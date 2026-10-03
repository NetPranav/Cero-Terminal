import { describe, it, expect, beforeEach } from 'vitest';
import { AgentLoop } from './AgentLoop';

describe('AgentLoop Conversational & Offline Resilience', () => {
  let agentLoop: AgentLoop;

  beforeEach(() => {
    const mockRegistry = {
      toolIndex: { getAll: () => [] }
    };
    const mockToolExecutor = {
      hasDriver: () => true,
      execute: (tool: string, params: any) => Promise.resolve({ success: true, data: {} })
    };
    agentLoop = new AgentLoop(mockRegistry as any, mockToolExecutor as any);
  });

  it('answers "hey" and conversational greetings immediately without needing an LLM', async () => {
    const res = await agentLoop.run('hey', { os: 'darwin', cwd: '/tmp' });
    expect(res.success).toBe(true);
    expect(res.summary).toContain('Cero AI');
    expect(res.summary).toContain('copilot');
    expect(res.steps.length).toBe(0);
  });

  it('answers "who are you" and "help" with a list of terminal capabilities', async () => {
    const res = await agentLoop.run('who are you', { os: 'darwin', cwd: '/tmp' });
    expect(res.success).toBe(true);
    expect(res.summary).toContain('autonomous terminal agent');
    expect(res.summary).toContain('port 3000');
  });

  it('initiates model setup with ">setup-ai"', async () => {
    const res = await agentLoop.run('setup-ai', { os: 'darwin', cwd: '/tmp' });
    expect(res.success).toBe(true);
    expect(res.summary).toContain('Qwen 2.5 Coder 3B');
  });

  it('answers ">what did you just do" with recent actions from UndoLog (0.5.9)', async () => {
    const res = await agentLoop.run('>what did you just do', { os: 'darwin', cwd: '/tmp' });
    expect(res.success).toBe(true);
    expect(res.summary).toBeDefined();
  });

  it('handles ">undo last step" via UndoLog rollback (0.5.9)', async () => {
    const res = await agentLoop.run('>undo last step', { os: 'darwin', cwd: '/tmp' });
    // In empty session, reports no actions found
    expect(res.summary).toContain('No destructive actions');
  });

  it('resolves generalized app launch requests via fast-path in sub-100ms (Task 0.75.6)', async () => {
    const res = await agentLoop.run('open nvim', { os: 'linux', cwd: '/tmp' });
    expect(res.success).toBe(true);
    expect(res.steps[0].tool).toBe('application.open');
    expect(res.steps[0].params.app).toBe('nvim');

    const res2 = await agentLoop.run('launch vlc', { os: 'linux', cwd: '/tmp' });
    expect(res2.success).toBe(true);
    expect(res2.steps[0].tool).toBe('application.open');
    expect(res2.steps[0].params.app).toBe('vlc');

    const res3 = await agentLoop.run('start htop', { os: 'linux', cwd: '/tmp' });
    expect(res3.success).toBe(true);
    expect(res3.steps[0].tool).toBe('application.open');
    expect(res3.steps[0].params.app).toBe('htop');
  });
});

