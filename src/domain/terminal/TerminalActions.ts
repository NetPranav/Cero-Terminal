/**
 * TerminalActions.ts — requests about the terminals themselves.
 *
 * "open a new tab in ~/api and run npm run dev", "run npm test in tab 2", "stop the server",
 * "what is the other terminal showing", "what's running in my terminals". Parsed without the
 * model, and answered from the TerminalWorkspace registry, which costs no model call and no
 * polling. Targets are resolved strictly: when a phrase could mean more than one terminal the
 * caller asks instead of guessing, because typing into the wrong shell is a real hazard.
 */

import type { PaneInfo } from './TerminalWorkspace';

export type TargetSpec =
  | { kind: 'tab'; index: number }
  | { kind: 'number'; number: number }
  | { kind: 'other'; sameTab: boolean }
  | { kind: 'name'; name: string };

export type TerminalAction =
  | { kind: 'status' }
  | { kind: 'read'; target: TargetSpec; phrase: string }
  | { kind: 'send'; target: TargetSpec; phrase: string; command: string }
  | { kind: 'stop'; target: TargetSpec; phrase: string }
  | { kind: 'open'; placement: 'tab' | 'split'; direction?: 'vertical' | 'horizontal'; cwd?: string; command?: string };

const NOUN = String.raw`(?:terminal|tab|pane|split|shell|window)`;

/** "tab 2", "terminal 3", "the other terminal", "the server tab", "the server" */
export function parseTarget(phrase: string): TargetSpec | null {
  const p = phrase.trim().toLowerCase().replace(/^(?:the|my)\s+/, '').replace(/[?.!]+$/, '');
  if (!p) return null;
  let m = p.match(/^tab\s*#?(\d{1,2})$/) || p.match(/^(first|second|third|fourth|fifth)\s+tab$/);
  if (m) {
    const words: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
    return { kind: 'tab', index: words[m[1]] ?? Number(m[1]) };
  }
  m = p.match(/^(?:terminal|pane|split|shell)\s*#?(\d{1,2})$/);
  if (m) return { kind: 'number', number: Number(m[1]) };
  m = p.match(new RegExp(`^(?:other|another)(?:\\s+(${NOUN}|one))?$`));
  if (m) return { kind: 'other', sameTab: /pane|split/.test(m[1] || '') };
  m = p.match(new RegExp(`^(.+?)\\s+${NOUN}$`));
  if (m && !/\b(?:new|a|an)\b/.test(m[1])) return { kind: 'name', name: m[1].trim() };
  if (/^[\w .:/-]{2,40}$/.test(p) && !/\b(?:it|this|that|here|there)\b/.test(p)) return { kind: 'name', name: p };
  return null;
}

/** Plain shell text in backticks or quotes, else the raw text */
const unquote = (s: string) => s.trim().replace(/^`([^`]+)`$/, '$1').replace(/^"([^"]+)"$/, '$1').replace(/^'([^']+)'$/, '$1');

export function parseTerminalAction(goal: string): TerminalAction | null {
  const text = goal.trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();

  // What every terminal is doing (answered from the registry)
  if (/^(?:what(?:'s|\s+is|\s+are)?\s+(?:running|going\s+on|happening|open)|which\s+(?:terminals?|tabs?)\s+(?:are\s+)?(?:busy|running)|list|show(?:\s+me)?)\s+(?:(?:in|on|across)\s+)?(?:all\s+)?(?:(?:my|the)\s+)?(?:other\s+)?(?:open\s+)?(?:terminals?|tabs?|panes?|splits?)\s*\??$/i.test(text)
    || /^what\s+are\s+(?:all\s+)?(?:my|the)\s+(?:other\s+)?(?:terminals?|tabs?|panes?)\s+doing\s*\??$/i.test(text)
    || /^(?:status\s+of\s+)?(?:all\s+)?(?:my\s+)?terminals?\s+status\??$/i.test(text)) {
    return { kind: 'status' };
  }

  // Open a tab or a split, optionally in a folder and running something
  // "here", "in this folder" and "in the current directory" mean the requester's own folder
  const HERE = String.raw`(?:\s+(?:here|in\s+(?:this|the\s+current)\s+(?:folder|directory|dir)))`;
  let m = text.match(new RegExp(`^(?:open|create|start|make|add)\\s+(?:a\\s+|another\\s+)?(?:new\\s+)?(tab|terminal|window|split|pane)(?:${HERE}|\\s+(?:in|at|for)\\s+(\\S+))?(?:\\s*(?:,|and|then)\\s+(?:then\\s+)?(?:run\\s+|start\\s+|execute\\s+)?(.+))?$`, 'i'));
  if (m) {
    const noun = m[1].toLowerCase();
    return {
      kind: 'open',
      placement: noun === 'split' || noun === 'pane' ? 'split' : 'tab',
      cwd: m[2] ? unquote(m[2]) : undefined,
      command: m[3] ? unquote(m[3]) : undefined,
    };
  }
  // "run npm run dev in a new tab", "start the server in a new split here"
  m = text.match(new RegExp(`^(?:run|start|launch|execute)\\s+(.+?)\\s+in\\s+(?:a\\s+)?new\\s+(tab|terminal|window|split|pane)(?:${HERE}|\\s+(?:in|at)\\s+(\\S+))?$`, 'i'))
    || text.match(new RegExp(`^in\\s+(?:a\\s+)?new\\s+(tab|terminal|window|split|pane)${HERE}?\\s*,?\\s*(?:run|start|launch|execute)\\s+(.+)$`, 'i'));
  if (m) {
    const inFirst = /^in\s/i.test(text);
    const noun = (inFirst ? m[1] : m[2]).toLowerCase();
    return {
      kind: 'open',
      placement: noun === 'split' || noun === 'pane' ? 'split' : 'tab',
      cwd: !inFirst && m[3] ? unquote(m[3]) : undefined,
      command: unquote(inFirst ? m[2] : m[1]),
    };
  }
  m = text.match(/^split\s+(?:the\s+)?(?:screen|terminal|this|window|pane)?\s*(vertically|horizontally|side\s+by\s+side|below|to\s+the\s+right|down)?(?:\s*(?:,|and|then)\s+(?:run\s+)?(.+))?$/i);
  if (m) {
    const dir = (m[1] || '').toLowerCase();
    return {
      kind: 'open',
      placement: 'split',
      direction: /horizontal|below|down/.test(dir) ? 'horizontal' : dir ? 'vertical' : undefined,
      command: m[2] ? unquote(m[2]) : undefined,
    };
  }
  m = text.match(/^open\s+(\S+)\s+in\s+(?:a\s+)?new\s+(tab|terminal|window|split|pane)$/i);
  if (m && /[/~.]/.test(m[1])) {
    return { kind: 'open', placement: /split|pane/i.test(m[2]) ? 'split' : 'tab', cwd: unquote(m[1]) };
  }

  // Send a command to another terminal
  m = text.match(/^(?:run|type|execute|send)\s+(.+?)\s+(?:in|on|to|inside|into)\s+((?:the\s+|my\s+)?(?:other|another|tab|terminal|pane|split|shell|second|first|third)\b.*|(?:the\s+|my\s+)?\S+(?:\s+\S+)?\s+(?:tab|terminal|pane|split|shell|window))$/i);
  if (m) {
    const target = parseTarget(m[2]);
    if (target) return { kind: 'send', target, phrase: m[2].trim(), command: unquote(m[1]) };
  }
  m = text.match(/^(?:in|on)\s+((?:the\s+)?(?:other\s+\w+|tab\s*\d+|terminal\s*\d+|pane\s*\d+|\S+\s+(?:tab|terminal|pane)))[,\s]+(?:run|type|execute)\s+(.+)$/i);
  if (m) {
    const target = parseTarget(m[1]);
    if (target) return { kind: 'send', target, phrase: m[1].trim(), command: unquote(m[2]) };
  }

  // "stop the server on port 8766": the terminal whose command mentions that port
  m = lower.match(/^(?:stop|interrupt|end|kill)\s+(?:the\s+|whatever(?:'s|\s+is)?\s+)?(?:\w+\s+)?(?:server|process|app|service|thing)?\s*(?:running\s+|listening\s+)?on\s+port\s+(\d{2,5})$/);
  if (m) return { kind: 'stop', target: { kind: 'name', name: m[1] }, phrase: `the terminal using port ${m[1]}` };

  // Stop what is running in a terminal (Ctrl+C)
  m = lower.match(/^(?:stop|interrupt|cancel|end|ctrl\+?c|kill)\s+(?:the\s+)?(?:process\s+|command\s+|job\s+)?(?:(?:that(?:'s|\s+is)\s+|what(?:'s|\s+is)\s+)?running\s+)?(?:in|on)\s+(.+)$/)
    || lower.match(/^(?:stop|interrupt)\s+((?:the\s+)?(?:other\s+\w+|tab\s*\d+|terminal\s*\d+|\S+(?:\s+\S+)?\s+(?:tab|terminal|pane|split)|server|dev\s+server|log\s+follower|tail|listener|talker))$/);
  if (m) {
    const target = parseTarget(m[1]);
    if (target) return { kind: 'stop', target, phrase: m[1].trim() };
  }

  // What another terminal is showing
  m = lower.match(/^(?:what(?:'s|\s+is)|show(?:\s+me)?)\s+(?:the\s+)?(?:(?:output|last\s+lines?)\s+(?:of|in|from)\s+)?(.+?)\s+(?:printing|showing|saying|outputting|output|doing)\s*\??$/)
    || lower.match(/^(?:show(?:\s+me)?|read)\s+(?:the\s+)?(?:output|last\s+lines?)\s+(?:of|in|from)\s+(.+?)\s*\??$/);
  if (m) {
    const target = parseTarget(m[1]);
    if (target && target.kind !== 'name') return { kind: 'read', target, phrase: m[1].trim() };
    if (target && target.kind === 'name' && /\b(?:tab|terminal|pane|split|server|log)\b/.test(m[1])) {
      return { kind: 'read', target, phrase: m[1].trim() };
    }
  }
  return null;
}

export type Resolution =
  | { kind: 'one'; pane: PaneInfo }
  | { kind: 'ambiguous'; candidates: PaneInfo[] }
  | { kind: 'none' };

/** Last folder of a path, for both / and \\ separators (Windows) */
const baseName = (path?: string) => path?.split(/[\\/]/).filter(Boolean).pop();

const SERVER_WORDS = /\b(?:serve|server|http\.server|dev|start|uvicorn|gunicorn|flask|rails|vite|next|nodemon|webpack)\b/;

function nameMatches(pane: PaneInfo, name: string): boolean {
  const n = name.toLowerCase().replace(/^the\s+/, '');
  const fields = [pane.title, pane.tabTitle, pane.runningCommand, baseName(pane.cwd)]
    .filter(Boolean)
    .map(f => String(f).toLowerCase());
  if (fields.some(f => f === n || new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(f))) return true;
  const cmd = (pane.runningCommand || '').toLowerCase();
  if (/\b(?:dev\s+)?server\b/.test(n)) return SERVER_WORDS.test(cmd) && !/\btail\b/.test(cmd);
  if (/\b(?:log|logs|tail|follower)\b/.test(n)) return /\btail\b|\bjournalctl\b|\blogs\b/.test(cmd);
  return false;
}

/** The terminal a target phrase names, from the requester's point of view. */
export function resolveTarget(spec: TargetSpec, panes: PaneInfo[], requesterPaneId?: string): Resolution {
  const others = panes.filter(p => p.paneId !== requesterPaneId);
  let matches: PaneInfo[];
  switch (spec.kind) {
    case 'tab':
      matches = panes.filter(p => p.tabIndex === spec.index);
      // A tab with several panes: its busy panes are what people usually mean; otherwise ask
      if (matches.length > 1) {
        const busy = matches.filter(p => p.busy && p.paneId !== requesterPaneId);
        if (busy.length === 1) matches = busy;
      }
      break;
    case 'number':
      matches = panes.filter(p => p.number === spec.number);
      break;
    case 'other': {
      const requester = panes.find(p => p.paneId === requesterPaneId);
      matches = spec.sameTab && requester?.tabId ? others.filter(p => p.tabId === requester.tabId) : others;
      break;
    }
    case 'name':
      matches = others.filter(p => nameMatches(p, spec.name));
      break;
  }
  if (matches.length === 1) return { kind: 'one', pane: matches[0] };
  if (matches.length > 1) return { kind: 'ambiguous', candidates: matches };
  return { kind: 'none' };
}

/** "terminal 2 (tab 1, python3, running python3 -m http.server 8000)" */
export function describePane(p: PaneInfo): string {
  const where = [p.tabIndex ? `tab ${p.tabIndex}` : '', p.title || p.tabTitle || baseName(p.cwd)].filter(Boolean).join(', ');
  return `terminal ${p.number ?? '?'}${where ? ` (${where})` : ''}`;
}

/** Whether a terminal can take typed input now: idle, not in a full-screen program, at a prompt. */
export function readyForInput(p: PaneInfo): { ok: true } | { ok: false; reason: string } {
  if (p.alternateScreen) return { ok: false, reason: `${describePane(p)} is showing a full-screen program` };
  if (p.busy) return { ok: false, reason: `${describePane(p)} is busy running \`${p.runningCommand || 'a command'}\`` };
  // The prompt is the unfinished line after the last newline; fall back to the last full line
  const last = p.currentLine?.trim() ? p.currentLine : (p.outputTail[p.outputTail.length - 1] || '');
  if (last && !/[$%#>❯➜]\s*$/.test(last)) return { ok: false, reason: `${describePane(p)} is not at a prompt` };
  return { ok: true };
}
