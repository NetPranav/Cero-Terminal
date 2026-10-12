import { describe, it, expect } from 'vitest';
import { SystemServiceManager } from './SystemServiceManager';

describe('SystemServiceManager — Cross-Platform System Services Driver', () => {
  it('generates correct systemctl command for Linux system-level service', () => {
    const cmd = SystemServiceManager.getCommand('restart', 'docker', { os: 'linux', userScope: false });
    expect(cmd.command).toBe('sudo');
    expect(cmd.args).toEqual(['systemctl', 'restart', 'docker']);
    expect(cmd.requiresSudo).toBe(true);
    expect(cmd.fullCommand).toBe('sudo systemctl restart docker');
  });

  it('generates correct systemctl --user command for Linux user-level service', () => {
    const cmd = SystemServiceManager.getCommand('start', 'pipewire', { os: 'linux', userScope: true });
    expect(cmd.command).toBe('systemctl');
    expect(cmd.args).toEqual(['--user', 'start', 'pipewire']);
    expect(cmd.requiresSudo).toBe(false);
    expect(cmd.fullCommand).toBe('systemctl --user start pipewire');
  });

  it('generates correct brew services command for macOS developer services', () => {
    const cmd = SystemServiceManager.getCommand('start', 'postgresql', { os: 'macos' });
    expect(cmd.command).toBe('brew');
    expect(cmd.args).toEqual(['services', 'start', 'postgresql']);
    expect(cmd.fullCommand).toBe('brew services start postgresql');
  });

  it('generates correct launchctl command for native macOS services', () => {
    const cmd = SystemServiceManager.getCommand('stop', 'com.apple.bluetoothd', { os: 'macos' });
    expect(cmd.command).toBe('launchctl');
    expect(cmd.args).toEqual(['stop', 'com.apple.bluetoothd']);
  });

  it('generates correct PowerShell cmdlets for Windows Services', () => {
    const cmd = SystemServiceManager.getCommand('enable', 'wuauserv', { os: 'windows' });
    expect(cmd.command).toBe('powershell');
    expect(cmd.fullCommand).toContain('Set-Service -Name "wuauserv" -StartupType Automatic');
    expect(cmd.requiresSudo).toBe(true);
  });

  it('parses Linux systemctl status output correctly', () => {
    const sampleOutput = `
● bluetooth.service - Bluetooth service
     Loaded: loaded (/lib/systemd/system/bluetooth.service; enabled; vendor preset: enabled)
     Active: active (running) since Thu 2026-09-03 10:00:00 UTC; 2h ago
   Main PID: 1234 (bluetoothd)
     Status: "Running"
    `;

    const parsed = SystemServiceManager.parseStatus(sampleOutput, 'linux', 'bluetooth');
    expect(parsed.active).toBe(true);
    expect(parsed.enabled).toBe(true);
    expect(parsed.pid).toBe(1234);
    expect(parsed.state).toBe('active');
    expect(parsed.description).toBe('Bluetooth service');
  });

  it('parses inactive systemctl status output correctly', () => {
    const sampleOutput = `
○ nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/lib/systemd/system/nginx.service; disabled; vendor preset: enabled)
     Active: inactive (dead)
    `;

    const parsed = SystemServiceManager.parseStatus(sampleOutput, 'linux', 'nginx');
    expect(parsed.active).toBe(false);
    expect(parsed.enabled).toBe(false);
    expect(parsed.pid).toBeUndefined();
    expect(parsed.state).toBe('inactive');
  });
});
