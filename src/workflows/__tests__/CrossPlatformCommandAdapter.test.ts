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
      const inv = adapter.getShellInvocation('echo hello', undefined, 'windows');
      expect(inv.command).toBe('powershell.exe');
      expect(inv.args).toEqual(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'echo hello']);
    });

    it('should generate powershell invocation with cwd on Windows', () => {
      const inv = adapter.getShellInvocation('npm test', 'C:\\projects\\app', 'windows');
      expect(inv.command).toBe('powershell.exe');
      expect(inv.args[inv.args.length - 1]).toContain('Set-Location');
    });

    it('should generate sh invocation on Linux and macOS', () => {
      const linuxInv = adapter.getShellInvocation('echo hello', undefined, 'linux');
      expect(linuxInv.command).toBe('sh');
      expect(linuxInv.args).toEqual(['-c', 'echo hello']);

      const macInv = adapter.getShellInvocation('echo hello', '/tmp', 'macos');
      expect(macInv.command).toBe('sh');
      expect(macInv.args).toEqual(['-c', "cd '/tmp' && echo hello"]);

      // a folder is data: nothing inside it is expanded or run
      const evil = adapter.getShellInvocation('echo hi', '/tmp/$(touch pwned)`id`\'x', 'macos');
      expect(evil.args[1]).toBe("cd '/tmp/$(touch pwned)`id`'\\''x' && echo hi");
      expect(adapter.getShellInvocation('echo hi', "C:\\it's", 'windows').args.join(' ')).toContain("Set-Location -LiteralPath 'C:\\it''s'");
    });
  });

  describe('POSIX to Windows Command Translation', () => {
    it('should translate rm -rf to PowerShell Remove-Item', () => {
      const res = adapter.translateCommand('rm -rf ./build', 'windows');
      expect(res).toContain('Remove-Item');
      expect(res).toContain('-Recurse');
      expect(res).toContain('-Force');
      expect(res).toContain('./build');
    });

    it('should translate mkdir -p to PowerShell New-Item', () => {
      const res = adapter.translateCommand('mkdir -p ./logs/archive', 'windows');
      expect(res).toContain('New-Item');
      expect(res).toContain('-ItemType Directory');
      expect(res).toContain('./logs/archive');
    });

    it('should translate which and command -v to where.exe', () => {
      const res1 = adapter.translateCommand('which node', 'windows');
      expect(res1).toBe('where.exe node');

      const res2 = adapter.translateCommand('command -v cargo', 'windows');
      expect(res2).toBe('where.exe cargo');
    });

    it('should translate null redirects on Windows', () => {
      const res1 = adapter.translateCommand('echo test >/dev/null 2>&1', 'windows');
      expect(res1).toContain('>NUL 2>&1');

      const res2 = adapter.translateCommand('cat file 2>/dev/null', 'windows');
      expect(res2).toContain('2>NUL');
    });

    it('should translate open / xdg-open to start on Windows', () => {
      const res = adapter.translateCommand('xdg-open https://github.com', 'windows');
      expect(res).toContain('start "" https://github.com');
    });

    it('should translate package managers to winget on Windows', () => {
      const res1 = adapter.translateCommand('sudo apt-get install -y nginx', 'windows');
      expect(res1).toContain('winget install nginx');

      const res2 = adapter.translateCommand('brew install ripgrep', 'windows');
      expect(res2).toContain('winget install ripgrep');
    });
  });

  describe('POSIX to macOS Command Translation', () => {
    it('should translate xdg-open to open on macOS', () => {
      const res = adapter.translateCommand('xdg-open https://github.com', 'macos');
      expect(res).toBe('open https://github.com');
    });

    it('should translate apt-get to brew on macOS', () => {
      const res = adapter.translateCommand('sudo apt-get install -y node', 'macos');
      expect(res).toBe('brew install node');
    });
  });

  describe('Linux Distro Package Management Translation', () => {
    it('should translate brew install to apt on Debian/Ubuntu family', () => {
      adapter.setDistroFamily('debian');
      const res = adapter.translateCommand('brew install curl', 'linux');
      expect(res).toBe('sudo apt-get install -y curl');
    });

    it('should translate brew install to pacman on Arch family', () => {
      adapter.setDistroFamily('arch');
      const res = adapter.translateCommand('brew install curl', 'linux');
      expect(res).toBe('sudo pacman -S --noconfirm curl');
    });

    it('should translate brew install to dnf on Fedora family', () => {
      adapter.setDistroFamily('fedora');
      const res = adapter.translateCommand('brew install curl', 'linux');
      expect(res).toBe('sudo dnf install -y curl');
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

      expect(adapter.resolveStepCommand(step, 'macos')).toBe('open https://example.com');
      expect(adapter.resolveStepCommand(step, 'windows')).toBe('start "" "https://example.com"');
    });

    it('should fall back to translation when explicit platform variant is not specified', () => {
      const step: WorkflowStepDefinition = {
        id: 'step-2',
        name: 'Clean Directory',
        command: 'rm -rf ./dist'
      };

      const winRes = adapter.resolveStepCommand(step, 'windows');
      expect(winRes).toContain('Remove-Item');
      expect(winRes).toContain('./dist');
    });
  });
});
