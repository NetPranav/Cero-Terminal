import { describe, it, expect, vi } from 'vitest';
import { approveBatch, preApproved } from './BatchApproval';

describe('approveBatch', () => {
  it('asks once, listing only commands that need consent, and passes exactly those afterwards', async () => {
    const handler = vi.fn().mockResolvedValue(true);
    const result = await approveBatch(['ls -la', 'mkdir -p out', 'git init', 'mkdir -p out'], 'Plan', handler);
    expect(handler).toHaveBeenCalledTimes(1);
    const plan = handler.mock.calls[0][0];
    expect(plan.parameters.command).toBe('1. mkdir -p out\n2. git init');
    expect(plan.explanation).toBe('2 commands in this plan change your system. Approving runs exactly these, in order.');
    expect(await result.handler!({ parameters: { command: 'git init' } } as any)).toBe(true);
    // Anything not in the approved list still goes to the real dialog
    handler.mockResolvedValueOnce(false);
    expect(await result.handler!({ parameters: { command: 'rm -rf out' } } as any)).toBe(false);
  });

  it('does not ask when nothing needs consent, and uses singular wording for one command', async () => {
    const handler = vi.fn().mockResolvedValue(true);
    expect((await approveBatch(['ls', 'pwd'], 'Plan', handler)).approved).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    await approveBatch(['touch a.txt'], 'Plan', handler);
    expect(handler.mock.calls[0][0].explanation).toBe('1 command in this plan changes your system. Approving runs exactly this one.');
  });

  it('declines when there is no dialog to ask', async () => {
    expect((await approveBatch(['touch a'], 'Plan', undefined)).approved).toBe(false);
    expect(await preApproved(new Set(['a']))({ parameters: { command: 'b' } } as any)).toBe(false);
  });
});
