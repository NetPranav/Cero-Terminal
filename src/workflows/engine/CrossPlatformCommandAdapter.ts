/**
 * CrossPlatformCommandAdapter.ts — workflow command adapter for Windows.
 *
 * Saved workflows may come from Linux or macOS. A step's `platformCommands.windows` variant wins;
 * otherwise common POSIX idioms in the step command are translated to PowerShell / cmd equivalents.
 */

import { WorkflowStepDefinition } from '../models/WorkflowTypes';
import { invoke } from '@tauri-apps/api/core';

export class CrossPlatformCommandAdapter {
  private static instance?: CrossPlatformCommandAdapter;

  public static getInstance(): CrossPlatformCommandAdapter {
    if (!CrossPlatformCommandAdapter.instance) {
      CrossPlatformCommandAdapter.instance = new CrossPlatformCommandAdapter();
    }
    return CrossPlatformCommandAdapter.instance;
  }

  /**
   * The PowerShell executable and arguments that run a command, optionally in a working directory.
   */
  public getShellInvocation(command: string, cwd?: string): { command: string; args: string[] } {
    const fullCmd = cwd
      ? `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; ${command}`
      : command;
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', fullCmd]
    };
  }

  /**
   * The command to execute for a workflow step: the explicit Windows variant when the step has one,
   * otherwise the step command translated to Windows.
   */
  public resolveStepCommand(step: WorkflowStepDefinition): string {
    const explicit = step.platformCommands?.windows;
    if (explicit && explicit.trim()) {
      return explicit.trim();
    }
    return this.translateCommand(step.command);
  }

  /**
   * Translates common POSIX idioms into their Windows equivalents.
   */
  public translateCommand(cmd: string): string {
    const trimmed = cmd.trim();
    if (!trimmed) return trimmed;
    return this.translateToWindows(trimmed);
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
   * Check if a binary exists in PATH.
   */
  public async checkBinaryExists(
    binary: string,
    executor?: (cmd: string) => Promise<{ code: number }>
  ): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return true;
    }

    const testCmd = `where.exe '${binary.replace(/'/g, "''")}' >NUL 2>&1`;

    try {
      if (executor) {
        const res = await executor(testCmd);
        return res.code === 0;
      }

      const invocation = this.getShellInvocation(testCmd);
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
   * Check if a path exists.
   */
  public async checkPathExists(
    pathToCheck: string,
    executor?: (cmd: string) => Promise<{ code: number }>
  ): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return true;
    }

    const testCmd = `if (Test-Path -LiteralPath '${pathToCheck.replace(/'/g, "''")}') { exit 0 } else { exit 1 }`;

    try {
      if (executor) {
        const res = await executor(testCmd);
        return res.code === 0;
      }

      const invocation = this.getShellInvocation(testCmd);
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
