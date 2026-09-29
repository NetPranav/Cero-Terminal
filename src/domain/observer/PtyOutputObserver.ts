/**
 * Sentinel Terminal — Passive PTY Output Stream Observer
 *
 * Monitors real-time terminal stdout/stderr stream from standard shell sessions.
 * When non-AI commands crash or fail with diagnostic signatures (e.g. EADDRINUSE,
 * git index lock, missing modules), it correlates the failure and offers 1-click
 * inline remediation without requiring user prompt copy-pasting.
 */

import { ErrorDiagnosticsEngine } from '../../ai/agent/ErrorDiagnosticsEngine';
import { SentinelSerlCoordinator } from '../learning/SentinelSerlCoordinator';
import { getPlatform } from '../../shared/platform';

/**
 * Cheap gate in front of the rule oracle. Most terminal output (build progress, logs, redraws)
 * contains no error at all, and running ~60 rules over the last 40 lines for every chunk was the
 * observer's main cost.
 */
export const ERROR_SIGNAL = new RegExp([
  'error', '\\berr\\b', 'err!', 'fatal', 'fail', 'exception', 'traceback', 'panic', 'denied', 'not found', 'no such',
  'refused', 'in use', 'eaddrinuse', 'eacces', 'unable to', 'cannot', "can't", 'could not', 'timed out', 'segmentation',
  'abort', 'conflict', 'rejected', 'hint:', 'already exists', 'lock', 'upstream', 'fast-forward', 'fetch first',
  'nothing to commit', 'not staged', 'would be overwritten', 'ignored by', 'did you', 'similar command', 'missing',
  'externally.managed', 'no crate', 'requires admin', 'overwrite', 'is a directory', 'does not exist', 'illegal',
  'not permitted', 'superuser', 'not running', 'not a tty', 'damaged', 'servname', 'invalid', 'bad flag',
  'no changes', 'another git process', 'err_'
].join('|'), 'i');

/** "failed" that is not a zero count ("0 failed", "failed: 0") */
function reportsFailure(text: string): boolean {
  if (/error:|fatal:|command not found|traceback|panicked at/i.test(text)) return true;
  return /\bfailed\b/i.test(text) && !/\b0\s+failed\b|\bfailed:?\s+0\b/i.test(text);
}

export interface RemediationPrompt {
  id: string;
  cause: string;
  actionTitle: string;
  tool: string;
  params: Record<string, any>;
  rawError: string;
  timestamp: number;
  fixedCommand?: string;
  /** The command whose output triggered this remediation, when it could be identified */
  failedCommand?: string;
  /** Last lines of terminal output, so the model sees the actual error text */
  outputTail?: string;
}

export class PtyOutputObserver {
  private static instance: PtyOutputObserver;
  private recentOutputBuffer: string[] = [];
  private activeRemediation: RemediationPrompt | null = null;
  private listeners: ((remediation: RemediationPrompt | null) => void)[] = [];
  private isSuspended: boolean = false;
  /** Last command reported to SERL, so one failing command is logged once, not once per chunk */
  private lastReportedFailure = '';
  /**
   * Programs write one error across several writes ("...not a git command", then "The most
   * similar command is", then "status"), which can arrive as separate chunks. After a chunk with
   * an error signal, the following chunks are diagnosed too until this time.
   */
  private errorWindowUntil = 0;
  /** The fix last announced, so re-diagnosing the same error does not announce it twice */
  private lastRemediationKey = '';
  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Shared instance for callers outside a terminal pane; each TerminalView owns its own observer. */
  public static getInstance(): PtyOutputObserver {
    if (!PtyOutputObserver.instance) {
      PtyOutputObserver.instance = new PtyOutputObserver();
    }
    return PtyOutputObserver.instance;
  }

  public isObserverSuspended(): boolean {
    return this.isSuspended;
  }

  public setSuspended(suspended: boolean): void {
    this.isSuspended = suspended;
  }

  /**
   * Ingest streaming terminal output chunks
   */
  public ingest(chunk: string, cwd?: string, command?: string): RemediationPrompt | null {
    if (!chunk) return null;

    // Detect alternate screen buffer entry/exit sequences BEFORE stripping ANSI
    // \x1b[?1049h or \x1b[?47h: Enter alternate screen buffer (e.g. vim, htop, tmux, less)
    if (chunk.includes('\x1b[?1049h') || chunk.includes('\x1b[?47h')) {
      this.isSuspended = true;
    }
    // \x1b[?1049l or \x1b[?47l: Exit alternate screen buffer
    if (chunk.includes('\x1b[?1049l') || chunk.includes('\x1b[?47l')) {
      this.isSuspended = false;
    }

    // When inside an interactive full-screen TUI application, suspend passive observation
    // to prevent misfiring auto-heal suggestions on TUI redraws.
    if (this.isSuspended) {
      return null;
    }

    // Filter out common raw ANSI escape codes to inspect clean text
    const cleanChunk = chunk.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

    // Keep last 40 lines of scrollback
    const lines = cleanChunk.split(/\r?\n/).filter(Boolean);
    this.recentOutputBuffer.push(...lines);
    if (this.recentOutputBuffer.length > 40) {
      this.recentOutputBuffer = this.recentOutputBuffer.slice(this.recentOutputBuffer.length - 40);
    }

    // Attempt to extract latest shell command from scrollback if not passed
    let detectedCommand = command;
    if (!detectedCommand) {
      for (let i = this.recentOutputBuffer.length - 1; i >= 0; i--) {
        const line = this.recentOutputBuffer[i].trim();
        const promptMatch = line.match(/(?:[$%#>]\s+|\$\s*)([a-zA-Z0-9_\.\-\/]+.*)/);
        if (promptMatch) {
          detectedCommand = promptMatch[1].trim();
          break;
        }
      }
    }

    if (ERROR_SIGNAL.test(cleanChunk)) {
      this.errorWindowUntil = this.now() + 2000;
    } else if (this.now() > this.errorWindowUntil) {
      return null;
    }

    const fullRecent = this.recentOutputBuffer.join('\n');
    const diag = ErrorDiagnosticsEngine.diagnose(fullRecent, undefined, undefined, cwd, detectedCommand);

    if (diag.category === 'SOFTWARE_RECOVERABLE' && diag.remediation) {
      const fixedCmd = diag.remediation.params?.command;
      const key = `${diag.cause}|${fixedCmd ?? diag.remediation.title}`;
      // getActiveRemediation() expires old fixes, so the same typo later is announced again
      const current = this.getActiveRemediation();
      if (key === this.lastRemediationKey && current) {
        return current;
      }
      this.lastRemediationKey = key;
      const remediation: RemediationPrompt = {
        id: 'rem_' + Date.now(),
        cause: diag.cause,
        actionTitle: diag.remediation.title,
        tool: diag.remediation.tool,
        params: diag.remediation.params,
        rawError: diag.cause,
        timestamp: Date.now(),
        fixedCommand: fixedCmd,
        failedCommand: detectedCommand,
        outputTail: this.recentOutputBuffer.slice(-15).join('\n')
      };
      this.activeRemediation = remediation;
      this.notify(remediation);
      return remediation;
    } else if (detectedCommand && reportsFailure(cleanChunk) && detectedCommand !== this.lastReportedFailure) {
      this.lastReportedFailure = detectedCommand;
      try {
        SentinelSerlCoordinator.getInstance().onCommandExecutionFailure(
          `Shell command: ${detectedCommand}`,
          detectedCommand,
          1,
          cleanChunk,
          { cwd, os: getPlatform() }
        );
      } catch {
        // Non-blocking background deficit logging
      }
    }

    return null;
  }

  public getActiveRemediation(): RemediationPrompt | null {
    // Expire remediation after 2 minutes
    if (this.activeRemediation && Date.now() - this.activeRemediation.timestamp > 120000) {
      this.activeRemediation = null;
    }
    return this.activeRemediation;
  }

  public clearRemediation(): void {
    this.activeRemediation = null;
    this.lastRemediationKey = '';
    this.errorWindowUntil = 0;
    this.recentOutputBuffer = [];
    this.notify(null);
  }

  public onRemediation(listener: (remediation: RemediationPrompt | null) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(rem: RemediationPrompt | null): void {
    this.listeners.forEach(l => {
      try {
        l(rem);
      } catch { /* ignore listener error */ }
    });
  }
}
