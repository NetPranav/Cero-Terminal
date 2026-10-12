import { describe, it, expect, vi } from 'vitest';
import { planFlow } from './FlowPlan';
import { runDesktopSteps, runFlowInTerminal, typedStep, markerDefinition, parseStepMarker, shellInvocation } from './FlowRunner';

const TUTORIAL = { metadata: { name: 'demo' }, actions: [
  { type: 'install', package: 'git' },
  { type: 'command', command: 'npm install', cwd: '~/demo' },
  { type: 'browser', url: 'http://localhost:3000' },
] };

describe('FlowRunner', () => {
  it('runs desktop steps outside the terminal with the OS shell', async () => {
    const plan = planFlow({ actions: [{ type: 'app', app: 'Slack' }, { type: 'browser', url: 'https://example.com' }] }, 'x', 'windows')!;
    const execute = vi.fn().mockResolvedValue({ code: 0 });
    expect(await runDesktopSteps(plan.steps, 'windows', execute)).toEqual({ ok: true, failed: [] });
    expect(execute).toHaveBeenCalledWith('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Start-Process 'slack'"]);
    expect(shellInvocation('open .', 'macos')).toEqual({ command: '/bin/sh', args: ['-c', 'open .'] });
  });

  it('types terminal steps with an exit-code marker and opens the page itself', async () => {
    const plan = planFlow(TUTORIAL, 'demo', 'linux')!;
    const typed: string[] = [];
    const notices: string[] = [];
    const execute = vi.fn().mockResolvedValue({ code: 0 });
    const result = await runFlowInTerminal(plan, {
      os: 'linux', shell: 'posix',
      type: t => { typed.push(t); },
      nextStepResult: async () => 0,
      approve: async () => true,
      execute,
      notice: t => { notices.push(t); },
    }, '/home/u/Downloads/demo.flow');
    expect(result).toMatchObject({ success: true, completed: 3, summary: 'Flow "demo" from demo.flow finished: 3 steps.' });
    expect(typed[0]).toBe(`${markerDefinition('posix')}\r`);
    expect(typed[2]).toBe('cd "$HOME/demo" && npm install; __cero_step $?\r');
    expect(typed).toHaveLength(3);
    expect(execute).toHaveBeenCalledWith('/bin/sh', ['-c', "xdg-open 'http://localhost:3000'"]);
  });

  it('stops at the first failure and runs nothing after a decline', async () => {
    const plan = planFlow(TUTORIAL, 'demo', 'macos')!;
    const io = { os: 'macos' as const, shell: 'posix' as const, type: vi.fn(), approve: async () => true, execute: vi.fn(), notice: vi.fn(),
      nextStepResult: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1) };
    const failed = await runFlowInTerminal(plan, io);
    expect(failed).toMatchObject({ success: false, completed: 1 });
    expect(failed.summary).toContain('stopped at step 2');
    expect(io.execute).not.toHaveBeenCalled();
    const typeFn = vi.fn();
    const declined = await runFlowInTerminal(plan, { ...io, type: typeFn, approve: async () => false });
    expect(declined.declined).toBe(true);
    expect(typeFn).not.toHaveBeenCalled();
  });

  it('writes the marker for each shell and reads it back', () => {
    const plan = planFlow(TUTORIAL, 'demo', 'windows')!;
    expect(typedStep(plan.steps[1], 'windows', 'powershell')).toBe("Set-Location -LiteralPath (Join-Path $HOME 'demo'); npm install; __cero_step $(if ($?) { 0 } elseif ($LASTEXITCODE) { $LASTEXITCODE } else { 1 })");
    expect(typedStep(plan.steps[1], 'linux', 'fish')).toMatch(/; __cero_step \$status$/);
    expect(parseStepMarker('cero-step;0')).toBe(0);
    expect(parseStepMarker('cero-step;127')).toBe(127);
    expect(parseStepMarker('other;1')).toBeNull();
  });
});

describe('flow approvals', () => {
  it('a flow from a file needs a click, and approvals and steps are audited', async () => {
    const { flowApprovalPlan } = await import('./FlowRunner');
    const plan = planFlow(TUTORIAL, 'demo', 'macos')!;
    expect((flowApprovalPlan(plan, 'macos', '/Users/me/Downloads/demo.flow') as any).requiresClick).toBe(true);
    const events: string[] = [];
    await runFlowInTerminal(plan, { os: 'macos', shell: 'posix', type: () => {}, nextStepResult: async () => 0, approve: async () => true,
      execute: async () => ({ code: 0 }), notice: () => {}, audit: e => events.push(`${e.type}:${e.exitCode ?? ''}`) });
    expect(events).toEqual(['approved:', 'step:0', 'step:0', 'step:0']);
  });
});
