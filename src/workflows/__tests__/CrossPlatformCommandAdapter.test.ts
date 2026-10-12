import { describe, it, expect, beforeEach } from 'vitest';
import { CrossPlatformCommandAdapter } from '../engine/CrossPlatformCommandAdapter';
import { WorkflowStepDefinition } from '../models/WorkflowTypes';

describe('CrossPlatformCommandAdapter', () => {
  let adapter: CrossPlatformCommandAdapter;

  beforeEach(() => {
    adapter = CrossPlatformCommandAdapter.getInstance();
  });

  describe('Shell Invocation', () => {
    it('should generate powershell invocation on Windows', () => {
      const inv = adapter.getShellInvocation('echo hello', undefined);
      expect(inv.command).toBe('powershell.exe');
      expect(inv.args).toEqual(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'echo hello']);
    });

    it('should generate powershell invocation with cwd on Windows', () => {
      const inv = adapter.getShellInvocation('npm test', 'C:\\projects\\app');
      expect(inv.command).toBe('powershell.exe');
      expect(inv.args[inv.args.length - 1]).toContain('Set-Location');
    });

    it('quotes the folder as data, so nothing inside it runs', () => {
      expect(adapter.getShellInvocation('echo hi', "C:\\it's").args.join(' ')).toContain("Set-Location -LiteralPath 'C:\\it''s'");
      const evil = adapter.getShellInvocation('echo hi', "C:\\x'; Remove-Item C:\\ -Recurse; '");
      expect(evil.args[4]).toBe("Set-Location -LiteralPath 'C:\\x''; Remove-Item C:\\ -Recurse; '''; echo hi");
    });
  });

  describe('POSIX to Windows Command Translation', () => {
    it('should translate rm -rf to PowerShell Remove-Item', () => {
      const res = adapter.translateCommand('rm -rf ./build');
      expect(res).toContain('Remove-Item');
      expect(res).toContain('-Recurse');
      expect(res).toContain('-Force');
      expect(res).toContain('./build');
    });

    it('should translate mkdir -p to PowerShell New-Item', () => {
      const res = adapter.translateCommand('mkdir -p ./logs/archive');
      expect(res).toContain('New-Item');
      expect(res).toContain('-ItemType Directory');
      expect(res).toContain('./logs/archive');
    });

    it('should translate which and command -v to where.exe', () => {
      const res1 = adapter.translateCommand('which node');
      expect(res1).toBe('where.exe node');

      const res2 = adapter.translateCommand('command -v cargo');
      expect(res2).toBe('where.exe cargo');
    });

    it('should translate null redirects on Windows', () => {
      const res1 = adapter.translateCommand('echo test >/dev/null 2>&1');
      expect(res1).toContain('>NUL 2>&1');

      const res2 = adapter.translateCommand('cat file 2>/dev/null');
      expect(res2).toContain('2>NUL');
    });

    it('should translate open / xdg-open to start on Windows', () => {
      const res = adapter.translateCommand('xdg-open https://github.com');
      expect(res).toContain('start "" https://github.com');
    });

    it('should translate package managers to winget on Windows', () => {
      const res1 = adapter.translateCommand('sudo apt-get install -y nginx');
      expect(res1).toContain('winget install nginx');

      const res2 = adapter.translateCommand('brew install ripgrep');
      expect(res2).toContain('winget install ripgrep');
    });
  });

  describe('Step Command Resolution with Platform Overrides', () => {
    it('should prioritize explicit platform command variant when present', () => {
      const step: WorkflowStepDefinition = {
        id: 'step-1',
        name: 'Open Browser',
        command: 'xdg-open https://example.com',
        platformCommands: {
          macos: 'open https://example.com',
          windows: 'start "" "https://example.com"'
        }
      };

      expect(adapter.resolveStepCommand(step)).toBe('start "" "https://example.com"');
    });

    it('should fall back to translation when explicit platform variant is not specified', () => {
      const step: WorkflowStepDefinition = {
        id: 'step-2',
        name: 'Clean Directory',
        command: 'rm -rf ./dist'
      };

      const winRes = adapter.resolveStepCommand(step);
      expect(winRes).toContain('Remove-Item');
      expect(winRes).toContain('./dist');
    });
  });
});
