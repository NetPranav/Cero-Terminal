import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddedProvider } from './EmbeddedProvider';
import { CloudApiProvider, type CloudKeyConfig } from './CloudApiProvider';
import type { ModelProvider } from './Provider';
import { buildDecisionCall } from '../agent/DecisionCall';
import { AgentLoop } from '../agent/AgentLoop';

/**
 * "The same prompt works with the API AI but not with the built-in AI."
 *
 * Both providers are the real classes. Only the network is replaced, with servers that answer in
 * the shape the real ones use (llama-server and an OpenAI-compatible API). The same decision call
 * goes through each, so any difference in what the model is sent, or in what the agent makes of a
 * reply, is a bug in Cero rather than a difference between models.
 */

interface Captured { url: string; body: any }

function installNetwork(reply: { content: string; finish?: string; status?: number }) {
  const calls: Captured[] = [];
  const fakeFetch = vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    if (url.endsWith('/health')) return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    if (url.endsWith('/v1/models')) return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (reply.status && reply.status >= 400) {
      return new Response(JSON.stringify({ error: { message: `upstream ${reply.status}` } }), { status: reply.status });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: reply.content }, finish_reason: reply.finish ?? 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }), { status: 200 });
  });
  vi.stubGlobal('fetch', fakeFetch);
  return calls;
}

function setCloudConfig(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
  const cloud = CloudApiProvider.getInstance();
  (cloud as any).inMemoryConfigs = {};
  const cfg: CloudKeyConfig = { serviceId: 'custom', apiKey: 'test-key', baseUrl: 'https://api.example.test/v1', modelId: 'test-model', displayName: 'Custom', isActive: true };
  cloud.saveConfig(cfg);
}

const providers = (): Array<[string, ModelProvider]> => [
  ['built-in (embedded)', new EmbeddedProvider()],
  ['API (cloud)', CloudApiProvider.getInstance()],
];

beforeEach(() => setCloudConfig());
afterEach(() => { vi.unstubAllGlobals(); });

describe('what each provider is sent for the same decision call', () => {
  const goals = ['open the folder gitBrains in vs code', 'what is using port 3000', 'hello, who are you?', 'list python files here'];

  for (const goal of goals) {
    it(`same system prompt, history and sampling for: ${goal}`, async () => {
      const call = buildDecisionCall(goal, { os: 'linux', cwd: '/home/me/work' });
      const sent: Captured[] = [];
      for (const [, provider] of providers()) {
        const calls = installNetwork({ content: '{"action":"done","summary":"ok"}' });
        await provider.generate(call.fullPrompt, 'test-model', call.options);
        sent.push(calls[calls.length - 1]);
      }
      const [embedded, cloud] = sent;

      // prompt construction and system context: byte for byte the same messages
      expect(embedded.body.messages).toEqual(cloud.body.messages);
      expect(embedded.body.messages[0].role).toBe('system');
      expect(embedded.body.messages.at(-1)).toMatchObject({ role: 'user', content: goal });

      // model configuration: the sampling both servers understand is identical
      for (const key of ['temperature', 'seed', 'max_tokens']) {
        expect(embedded.body[key], key).toBe(cloud.body[key]);
      }
      expect(embedded.body.temperature).toBe(0);

      // both are held to the JSON contract, each with the mechanism its server has
      expect(typeof embedded.body.grammar).toBe('string');
      expect(cloud.body.response_format).toEqual({ type: 'json_object' });
    });
  }

  it('the grammar the built-in model is forced through can express every shape the prompt asks for', async () => {
    const call = buildDecisionCall('open vscode', { os: 'linux', cwd: '/w' });
    const grammar = String(call.options.grammar);
    // the system prompt's JSON CONTRACT: execute (command + explanation) and done (summary)
    expect(call.systemPrompt).toContain('{"action": "execute", "command":');
    expect(call.systemPrompt).toContain('{"action": "done", "summary":');
    for (const field of ['"action"', '"execute"', '"command"', '"explanation"', '"done"', '"summary"']) {
      expect(grammar, field).toContain(field.replace(/"/g, '\\"'));
    }
    // and nothing the prompt never mentions (a tool call shape would be impossible for the model to follow)
    expect(call.systemPrompt).not.toMatch(/"action":\s*"tool"/);
  });

  it('the grammar cannot make the model emit unbounded whitespace until the token limit', () => {
    const grammar = String(buildDecisionCall('x', { os: 'linux', cwd: '/w' }).options.grammar);
    const wsRule = grammar.split('\n').find(l => l.startsWith('ws ::='))!;
    // `[ \t\n\r]*` lets a small model loop on newlines until n_predict, cutting the JSON off
    expect(wsRule).not.toMatch(/\]\s*\*/);
  });
});

describe('what the agent makes of the same reply from each provider', () => {
  const replies: Array<[string, { content: string; finish?: string }]> = [
    ['clean done', { content: '{"action":"done","summary":"The answer is 42."}' }],
    ['fenced JSON', { content: '```json\n{"action":"done","summary":"The answer is 42."}\n```' }],
    ['JSON with trailing text', { content: '{"action":"done","summary":"The answer is 42."}\n\nLet me know if you need more.' }],
    ['reasoning block first', { content: '<think>the user wants a number</think>{"action":"done","summary":"The answer is 42."}' }],
    ['plain text answer', { content: 'The answer is 42.' }],
  ];

  function loopFor(provider: ModelProvider) {
    return new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => provider,
      getActiveModel: () => ({ modelId: 'test-model' }),
      getProviders: () => [provider],
      initialize: vi.fn(),
    } as any);
  }

  for (const [label, reply] of replies) {
    it(`${label}: both providers give the same result`, async () => {
      const outcomes: Array<{ success: boolean; summary: string }> = [];
      for (const [, provider] of providers()) {
        installNetwork(reply);
        const loop = loopFor(provider);
        (loop as any).toolExecutor = { hasDriver: () => true, execute: vi.fn().mockResolvedValue({ success: true, data: { stdout: '', code: 0 } }) };
        const r = await loop.run('what is the answer to life, the universe and everything', { os: 'linux', cwd: '/w' });
        outcomes.push({ success: r.success, summary: r.summary });
      }
      expect(outcomes[0]).toEqual(outcomes[1]);
      expect(outcomes[0].success).toBe(true);
      expect(outcomes[0].summary).toContain('42');
    });
  }

  it('an execute reply runs the same command through either provider', async () => {
    const ran: string[][] = [];
    for (const [, provider] of providers()) {
      installNetwork({ content: '{"action":"execute","command":"df -h /","explanation":"Show disk usage of the root filesystem"}' });
      const loop = loopFor(provider);
      const execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: 'Filesystem Size Used\n/dev/sda1 100G 40G', code: 0 } });
      (loop as any).toolExecutor = { hasDriver: () => true, execute };
      await loop.run('how full is my root disk', { os: 'linux', cwd: '/w' });
      ran.push(execute.mock.calls.map(c => String(c[1]?.command)));
    }
    expect(ran[0]).toEqual(ran[1]);
    expect(ran[0].some(c => c.includes('df -h /'))).toBe(true);
  });

  it('a server error is reported the same way, not silently as success', async () => {
    const outcomes: boolean[] = [];
    for (const [, provider] of providers()) {
      installNetwork({ content: '', status: 500 });
      const loop = loopFor(provider);
      (loop as any).toolExecutor = { hasDriver: () => true, execute: vi.fn().mockResolvedValue({ success: true, data: { stdout: '', code: 0 } }) };
      const r = await loop.run('what is the answer to life, the universe and everything', { os: 'linux', cwd: '/w' }).catch(() => ({ success: false }));
      outcomes.push(r.success);
    }
    expect(outcomes).toEqual([false, false]);
  });
});
