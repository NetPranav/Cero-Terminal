/**
 * FolderOpenParser.ts — Pure deterministic parser for opening folders and directories in code editors
 *
 * Resolves phrases like "open folder gitBrains in cursor", "open ~/Projects in vscode",
 * "open project backend in clion" directly to execution requests without calling the LLM.
 */

export interface OpenFolderRequest {
  folder: string;
  editor?: string;
}

const EDITOR_ALIASES: Record<string, string> = {
  'code': 'code',
  'vscode': 'code',
  'vs code': 'code',
  'visual studio code': 'code',
  'cursor': 'cursor',
  'clion': 'clion',
  'sublime': 'subl',
  'sublime text': 'subl',
  'subl': 'subl',
  'atom': 'atom',
  'webstorm': 'webstorm',
  'pycharm': 'pycharm',
  'intellij': 'idea',
  'idea': 'idea',
  'zed': 'zed',
  'neovim': 'nvim',
  'nvim': 'nvim',
  'vim': 'vim'
};

export function parseOpenFolder(goal: string): OpenFolderRequest | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const cleaned = text.replace(/^(?:please\s+|can\s+you\s+|could\s+you\s+|kindly\s+|just\s+)+/i, '');

  const cleanFolder = (f: string) => f.trim().replace(/\s+(?:folder|directory|project)$/i, '').trim();

  // 1. Pattern: "open folder|directory|project <folder> in|with <editor>"
  // e.g. "open folder gitBrains in cursor", "open project backend in clion"
  let match = cleaned.match(
    /^open\s+(?:the\s+|my\s+)?(?:folder|directory|project)\s+["']?([^"']+)["']?\s+(?:in|with|using)\s+["']?([a-zA-Z0-9_\-\s]+)["']?$/i
  );
  if (match) {
    const rawFolder = cleanFolder(match[1]);
    const rawEditor = match[2].trim().toLowerCase();
    const editor = EDITOR_ALIASES[rawEditor] || rawEditor;
    return { folder: rawFolder, editor };
  }

  // 2. Pattern: "open <folder> [folder|directory] in|with <editor>" (where folder contains path indicators like ~, /, or known project)
  // e.g. "open ~/Project Folder/AI Terminal in vscode", "open ./tests folder in visual studio code"
  match = cleaned.match(
    /^open\s+(?:the\s+|my\s+)?["']?((?:~|\/|\.|\.\.)[^"']+)["']?\s+(?:in|with|using)\s+["']?([a-zA-Z0-9_\-\s]+)["']?$/i
  );
  if (match) {
    const rawFolder = cleanFolder(match[1]);
    const rawEditor = match[2].trim().toLowerCase();
    const editor = EDITOR_ALIASES[rawEditor] || rawEditor;
    return { folder: rawFolder, editor };
  }

  // 3. Pattern: "open <folder> folder|directory"
  // e.g. "open gitBrains folder", "open src directory"
  match = cleaned.match(
    /^open\s+(?:the\s+|my\s+)?["']?([^"']+)["']?\s+(?:folder|directory)(?:\s+(?:in|with|using)\s+["']?([a-zA-Z0-9_\-\s]+)["']?)?$/i
  );
  if (match) {
    const rawFolder = cleanFolder(match[1]);
    const rawEditor = match[2] ? match[2].trim().toLowerCase() : undefined;
    const editor = rawEditor ? (EDITOR_ALIASES[rawEditor] || rawEditor) : undefined;
    return { folder: rawFolder, editor };
  }

  // 4. Pattern: "launch <editor> on <folder> (folder|directory|project)?"
  // e.g. "launch vscode on the gitBrains directory"
  match = cleaned.match(
    /^(?:launch|open)\s+["']?([a-zA-Z0-9_\-\s]+?)["']?\s+on\s+(?:the\s+|my\s+)?(?:folder\s+|directory\s+|project\s+)?["']?([^"']+)["']?$/i
  );
  if (match) {
    const rawEditor = match[1].trim().toLowerCase();
    const rawFolder = cleanFolder(match[2]);
    if (EDITOR_ALIASES[rawEditor]) {
      return { folder: rawFolder, editor: EDITOR_ALIASES[rawEditor] };
    }
  }

  return null;
}
