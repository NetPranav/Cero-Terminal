import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentLoop } from './AgentLoop';
import { setChoiceHandlerForTests } from '../../presentation/ChoiceRequests';

const BAD = JSON.stringify({ action: 'tool', tool: 'does.not.exist', params: {} });
const GOOD = JSON.stringify({ action: 'execute', command: 'echo hello-from-api', explanation: 'Say hello' });

function setup(opts: { externalAvailable: boolean }) {
  const embedded = {
    providerId: 'embedded', providerName: 'Built-in', isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({ content: BAD, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 1 }),
    listModels: vi.fn().mockResolvedValue([]),
  };
  const cloud = {
    providerId: 'cloud_api', providerName: 'Cloud API', isAvailable: vi.fn().mockResolvedValue(opts.externalAvailable),
    generate: vi.fn().mockResolvedValue({ content: GOOD, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 1 }),
    listModels: vi.fn().mockResolvedValue([{ id: 'api-model', name: 'api-model', sizeBytes: 0 }]),
  };
  const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
    getActiveProvider: () => embedded,
    getProviders: () => [embedded, cloud],
    getActiveModel: () => ({ modelId: 'built-in' }),
    initialize: vi.fn(),
  } as any);
  const execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: 'hello-from-api', code: 0 } });
  (loop as any).toolExecutor = { hasDriver: () => true, execute };
  return { loop, embedded, cloud, execute };
}

// A request that no deterministic route handles, so it reaches the model
const GOAL = 'please ponder the meaning of zebra stripes and echo a greeting';

describe('Offering the API model when the built-in model keeps failing the action check', () => {
  afterEach(() => setChoiceHandlerForTests(null));

  it('asks first, sends nothing without a yes, and does not remember the answer', async () => {
    const { loop, cloud } = setup({ externalAvailable: true });
    const titles: string[] = [];
    setChoiceHandlerForTests(async q => { titles.push(q.title); return { index: 1 }; });
    const r = await loop.run(GOAL, { os: 'linux', cwd: '/tmp' });
    expect(titles.some(t => /built-in model could not do this reliably\. Try it with Cloud API \(api-model\)\?/.test(t))).toBe(true);
    expect(cloud.generate).not.toHaveBeenCalled();
    expect(r.success).toBe(false);
  });

  it('on yes, runs the one request with the API model', async () => {
    const { loop, cloud, execute } = setup({ externalAvailable: true });
    const asked: string[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q.title); return { index: 0 }; });
    cloud.generate
      .mockResolvedValueOnce({ content: GOOD, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 1 })
      .mockResolvedValue({ content: JSON.stringify({ action: 'done', summary: 'Greeted.' }), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 1 });
    await loop.run(GOAL, { os: 'linux', cwd: '/tmp' });
    // asked once for the whole request, however many steps it takes
    expect(asked.filter(t => /reliably/.test(t))).toHaveLength(1);
    expect(execute.mock.calls.some(c => String(c[1]?.command).includes('echo hello-from-api'))).toBe(true);
  });

  it('offers nothing when no other provider is available', async () => {
    const { loop, cloud } = setup({ externalAvailable: false });
    const titles: string[] = [];
    setChoiceHandlerForTests(async q => { titles.push(q.title); return null; });
    await loop.run(GOAL, { os: 'linux', cwd: '/tmp' });
    expect(titles.some(t => /reliably/.test(t))).toBe(false);
    expect(cloud.generate).not.toHaveBeenCalled();
  });
});
