/**
 * AppCatalog.ts: the apps installed on this computer, and the one a name means.
 *
 * Listing is one shell command per place; parsing and matching are pure so they are tested with
 * saved samples. `resolveApp` never guesses: no match is "missing", a close call is "choose".
 */
import { scoreName, type NameWhy } from './NameMatch';
import { aliasTargets, APP_ALIASES } from './appAliases';
import { powershellQuote } from '../../utils/shellQuote';
import type { OpenOs } from './OpenInApp';

export interface AppEntry {
  name: string;
  /** other names it answers to (generic name, keywords) */
  aliases: string[];
  launch: { kind: 'appid' | 'exec'; value: string };
  source: string;
}

export type AppResolution =
  | { type: 'found'; app: AppEntry }
  | { type: 'choose'; candidates: Array<{ app: AppEntry; score: number; why: NameWhy }>; reason: 'several' | 'typo' | 'close' }
  | { type: 'missing'; closest: string[] };

/** `Get-StartApps | ConvertTo-Csv`-style "Name","AppID" lines, or "Name   AppID" columns */
export function parseWindowsStartApps(output: string): AppEntry[] {
  const apps: AppEntry[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^"?Name"?[ ,]/i.test(line) || /^-+(\s+-+)*$/.test(line)) continue;
    const csv = line.match(/^"(.+?)","(.+)"$/);
    const cols = csv ?? line.match(/^(.+?)\s{2,}(\S.*)$/);
    if (!cols) continue;
    apps.push({ name: cols[1].trim(), aliases: [], launch: { kind: 'appid', value: cols[2].trim() }, source: 'start-menu' });
  }
  return apps;
}

// TODO(3.7): also the App Paths registry and Start-menu .lnk files, for apps Get-StartApps does not list
export function listCommands(_os: OpenOs): string[] {
  return ['Get-StartApps | ForEach-Object { \'"\' + $_.Name + \'","\' + $_.AppID + \'"\' }'];
}

let cache: { os: OpenOs; at: number; apps: AppEntry[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Installed apps for this OS; cached for five minutes. An empty list means "could not list". */
export async function loadCatalog(os: OpenOs, run: (command: string) => Promise<string>, now = Date.now()): Promise<AppEntry[]> {
  if (cache && cache.os === os && now - cache.at < TTL_MS) return cache.apps;
  const outputs: string[] = [];
  for (const cmd of listCommands(os)) {
    try { outputs.push(await run(cmd)); } catch { /* a missing folder is normal */ }
  }
  const text = outputs.join('\n');
  const apps = parseWindowsStartApps(text);
  cache = { os, at: now, apps };
  return apps;
}

export function clearCatalogCache(): void {
  cache = null;
}

/** Score one app for a query: the app's own names and the aliases people type */
function scoreApp(query: string, app: AppEntry): { score: number; why: NameWhy } {
  const targets = aliasTargets(query);
  let best = { score: 0, why: 'none' as NameWhy };
  const consider = (q: string, name: string, discount = 0, why?: NameWhy) => {
    const s = scoreName(q, name);
    if (s.score - discount > best.score) best = { score: s.score - discount, why: why ?? s.why };
  };
  consider(query, app.name);
  for (const a of app.aliases) consider(query, a, 10);
  for (const t of targets) consider(t, app.name);
  if (targets.length === 0) {
    // "crome" is not an alias, but it is one slip away from "chrome"
    for (const key of Object.keys(APP_ALIASES)) {
      const k = scoreName(query, key);
      if (k.why === 'typo') for (const t of APP_ALIASES[key]) consider(t, app.name, Math.round((100 - k.score) / 2), 'typo');
    }
  }
  return best;
}

export function resolveApp(query: string, apps: AppEntry[]): AppResolution {
  const scored = apps
    .map(app => ({ app, ...scoreApp(query, app) }))
    .filter(x => x.score >= 40)
    .sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name));
  if (scored.length === 0) return { type: 'missing', closest: [] };
  const top = scored[0];
  const exactish = scored.filter(x => x.score >= 95);
  if (exactish.length === 1 && (scored.length === 1 || top.score - scored[1].score >= 15)) return { type: 'found', app: top.app };
  if (exactish.length > 1) {
    // the same app listed twice from different sources is a real choice; the same name from one source is not
    const names = new Set(exactish.map(x => `${x.app.name}|${x.app.source}`));
    if (names.size === 1) return { type: 'found', app: top.app };
    return { type: 'choose', candidates: scored.slice(0, 6), reason: 'several' };
  }
  if (top.score >= 70 && (scored.length === 1 || top.score - scored[1].score >= 15) && top.why !== 'typo') {
    return { type: 'choose', candidates: scored.slice(0, 6), reason: 'close' };
  }
  return { type: 'choose', candidates: scored.slice(0, 6), reason: top.why === 'typo' ? 'typo' : 'close' };
}

/** The command that starts this app */
export function launchCommand(app: AppEntry, _os: OpenOs): string {
  const { kind, value } = app.launch;
  return kind === 'appid' ? `Start-Process ${powershellQuote(`shell:AppsFolder\\${value}`)}` : `Start-Process -FilePath ${powershellQuote(value)}`;
}
