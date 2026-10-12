import { describe, expect, it, vi } from 'vitest';
import { AgentLoop } from './AgentLoop';
import type { QueueIO } from './AgentLoop';

describe('AgentLoop Queue Management Routes (Task 2.3)', () => {
  it('handles "show the queue" when queue is empty without invoking LLM', async () => {
    const mockRegistry = { toolIndex: { getAll: () => [] } };
    const mockModelManager = {
      getActiveModel: vi.fn(),
      getActiveProvider: vi.fn(),
    };
    const loop = new AgentLoop(mockRegistry as any, mockModelManager as any);

    const mockQueueIO: QueueIO = {
      list: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
      remove: vi.fn().mockReturnValue(true),
    };
    loop.setQueueIO(mockQueueIO);

    const result = await loop.run('show the queue', { os: 'linux', cwd: '/workspace' });

    expect(result.success).toBe(true);
    expect(result.summary).toBe('The queue is empty.');
    expect(mockQueueIO.list).toHaveBeenCalled();
    expect(mockModelManager.getActiveProvider).not.toHaveBeenCalled();
  });

  it('handles "show the queue" with queued items formatted cleanly', async () => {
    const mockRegistry = { toolIndex: { getAll: () => [] } };
    const loop = new AgentLoop(mockRegistry as any);

    const mockQueueIO: QueueIO = {
      list: vi.fn().mockReturnValue([
        { id: '1', label: 'Inspect docker containers', kind: 'goal' },
        { id: '2', label: 'Deploy flow', kind: 'flow' },
      ]),
      clear: vi.fn(),
      remove: vi.fn().mockReturnValue(true),
    };
    loop.setQueueIO(mockQueueIO);

    const result = await loop.run('show the queue', { os: 'linux', cwd: '/workspace' });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('Queue (2):');
    expect(result.summary).toContain('1. [goal] Inspect docker containers');
    expect(result.summary).toContain('2. [flow] Deploy flow');
  });

  it('handles "cancel the second queued request" via QueueIO.remove', async () => {
    const mockRegistry = { toolIndex: { getAll: () => [] } };
    const loop = new AgentLoop(mockRegistry as any);

    const mockQueueIO: QueueIO = {
      list: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
      remove: vi.fn().mockReturnValue(true),
    };
    loop.setQueueIO(mockQueueIO);

    const result = await loop.run('cancel the second queued request', { os: 'linux', cwd: '/workspace' });

    expect(result.success).toBe(true);
    expect(mockQueueIO.remove).toHaveBeenCalledWith(2);
    expect(result.summary).toContain('Removed item 2 from queue.');
  });

  it('reports failure when item index is not found in queue', async () => {
    const mockRegistry = { toolIndex: { getAll: () => [] } };
    const loop = new AgentLoop(mockRegistry as any);

    const mockQueueIO: QueueIO = {
      list: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
      remove: vi.fn().mockReturnValue(false),
    };
    loop.setQueueIO(mockQueueIO);

    const result = await loop.run('cancel the 5th queued request', { os: 'linux', cwd: '/workspace' });

    expect(result.success).toBe(false);
    expect(mockQueueIO.remove).toHaveBeenCalledWith(5);
    expect(result.summary).toContain('Item 5 not found in queue.');
  });

  it('handles "clear the queue" via QueueIO.clear', async () => {
    const mockRegistry = { toolIndex: { getAll: () => [] } };
    const loop = new AgentLoop(mockRegistry as any);

    const mockQueueIO: QueueIO = {
      list: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
      remove: vi.fn().mockReturnValue(true),
    };
    loop.setQueueIO(mockQueueIO);

    const result = await loop.run('clear the queue', { os: 'linux', cwd: '/workspace' });

    expect(result.success).toBe(true);
    expect(mockQueueIO.clear).toHaveBeenCalled();
    expect(result.summary).toBe('Queue cleared.');
  });

  it('handles pause and resume queue commands', async () => {
    const mockRegistry = { toolIndex: { getAll: () => [] } };
    const loop = new AgentLoop(mockRegistry as any);

    const mockQueueIO: QueueIO = {
      list: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
      remove: vi.fn().mockReturnValue(true),
      setPaused: vi.fn(),
    };
    loop.setQueueIO(mockQueueIO);

    const pauseResult = await loop.run('pause the queue', { os: 'linux', cwd: '/workspace' });
    expect(pauseResult.success).toBe(true);
    expect(mockQueueIO.setPaused).toHaveBeenCalledWith(true);

    const resumeResult = await loop.run('resume the queue', { os: 'linux', cwd: '/workspace' });
    expect(resumeResult.success).toBe(true);
    expect(mockQueueIO.setPaused).toHaveBeenCalledWith(false);
  });
});
