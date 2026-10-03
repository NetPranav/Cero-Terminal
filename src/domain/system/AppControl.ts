/**
 * AppControl.ts — quit an app the user names, after checking what is actually running.
 *
 * "stop the claude application" used to run `pkill -9 -i -f claude`: a guess at the name, and a
 * forced kill of every process whose command line contained the word (a terminal whose folder
 * had "claude" in its path, a CLI tool, the app's helpers). Now:
 *   1. list what is running (a read, no approval),
 *   2. match the user's words to one running app, ignoring case ("claude" finds "Claude"),
 *   3. ask for approval with the exact name, and quit it the normal way (the app can ask to save),
 *   4. check that it is gone.
 * Nothing matches: say so and name the closest running apps. Several match: ask which one.
 */

import { editDistance } from './NameMatch';

export type AppOs = 'macos' | 'linux' | 'windows';

export interface QuitRequest {
  /** What the user called it: "claude", "vs code", "google chrome" */
  name: string;
  /** "force quit", "kill -9": no chance to save */
  force: boolean;
  /** "if music is running, close it": not running is fine */
  ifRunning: boolean;
  /** The user said "app"/"application": command-line processes do not count */
  appOnly: boolean;
  /** The verb was quit/close/kill/terminate (not only "stop"): answer even when nothing matches */
  explicit: boolean;
}

export interface RunningItem {
  name: string;
  /** A desktop app (has a window / an .app bundle) rather than a command-line process */
  app: boolean;
}

// Things "stop"/"close" refer to that are not apps: other routes handle them
const NOT_AN_APP = /^(?:(?:the\s+)?(?:dev\s+|web\s+|local\s+|http\s+)?server|(?:this|the|that|current|other|last|first)?\s*(?:tab|pane|split|terminal|window|shell|session)(?:\s+\d+)?|tab\s+\d+|terminal\s+\d+|it|this|that|everything|all|settings|cero(?:\s+terminal)?|port\s+\d+|pid\s+\d+|\d+|the\s+build|build|watch(?:er|ing)?|recording|the\s+recording|it\s+all|(?:the\s+)?(?:command|process)(?:\s+(?:on|using)\s+port\s+\d+)?|.*\bport\s+\d+.*|.*\b(?:in|on)\s+tab\s+\d+.*)$/i;

const VERB = '(?:force\\s+quit|force\\s+close|force\\s+kill|quit|close|stop|kill|terminate|exit|shut\\s*down|end)';

export function parseQuitRequest(goal: string): QuitRequest | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const t = text.replace(/^(?:please\s+|can\s+you\s+|could\s+you\s+|hey\s+)+/i, '');

  // "if claude is running then close it", "if any app named music is running, quit it"
  let m = t.match(new RegExp(`^if\\s+(?:any\\s+)?(?:(?:app|application|program|process)\\s+)?(?:(?:named|called)\\s+)?["'\`]?(.+?)["'\`]?\\s+is\\s+(?:running|open)\\s*,?\\s*(?:then\\s+)?(${VERB})\\s+(?:it|that)$`, 'i'));
  if (m) return build(m[1], m[2], t, true);

  // "terminate or stop the claude application", "quit Safari and Mail" (first app only), "kill -9 chrome"
  m = t.match(new RegExp(`^(${VERB})(?:\\s+(?:or|and|\\/)\\s+${VERB})*\\s+(?:-9\\s+)?(?:the\\s+|my\\s+|an?\\s+)?(?:(?:app|application|program|process)\\s+(?:named\\s+|called\\s+)?)?["'\`]?(.+?)["'\`]?(?:\\s+(?:app|application|program|process))?(?:\\s+(?:now|please|for\\s+me|completely))?$`, 'i'));
  if (m) return build(m[2], m[1], t, false);
  return null;
}

function build(rawName: string, verb: string, text: string, ifRunning: boolean): QuitRequest | null {
  const name = rawName.trim().replace(/^(?:the|my)\s+/i, '').replace(/\s+(?:app|application|program|process)$/i, '').trim();
  if (!name || name.length > 40 || NOT_AN_APP.test(name)) return null;
  // Several targets or shell syntax: not a single app name
  if (/[;&|`$<>\\/]|\s(?:and|then)\s/i.test(name)) return null;
  return {
    name,
    force: /\bforce\b|-9\b/i.test(text),
    ifRunning,
    appOnly: /\b(?:app|application)\b/i.test(text),
    explicit: !/^stop$/i.test(verb.trim()) || /\b(?:app|application|program|process)\b/i.test(text),
  };
}

// ---- what is running ------------------------------------------------------------------------

/** A read-only command that lists running apps and processes */
export function listRunningCommand(os: AppOs): string {
  if (os === 'windows') {
    return "Get-Process | ForEach-Object { $(if ($_.MainWindowHandle -ne 0) { 'A' } else { 'P' }) + [char]9 + $_.ProcessName }";
  }
  return os === 'macos' ? 'ps -axo comm=' : 'ps -eo comm=';
}

const MAC_SYSTEM = /^\/(?:System\/Library|Library|usr|sbin|bin)\//;

export function parseRunning(stdout: string, os: AppOs): RunningItem[] {
  const seen = new Map<string, RunningItem>();
  // An app and a command-line tool may share a name ("Claude" and "claude"): both are kept
  const add = (name: string, app: boolean) => {
    const key = `${app ? 'A' : 'P'}:${name.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, { name, app });
  };
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (os === 'windows') {
      const [kind, name] = line.split('\t');
      if (name) add(name.trim(), kind === 'A');
      continue;
    }
    if (os === 'macos') {
      // The main executable of an app bundle: /Applications/Claude.app/Contents/MacOS/Claude
      // (helpers live deeper: .../Claude.app/Contents/Frameworks/Claude Helper.app/...)
      const main = line.match(/^((?:(?!\.app\/).)*?)\/([^/]+)\.app\/Contents\/MacOS\/[^/]+$/);
      if (main && !MAC_SYSTEM.test(line)) { add(main[2], true); continue; }
      if (/\.app\//.test(line)) continue; // helpers, widgets and system agents
    }
    const base = line.split('/').pop()!.trim();
    if (base && !/^\[.*\]$/.test(base)) add(base, false);
  }
  return [...seen.values()];
}

// ---- matching -------------------------------------------------------------------------------

const ALIASES: Record<string, string[]> = {
  'vs code': ['Visual Studio Code', 'Code'], vscode: ['Visual Studio Code', 'Code'], code: ['Visual Studio Code', 'Code'],
  chrome: ['Google Chrome', 'chrome'], 'google chrome': ['Google Chrome', 'chrome'], edge: ['Microsoft Edge', 'msedge'],
  firefox: ['Firefox', 'firefox'], word: ['Microsoft Word', 'WINWORD'], excel: ['Microsoft Excel', 'EXCEL'],
  teams: ['Microsoft Teams', 'ms-teams', 'Teams'], outlook: ['Microsoft Outlook', 'OUTLOOK'], terminal: ['Terminal'],
  'system settings': ['System Settings'], settings: ['System Settings'], iterm: ['iTerm2', 'iTerm'],
};

const norm = (s: string) => s.toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]+/g, '');

export type MatchResult =
  | { kind: 'one'; item: RunningItem }
  | { kind: 'many'; items: RunningItem[] }
  | { kind: 'none'; closest: RunningItem[] };

export function matchRunning(query: string, running: RunningItem[], appOnly: boolean): MatchResult {
  const pool = appOnly ? running.filter(r => r.app) : running;
  const wanted = [query, ...(ALIASES[query.toLowerCase()] ?? [])].map(norm).filter(Boolean);
  const tiers: Array<(n: string) => boolean> = [
    n => wanted.includes(n),
    n => wanted.some(w => w.length >= 3 && n.startsWith(w)),
    n => wanted.some(w => w.length >= 4 && n.includes(w)),
  ];
  for (const test of tiers) {
    const hits = pool.filter(r => test(norm(r.name)));
    if (hits.length === 0) continue;
    // A desktop app wins over command-line processes of the same tier
    const apps = hits.filter(h => h.app);
    const best = apps.length ? apps : hits;
    return best.length === 1 ? { kind: 'one', item: best[0] } : { kind: 'many', items: best.slice(0, 6) };
  }
  const q = norm(query);
  const closest = pool
    .map(r => ({ r, d: distance(q, norm(r.name).slice(0, Math.max(q.length, 1) + 2)) }))
    .filter(x => x.d <= Math.max(2, Math.floor(q.length / 3)))
    .sort((a, b) => a.d - b.d || Number(b.r.app) - Number(a.r.app))
    .slice(0, 5)
    .map(x => x.r);
  return { kind: 'none', closest };
}

const distance = editDistance;

// ---- quitting -------------------------------------------------------------------------------

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const psq = (s: string) => `'${s.replace(/'/g, "''")}'`;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The command that quits exactly this app or process */
export function quitCommand(item: RunningItem, os: AppOs, force: boolean): string {
  if (os === 'windows') {
    return item.app && !force
      ? `Get-Process -Name ${psq(item.name)} -ErrorAction Stop | ForEach-Object { [void]$_.CloseMainWindow() }`
      : `Stop-Process -Name ${psq(item.name)} -Force -ErrorAction Stop`;
  }
  if (os === 'macos' && item.app) {
    // Quit through the app (it may ask to save); a forced quit ends every process of that bundle only
    return force
      ? `pkill -9 -f -- ${sq(`/${escapeRegex(item.name)}\\.app/Contents/`)}`
      : `osascript -e ${sq(`quit app "${item.name.replace(/["\\]/g, '')}"`)}`;
  }
  return `pkill ${force ? '-9 ' : ''}-x -- ${sq(item.name)}`;
}
