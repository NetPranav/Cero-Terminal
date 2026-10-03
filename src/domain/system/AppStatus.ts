/**
 * AppStatus.ts: "is the amphetmine application running or not".
 *
 * The name a person types is rarely the exact name of the process. The check is therefore never "does a process with
 * exactly this name exist": it lists what is really running, compares the name loosely (case, spelling, a typo) and says
 * which real app it matched.
 */
import { type RunningItem, matchRunning } from './AppControl';
import { rankNames } from './NameMatch';

const GREETING = /^(?:hey|hi|hello|yo)(?:\s+there)?[\s,!.]*/i;
const NOT_AN_APP = /^(?:it|this|that|anything|something|everything|the\s+server|server|port|ports|wi-?fi|bluetooth|internet|network|battery|vpn|the\s+network|the\s+internet|there)$/i;
const FILLER = /\b(?:the|my|an?)\b|\b(?:application|app|program|process)\b/gi;

export interface AppStatusRequest {
  /** what was typed, cleaned: "amphetmine" */
  name: string;
}

const clean = (s: string) => s.replace(FILLER, ' ').replace(/\s+/g, ' ').replace(/^[\s"'`]+|[\s"'`?.!]+$/g, '').trim();

export function parseAppStatus(goal: string): AppStatusRequest | null {
  const text = goal.trim().replace(GREETING, '').replace(/^(?:please|can you|could you|tell me|let me know|i want to know|check)\s+/i, '').trim();
  const patterns: RegExp[] = [
    /^is\s+there\s+(?:an?\s+)?(.+?)\s+(?:application|app|process)\s+running[\s?.!]*$/i,
    /^(?:if|whether)\s+(.+?)\s+(?:is|are)\s+(?:currently\s+|still\s+)?(?:running|open|opened|active|launched|started)(?:\s+or\s+not)?[\s?.!]*$/i,
    /^(?:is|are)\s+(.+?)\s+(?:currently\s+|still\s+)?(?:running|open|opened|active|launched|started)(?:\s+or\s+not)?[\s?.!]*$/i,
    /^(?:the\s+)?(.+?)\s+(?:application|app|program)\s+(?:status|state)[\s?.!]*$/i,
    /^(?:what(?:'s|\s+is)\s+)?(?:the\s+)?(?:status|state)\s+of\s+(?:the\s+)?(.+?)(?:\s+(?:application|app|program))?[\s?.!]*$/i,
    /^(?:about\s+)?(?:the\s+)?(.+?)\s+(?:application|app|program)\s+(?:status|state)[\s?.!]*$/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const name = clean(m[1].replace(/^(?:about|the)\s+/i, ''));
    if (!name || name.length > 40 || /[\\/;&|`$<>]/.test(name) || NOT_AN_APP.test(name) || /\b(?:port|server|service)\b/i.test(name)) continue;
    if (/^\d+$/.test(name)) continue;
    return { name };
  }
  return null;
}

export type StatusMatch =
  | { kind: 'running'; item: RunningItem; exact: boolean }
  | { kind: 'several'; items: RunningItem[] }
  | { kind: 'not-running'; closest: RunningItem[] };

/** Find the running app a loosely typed name means */
export function findRunningApp(name: string, running: RunningItem[]): StatusMatch {
  const m = matchRunning(name, running, false);
  if (m.kind === 'one') return { kind: 'running', item: m.item, exact: true };
  if (m.kind === 'many') return { kind: 'several', items: m.items };
  // nothing by the usual rules: a typo or a different spelling ("amphetmine" for "Amphetamine")
  const ranked = rankNames(name, running, r => r.name, { min: 44, limit: 5 });
  const apps = ranked.filter(r => r.item.app);
  const pool = apps.length ? apps : ranked;
  if (pool.length === 0) return { kind: 'not-running', closest: [] };
  const top = pool[0];
  if (pool.length === 1 || top.score - pool[1].score >= 10) return { kind: 'running', item: top.item, exact: false };
  return { kind: 'several', items: pool.map(p => p.item) };
}

export function describeStatus(typed: string, match: StatusMatch, installed?: string): string {
  switch (match.kind) {
    case 'running':
      return match.exact || match.item.name.toLowerCase().replace(/[^a-z0-9]/g, '') === typed.toLowerCase().replace(/[^a-z0-9]/g, '')
        ? `${match.item.name} is running.`
        : `${match.item.name} is running. (You wrote "${typed}"; that is the closest running ${match.item.app ? 'app' : 'process'}.)`;
    case 'several':
      return `Several running things could be "${typed}": ${match.items.map(i => i.name).join(', ')}. Say which one.`;
    case 'not-running':
      return installed
        ? `${installed} is installed but not running right now.`
        : match.closest.length
          ? `No app called "${typed}" is running. Running with a similar name: ${match.closest.map(c => c.name).join(', ')}.`
          : `No app or process like "${typed}" is running, and I did not find one installed with that name.`;
  }
}
