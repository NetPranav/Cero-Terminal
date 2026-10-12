import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShellSDKCapability } from './ShellSDKCapability';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args)
}));

describe('ShellSDKCapability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancel() calls cancel_command with runningRunId', async () => {
    const capability = new ShellSDKCapability();
    // Simulate setting runningRunId
    (capability as any).runningRunId = 'test-run-123';

    await capability.cancel();

    expect(mockInvoke).toHaveBeenCalledWith('cancel_command', {
      runId: 'test-run-123'
    });
  });

  it('cancel() does not invoke cancel_command when not running', async () => {
    const capability = new ShellSDKCapability();
    (capability as any).runningRunId = undefined;

    await capability.cancel();

    expect(mockInvoke).not.toHaveBeenCalledWith('cancel_command', expect.anything());
  });
});
