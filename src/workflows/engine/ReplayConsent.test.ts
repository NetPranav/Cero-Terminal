import { describe, it, expect, vi } from 'vitest';

const executeSpy = vi.fn();
vi.mock('../../ai/agent/ToolExecutor', () => ({
  ToolExecutor: class {
    execute = executeSpy;
  }
}));

import { DeterministicReplayEngine } from './DeterministicReplayEngine';

describe('Workflow replay consent', () => {
  it('runs default replay steps through ToolExecutor with a consent handler', async () => {
    executeSpy.mockResolvedValue({ success: true, data: { stdout: 'ok', stderr: '', code: 0 } });
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const out = await (DeterministicReplayEngine.getInstance() as any).defaultExecute('rm -rf build', '/home/u/app');
      expect(out).toEqual({ code: 0, stdout: 'ok', stderr: '' });
    } finally {
      process.env.NODE_ENV = previous;
    }
    const [tool, params, cwd, askPermission] = executeSpy.mock.calls[0];
    expect(tool).toBe('shell.execute');
    expect(params.command).toBe('rm -rf build');
    expect(cwd).toBe('/home/u/app');
    expect(typeof askPermission).toBe('function');
  });
});
