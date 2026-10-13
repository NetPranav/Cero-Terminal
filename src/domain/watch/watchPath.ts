/**
 * watchPath.ts: which words after `>watch` name a file, and the full path to tail.
 */

const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;
const UNC = /^\\\\[^\\/]/;

/** A path with a folder part (Windows drive, UNC, `~`, `.`/`..`, or POSIX) or a bare log-like file name. */
export function isWatchFileTarget(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (WINDOWS_DRIVE.test(t) || UNC.test(t)) return true;
  if (/^(?:~|\.{1,2})?[\\/]\S+$/.test(t)) return true;
  return /^[\w.-]+\.(?:log|txt|out|err|jsonl?)$/i.test(t);
}

function isAbsolute(path: string): boolean {
  return WINDOWS_DRIVE.test(path) || UNC.test(path) || path.startsWith('/') || path.startsWith('~');
}

/** Full path of a watch target; a relative name goes after the working folder, joined the way that folder is written. */
export function resolveWatchPath(raw: string, cwd?: string): string {
  const path = raw.trim();
  if (isAbsolute(path)) return path;
  const base = cwd && cwd !== '~' ? cwd : '~';
  const windowsStyle = /^[A-Za-z]:/.test(base) || base.includes('\\');
  const separator = windowsStyle && base.includes('\\') ? '\\' : '/';
  const folder = base.replace(/[\\/]+$/, '');
  const name = path.replace(/^\.[\\/]/, '');
  return `${folder}${separator}${name}`;
}
