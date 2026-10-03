/**
 * AutoRemediationPolicy.ts — decides whether a detected error may be fixed without asking.
 *
 * Watched files and terminal output are untrusted input: a crafted log line such as
 * "Cannot find module 'evil-pkg'" must never make Cero install a package (typosquatting plus
 * postinstall scripts = arbitrary code execution). So unattended fixes are limited to a small
 * table of vetted, standalone commands that are local, idempotent and need no privileges.
 * Every other remediation is proposed and goes through the normal consent flow.
 */

import type { RemediationSuggestion } from './DeterministicRuleOracle';

export type AutoRemediationMode = 'off' | 'suggest' | 'auto-safe';

export interface RemediationDecision {
  action: 'auto' | 'propose' | 'ignore';
  /** Exact command to run for an 'auto' decision (never the rule's free-form template) */
  command?: string;
  reason: string;
}

interface VettedFix {
  /** Standalone command for the working directory and the error text; idempotent and unprivileged */
  command: (cwd: string, output: string) => string;
  why: string;
}

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * Absolute path of the lock file named in git's "Unable to create '<path>/.git/index.lock'"
 * error. A watched log usually lives outside the repository, so the error line is the only
 * reliable pointer to the right repo. Only a file literally named .git/index.lock qualifies.
 */
export function extractIndexLockPath(output: string): string | null {
  const m = output.match(/Unable to create '([^'\n]+\/\.git\/index\.lock)'/);
  if (!m) return null;
  const path = m[1];
  if (!path.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(path) || /[\x00-\x1f]/.test(path)) return null;
  return path;
}

/** The only fixes that may run unattended, keyed by DeterministicRuleOracle rule id. */
export const VETTED_AUTO_FIXES: Record<string, VettedFix> = {
  git_index_lock: {
    // Only remove the lock when no git process is alive, otherwise it is not stale
    command: (cwd, output) => {
      const lock = extractIndexLockPath(output);
      return lock
        ? `! pgrep -x git >/dev/null && rm -f ${shellQuote(lock)}`
        : `cd ${shellQuote(cwd)} && ! pgrep -x git >/dev/null && rm -f .git/index.lock`;
    },
    why: 'Removes a stale .git/index.lock left by a crashed git process (only when no git process is running)'
  }
};

export class AutoRemediationPolicy {
  public static readonly STORAGE_KEY = 'cero_auto_remediation_mode';
  /** The same fix is not repeated for the same directory within this window */
  public static readonly REPEAT_WINDOW_MS = 10 * 60_000;
  /** Upper bound on unattended fixes per hour across everything */
  public static readonly MAX_AUTO_PER_HOUR = 5;

  private lastApplied = new Map<string, number>();
  private appliedTimes: number[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  private static currentMode: AutoRemediationMode | null = null;

  public static getMode(): AutoRemediationMode {
    if (AutoRemediationPolicy.currentMode) return AutoRemediationPolicy.currentMode;
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(AutoRemediationPolicy.STORAGE_KEY) : null;
      if (saved === 'off' || saved === 'suggest' || saved === 'auto-safe') return saved;
    } catch {
      // storage unavailable
    }
    return 'suggest';
  }

  public static setMode(mode: AutoRemediationMode): void {
    AutoRemediationPolicy.currentMode = mode;
    try {
      localStorage.setItem(AutoRemediationPolicy.STORAGE_KEY, mode);
    } catch {
      // storage unavailable
    }
  }

  public decide(
    suggestion: RemediationSuggestion,
    options: { mode: AutoRemediationMode; source: 'rule_oracle' | 'model'; cwd: string; output?: string }
  ): RemediationDecision {
    if (options.mode === 'off') return { action: 'ignore', reason: 'Automatic remediation is off' };
    if (options.source !== 'rule_oracle') {
      return { action: 'propose', reason: 'Model-generated fixes always need confirmation' };
    }
    if (options.mode !== 'auto-safe') return { action: 'propose', reason: 'Suggest mode' };

    const vetted = VETTED_AUTO_FIXES[suggestion.ruleId];
    if (!vetted) return { action: 'propose', reason: `${suggestion.ruleName} is not on the unattended list` };
    if (suggestion.requiresElevation) return { action: 'propose', reason: 'Needs elevated privileges' };

    // Rate limits are per concrete fix: the same rule in another repository is a new problem
    const command = vetted.command(options.cwd, options.output || '');
    const key = `${suggestion.ruleId}@${command}`;
    const now = this.now();
    const last = this.lastApplied.get(key);
    if (last !== undefined && now - last < AutoRemediationPolicy.REPEAT_WINDOW_MS) {
      return { action: 'propose', reason: 'Already applied recently; the problem came back' };
    }
    this.appliedTimes = this.appliedTimes.filter(t => now - t < 60 * 60_000);
    if (this.appliedTimes.length >= AutoRemediationPolicy.MAX_AUTO_PER_HOUR) {
      return { action: 'propose', reason: 'Hourly limit for unattended fixes reached' };
    }

    return { action: 'auto', command, reason: vetted.why };
  }

  /** Call after an automatic fix actually ran, so rate limits apply. */
  public recordApplied(suggestion: RemediationSuggestion, cwd: string, command?: string): void {
    const now = this.now();
    const fix = command ?? VETTED_AUTO_FIXES[suggestion.ruleId]?.command(cwd, '') ?? cwd;
    this.lastApplied.set(`${suggestion.ruleId}@${fix}`, now);
    this.appliedTimes.push(now);
  }
}
