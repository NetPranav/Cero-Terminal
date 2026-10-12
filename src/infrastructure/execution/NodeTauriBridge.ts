/**
 * NodeTauriBridge.ts — Seamless Tauri IPC Polyfill for Node.js / CLI Environments
 * 
 * Enables all Cero Capability SDK drivers to execute real native macOS commands
 * directly in Node.js / CLI / test harnesses without requiring a Tauri GUI window.
 * 
 * Features:
 * - Emulates @tauri-apps/api/core `invoke` using Node.js `child_process`
 * - Real-time command inspection observer (records exact command, args, cwd, stdout, stderr, code, duration)
 * - Supports `execute_command`, `list_processes`, `kill_process`, `get_system_stats`, etc.
 */

import { spawnSync } from 'node:child_process';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CommandExecutionRecord {
  command: string;
  args: string[];
  fullCommand: string;
  cwd?: string;
  stdout: string;
  stderr: string;
  code: number;
  durationMs: number;
  timestamp: number;
  isAuditLog?: boolean;
}

export type CommandExecutionListener = (record: CommandExecutionRecord) => void;

export class NodeTauriBridge {
  private static installed = false;
  private static listeners: CommandExecutionListener[] = [];
  private static commandHistory: CommandExecutionRecord[] = [];

  /**
   * Install the Tauri invoke polyfill into global scope.
   */
  public static install(): void {
    if (this.installed) return;

    const invokeHandler = async (cmd: string, args?: Record<string, any>): Promise<any> => {
      return NodeTauriBridge.handleInvoke(cmd, args || {});
    };

    // Polyfill global window and __TAURI_INTERNALS__
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = globalThis;
    }

    const tauriInternals = (globalThis.window as any).__TAURI_INTERNALS__ || {};
    tauriInternals.invoke = invokeHandler;
    tauriInternals.transformCallback = (callback?: any) => callback;
    (globalThis.window as any).__TAURI_INTERNALS__ = tauriInternals;

    this.installed = true;
  }

  /**
   * Register a listener to observe every command executed by any capability driver.
   */
  public static onCommand(listener: CommandExecutionListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Get all recorded command executions in this session.
   */
  public static getHistory(includeAudit = true): CommandExecutionRecord[] {
    if (includeAudit) {
      return [...this.commandHistory];
    }
    return this.commandHistory.filter(c => !c.isAuditLog);
  }

  /**
   * Get capability commands executed by the user / agent (excludes internal audit logging and probe checks).
   */
  public static getCapabilityCommands(): CommandExecutionRecord[] {
    return this.commandHistory.filter(c => 
      !c.isAuditLog && 
      !c.fullCommand.includes('learned_patterns.json') &&
      !c.fullCommand.includes('test -f "$HOME/.cero/models')
    );
  }

  /**
   * Clear command history.
   */
  public static clearHistory(): void {
    this.commandHistory = [];
  }

  /**
   * Directly execute a command using the bridge.
   */
  public static execute(command: string, args: string[] = [], cwd?: string): { code: number; stdout: string; stderr: string } {
    // When called with a bare command string (no args), use sh -c for shell evaluation
    if (args.length === 0) {
      return this.handleInvoke('execute_command', { command: 'sh', args: ['-c', command], cwd });
    }
    return this.handleInvoke('execute_command', { command, args, cwd });
  }

  /**
   * Core dispatcher handling Tauri command requests.
   */
  private static handleInvoke(cmd: string, payload: Record<string, any>): any {
    switch (cmd) {
      case 'execute_command': {
        const command = payload.command || 'sh';
        const args: string[] = payload.args || [];
        const cwd = payload.cwd || process.cwd();

        const startTime = performance.now();
        let stdout = '';
        let stderr = '';
        let code = 0;

        try {
          // Resolve environment path so brew and system tools are available
          const env = {
            ...process.env,
            PATH: `${process.env.PATH || ''}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`
          };

          // Same contract as the app's execute_command: `timeoutMs` bounds the run when given.
          // CERO_CMD_TIMEOUT_MS caps every command in headless test runs.
          const cap = Number(process.env.CERO_CMD_TIMEOUT_MS) || 0;
          const requested = Number(payload.timeoutMs) || 0;
          const timeout = [requested, cap].filter(ms => ms > 0).reduce((a, b) => Math.min(a, b), Infinity);
          const result = spawnSync(command, args, {
            cwd,
            env,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
            shell: false,
            timeout: Number.isFinite(timeout) ? timeout : undefined
          });

          stdout = result.stdout || '';
          stderr = result.stderr || '';
          code = result.status ?? (result.error ? -1 : 0);

          if (result.error && !stderr) {
            stderr = result.error.message;
          }
        } catch (err: any) {
          stderr = err.message || 'Execution error';
          code = -1;
        }

        const durationMs = performance.now() - startTime;
        const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
        const isAuditLog = fullCommand.includes('.cero/audit.') || fullCommand.includes('audit.jsonl') || fullCommand.includes('audit.benchmark.jsonl');

        const record: CommandExecutionRecord = {
          command,
          args,
          fullCommand,
          cwd,
          stdout,
          stderr,
          code,
          durationMs,
          timestamp: Date.now(),
          isAuditLog
        };

        this.commandHistory.push(record);
        for (const listener of this.listeners) {
          try {
            listener(record);
          } catch {
            // Ignore listener errors
          }
        }

        return { stdout, stderr, code };
      }

      case 'list_processes': {
        try {
          const isLinux = process.platform === 'linux';
          const args = isLinux
            ? ['-eo', 'pid,pcpu,pmem,comm', '--sort=-pcpu']
            : ['-eo', 'pid,pcpu,pmem,comm', '-r'];
          const res = spawnSync('ps', args, { encoding: 'utf-8' });
          const lines = (res.stdout || '').split('\n').filter(Boolean);
          const processes: Array<{ pid: number; name: string; memory: number; cpu: number; cmd: string[] }> = [];

          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].trim().split(/\s+/);
            if (parts.length >= 4) {
              processes.push({
                pid: parseInt(parts[0], 10),
                cpu: parseFloat(parts[1]) || 0,
                memory: parseFloat(parts[2]) || 0,
                name: parts.slice(3).join(' '),
                cmd: [parts.slice(3).join(' ')]
              });
            }
          }
          return processes;
        } catch {
          return [];
        }
      }

      case 'kill_process': {
        const pid = payload.pid;
        if (!pid) return false;
        try {
          process.kill(pid, 'SIGTERM');
          return true;
        } catch {
          try {
            spawnSync('kill', ['-9', String(pid)]);
            return true;
          } catch {
            return false;
          }
        }
      }

      case 'get_system_stats': {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMemMb = Math.round((totalMem - freeMem) / (1024 * 1024));
        const load = os.loadavg();
        return {
          memory_used: usedMemMb,
          cpu_usage: (load[0] || 0) * 10
        };
      }

      case 'get_launch_args': {
        return process.argv;
      }

      case 'get_app_binary_path': {
        return process.execPath;
      }

      case 'write_system_file': {
        const filePath = (payload as any)?.path;
        const contents = (payload as any)?.contents ?? '';
        if (filePath) {
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(filePath, contents, 'utf-8');
        }
        return null;
      }

      case 'create_system_dir': {
        const dirPath = (payload as any)?.path;
        if (dirPath && !fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        return null;
      }

      case 'read_system_file': {
        const filePath = (payload as any)?.path;
        if (filePath && fs.existsSync(filePath)) {
          return fs.readFileSync(filePath, 'utf-8');
        }
        throw new Error(`File not found: ${filePath}`);
      }

      case 'check_path_exists': {
        const checkPath = (payload as any)?.path;
        return checkPath ? fs.existsSync(checkPath) : false;
      }

      case 'find_paths': {
        const a = payload as any;
        return findPaths(String(a?.query ?? ''), (a?.roots ?? []) as string[], String(a?.kind ?? 'any'), Number(a?.maxDepth ?? a?.max_depth ?? 3), Number(a?.limit ?? 20));
      }

      default:
        // No-op for GUI/window commands
        return null;
    }
  }
}


// ---- find_paths: the same bounded folder search the app does in Rust (src-tauri/src/path_search.rs) ----

const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'target', 'dist', 'build', '.venv', '__pycache__', 'Library', 'AppData', 'proc', 'sys', 'dev', 'snap']);
const PROTECTED_UNDER_HOME = new Set(['Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures', 'Public']);
const compactOf = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

function editDistanceLoose(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function couldMatch(query: string, name: string): boolean {
  if (!query) return true;
  const q = compactOf(query);
  const n = compactOf(name);
  if (!q || !n) return false;
  if (n.includes(q) || (q.includes(n) && n.length >= 3)) return true;
  return Math.abs(q.length - n.length) <= 3 && editDistanceLoose(q, n) <= 3;
}

function findPaths(query: string, roots: string[], kind: string, maxDepth: number, limit: number): Array<{ path: string; name: string; is_dir: boolean }> {
  const started = Date.now();
  const cap = Math.max(1, limit) * 10;
  const wantHidden = query.startsWith('.');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const out: Array<{ path: string; name: string; is_dir: boolean }> = [];
  const seen = new Set<string>();
  const queue: Array<[string, number]> = [];
  for (const r of roots) {
    const full = r === '~' ? home : r.startsWith('~/') ? path.join(home, r.slice(2)) : r;
    try { if (fs.statSync(full).isDirectory()) queue.push([full, 0]); } catch { /* missing root */ }
  }
  let visited = 0;
  while (queue.length) {
    const [dir, depth] = queue.shift()!;
    if (depth >= maxDepth || out.length >= cap || visited >= 20000 || Date.now() - started > 2000) break;
    let real = dir;
    try { real = fs.realpathSync(dir); } catch { /* keep */ }
    if (seen.has(real)) continue;
    seen.add(real);
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name)); } catch { continue; }
    for (const e of entries) {
      visited++;
      const isDir = e.isDirectory();
      const hidden = e.name.startsWith('.');
      if (isDir) {
        if (SKIP_DIRS.has(e.name) || (hidden && !wantHidden)) continue;
        // macOS asks permission the first time an app looks inside these; a search from the home folder leaves them out
        if (depth === 0 && dir === home && PROTECTED_UNDER_HOME.has(e.name)) continue;
        queue.push([path.join(dir, e.name), depth + 1]);
      } else if (hidden && !wantHidden) continue;
      const kindOk = kind === 'dir' ? isDir : kind === 'file' ? !isDir : true;
      if (kindOk && couldMatch(query, e.name)) {
        out.push({ path: path.join(dir, e.name), name: e.name, is_dir: isDir });
        if (out.length >= cap) break;
      }
    }
  }
  return out;
}
