import { describe, it, expect } from 'vitest';
import { SystemServiceManager } from './SystemServiceManager';

describe('SystemServiceManager (Windows services)', () => {
  it('generates PowerShell service cmdlets', () => {
    const enable = SystemServiceManager.getCommand('enable', 'wuauserv');
    expect(enable.command).toBe('powershell');
    expect(enable.fullCommand).toContain('Set-Service -Name "wuauserv" -StartupType Automatic');
    expect(enable.requiresSudo).toBe(true);

    const restart = SystemServiceManager.getCommand('restart', 'Spooler');
    expect(restart.args).toEqual(['-Command', 'Restart-Service -Name "Spooler"']);
    expect(restart.requiresSudo).toBe(false);

    expect(SystemServiceManager.getCommand('status', 'Spooler').args[1]).toBe('Get-Service -Name "Spooler" | Format-List');
  });

  it('parses Get-Service output', () => {
    const running = `
Name                : Spooler
DisplayName         : Print Spooler
Status              : Running
StartType           : Automatic
`;
    const parsed = SystemServiceManager.parseStatus(running, 'Spooler');
    expect(parsed.active).toBe(true);
    expect(parsed.enabled).toBe(true);
    expect(parsed.state).toBe('Running');

    const stopped = `
Name                : wuauserv
Status              : Stopped
StartType           : Disabled
`;
    const p2 = SystemServiceManager.parseStatus(stopped, 'wuauserv');
    expect(p2.active).toBe(false);
    expect(p2.enabled).toBe(false);
    expect(p2.state).toBe('Stopped');
  });
});
