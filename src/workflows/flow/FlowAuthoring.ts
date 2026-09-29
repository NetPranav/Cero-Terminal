/**
 * FlowAuthoring.ts — "make me a workflow that installs node and opens youtube in chrome".
 *
 * Turns the steps a person lists into a .flow document, using only what the planner already
 * understands (install, open a site or app, clone, download, run a command, folders). Nothing is
 * invented: a step that cannot be understood is reported and left out of the file, never guessed.
 * Every generated action is checked with the same code that later runs the file (stepForAction),
 * so a file written here always plans on macOS, Windows and Linux.
 */

import { splitChainClauses, commandForSingleClause } from '../engine/ChainPlanner';
import { stepForAction, KNOWN_APP_NAMES, KNOWN_BROWSER_NAMES, type FlowOs } from './FlowPlan';

export interface FlowCreateRequest {
  /** The steps as the user wrote them, one per entry */
  steps: string[];
  /** "called morning setup" */
  name?: string;
}

export interface FlowDraft {
  name: string;
  actions: any[];
  /** Steps that could not be turned into an action, as written */
  unrecognised: string[];
}

const OSES: FlowOs[] = ['macos', 'linux', 'windows'];

// ---- understanding the request ---------------------------------------------------------------

const HEAD = /^(?:(?:please|can you|could you|hey)\s+)?(?:make|create|build|generate|write|record|save)\s+(?:me\s+|us\s+)?(?:(?:an?|the|new|my)\s+)*(?:\.?flow|workflow|macro)(?:\s+file)?\b\s*(.*)$/i;
const HEAD_THIS = /^(?:(?:please|can you|could you)\s+)?(?:turn|save|convert|put)\s+(?:this|these|the\s+following|the\s+steps)(?:\s+steps)?\s+(?:into|as|in)\s+(?:an?\s+)?(?:\.?flow|workflow)(?:\s+file)?\b\s*(.*)$/i;

const VERB_FORMS: Record<string, string> = {
  installs: 'install', opens: 'open', runs: 'run', clones: 'clone', downloads: 'download', launches: 'launch',
  starts: 'start', visits: 'visit', creates: 'create', makes: 'make', executes: 'execute', goes: 'go', moves: 'move',
  enters: 'enter', initializes: 'initialize', initialises: 'initialise', adds: 'add', switches: 'switch', navigates: 'navigate',
  lists: 'list', shows: 'show', prints: 'print', displays: 'display', checks: 'check', copies: 'copy', deletes: 'delete', removes: 'remove',
  renames: 'rename', restarts: 'restart', stops: 'stop', pulls: 'pull', pushes: 'push', commits: 'commit', builds: 'build', tests: 'test',
  deploys: 'deploy', updates: 'update', upgrades: 'upgrade', changes: 'change',
};

/** "make me a workflow called morning that opens youtube, then ..." */
export function parseFlowCreateRequest(goal: string): FlowCreateRequest | null {
  const text = goal.trim().replace(/[.!]+$/, '');
  const m = text.match(HEAD) || text.match(HEAD_THIS);
  if (!m) return null;
  let rest = m[1].trim();
  let name: string | undefined;
  const named = rest.match(/^(?:called|named|titled)\s+(?:["'`]([^"'`]{1,50})["'`]|([\w.@-]+(?:\s[\w.@-]+){0,3}?))\s*(?=$|[:,;]|\s+(?:that|which|to|for|with|where|and)\b)/i);
  if (named) {
    name = (named[1] || named[2]).trim();
    rest = rest.slice(named[0].length);
  }
  for (let i = 0; i < 2; i++) {
    rest = rest.replace(/^\s*(?:[:,;-]\s*)?(?:(?:that|which)\s+(?:will\s+)?|to\s+|for\s+|with\s+(?:these\s+|the\s+following\s+)?steps\s*:?\s*|where\s+(?:you|it)\s+|and\s+)?/i, '');
  }
  rest = rest.trim();
  if (rest.length < 4) return null;
  // "installs node, opens youtube": only where a step starts, so command text is left as written
  const verbs = Object.keys(VERB_FORMS).join('|');
  rest = rest.replace(new RegExp(`(^|[,;]\\s*|\\band\\s+|\\bthen\\s+)(${verbs})\\b`, 'gi'), (_m, lead, verb) => `${lead}${VERB_FORMS[verb.toLowerCase()]}`);

  // "1. install node 2. open youtube", one step per line, or the usual "a, then b and c"
  let steps: string[];
  if (/\n/.test(rest)) steps = rest.split(/\n+/);
  else if (/(?:^|\s)\d{1,2}[.)]\s+\S/.test(rest)) steps = rest.split(/\s*(?:^|\s)\d{1,2}[.)]\s+/).filter(Boolean);
  else steps = splitChainClauses(rest) ?? [rest];
  steps = steps
    .map(s => s.replace(/^\s*(?:[-*]|\d{1,2}[.)])\s*/, '').trim())
    .map(s => s.replace(/^([A-Za-z]+)\b/, (w) => VERB_FORMS[w.toLowerCase()] ?? w))
    .filter(Boolean);
  return steps.length ? { steps, name } : null;
}

// ---- turning steps into actions --------------------------------------------------------------

const SITES: Record<string, { url: string; label: string }> = {
  youtube: { url: 'https://www.youtube.com', label: 'YouTube' },
  google: { url: 'https://www.google.com', label: 'Google' },
  gmail: { url: 'https://mail.google.com', label: 'Gmail' },
  'google mail': { url: 'https://mail.google.com', label: 'Gmail' },
  calendar: { url: 'https://calendar.google.com', label: 'Google Calendar' },
  'google calendar': { url: 'https://calendar.google.com', label: 'Google Calendar' },
  drive: { url: 'https://drive.google.com', label: 'Google Drive' },
  'google drive': { url: 'https://drive.google.com', label: 'Google Drive' },
  'google docs': { url: 'https://docs.google.com', label: 'Google Docs' },
  maps: { url: 'https://maps.google.com', label: 'Google Maps' },
  'google maps': { url: 'https://maps.google.com', label: 'Google Maps' },
  github: { url: 'https://github.com', label: 'GitHub' },
  twitter: { url: 'https://x.com', label: 'X' },
  x: { url: 'https://x.com', label: 'X' },
  reddit: { url: 'https://www.reddit.com', label: 'Reddit' },
  linkedin: { url: 'https://www.linkedin.com', label: 'LinkedIn' },
  netflix: { url: 'https://www.netflix.com', label: 'Netflix' },
  chatgpt: { url: 'https://chatgpt.com', label: 'ChatGPT' },
  claude: { url: 'https://claude.ai', label: 'Claude' },
  wikipedia: { url: 'https://www.wikipedia.org', label: 'Wikipedia' },
  'stack overflow': { url: 'https://stackoverflow.com', label: 'Stack Overflow' },
  stackoverflow: { url: 'https://stackoverflow.com', label: 'Stack Overflow' },
  'hacker news': { url: 'https://news.ycombinator.com', label: 'Hacker News' },
  notion: { url: 'https://www.notion.so', label: 'Notion' },
  figma: { url: 'https://www.figma.com', label: 'Figma' },
};

const BROWSER_LABELS: Record<string, string> = {
  chrome: 'Chrome', 'google chrome': 'Chrome', safari: 'Safari', firefox: 'Firefox', edge: 'Edge', 'microsoft edge': 'Edge', brave: 'Brave', arc: 'Arc', opera: 'Opera', vivaldi: 'Vivaldi',
};
const BROWSER_NAMES = new Set([...KNOWN_BROWSER_NAMES, 'chromium']);
const APP_LABELS: Record<string, string> = {
  'vs code': 'VS Code', vscode: 'VS Code', 'visual studio code': 'VS Code', code: 'VS Code', spotify: 'Spotify', slack: 'Slack', discord: 'Discord',
  terminal: 'Terminal', calculator: 'Calculator', notes: 'Notes', chrome: 'Chrome', 'google chrome': 'Chrome', firefox: 'Firefox',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DOMAIN = /^(?:https?:\/\/)?((?:localhost(?::\d{2,5})?|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{2,5})?)(?:\/[^\s'"`]*)?)$/i;

function webTarget(text: string): { url: string; label: string } | null {
  const t = text.trim().replace(/^["'`]|["'`]$/g, '').replace(/^(?:the\s+)?(?:website|site|page)\s+/i, '').replace(/\s+(?:website|site|page)$/i, '').trim();
  const known = SITES[t.toLowerCase()];
  if (known) return known;
  const m = t.match(DOMAIN);
  if (!m) return null;
  const host = m[1];
  const url = /^https?:\/\//i.test(t) ? t : `${/^localhost/i.test(host) ? 'http' : 'https'}://${host}`;
  return { url, label: host.replace(/^www\./, '') };
}

const isFolderPhrase = (t: string) =>
  /^(?:the\s+)?(?:this\s+|current\s+|project\s+)?(?:folder|directory|project)$/i.test(t) || /^(?:~|\.|\/|[A-Za-z]:[\\/])/.test(t) || /\b(?:folder|directory)$/i.test(t);

/** Rewrite npm/npx/yarn/pnpm to their .cmd launchers: PowerShell's script policy blocks the .ps1 shims */
const winCmd = (command: string) => command.replace(/\b(npm|npx|yarn|pnpm)\b(?=\s|$)/g, '$1.cmd');

interface DraftState {
  cwd?: string;
  lastFolder?: string;
}

function joinFolder(base: string | undefined, target: string): string {
  if (/^(?:~|\/|[A-Za-z]:[\\/])/.test(target) || !base) return target;
  return `${base.replace(/[\\/]+$/, '')}/${target.replace(/^\.\//, '')}`;
}

type Recognised = { actions: any[] } | null;

function actionsForClause(raw: string, st: DraftState): Recognised {
  const c = raw.trim().replace(/\s+/g, ' ').replace(/[.,;]+$/, '');
  let m: RegExpMatchArray | null;
  const cwd = st.cwd ? { cwd: st.cwd } : {};

  // Folders: "go into it", "cd ~/app" change where the following commands run
  if (/^(?:go|move|switch|cd|step)\s+(?:in)?to\s+(?:it|that(?:\s+(?:folder|directory))?|there)$|^(?:enter|open)\s+(?:it|that\s+folder)$|^cd\s+(?:into\s+)?it$/i.test(c)) {
    if (!st.lastFolder) return null;
    st.cwd = joinFolder(st.cwd, st.lastFolder);
    return { actions: [] };
  }
  m = c.match(/^(?:cd|go|move|switch|navigate)\s+(?:in)?to\s+(?:the\s+)?(?:folder\s+|directory\s+)?["'`]?([\w@.+~/\\:-]+)["'`]?(?:\s+(?:folder|directory))?$/i)
    || c.match(/^cd\s+["'`]?([\w@.+~/\\:-]+)["'`]?$/i);
  if (m && !/^(?:it|there)$/i.test(m[1])) {
    st.cwd = joinFolder(st.cwd, m[1]);
    return { actions: [] };
  }

  // Install
  m = c.match(/^(?:install|set\s*up|get)\s+(?:the\s+)?(.+)$/i);
  if (m && !/\b(?:dependencies|deps|packages|requirements)\b/i.test(m[1])) {
    const pkgs = m[1].split(/\s*,\s*|\s+and\s+/i).map(p => p.trim().replace(/^(?:the|a|an)\s+/i, '')).filter(Boolean);
    const actions = pkgs.map(p => ({ type: 'install', name: `Install ${p}`, package: p.toLowerCase() }));
    return actions.length && actions.every(a => stepForAction(a, 'macos', 0)) ? { actions } : null;
  }

  // Clone / download
  m = c.match(/^clone\s+(?:the\s+)?(?:repo(?:sitory)?\s+)?(\S+?)(?:\.git)?(?:\s+(?:into|to|as)\s+(\S+))?$/i);
  if (m) {
    const repo = /^(?:https:\/\/|git@)/.test(m[1]) ? m[1] : `https://github.com/${m[1]}`;
    const action: any = { type: 'clone', name: `Clone ${m[1].split('/').pop()}`, repo, ...(m[2] ? { into: m[2] } : {}) };
    if (!stepForAction(action, 'macos', 0)) return null;
    if (m[2]) st.cwd = joinFolder(undefined, m[2]);
    return { actions: [action] };
  }
  m = c.match(/^download\s+(https?:\/\/\S+)(?:\s+(?:to|as|into)\s+(\S+))?$/i);
  if (m) {
    const action: any = { type: 'download', name: `Download ${m[2] || m[1].split('/').pop()}`, url: m[1], ...(m[2] ? { to: m[2] } : {}), ...cwd };
    return stepForAction(action, 'macos', 0) ? { actions: [action] } : null;
  }

  // Open a site, an app or a folder
  m = c.match(/^(?:open|launch|start|visit|browse\s+to|go\s+to)\s+(.+)$/i);
  if (m) {
    let target = m[1].trim();
    let via = '';
    const viaMatch = target.match(/^(.+?)\s+(?:in|with|using|on|via)\s+(?:the\s+)?(?:a\s+)?(?:new\s+(?:tab|window)\s+(?:in|of)\s+)?([\w .+-]+?)(?:\s+(?:browser|app|application))?$/i);
    if (viaMatch) { target = viaMatch[1].trim(); via = viaMatch[2].trim().toLowerCase(); }
    const site = webTarget(target);
    if (site && (!via || BROWSER_NAMES.has(via))) {
      const action: any = { type: 'browser', name: `Open ${site.label}${via ? ` in ${BROWSER_LABELS[via] ?? cap(via)}` : ''}`, url: site.url, ...(via ? { app: via } : {}) };
      return stepForAction(action, 'macos', 0) ? { actions: [action] } : null;
    }
    if (via && (isFolderPhrase(target) || target === '')) {
      const action: any = { type: 'app', name: `Open ${APP_LABELS[via] ?? cap(via)}`, app: via, ...(st.cwd && !/^(?:~|\/|[A-Za-z]:[\\/])/.test(target) ? { path: st.cwd } : /^(?:~|\/|[A-Za-z]:[\\/])/.test(target) ? { path: target } : {}) };
      return stepForAction(action, 'macos', 0) ? { actions: [action] } : null;
    }
    if (!via && isFolderPhrase(target) && /^(?:~|\/|[A-Za-z]:[\\/])|\b(?:downloads|documents|desktop)\b/i.test(target)) {
      const path = /^(?:~|\/|[A-Za-z]:[\\/])/.test(target) ? target : `~/${cap(target.replace(/^(?:the\s+)?/i, '').replace(/\s*(?:folder|directory)$/i, ''))}`;
      const action = { type: 'folder', name: `Open ${path}`, path };
      return stepForAction(action, 'macos', 0) ? { actions: [action] } : null;
    }
    if (!via) {
      const app = target.toLowerCase().replace(/^the\s+/, '').replace(/\s+(?:app|application)$/, '');
      // "open the demo folder" is a folder, not an app called "demo folder": never guess
      if (KNOWN_APP_NAMES.includes(app) || /^[A-Za-z][A-Za-z0-9 .+-]{1,30}$/.test(app) && !/\b(?:the|a|an|it|this|that|my|of|for|and|folder|directory|file|project)\b/.test(app)) {
        const action: any = { type: 'app', name: `Open ${APP_LABELS[app] ?? cap(app)}`, app };
        return stepForAction(action, 'macos', 0) ? { actions: [action] } : null;
      }
    }
    return null;
  }

  // Tested recipes for common commands ("create a folder x", "git init", "npm init")
  const per: Partial<Record<FlowOs, string>> = {};
  for (const os of OSES) per[os] = commandForSingleClause(c, os);
  if (per.windows) per.windows = winCmd(per.windows);
  if (per.macos || per.linux || per.windows) {
    const command = per.linux ?? per.macos ?? per.windows!;
    const action: any = { type: 'command', name: cap(c), command, ...cwd };
    for (const os of OSES) if (per[os] && per[os] !== command) action[os] = per[os];
    const folder = c.match(/^(?:create|make)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:empty\s+)?(?:project\s+)?(?:folder|directory|dir)\s+(?:called\s+|named\s+)?["'`]?([\w@.+~/-]+)["'`]?/i)
      || c.match(/^mkdir\s+(?:-p\s+)?(\S+)$/i);
    if (folder) st.lastFolder = folder[1];
    return { actions: [action] };
  }

  // "run <command>" or a command typed as it is
  m = c.match(/^(?:run|execute|type)\s+(.+)$/i);
  const command = (m ? m[1] : isBareCommand(c) ? c : '').trim().replace(/^["'`]|["'`]$/g, '');
  // "run the tests", "run it", "run my script" are prose, not a command
  if (command && !/[\n\r]/.test(command) && !/^(?:the|a|an|my|all|this|that|these|those|some|it|them|our|your|everything|anything)\b/i.test(command)) {
    const action: any = { type: 'command', name: command, command, ...cwd };
    if (winCmd(command) !== command) action.windows = winCmd(command);
    return { actions: [action] };
  }
  return null;
}

export interface DraftOptions {
  name?: string;
}

/**
 * A step written as a command with no "run" in front ("npm install", "git pull"). Only developer
 * tools that are not also English words: "make everything faster" or "watch the logs" are prose,
 * and turning them into `make ...` or `watch ...` would run something nobody asked for.
 */
const BARE_PROGRAMS = /^(?:git|npm|npx|pnpm|yarn|bun|node|deno|python3?|pip3?|uv|cargo|rustc|docker|docker-compose|kubectl|brew|winget|composer|mvn|gradle|dotnet|flutter|pytest|tsc|vite)\s+[\w./@:=~-]/i;
const isBareCommand = (text: string) => BARE_PROGRAMS.test(text) && !/[;&|`$<>\n]/.test(text);

/** The actions for the listed steps, and the steps that could not be understood */
export function draftFlow(steps: string[], options: DraftOptions = {}): FlowDraft {
  const st: DraftState = {};
  const actions: any[] = [];
  const unrecognised: string[] = [];
  for (const step of steps) {
    const found = actionsForClause(step, st);
    if (found) actions.push(...found.actions);
    else unrecognised.push(step);
  }
  const name = options.name?.trim() || autoName(actions);
  return { name, actions, unrecognised };
}

function autoName(actions: any[]): string {
  const titles = actions.filter(a => a.type !== 'command' || actions.length === 1).slice(0, 2).map(a => String(a.name || '').replace(/^(?:Open|Install|Clone|Download)\s+/i, m => m).trim());
  const base = titles.length ? titles.join(' and ') : 'My workflow';
  return base.length > 44 ? `${base.slice(0, 44).replace(/\s+\S*$/, '')}` : base;
}

// ---- the file --------------------------------------------------------------------------------

export function flowSlug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^\w\s.-]/g, '').trim().replace(/[\s._]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'workflow';
}

export function flowFileName(name: string): string {
  return `${flowSlug(name)}.flow`;
}

/** The .flow document as text */
export function serializeFlow(draft: FlowDraft): string {
  const doc = {
    schemaVersion: '1.0',
    metadata: { id: flowSlug(draft.name), name: draft.name, description: 'Made with Sentinel Terminal. Open the file to run it.' },
    actions: draft.actions,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** One plain line per action, for the confirmation ("1. Install nodejs") */
export function describeDraft(draft: FlowDraft): string[] {
  return draft.actions.map((a, i) => `${i + 1}. ${a.name}`);
}

/** True when opening the file needs the terminal (something is installed or run) */
export function draftNeedsTerminal(draft: FlowDraft): boolean {
  return draft.actions.some(a => ['install', 'command', 'clone', 'download'].includes(a.type));
}
