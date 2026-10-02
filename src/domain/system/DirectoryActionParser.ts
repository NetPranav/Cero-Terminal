/**
 * DirectoryActionParser.ts — Pure deterministic parser for directory operations
 *
 * Handles creation (mkdir), listing (ls), and navigation (cd) operations
 * deterministically before invoking an LLM.
 */

export interface DirectoryActionRequest {
  kind: 'mkdir' | 'list' | 'cd';
  targetPath?: string;
  command: string;
}

export function parseDirectoryAction(goal: string): DirectoryActionRequest | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const cleaned = text.replace(/^(?:please\s+|can\s+you\s+|could\s+you\s+|kindly\s+|just\s+)+/i, '');

  // 1. Directory Creation (mkdir)
  // e.g. "make a folder called my_app", "create directory temp", "create a new folder named test", "mkdir src"
  let match = cleaned.match(
    /^(?:make|create)\s+(?:a\s+)?(?:new\s+)?(?:folder|directory)(?:\s+(?:called|named))?\s+["']?([^"']+)["']?$/i
  );
  if (match) {
    const name = match[1].trim();
    if (name && !name.includes(' ') && !/[;&|`$<>\\]/.test(name)) {
      return {
        kind: 'mkdir',
        targetPath: name,
        command: `mkdir -p "${name}"`
      };
    }
  }

  match = cleaned.match(/^mkdir\s+(?:-p\s+)?["']?([^"']+)["']?$/i);
  if (match) {
    const name = match[1].trim();
    if (name && !/[;&|`$<>\\]/.test(name)) {
      return {
        kind: 'mkdir',
        targetPath: name,
        command: `mkdir -p "${name}"`
      };
    }
  }

  // 2. Listing Files
  // e.g. "list files in current directory", "list files in src", "show directory contents", "list all files", "what files are in this folder"
  if (/^(?:list\s+(?:all\s+)?files(?:\s+in\s+current\s+directory)?|show\s+directory\s+contents|what\s+files\s+are\s+in\s+this\s+folder|list\s+contents)$/i.test(cleaned)) {
    return {
      kind: 'list',
      command: 'ls -la'
    };
  }

  match = cleaned.match(/^(?:list\s+files\s+in|show\s+files\s+in|ls\s+-la\s+in)\s+["']?([^"']+)["']?$/i);
  if (match) {
    const dir = match[1].trim();
    if (dir && !/[;&|`$<>\\]/.test(dir)) {
      return {
        kind: 'list',
        targetPath: dir,
        command: `ls -la "${dir}"`
      };
    }
  }

  // 3. Navigation (cd)
  // e.g. "cd into src", "change directory to projects", "switch to directory build", "go to folder docs"
  match = cleaned.match(
    /^(?:cd\s+into|change\s+directory\s+to|switch\s+to\s+directory|go\s+to\s+folder)\s+["']?([^"']+)["']?$/i
  );
  if (match) {
    const target = match[1].trim();
    if (target && !/[;&|`$<>\\]/.test(target)) {
      return {
        kind: 'cd',
        targetPath: target,
        command: `cd "${target}"`
      };
    }
  }

  return null;
}
