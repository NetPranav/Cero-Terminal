import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from './AgentLoop';

function loopReplying(content: string) {
  const provider = {
    providerId: 'embedded', providerName: 'Built-in', isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({ content, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 1 }),
    listModels: vi.fn().mockResolvedValue([]),
  };
  const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
    getActiveProvider: () => provider, getProviders: () => [provider], getActiveModel: () => ({ modelId: 'm' }), initialize: vi.fn(),
  } as any);
  const execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: '', code: 0 } });
  (loop as any).toolExecutor = { hasDriver: () => true, execute };
  return { loop, execute };
}

describe('A question answered with echo', () => {
  const ANSWER = 'Binary search repeatedly halves a sorted list until it finds the item.';
  const reply = JSON.stringify({ action: 'execute', command: `echo '${ANSWER}'`, explanation: 'Explain binary search' });

  it('is shown as the answer, and nothing is run', async () => {
    const { loop, execute } = loopReplying(reply);
    const r = await loop.run('how does binary search work?', { os: 'linux', cwd: '/tmp' });
    expect(r.summary).toBe(ANSWER);
    expect(execute).not.toHaveBeenCalled();
  });

  it('a request that is not a question still runs its command', async () => {
    const { loop, execute } = loopReplying(JSON.stringify({ action: 'execute', command: `echo 'this prints a long enough sentence'`, explanation: 'Print text' }));
    await loop.run('print a sentence for me please', { os: 'linux', cwd: '/tmp' });
    expect(execute.mock.calls.some(c => String(c[1]?.command).startsWith('echo '))).toBe(true);
  });
});
