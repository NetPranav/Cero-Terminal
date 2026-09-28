/**
 * ShellSDKCapability.ts — Concrete Execution Driver for Explicit Shell Commands
 * 
 * Mapped from Tool Registry: "shell.execute"
 */

import { BaseCapabilityDriver, CapabilityExecutionResult, ExecutionContext, Platform } from '../CapabilitySDK';
import { invoke } from '@tauri-apps/api/core';
import { isLinux, isWindows } from '../../../shared/platform';
import { chooseRosDistro, withRosEnvironment } from '../../../domain/ros/RosEnvironment';
import { SystemKnowledgeScanner } from '../../../domain/knowledge/SystemKnowledgeScanner';

export interface ShellDriverInput {
  /** A complete shell command line, for example `git status --short`. */
  command: string;
  /** One-line plain English explanation of what the command does, without jargon */
  explanation?: string;
  /** @deprecated Prefer a complete command line in `command`. */
  args?: string[];
  cwd?: string;
  /** Kill the command (and everything it spawned) after this many ms. */
  timeoutMs?: number;
}

/** Default budget for an agent-issued command; long enough for builds, short enough to never hang forever. */
export const DEFAULT_SHELL_TIMEOUT_MS = 5 * 60 * 1000;

export class ShellSDKCapability extends BaseCapabilityDriver<ShellDriverInput, any> {
  readonly capabilityId = 'shell.execute';
  readonly name = 'Arbitrary Shell Execution Driver';
  readonly supportedPlatforms: Platform[] = ['macos', 'windows', 'linux'];

  private runningPid?: number;

  public async run(command: string, cwd?: string): Promise<CapabilityExecutionResult<{ stdout: string; stderr: string; code: number }>> {
    return this.execute({ command, cwd });
  }

  protected async performExecution(
    input: ShellDriverInput,
    _context: ExecutionContext,
    cancelToken: { cancelled: boolean }
  ): Promise<CapabilityExecutionResult<any>> {
    if (cancelToken.cancelled) {
      return { success: false, cancelled: true };
    }

    if (!input.command) {
      return { success: false, error: { code: 'MISSING_SHELL_CMD', message: 'Command string required for shell.execute' } };
    }

    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      const commandLine = this.toCommandLine(input);
      return {
        success: true,
        data: { stdout: `mock output for ${commandLine}`, stderr: '', code: 0 },
        commandExecuted: commandLine
      };
    }

    try {
      const commandLine = this.toCommandLine(input);
      const shellBinary = isLinux() ? '/bin/bash' : (isWindows() ? 'powershell.exe' : '/bin/zsh');
      // ros2/colcon/rosdep only exist after sourcing ROS; non-interactive bash never reads ~/.bashrc
      const runnable = isLinux() ? withRosEnvironment(commandLine, this.rosDistro()) : commandLine;
      const shellArgs = isWindows() ? ['-Command', runnable] : ['-c', runnable];

      const output = await invoke<{ stdout: string; stderr: string; code: number; pid?: number; timed_out?: boolean }>('execute_command', {
        command: shellBinary,
        args: shellArgs,
        cwd: input.cwd || _context?.cwd,
        timeoutMs: input.timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS
      });

      if (output.pid) {
        this.runningPid = output.pid;
      }

      const isSuccess = output.code === 0;
      return {
        success: isSuccess,
        data: { stdout: output.stdout, stderr: output.stderr, code: output.code },
        error: !isSuccess
          ? output.timed_out
            ? { code: 'TIMEOUT', message: `Command timed out and was terminated: ${output.stderr || output.stdout}` }
            : { code: 'NON_ZERO_EXIT', message: `Command exited with status code ${output.code}: ${output.stderr || output.stdout}` }
          : undefined,
        commandExecuted: commandLine
      };
    } catch (e: any) {
      const errMsg = typeof e === 'string'
        ? e
        : (e?.message || (e ? JSON.stringify(e) : 'Error occurred while executing command in shell'));
      return { success: false, error: { code: 'SHELL_INVOKER_ERROR', message: errMsg } };
    }
  }

  public async verify(_input: ShellDriverInput, result: CapabilityExecutionResult<any>): Promise<boolean> {
    return result.success && result.data?.code === 0;
  }

  public async cancel(): Promise<boolean> {
    const cancelled = await super.cancel();
    if (this.runningPid) {
      try {
        await invoke('kill_process', { pid: this.runningPid });
      } catch {
        // ignore errors during process termination
      }
    }
    return cancelled;
  }

  private rosDistro(): string | undefined {
    const ros = SystemKnowledgeScanner.getInstance().getProfile()?.ros;
    return ros ? chooseRosDistro(ros.distros, ros.activeDistro) : undefined;
  }

  private toCommandLine(input: ShellDriverInput): string {
    let raw = input.command || '';
    if (input.args?.length) {
      // Backward-compatible support for callers that still pass a binary and
      // separate arguments. JSON-string quoting is shell-safe for zsh values.
      raw = [input.command, ...input.args.map(arg => JSON.stringify(arg))].join(' ');
    }
    // Automatically sanitize read-only diagnostic commands by removing 'sudo'
    // Non-interactive subshells cannot supply sudo passwords, causing silent empty failures
    return raw.replace(/^sudo\s+(lsof|netstat|ps|ifconfig|vm_stat|sw_vers|pmset|cat|grep|find|cut|awk|head|tail|sed)\b/, '$1');
  }
}
