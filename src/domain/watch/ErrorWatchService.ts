/**
 * ErrorWatchService.ts — continuous error detection on log files and systemd units (`>watch`).
 *
 * The Rust tailer streams new lines; this service keeps a little context per watch, finds lines
 * that look like errors, asks the deterministic rule oracle for a fix, and then follows
 * AutoRemediationPolicy: vetted fixes may run unattended ('auto-safe' mode), everything else is
 * proposed to the user and applied only through the normal consent flow. Watched content is
 * untrusted, so nothing it says is ever executed except those vetted, fixed templates.
 */

import { ERROR_SIGNAL } from '../observer/PtyOutputObserver';
import { DeterministicRuleOracle, RemediationSuggestion } from '../remediation/DeterministicRuleOracle';
import { AutoRemediationPolicy, AutoRemediationMode } from '../remediation/AutoRemediationPolicy';
import { UndoLog } from '../session/UndoLog';
import { getPlatform } from '../../shared/platform';

export interface WatchTarget {
  id: number;
  kind: 'file' | 'service';
  target: string;
  /** Which terminal tab (AgentLoop) started it, so only that tab shows its notices */
  owner?: string;
}

export type WatchEvent =
  | { type: 'proposal'; watch: WatchTarget; errorLine: string; suggestion: RemediationSuggestion; context: string }
  | { type: 'auto-fixed'; watch: WatchTarget; errorLine: string; suggestion: RemediationSuggestion; command: string; exitCode: number; output: string }
  | { type: 'error'; watch: WatchTarget; errorLine: string; context: string };

export interface WatchBackend {
  startFile(path: string): Promise<number>;
  startService(unit: string, user: boolean): Promise<number>;
  stop(id: number): Promise<boolean>;
  list(): Promise<{ id: number; kind: string; target: string }[]>;
  /** Subscribe to line batches; returns an unsubscribe function */
  onLines(handler: (id: number, lines: string[]) => void): Promise<() => void>;
  run(command: string): Promise<{ code: number; stdout: string; stderr: string }>;
}

const CONTEXT_LINES = 30;
/** The same error is reported at most once per window per watch */
const DEDUPE_WINDOW_MS = 5 * 60_000;
/** Unmatched errors (no known fix) are reported at most this often per watch */
const UNMATCHED_INTERVAL_MS = 30_000;

/** Stable key for "the same error": digits, hex ids and paths vary between occurrences */
function errorKey(line: string): string {
  // Numbers vary between repeats of one error; the tail of a path says which repo or file it is
  return line.toLowerCase()
    .replace(/0x[0-9a-f]+|\d+/g, '#')
    .replace(/\/[^\s:'"]+/g, p => `…/${p.split('/').filter(Boolean).slice(-3).join('/')}`)
    .slice(0, 160);
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i > 0 ? p.slice(0, i) : '/';
}

function tauriBackend(): WatchBackend {
  const core = () => import('@tauri-apps/api/core');
  return {
    startFile: async (path) => (await core()).invoke<number>('watch_file_start', { path }),
    startService: async (unit, user) => (await core()).invoke<number>('watch_service_start', { unit, user }),
    stop: async (id) => (await core()).invoke<boolean>('watch_stop', { id }),
    list: async () => (await core()).invoke('watch_list'),
    onLines: async (handler) => {
      const { listen } = await import('@tauri-apps/api/event');
      return listen<{ id: number; lines: string[] }>('sentinel-watch-lines', e => handler(e.payload.id, e.payload.lines));
    },
    run: async (command) => (await core()).invoke('execute_command', { command: 'sh', args: ['-c', command], timeoutMs: 30_000 }),
  };
}

export class ErrorWatchService {
  private static instance: ErrorWatchService | null = null;

  private watches = new Map<number, WatchTarget>();
  private context = new Map<number, string[]>();
  private reported = new Map<string, number>();
  private lastUnmatched = new Map<number, number>();
  private listeners = new Set<(event: WatchEvent) => void>();
  private unsubscribe: (() => void) | null = null;
  private pendingProposals: Extract<WatchEvent, { type: 'proposal' }>[] = [];
  private lastError: Extract<WatchEvent, { type: 'error' }> | undefined;

  constructor(
    private readonly backend: WatchBackend = tauriBackend(),
    private readonly policy: AutoRemediationPolicy = new AutoRemediationPolicy(),
    private readonly now: () => number = () => Date.now(),
    private readonly modeProvider: () => AutoRemediationMode = () => AutoRemediationPolicy.getMode()
  ) {}

  public static getInstance(): ErrorWatchService {
    if (!ErrorWatchService.instance) ErrorWatchService.instance = new ErrorWatchService();
    return ErrorWatchService.instance;
  }

  public onEvent(listener: (event: WatchEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async ensureSubscribed(): Promise<void> {
    if (!this.unsubscribe) {
      this.unsubscribe = await this.backend.onLines((id, lines) => {
        this.handleLines(id, lines).catch(err => console.warn('[ErrorWatchService] handling failed:', err));
      });
    }
  }

  public async watchFile(path: string, owner?: string): Promise<WatchTarget> {
    await this.ensureSubscribed();
    const id = await this.backend.startFile(path);
    const watch: WatchTarget = { id, kind: 'file', target: path, owner };
    this.watches.set(id, watch);
    return watch;
  }

  public async watchService(unit: string, user = false, owner?: string): Promise<WatchTarget> {
    await this.ensureSubscribed();
    const id = await this.backend.startService(unit, user);
    const watch: WatchTarget = { id, kind: 'service', target: unit, owner };
    this.watches.set(id, watch);
    return watch;
  }

  public async unwatch(idOrTarget: string): Promise<WatchTarget[]> {
    const matches = [...this.watches.values()].filter(w =>
      idOrTarget === 'all' || String(w.id) === idOrTarget || w.target === idOrTarget || w.target.endsWith(`/${idOrTarget}`));
    for (const w of matches) {
      await this.backend.stop(w.id);
      this.watches.delete(w.id);
      this.context.delete(w.id);
    }
    return matches;
  }

  public list(): WatchTarget[] {
    return [...this.watches.values()].sort((a, b) => a.id - b.id);
  }

  /** Most recent unapplied proposal, removed from the queue (for `>watch fix`). */
  public takeLatestProposal(): Extract<WatchEvent, { type: 'proposal' }> | undefined {
    return this.pendingProposals.pop();
  }

  /** Most recent error without a known fix (for `>watch fix`, which then asks the model). */
  public takeLatestError(): Extract<WatchEvent, { type: 'error' }> | undefined {
    const last = this.lastError;
    this.lastError = undefined;
    return last;
  }

  private emit(event: WatchEvent): void {
    for (const l of this.listeners) {
      try { l(event); } catch { /* listener errors must not stop watching */ }
    }
  }

  public async handleLines(id: number, lines: string[]): Promise<void> {
    const watch = this.watches.get(id);
    if (!watch || lines.length === 0) return;

    const buffer = [...(this.context.get(id) || []), ...lines].slice(-CONTEXT_LINES);
    this.context.set(id, buffer);

    // Each new error is handled on its own (a read can carry several), newest last
    const errorIndexes = lines.map((l, i) => (ERROR_SIGNAL.test(l) ? i : -1)).filter(i => i >= 0).slice(-5);
    let previous = -1;
    for (const index of errorIndexes) {
      await this.handleError(watch, id, lines, index, previous, buffer);
      previous = index;
    }
  }

  private async handleError(watch: WatchTarget, id: number, lines: string[], index: number, previous: number, buffer: string[]): Promise<void> {
    const errorLine = lines[index];
    const key = `${id}:${errorKey(errorLine)}`;
    const now = this.now();
    const last = this.reported.get(key);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return;

    const context = buffer.join('\n');
    // Diagnose the error with the few lines around it, never the older buffer: an earlier
    // error must not be "fixed" again when an unrelated line arrives
    const cwd = watch.kind === 'file' ? dirname(watch.target) : '~';
    const os = getPlatform() === 'macos' ? 'mac' : 'linux';
    const oracle = DeterministicRuleOracle.getInstance();
    const around = lines.slice(Math.max(previous + 1, index - 5), index + 3).join('\n');
    const suggestion = oracle.diagnose({ command: '', output: errorLine, cwd, os })
      ?? oracle.diagnose({ command: '', output: around, cwd, os });

    if (!suggestion) {
      const lastUnmatched = this.lastUnmatched.get(id) ?? -Infinity;
      if (now - lastUnmatched < UNMATCHED_INTERVAL_MS) return;
      this.lastUnmatched.set(id, now);
      this.reported.set(key, now);
      this.lastError = { type: 'error', watch, errorLine, context };
      this.emit(this.lastError);
      return;
    }

    const decision = this.policy.decide(suggestion, { mode: this.modeProvider(), source: 'rule_oracle', cwd, output: errorLine });
    if (decision.action === 'ignore') return;
    this.reported.set(key, now);

    if (decision.action === 'auto' && decision.command) {
      const result = await this.backend.run(decision.command);
      this.policy.recordApplied(suggestion, cwd, decision.command);
      UndoLog.getInstance().recordAction({ goal: `watch auto-fix: ${suggestion.title}`, command: decision.command, tool: 'shell.execute' });
      this.emit({
        type: 'auto-fixed', watch, errorLine, suggestion, command: decision.command,
        exitCode: result.code, output: (result.stdout || result.stderr || '').trim()
      });
      return;
    }

    const proposal = { type: 'proposal' as const, watch, errorLine, suggestion, context };
    this.pendingProposals.push(proposal);
    if (this.pendingProposals.length > 20) this.pendingProposals.shift();
    this.emit(proposal);
  }
}
