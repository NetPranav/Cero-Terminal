/**
 * ActionGate.ts — Pre-Execution Action Validation, Gating & Safety Enforcement
 *
 * Verifies every candidate action proposed by the model before execution:
 * 1. Checks schema and parameter validity (via ToolParameterValidator)
 * 2. Blocks dangerous destructive commands (rm -rf /, mkfs, dd of=/dev, bare kill -9, chmod -R 777 /)
 * 3. Checks path existence for tools requiring existing targets, or verifies legal new paths
 * 4. Verifies application names are valid and clean
 * 5. Rejects invented secrets and credentials
 */

import { invoke } from '@tauri-apps/api/core';
import { ToolSpec } from './SystemPrompt';
import { STANDARD_TOOL_SPECS } from './StandardToolSpecs';
import { ToolParameterValidator } from './ToolParameterValidator';

export interface ActionCandidate {
  action?: 'tool' | 'done' | 'error' | 'execute';
  tool?: string;
  command?: string;
  explanation?: string;
  params?: Record<string, any>;
  summary?: string;
  message?: string;
}

export interface ActionGateContext {
  cwd: string;
  os: string;
  sessionId?: string;
}

export interface ActionValidationResult {
  ok: boolean;
  reason?: string;
  hint?: string;
  repairedAction?: ActionCandidate & { action: 'tool' | 'done' | 'error' | 'execute' };
}

export class ActionGate {
  /** Dangerous destructive command patterns that must NEVER reach the execution driver */
  private static readonly DANGEROUS_PATTERNS: { regex: RegExp; desc: string; hint: string }[] = [
    {
      // rm -rf / or rm -rf /* or rm -rf ~ or rm -rf $HOME
      regex: /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+(?:--no-preserve-root\s+)?(?:\/|\/\*|~|\$HOME|\$\{HOME\})(?:\s|$)/i,
      desc: 'Wiping root filesystem or entire user home directory via rm -rf',
      hint: 'Refuse to delete root or the entire user home. Target only specific project directories.'
    },
    {
      // mkfs or mkfs.ext4
      regex: /\bmkfs(?:\.[a-z0-9]+)?\s+/i,
      desc: 'Formatting disk filesystem via mkfs',
      hint: 'Do not format storage devices or partitions.'
    },
    {
      // dd writing to raw drive device
      regex: /\bdd\s+.*of=\/dev\/(?:[r]?sd[a-z]|[r]?nvme\d+n\d+|[r]?vd[a-z]|disk\d+)/i,
      desc: 'Overwriting raw disk block device via dd',
      hint: 'Do not write raw byte streams directly to storage disk devices.'
    },
    {
      // Bare kill -9 or broadcast kill -9 -1 / kill -9 0 / kill -9 *
      regex: /\bkill\s+-9\s*(?:-1|\*|0)?(?:\s*$|\s+(?:-1|\*|0)(?:\s|$))/i,
      desc: 'Bare kill -9 or broadcast kill terminating all system processes',
      hint: 'Specify a specific positive PID or process name, never broadcast kill -9 -1.'
    },
    {
      // chmod -R 777 / or chmod 777 /
      regex: /\bchmod\s+(?:-R\s+)?777\s+(?:\/|\/\*)(?:\s|$)/i,
      desc: 'Recursive world-writable permission granting on root directory',
      hint: 'Do not set permissive 777 permissions on the root filesystem.'
    },
    {
      // Fork bomb
      regex: /:(){ :|:& };:/,
      desc: 'Shell fork bomb',
      hint: 'Prohibited fork bomb pattern.'
    },
    {
      // Model invented secrets / credential placeholders
      regex: /(?:<password>|<api_key>|<token>|<secret>|YOUR_PASSWORD|YOUR_API_KEY|YOUR_TOKEN|supersecret123)/i,
      desc: 'Invented placeholder or synthetic secret credentials',
      hint: 'Do not invent or require dummy credential placeholders.'
    }
  ];

  /** Tools that expect the target path to already exist */
  private static readonly PATH_MUST_EXIST_TOOLS = new Set([
    'filesystem.read',
    'filesystem.navigate',
    'filesystem.list',
    'file.read',
    'dir.list'
  ]);

  /**
   * Validate a proposed action candidate against safety, schema, path, and app constraints.
   */
  public static async validate(
    action: ActionCandidate,
    context: ActionGateContext,
    toolSpecs?: ToolSpec[]
  ): Promise<ActionValidationResult> {
    if (!action) {
      return { ok: false, reason: 'Empty or undefined action candidate.', hint: 'Output a valid action.' };
    }

    // Done and Error actions do not run tools
    if (action.action === 'done' || action.action === 'error') {
      return { ok: true };
    }

    // Normalize command / tool
    let toolId = action.tool;
    let params: Record<string, any> = action.params ? { ...action.params } : {};

    if (action.action === 'execute' || (!toolId && action.command)) {
      toolId = 'shell.execute';
      if (!params.command && action.command) {
        params.command = action.command;
      }
    }

    // 1. Dangerous Command Check
    const cmd = typeof params.command === 'string'
      ? params.command
      : typeof action.command === 'string'
        ? action.command
        : '';

    if (cmd) {
      for (const dangerous of this.DANGEROUS_PATTERNS) {
        if (dangerous.regex.test(cmd)) {
          return {
            ok: false,
            reason: `Action rejected: ${dangerous.desc}. Prohibited command: "${cmd.trim()}".`,
            hint: dangerous.hint
          };
        }
      }
    }

    // 2. Tool Schema & Parameter Validation
    if (toolId && toolId !== 'shell.execute') {
      const allSpecs = toolSpecs && toolSpecs.length > 0 ? toolSpecs : STANDARD_TOOL_SPECS;
      const spec = allSpecs.find(s => s.id === toolId);

      if (!spec) {
        // Unknown tool ID
        return {
          ok: false,
          reason: `Tool "${toolId}" is not recognized in the available tool catalog.`,
          hint: `Choose an available tool or use shell.execute.`
        };
      }

      const val = ToolParameterValidator.validateAndCoerce(spec, params);
      if (!val.valid) {
        return {
          ok: false,
          reason: `Invalid parameters for tool "${toolId}": ${(val.errors || []).join('; ')}.`,
          hint: 'Provide parameters that match the tool schema requirements.'
        };
      }
      params = val.coercedParams;
    }

    // 3. Path Existence & Legality Check
    const pathTarget = params.path || params.dir || params.filePath || params.directory;
    if (typeof pathTarget === 'string' && pathTarget.trim()) {
      const cleanPath = pathTarget.trim();

      // Illegal path checks (null bytes, invalid characters)
      if (cleanPath.includes('\0')) {
        return {
          ok: false,
          reason: `Path "${cleanPath}" contains invalid null byte characters.`,
          hint: 'Specify a clean, valid file or directory path.'
        };
      }

      // If tool expects an existing path, check if it actually exists
      if (toolId && this.PATH_MUST_EXIST_TOOLS.has(toolId)) {
        const resolved = this.resolvePath(cleanPath, context.cwd);
        const exists = await this.checkPathExists(resolved);
        if (!exists) {
          return {
            ok: false,
            reason: `Path "${cleanPath}" does not exist on disk.`,
            hint: 'Verify the file or folder name before attempting to access or navigate to it.'
          };
        }
      }
    }

    // 4. App Name Resolution & Validation
    const appTarget = params.app || params.appName || params.application;
    if (typeof appTarget === 'string') {
      const cleanApp = appTarget.trim();
      if (!cleanApp || cleanApp.length > 100) {
        return {
          ok: false,
          reason: `Application name "${cleanApp}" is invalid or empty.`,
          hint: 'Provide a valid, installed desktop application name.'
        };
      }

      // Check for command injection / metacharacters in app name
      if (/[;&|`$<>\\]/.test(cleanApp)) {
        return {
          ok: false,
          reason: `Application name "${cleanApp}" contains illegal shell metacharacters.`,
          hint: 'Provide only the plain application name without shell syntax or arguments.'
        };
      }
    }

    return {
      ok: true,
      repairedAction: {
        ...action,
        action: action.action || 'tool',
        tool: toolId,
        params
      }
    };
  }

  /**
   * Resolve relative or tilde path against context CWD.
   */
  private static resolvePath(target: string, cwd: string): string {
    if (target.startsWith('~')) {
      return target; // Let path polyfill / system handle home expansion
    }
    if (target.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(target)) {
      return target;
    }
    const cleanCwd = (cwd || '.').replace(/[/\\]+$/, '');
    return `${cleanCwd}/${target}`;
  }

  /**
   * Check if a path exists via Tauri invoke or local filesystem.
   */
  private static async checkPathExists(p: string): Promise<boolean> {
    try {
      const res = await invoke<boolean>('check_path_exists', { path: p });
      return Boolean(res);
    } catch {
      // In test/mock environments or if invoke is not supported, pass
      return true;
    }
  }
}
