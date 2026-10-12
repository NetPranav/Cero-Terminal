import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UndoLog } from './UndoLog';

describe('UndoLog — Destructive Workflow Rollback & Undo Log (0.5.9)', () => {
  let undoLog: UndoLog;

  beforeEach(() => {
    undoLog = UndoLog.getInstance();
    undoLog.clear();
  });

  it('records actions with metadata and formats what did you just do', () => {
    undoLog.recordAction({
      goal: 'list active ports',
      command: 'lsof -i :3000',
      tool: 'shell.execute',
      sessionId: 'tab-1'
    });

    undoLog.recordAction({
      goal: 'switch to staging branch',
      command: 'git checkout staging',
      tool: 'shell.execute',
      sessionId: 'tab-1'
    });

    const recent = undoLog.getRecentActions('tab-1');
    expect(recent.length).toBe(2);
    expect(recent[0].command).toBe('git checkout staging');
    expect(recent[0].isDestructive).toBe(true);
    expect(recent[0].rollbackCommand).toBe('git checkout -');
    expect(recent[1].command).toBe('lsof -i :3000');
    expect(recent[1].isDestructive).toBe(false);

    const formatted = undoLog.formatWhatDidYouJustDo('tab-1');
    expect(formatted).toContain('Recent Session Actions');
    expect(formatted).toContain('git checkout staging');
    expect(formatted).toContain('[DESTRUCTIVE]');
    expect(formatted).toContain('lsof -i :3000');
    expect(formatted).toContain('[READ-ONLY]');
  });

  it('identifies the last destructive action for rollback', () => {
    undoLog.recordAction({
      goal: 'commit code changes',
      command: 'git commit -m "feat: new feature"',
      sessionId: 'tab-2'
    });

    undoLog.recordAction({
      goal: 'check status',
      command: 'git status',
      sessionId: 'tab-2'
    });

    const lastDestructive = undoLog.getLastDestructiveAction('tab-2');
    expect(lastDestructive).toBeDefined();
    expect(lastDestructive?.command).toBe('git commit -m "feat: new feature"');
    expect(lastDestructive?.rollbackCommand).toBe('git reset --soft HEAD~1');
    expect(lastDestructive?.reversibility).toBe('automatic');
  });

  it('executes automatic rollback using provided executor and updates status', async () => {
    undoLog.recordAction({
      goal: 'switch to feature branch',
      command: 'git checkout feature/ai',
      sessionId: 'tab-1'
    });

    const mockExecutor = vi.fn().mockResolvedValue({ code: 0, stdout: 'Switched to branch main', stderr: '' });

    const result = await undoLog.rollbackLastStep('tab-1', mockExecutor);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Successfully rolled back');
    expect(mockExecutor).toHaveBeenCalledWith('git checkout -');

    // Action status should now be rolled_back
    const lastDestructive = undoLog.getLastDestructiveAction('tab-1');
    expect(lastDestructive).toBeUndefined(); // no un-rolled-back destructive actions remaining
  });

  it('provides manual recovery advice for irreversible commands like kill', async () => {
    undoLog.recordAction({
      goal: 'kill process 4190',
      command: 'kill -9 4190',
      sessionId: 'tab-1'
    });

    const result = await undoLog.rollbackLastStep('tab-1');
    expect(result.success).toBe(false);
    expect(result.message).toContain('irreversible');
    expect(result.message).toContain('Terminated process cannot be automatically resurrected');
  });

  it('handles empty log gracefully when rollback requested', async () => {
    const result = await undoLog.rollbackLastStep('empty-tab');
    expect(result.success).toBe(false);
    expect(result.message).toContain('No destructive actions found');
  });
});
