import { describe, it, expect } from 'vitest';
import { ShellAdapter } from './ShellAdapter';

describe('ShellAdapter', () => {
  const adapter = ShellAdapter.getInstance();

  it('detects the default shell from its path, and falls back to PowerShell', () => {
    expect(adapter.detectLoginShell('powershell.exe').id).toBe('powershell');
    expect(adapter.detectLoginShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe').id).toBe('powershell');
    expect(adapter.detectLoginShell('C:\\Program Files\\Git\\bin\\bash.exe').id).toBe('bash');
    expect(adapter.detectLoginShell('C:\\Program Files\\nu\\bin\\nu.exe').id).toBe('nushell');
    expect(adapter.detectLoginShell('C:\\tools\\menu.exe').id).toBe('powershell');
    expect(adapter.detectLoginShell(undefined).id).toBe('powershell');
  });

  it('retrieves shell paths and flags', () => {
    const ps = adapter.getProfile('powershell');
    expect(ps.defaultPath).toBe('powershell.exe');
    expect(ps.supportsTrueColor).toBe(true);

    const bash = adapter.getProfile('bash');
    expect(bash.loginFlag).toBe('--login');
    expect(bash.configFilePath).toBe('.bashrc');
  });

  it('builds interactive login flags for bash only', () => {
    const args = adapter.buildSpawnArgs(adapter.getProfile('bash'), true);
    expect(args).toContain('--login');
    expect(args).toContain('-i');
    expect(adapter.buildSpawnArgs(adapter.getProfile('powershell'), false)).toEqual([]);
  });

  it('generates the terminal environment variables', () => {
    const env = adapter.getTerminalEnvironment({ CUSTOM_VAR: 'test' });
    expect(env.TERM).toBe('xterm-256color');
    expect(env.COLORTERM).toBe('truecolor');
    expect(env.TERM_PROGRAM).toBe('Cero');
    expect(env.CERO_TERMINAL).toBe('1');
    expect(env.CUSTOM_VAR).toBe('test');
  });
});
