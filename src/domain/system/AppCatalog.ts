/**
 * AppCatalog.ts: the apps installed on this computer, and the one a name means.
 *
 * Listing is one shell command per place; parsing and matching are pure so they are tested with
 * saved samples. `resolveApp` never guesses: no match is "missing", a close call is "choose".
 */
import { scoreName, type NameWhy } from './NameMatch';
import { aliasTargets, APP_ALIASES } from './appAliases';
import { posixQuote, powershellQuote } from '../../utils/shellQuote';
import type { OpenOs } from './OpenInApp';

export interface AppEntry {
  name: string;
  /** other names it answers to (generic name, keywords) */
  aliases: string[];
  launch: { kind: 'desktop' | 'bundle' | 'appid' | 'exec'; value: string; exec?: string };
  source: string;
}

export type AppResolution =
  | { type: 'found'; app: AppEntry }
  | { type: 'choose'; candidates: Array<{ app: AppEntry; score: number; why: NameWhy }>; reason: 'several' | 'typo' | 'close' }
  | { type: 'missing'; closest: string[] };

export const LINUX_APP_DIRS = [
  '/usr/share/applications',
  '/usr/local/share/applications',
  '~/.local/share/applications',
  '/var/lib/flatpak/exports/share/applications',
  '~/.local/share/flatpak/exports/share/applications',
  '/var/lib/snapd/desktop/applications',
];

/** Parse `grep -H` output of .desktop files: "/path/x.desktop:Key=Value" */
export function parseDesktopEntries(output: string, source = 'desktop'): AppEntry[] {
  const files = new Map<string, Record<string, string>>();
  for (const line of output.split('\n')) {
    const m = line.match(/^(.+?\.desktop):(Name|GenericName|Keywords|Exec|NoDisplay|Hidden)=(.*)$/);
    if (!m) continue;
    const rec = files.get(m[1]) ?? {};
    if (rec[m[2]] === undefined) rec[m[2]] = m[3].trim();
    files.set(m[1], rec);
  }
  const apps = new Map<string, AppEntry>();
  for (const [file, rec] of files) {
    if (!rec.Name || /^true$/i.test(rec.NoDisplay || '') || /^true$/i.test(rec.Hidden || '')) continue;
    const id = file.split('/').pop()!.replace(/\.desktop$/, '');
    // field codes (%U, %f) and Flatpak file-forwarding markers (@@u ... @@) are for file arguments we do not pass
    const exec = (rec.Exec || '').replace(/\s@@\w*/g, '').replace(/\s%[a-zA-Z]/g, '').replace(/%[a-zA-Z]/g, '').trim();
    const aliases = [rec.GenericName, ...(rec.Keywords || '').split(';')].map(s => (s || '').trim()).filter(Boolean);
    if (!apps.has(id)) apps.set(id, { name: rec.Name, aliases, launch: { kind: 'desktop', value: id, exec }, source: /flatpak/.test(file) ? 'flatpak' : /snapd/.test(file) ? 'snap' : source });
  }
  return [...apps.values()];
}

/** `ls` of /Applications and friends: "Visual Studio Code.app" */
export function parseMacApps(output: string): AppEntry[] {
  return output.split('\n').map(l => l.trim()).filter(l => /\.app\/?$/.test(l)).map(l => {
    const name = l.replace(/\/$/, '').replace(/\.app$/, '');
    return { name, aliases: [], launch: { kind: 'bundle' as const, value: name }, source: 'applications' };
  });
}

/** `Get-StartApps | ConvertTo-Csv`-style "Name","AppID" lines, or "Name   AppID" columns */
export function parseWindowsStartApps(output: string): AppEntry[] {
  const apps: AppEntry[] = [];
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (!line || /^"?Name"?[ ,]/i.test(line) || /^-+(\s+-+)*$/.test(line)) continue;
    const csv = line.match(/^"(.+?)","(.+)"$/);
    const cols = csv ?? line.match(/^(.+?)\s{2,}(\S.*)$/);
    if (!cols) continue;
    apps.push({ name: cols[1].trim(), aliases: [], launch: { kind: 'appid', value: cols[2].trim() }, source: 'start-menu' });
  }
  return apps;
}

export function listCommands(os: OpenOs): string[] {
  // `|| true`: a folder that does not exist makes ls exit 1, and the listing is still good
  if (os === 'macos') return ['ls -1 /Applications ~/Applications /System/Applications /System/Applications/Utilities 2>/dev/null || true'];
  if (os === 'windows') return ['Get-StartApps | ForEach-Object { \'"\' + $_.Name + \'","\' + $_.AppID + \'"\' }'];
  return LINUX_APP_DIRS.map(d => `grep -H -E '^(Name|GenericName|Keywords|Exec|NoDisplay|Hidden)=' ${d.startsWith('~') ? `"$HOME${d.slice(1)}"` : d}/*.desktop 2>/dev/null || true`);
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
  const apps = os === 'macos' ? parseMacApps(text) : os === 'windows' ? parseWindowsStartApps(text) : parseDesktopEntries(text);
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
    // the same app listed twice (deb and Flatpak) is a real choice; the same name from one source is not
    const names = new Set(exactish.map(x => `${x.app.name}|${x.app.source}`));
    if (names.size === 1) return { type: 'found', app: top.app };
    return { type: 'choose', candidates: scored.slice(0, 6), reason: 'several' };
  }
  if (top.score >= 70 && (scored.length === 1 || top.score - scored[1].score >= 15) && top.why !== 'typo') {
    return { type: 'choose', candidates: scored.slice(0, 6), reason: 'close' };
  }
  return { type: 'choose', candidates: scored.slice(0, 6), reason: top.why === 'typo' ? 'typo' : 'close' };
}

/** The command that starts this app on this OS */
export function launchCommand(app: AppEntry, os: OpenOs): string {
  const { kind, value, exec } = app.launch;
  if (os === 'macos') return `open -a ${posixQuote(app.name)}`;
  if (os === 'windows') return kind === 'appid' ? `Start-Process ${powershellQuote(`shell:AppsFolder\\${value}`)}` : `Start-Process -FilePath ${powershellQuote(value)}`;
  if (kind === 'desktop') {
    const direct = exec ? ` || setsid -f ${exec} >/dev/null 2>&1` : '';
    return `(gtk-launch ${posixQuote(value)} >/dev/null 2>&1${direct})`;
  }
  return `setsid -f ${posixQuote(value)} >/dev/null 2>&1`;
}
