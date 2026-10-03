import { describe, expect, it, vi } from 'vitest';
import { AgentLoop } from './AgentLoop';
import { CancelledError } from './Cancelled';
import { ToolExecutor } from './ToolExecutor';

describe('AgentLoop Cancellation Signal (Task 2.1)', () => {
  it('returns immediately with cancelled: true if signal is already aborted', async () => {
    const mockRegistry = { toolIndex: { getAll: () => [] } };
    const mockToolExecutor = {
      execute: vi.fn().mockResolvedValue({ success: true, data: { stdout: 'done' } })
    };

    const loop = new AgentLoop(mockRegistry as any);
    (loop as any).toolExecutor = mockToolExecutor;

    const controller = new AbortController();
    controller.abort();

    const result = await loop.run('sleep 30', {
      os: 'linux',
      cwd: '/test',
      signal: controller.signal
    });

    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/stopped/i);
    expect(mockToolExecutor.execute).not.toHaveBeenCalled();
  });

  it('aborts prompt execution and sets cancelled: true when signal aborts during LLM generation', async () => {
    const controller = new AbortController();

    const mockModelManager = {
      getActiveModel: vi.fn().mockReturnValue({ id: 'test-model', displayName: 'Test Model' }),
      getActiveProvider: vi.fn().mockReturnValue({
        isAvailable: vi.fn().mockResolvedValue(true),
        generate: vi.fn().mockImplementation(async (_prompt: string, _model: string, options?: any) => {
          controller.abort();
          if (options?.signal?.aborted) {
            throw new CancelledError();
          }
          return { content: '{"action":"done","summary":"ok"}' };
        })
      })
    };

    const mockRegistry = { toolIndex: { getAll: () => [] } };
    const loop = new AgentLoop(mockRegistry as any, mockModelManager as any);

    const result = await loop.run('explain quantum physics in detail', {
      os: 'linux',
      cwd: '/test',
      signal: controller.signal
    });

    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/stopped/i);
  });

  it('ToolExecutor returns CANCELLED immediately when signal is aborted', async () => {
    const executor = new ToolExecutor();
    const controller = new AbortController();
    controller.abort();

    const result = await executor.execute(
      'shell.execute',
      { command: 'sleep 30' },
      '.',
      undefined,
      undefined,
      controller.signal
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('CANCELLED');
    expect(result.error).toMatch(/cancelled/i);
  });

  it('aborts chain execution immediately on signal abort', async () => {
    const controller = new AbortController();
    const mockRegistry = { toolIndex: { getAll: () => [] } };
    const loop = new AgentLoop(mockRegistry as any);

    const chainPlan = {
      steps: [
        { clause: 'step 1', command: 'echo 1' },
        { clause: 'step 2', command: 'echo 2' }
      ]
    };

    const mockToolExecutor = {
      execute: vi.fn().mockImplementation(async () => {
        controller.abort();
        throw new CancelledError();
      })
    };
    (loop as any).toolExecutor = mockToolExecutor;

    const result = await (loop as any).runChain('my goal', chainPlan, {
      os: 'linux',
      cwd: '/test',
      signal: controller.signal
    });

    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
  });
});
