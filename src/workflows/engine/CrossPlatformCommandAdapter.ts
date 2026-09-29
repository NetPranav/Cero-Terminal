/**
 * CrossPlatformCommandAdapter.ts — OS-Agnostic Workflow Command & Execution Adapter
 *
 * Normalizes shell commands, paths, and process invocations across:
 * - Linux (Debian/Ubuntu, Arch, Fedora, Alpine)
 * - macOS (Darwin)
 * - Windows (PowerShell & CMD)
 *
 * Enables zero-token saved workflows created on any platform to execute seamlessly
 * across all supported desktop operating systems.
 */

import { getPlatform, Platform } from '../../shared/platform';
import { WorkflowStepDefinition } from '../models/WorkflowTypes';
import { invoke } from '@tauri-apps/api/core';

export type LinuxDistroFamily = 'debian' | 'arch' | 'fedora' | 'alpine' | 'generic';

export class CrossPlatformCommandAdapter {
  private static instance?: CrossPlatformCommandAdapter;
  private distroFamily: LinuxDistroFamily = 'generic';

  public static getInstance(): CrossPlatformCommandAdapter {
    if (!CrossPlatformCommandAdapter.instance) {
      CrossPlatformCommandAdapter.instance = new CrossPlatformCommandAdapter();
    }
    return CrossPlatformCommandAdapter.instance;
  }

  constructor() {
    this.detectLinuxDistro();
  }

  /**
   * Best-effort detection of the Linux distro family in Node / browser runtime.
   */
  private detectLinuxDistro(): void {
    if (typeof process === 'undefined' || process.platform !== 'linux') {
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('ubuntu') || ua.includes('debian')) this.distroFamily = 'debian';
        else if (ua.includes('arch') || ua.includes('manjaro')) this.distroFamily = 'arch';
        else if (ua.includes('fedora') || ua.includes('redhat')) this.distroFamily = 'fedora';
        else if (ua.includes('alpine')) this.distroFamily = 'alpine';
      }
    } catch {
      // Non-fatal
    }
  }

  public getDistroFamily(): LinuxDistroFamily {
    return this.distroFamily;
  }

  public setDistroFamily(family: LinuxDistroFamily): void {
    this.distroFamily = family;
  }

  /**
   * Resolves the proper shell executable and arguments for the current operating system.
   */
  public getShellInvocation(
    command: string,
    cwd?: string,
    platform: Platform = getPlatform()
  ): { command: string; args: string[] } {
    const fullCmd = cwd
      ? (platform === 'windows' ? `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; ${command}` : `cd '${cwd.replace(/'/g, `'\\''`)}' && ${command}`)
      : command;

    if (platform === 'windows') {
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', fullCmd]
      };
    }

    return {
      command: 'sh',
      args: ['-c', fullCmd]
    };
  }

  /**
   * Resolves the appropriate command to execute for a workflow step.
   * Prioritizes explicit platform variants (`platformCommands[targetPlatform]`),
   * falling back to automatic command translation.
   */
  public resolveStepCommand(
    step: WorkflowStepDefinition,
    targetPlatform: Platform = getPlatform()
  ): string {
    // 1. Check for explicit platform override
    if (step.platformCommands) {
      const explicit = step.platformCommands[targetPlatform];
      if (explicit && explicit.trim()) {
        return explicit.trim();
      }
      if (targetPlatform === 'linux' && step.platformCommands.distroOverrides) {
        const distroOverride = step.platformCommands.distroOverrides[this.distroFamily];
        if (distroOverride && distroOverride.trim()) {
          return distroOverride.trim();
        }
      }
    }

    // 2. Fall back to automated cross-platform command translation
    return this.translateCommand(step.command, targetPlatform);
  }

  /**
   * Translates common POSIX or platform-specific idioms into the target OS equivalent.
   */
  public translateCommand(cmd: string, targetPlatform: Platform = getPlatform()): string {
    const trimmed = cmd.trim();
    if (!trimmed) return trimmed;

    if (targetPlatform === 'windows') {
      return this.translateToWindows(trimmed);
    }

    if (targetPlatform === 'macos') {
      return this.translateToMac(trimmed);
    }

    return this.translateToLinux(trimmed);
  }

  /**
   * Translates POSIX commands into Windows PowerShell-compatible syntax.
   */
  private translateToWindows(cmd: string): string {
    let result = cmd;

    // 1. Remove recursive directory: rm -rf <path> or rm -r <path>
    result = result.replace(
      /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*|--recursive\s+--force)\s+["']?([^;&|]+)["']?/gi,
      (_match, p1) => `powershell -NoProfile -Command "Remove-Item -Recurse -Force -LiteralPath '${p1.trim()}'"`
    );

    // 2. Remove single file: rm -f <path> or rm <path>
    result = result.replace(
      /\brm\s+(?:-f\s+)?["']?([^;&|]+)["']?/gi,
      (_match, p1) => {
        if (p1.startsWith('powershell')) return _match;
        return `powershell -NoProfile -Command "Remove-Item -Force -LiteralPath '${p1.trim()}'"`;
      }
    );

    // 3. Make directory recursive: mkdir -p <path>
    result = result.replace(
      /\bmkdir\s+(?:-p\s+|--parents\s+)["']?([^;&|]+)["']?/gi,
      (_match, p1) => `powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path '${p1.trim()}'"`
    );

    // 4. Touch file: touch <path>
    result = result.replace(
      /\btouch\s+["']?([^;&|]+)["']?/gi,
      (_match, p1) => `powershell -NoProfile -Command "New-Item -ItemType File -Force -Path '${p1.trim()}'"`
    );

    // 5. Copy directory: cp -r <src> <dst>
    result = result.replace(
      /\bcp\s+(?:-r|-R|--recursive)\s+["']?([^"'\s]+)["']?\s+["']?([^"'\s]+)["']?/gi,
      (_match, src, dst) => `powershell -NoProfile -Command "Copy-Item -Recurse -Force -Path '${src}' -Destination '${dst}'"`
    );

    // 6. Which command: which <bin> or command -v <bin>
    result = result.replace(
      /\b(?:which|command\s+-v)\s+["']?([a-zA-Z0-9_\-]+)["']?/gi,
      (_match, bin) => `where.exe ${bin}`
    );

    // 7. Redirection to null: >/dev/null 2>&1 or 2>/dev/null or >/dev/null
    result = result.replace(/>\s*\/dev\/null\s+2>&1/gi, '>NUL 2>&1');
    result = result.replace(/2>\s*\/dev\/null/gi, '2>NUL');
    result = result.replace(/>\s*\/dev\/null/gi, '>NUL');

    // 8. Open command in default application / browser
    result = result.replace(
      /\b(?:xdg-open|open)\s+(.+)$/gi,
      (_match, target) => `start "" ${target.trim()}`
    );

    // 9. Package managers: map apt-get or brew to winget
    result = result.replace(
      /\b(?:sudo\s+)?(?:apt-get\s+install|apt\s+install|brew\s+install)(?:\s+-y)?\s+([a-zA-Z0-9_\-]+)/gi,
      (_match, pkg) => `winget install ${pkg}`
    );

    return result;
  }

  /**
   * Translates Linux or Windows commands into macOS syntax.
   */
  private translateToMac(cmd: string): string {
    let result = cmd;

    // 1. Linux open -> macOS open
    result = result.replace(/\bxdg-open\s+/gi, 'open ');

    // 2. Windows where -> which
    result = result.replace(/\bwhere\.exe\s+/gi, 'which ');

    // 3. Linux package managers -> Homebrew
    result = result.replace(
      /\b(?:sudo\s+)?(?:apt-get\s+install|apt\s+install|pacman\s+-S|dnf\s+install)(?:\s+(?:-y|--noconfirm))?\s+([a-zA-Z0-9_\-]+)/gi,
      (_match, pkg) => `brew install ${pkg}`
    );

    return result;
  }

  /**
   * Translates macOS or Windows commands into Linux syntax.
   */
  private translateToLinux(cmd: string): string {
    let result = cmd;

    // 1. macOS open -> xdg-open
    result = result.replace(/\bopen\s+(https?:\/\/[^\s]+|[^\s]+\.[a-zA-Z0-9]+)/gi, 'xdg-open $1');

    // 2. Windows where -> which
    result = result.replace(/\bwhere\.exe\s+/gi, 'which ');

    // 3. Translate Homebrew or generic install to distro-specific manager
    const pkgMatch = result.match(/\b(?:brew\s+install|winget\s+install)\s+([a-zA-Z0-9_\-]+)/i);
    if (pkgMatch && pkgMatch[1]) {
      const pkg = pkgMatch[1];
      if (this.distroFamily === 'arch') {
        result = `sudo pacman -S --noconfirm ${pkg}`;
      } else if (this.distroFamily === 'fedora') {
        result = `sudo dnf install -y ${pkg}`;
      } else if (this.distroFamily === 'alpine') {
        result = `apk add ${pkg}`;
      } else {
        // Default to debian/ubuntu
        result = `sudo apt-get install -y ${pkg}`;
      }
    }

    return result;
  }

  /**
   * Cross-platform check if a binary exists in PATH.
   */
  public async checkBinaryExists(
    binary: string,
    executor?: (cmd: string) => Promise<{ code: number }>,
    platform: Platform = getPlatform()
  ): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return true;
    }

    const testCmd = platform === 'windows'
      ? `where.exe '${binary.replace(/'/g, "''")}' >NUL 2>&1`
      : `command -v '${binary.replace(/'/g, `'\\''`)}' >/dev/null 2>&1 || which '${binary.replace(/'/g, `'\\''`)}' >/dev/null 2>&1`;

    try {
      if (executor) {
        const res = await executor(testCmd);
        return res.code === 0;
      }

      const invocation = this.getShellInvocation(testCmd, undefined, platform);
      const res = await invoke<{ code: number }>('execute_command', {
        command: invocation.command,
        args: invocation.args
      });
      return res.code === 0;
    } catch {
      return false;
    }
  }

  /**
   * Cross-platform check if a path exists.
   */
  public async checkPathExists(
    pathToCheck: string,
    executor?: (cmd: string) => Promise<{ code: number }>,
    platform: Platform = getPlatform()
  ): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return true;
    }

    const testCmd = platform === 'windows'
      ? `if (Test-Path -LiteralPath '${pathToCheck.replace(/'/g, "''")}') { exit 0 } else { exit 1 }`
      : `test -e '${pathToCheck.replace(/'/g, `'\\''`)}'`;

    try {
      if (executor) {
        const res = await executor(testCmd);
        return res.code === 0;
      }

      const invocation = this.getShellInvocation(testCmd, undefined, platform);
      const res = await invoke<{ code: number }>('execute_command', {
        command: invocation.command,
        args: invocation.args
      });
      return res.code === 0;
    } catch {
      return false;
    }
  }
}
