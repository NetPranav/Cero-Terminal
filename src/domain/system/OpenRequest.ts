/**
 * OpenRequest.ts: read "open the folder gitBrains in VS Code. It is inside /padhai_in_linux/Projects/".
 *
 * Pure text in, plain object out. It only claims requests that clearly name a folder or file (or an
 * editor to open something in); "open spotify" and "open the door" are not its business.
 */

export interface OpenRequest {
  kind: 'folder' | 'file';
  /** "gitBrains" */
  name: string;
  /** "/padhai_in_linux/Projects/" from "inside ...", "under ...", "from ...", or a later sentence */
  locationHint?: string;
  /** "VS Code" as the user wrote it (see EDITORS for the command) */
  withApp?: string;
  /** The user said to create it if it is missing */
  create: boolean;
}

/** Editors people open folders in, and the command line each one installs (lower case keys) */
export const EDITORS: Record<string, { app: string; cli: string; macApp: string; flatpak?: string }> = {
  'code': { app: 'Visual Studio Code', cli: 'code', macApp: 'Visual Studio Code', flatpak: 'com.visualstudio.code' },
  'vscode': { app: 'Visual Studio Code', cli: 'code', macApp: 'Visual Studio Code', flatpak: 'com.visualstudio.code' },
  'vs code': { app: 'Visual Studio Code', cli: 'code', macApp: 'Visual Studio Code', flatpak: 'com.visualstudio.code' },
  'visual studio code': { app: 'Visual Studio Code', cli: 'code', macApp: 'Visual Studio Code', flatpak: 'com.visualstudio.code' },
  'vscodium': { app: 'VSCodium', cli: 'codium', macApp: 'VSCodium', flatpak: 'com.vscodium.codium' },
  'codium': { app: 'VSCodium', cli: 'codium', macApp: 'VSCodium', flatpak: 'com.vscodium.codium' },
  'cursor': { app: 'Cursor', cli: 'cursor', macApp: 'Cursor' },
  'windsurf': { app: 'Windsurf', cli: 'windsurf', macApp: 'Windsurf' },
  'zed': { app: 'Zed', cli: 'zed', macApp: 'Zed', flatpak: 'dev.zed.Zed' },
  'sublime': { app: 'Sublime Text', cli: 'subl', macApp: 'Sublime Text' },
  'sublime text': { app: 'Sublime Text', cli: 'subl', macApp: 'Sublime Text' },
  'subl': { app: 'Sublime Text', cli: 'subl', macApp: 'Sublime Text' },
  'intellij': { app: 'IntelliJ IDEA', cli: 'idea', macApp: 'IntelliJ IDEA' },
  'idea': { app: 'IntelliJ IDEA', cli: 'idea', macApp: 'IntelliJ IDEA' },
  'pycharm': { app: 'PyCharm', cli: 'pycharm', macApp: 'PyCharm' },
  'webstorm': { app: 'WebStorm', cli: 'webstorm', macApp: 'WebStorm' },
  'clion': { app: 'CLion', cli: 'clion', macApp: 'CLion' },
  'android studio': { app: 'Android Studio', cli: 'studio', macApp: 'Android Studio' },
};

export const editorFor = (name: string | undefined) => (name ? EDITORS[name.trim().toLowerCase().replace(/\s+/g, ' ')] : undefined);

const PATHISH = /^(?:~|\/|\.{1,2}[\\/]|[A-Za-z]:[\\/])/;
const LOCATION_WORDS = String.raw`(?:inside|under|within|from|located\s+(?:in|at|inside|under))`;
const trimEnd = (s: string) => s.trim().replace(/[\s.,;!?]+$/, '');
const unquote = (s: string) => s.trim().replace(/^["'`]+|["'`]+$/g, '').trim();

function splitSentences(text: string): string[] {
  // a full stop followed by a capital starts a new sentence; dots inside file names and paths do not
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
}

function hintFromLater(sentences: string[]): string | undefined {
  for (const s of sentences) {
    const m = s.match(new RegExp(String.raw`\b(?:is|are|lives?|sits?|stays?)\s+(?:located\s+)?(?:inside|in|under|within|at)\s+(?:the\s+)?["']?(.+?)["']?\s*$`, 'i'))
      || s.match(new RegExp(String.raw`\b${LOCATION_WORDS}\s+(?:the\s+)?["']?(.+?)["']?\s*$`, 'i'));
    if (m) return trimEnd(m[1]).replace(/\s+(?:folder|directory)$/i, '') || undefined;
  }
  return undefined;
}

export function parseOpenRequest(goal: string): OpenRequest | null {
  const text = (goal || '').replace(/\s+/g, ' ').trim().replace(/^(?:(?:please|can you|could you|kindly|just|hey)\s+)+/i, '');
  const sentences = splitSentences(text);
  if (sentences.length === 0) return null;
  let first = trimEnd(sentences[0]);
  const later = sentences.slice(1);

  const verb = first.match(/^(?:open|launch|start|show|load|bring\s+up)\s+(.*)$/i);
  if (!verb) return null;
  let rest = verb[1].replace(/^(?:up\s+)?(?:the\s+|my\s+|a\s+|an\s+)+/i, '');
  const create = /\b(?:create|make)\s+(?:it\s+)?if\s+(?:it\s+)?(?:is\s+)?(?:missing|not\s+there|doesn'?t\s+exist|does\s+not\s+exist)\b/i.test(text);
  rest = rest.replace(/[,;]?\s*(?:and\s+)?(?:create|make)\s+(?:it\s+)?if\b.*$/i, '').trim();

  let locationHint: string | undefined;
  let withApp: string | undefined;

  // "launch vscode on the gitBrains directory": the editor comes first
  const editorFirst = rest.match(/^(.+?)\s+(?:on|for)\s+(?:the\s+)?(.+)$/i);
  if (editorFirst && editorFor(editorFirst[1])) { withApp = editorFirst[1].trim(); rest = editorFirst[2]; }

  // "... with <editor>" at the very end belongs to the editor, whatever comes before it
  const trailingEditor = rest.match(/^(.*)\s+(?:in|with|using|on)\s+(?:the\s+)?([A-Za-z][\w .+-]{0,30})$/i);
  if (!withApp && trailingEditor && editorFor(trailingEditor[2])) { withApp = trailingEditor[2].trim(); rest = trailingEditor[1]; }

  // "... inside|under|within|from <place>" is always a place
  const place = rest.match(new RegExp(String.raw`^(.*?)\s+${LOCATION_WORDS}\s+(?:the\s+)?(.+)$`, 'i'));
  if (place) {
    rest = place[1];
    let tail = place[2];
    const appInTail = tail.match(/^(.*?)\s+(?:in|with|using|on)\s+(?:the\s+)?([A-Za-z][\w .+-]{0,30})$/i);
    if (appInTail && editorFor(appInTail[2])) { tail = appInTail[1]; withApp = appInTail[2].trim(); }
    locationHint = unquote(trimEnd(tail)).replace(/\s+(?:folder|directory)$/i, '');
  }

  // "... in|with|using|on <app or place>"
  const prep = rest.match(/^(.*?)\s+(?:in|with|using|on)\s+(?:the\s+)?(.+)$/i);
  if (prep) {
    const target = unquote(prep[2]);
    const folderWord = target.match(/^(.+?)\s+(?:folder|directory)$/i);
    if (PATHISH.test(target)) { locationHint = locationHint ?? target; rest = prep[1]; }
    else if (folderWord) { locationHint = locationHint ?? folderWord[1]; rest = prep[1]; }
    else if (editorFor(target)) { withApp = target; rest = prep[1]; }
    else if (/^(?:folder|directory)$/i.test(target)) { rest = prep[1]; }
    else if (!/\s/.test(target) || target.split(/\s+/).length <= 3) {
      // some other app ("in sublime"): only an app when it is not a person's word for a place
      withApp = withApp ?? target;
      rest = prep[1];
    }
  }

  // kind and name
  let kind: OpenRequest['kind'] | null = null;
  let name = rest;
  const named = name.match(/^(folder|directory|project|file)\s+(?:(?:named|called)\s+)?(.+)$/i);
  if (named) { kind = /file/i.test(named[1]) ? 'file' : 'folder'; name = named[2]; }
  const suffix = name.match(/^(.+?)\s+(folder|directory|project|file)$/i);
  if (suffix) { kind = /file/i.test(suffix[2]) ? 'file' : 'folder'; name = suffix[1]; }
  name = unquote(name).replace(/^(?:named|called)\s+/i, '').trim();
  if (!name || /\s{2,}/.test(name)) return null;

  if (!kind) {
    if (/\.[A-Za-z0-9]{1,6}$/.test(name) && !PATHISH.test(name.replace(/\.[^.\\/]+$/, '')) ) kind = 'file';
    else if (PATHISH.test(name)) kind = /\.[A-Za-z0-9]{1,6}$/.test(name.split(/[\\/]/).pop() || '') ? 'file' : 'folder';
    else if (withApp && editorFor(withApp)) kind = 'folder';   // "open gitbrains with code"
  }
  if (!kind) return null;
  if (name.split(/\s+/).length > 6) return null;

  const laterHint = hintFromLater(later);
  locationHint = locationHint ?? laterHint;
  const out: OpenRequest = { kind, name, create };
  if (locationHint) out.locationHint = locationHint;
  if (withApp) out.withApp = withApp;
  return out;
}
