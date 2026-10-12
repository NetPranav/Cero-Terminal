import { describe, expect, it, vi } from 'vitest';
import { ToolExecutor } from './ToolExecutor';

describe('ToolExecutor security integration', () => {
  it('accepts a complete macOS shell command line as one command parameter', async () => {
    const executor = new ToolExecutor();

    const result = await executor.execute('shell.execute', { command: 'git status --short' }, '.');

    expect(result.success).toBe(true);
    expect(result.data?.stdout).toContain('git status --short');
  });

  it('requires explicit approval before a process-termination action', async () => {
    const requestApproval = vi.fn().mockResolvedValue(false);
    const executor = new ToolExecutor();

    const result = await executor.execute(
      'system.kill_process',
      { process: 'node' },
      '.',
      requestApproval
    );

    expect(requestApproval).toHaveBeenCalledOnce();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Declined in the confirmation dialog');
  });

  it('requires explicit user approval and presents 1-line explanation for generative shell commands', async () => {
    let capturedPlan: any = null;
    const requestApproval = vi.fn().mockImplementation(async (plan) => {
      capturedPlan = plan;
      return true; // Approve
    });
    const executor = new ToolExecutor();

    const result = await executor.execute(
      'shell.execute',
      {
        command: 'ffmpeg -i video.mp4 -vn output.mp3',
        explanation: 'Converts video.mp4 to audio file output.mp3'
      },
      '.',
      requestApproval
    );

    expect(requestApproval).toHaveBeenCalledOnce();
    expect(capturedPlan).toBeDefined();
    expect(capturedPlan.riskLevel).toBe('SENSITIVE');
    expect(capturedPlan.requiresConsent).toBe(true);
    expect(capturedPlan.requiresPassword).toBe(false);
    expect(capturedPlan.explanation).toBe('Converts video.mp4 to audio file output.mp3');
    expect(result.success).toBe(true);
  });

  it('enforces execution timeout and cancels active driver when a command exceeds timeoutMs', async () => {
    const executor = new ToolExecutor();
    const mockSlowDriver = {
      capabilityId: 'test.slow_hang',
      name: 'Hanging Test Driver',
      supportedPlatforms: ['macos', 'windows', 'linux'],
      execute: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500))),
      verify: vi.fn().mockResolvedValue(true),
      rollback: vi.fn().mockResolvedValue(true),
      cancel: vi.fn().mockResolvedValue(true)
    };

    (executor['sdk'] as any).register('test.slow_hang', mockSlowDriver);

    const result = await executor.execute(
      'test.slow_hang',
      {},
      '.',
      undefined,
      50 // 50ms timeout
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out after 50ms');
    expect(mockSlowDriver.cancel).toHaveBeenCalled();
  });

  it('a cancelled run can never execute its command, even if the approval is granted afterwards', async () => {
    const executor = new ToolExecutor();
    const driver = (executor['sdk'] as any).getDriver('shell.execute');
    const run = vi.spyOn(driver, 'execute').mockResolvedValue({ success: true, data: { stdout: '', stderr: '', code: 0 } } as any);

    let release!: (approved: boolean) => void;
    const approval = new Promise<boolean>((resolve) => { release = resolve; });
    const ask = vi.fn().mockReturnValue(approval);
    const controller = new AbortController();

    const pending = executor.execute(
      'shell.execute',
      { command: 'ffmpeg -i a.mp4 b.mp3', explanation: 'Convert a.mp4 to b.mp3' },
      '.',
      ask,
      undefined,
      controller.signal
    );
    await vi.waitFor(() => expect(ask).toHaveBeenCalledOnce());

    controller.abort(); // Ctrl+C while the approval dialog is open
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('CANCELLED');

    release(true); // the user clicks Run on the stale dialog
    await new Promise((r) => setTimeout(r, 30));
    expect(run).not.toHaveBeenCalled();
    run.mockRestore();
  });

  it('an approval that resolves after the abort is treated as declined', async () => {
    const executor = new ToolExecutor();
    const driver = (executor['sdk'] as any).getDriver('shell.execute');
    const run = vi.spyOn(driver, 'execute').mockResolvedValue({ success: true, data: { stdout: '', stderr: '', code: 0 } } as any);
    const controller = new AbortController();
    const ask = vi.fn().mockImplementation(async () => { controller.abort(); return true; });

    const result = await executor.execute(
      'shell.execute',
      { command: 'ffmpeg -i a.mp4 b.mp3', explanation: 'Convert' },
      '.',
      ask,
      undefined,
      controller.signal
    );
    expect(result.success).toBe(false);
    expect(run).not.toHaveBeenCalled();
    run.mockRestore();
  });
});
