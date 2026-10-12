/**
 * pathPolyfill.ts — the `path` module inside the Tauri webview, on every OS.
 *
 * Node's `path` is not available in the webview, so the bundle maps `path` here (vite.config.ts),
 * and the tests use this module too, so they check what the app runs. Paths may come from macOS,
 * Linux or Windows ("C:\Users\me\proj"), so both separators and drive letters are understood.
 * Results use "/" (Windows accepts it everywhere) and keep the drive letter: "C:/Users/me/proj".
 */

/** "C:" for a Windows drive path, "/" for a POSIX root, "" for a relative path */
function rootOf(p: string): string {
  const drive = p.match(/^([A-Za-z]:)(?:[\\/]|$)/);
  if (drive) return `${drive[1].toUpperCase()}/`;
  if (/^[\\/]{2}[^\\/]/.test(p)) return '//'; // UNC share
  return /^[\\/]/.test(p) ? '/' : '';
}

function parts(p: string): string[] {
  return p.split(/[\\/]+/).filter(Boolean);
}

export function isAbsolute(filePath: string): boolean {
  return typeof filePath === 'string' && rootOf(filePath) !== '';
}

export function normalize(filePath: string): string {
  if (!filePath) return '.';
  const root = rootOf(filePath);
  const rest = parts(root && /^[A-Za-z]:/.test(root) ? filePath.slice(2) : filePath);
  const out: string[] = [];
  for (const part of rest) {
    if (part === '.') continue;
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!root) out.push('..');
      continue;
    }
    out.push(part);
  }
  const trailing = /[\\/]$/.test(filePath) && out.length ? '/' : '';
  if (root) return `${root}${out.join('/')}${trailing}` || root;
  return out.length ? `${out.join('/')}${trailing}` : '.';
}

export function join(...segments: (string | undefined | null)[]): string {
  const list = segments.filter((s): s is string => typeof s === 'string' && s.length > 0);
  if (list.length === 0) return '.';
  return normalize(list.join('/'));
}

/** Like Node: the last absolute segment starts over; relative results stay relative (no cwd here) */
export function resolve(...segments: (string | undefined | null)[]): string {
  const list = segments.filter((s): s is string => typeof s === 'string' && s.length > 0);
  let start = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (isAbsolute(list[i])) { start = i; break; }
  }
  const joined = join(...list.slice(start));
  return joined.length > 1 && !/^[A-Za-z]:\/$/.test(joined) ? joined.replace(/\/+$/, '') : joined;
}

export function dirname(filePath: string): string {
  if (!filePath) return '.';
  const root = rootOf(filePath);
  const trimmed = filePath.replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (cut === -1) return root || '.';
  const head = trimmed.slice(0, cut);
  if (!head || head === root.replace(/\/$/, '')) return root || '/';
  return head.replace(/\\/g, '/');
}

export function basename(filePath: string, ext?: string): string {
  if (!filePath) return '';
  const trimmed = filePath.replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  let base = cut === -1 ? trimmed : trimmed.slice(cut + 1);
  if (/^[A-Za-z]:$/.test(base)) base = '';
  if (ext && base.endsWith(ext) && base !== ext) base = base.slice(0, -ext.length);
  return base;
}

export function extname(filePath: string): string {
  const base = basename(filePath);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot);
}

export function relative(from: string, to: string): string {
  const a = parts(normalize(from));
  const b = parts(normalize(to));
  if (rootOf(from).toUpperCase() !== rootOf(to).toUpperCase()) return normalize(to);
  const win = /^[A-Za-z]:/.test(rootOf(from));
  let i = 0;
  while (i < a.length && i < b.length && (win ? a[i].toLowerCase() === b[i].toLowerCase() : a[i] === b[i])) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

export function parse(filePath: string): { root: string; dir: string; base: string; ext: string; name: string } {
  const base = basename(filePath);
  const ext = extname(filePath);
  return { root: rootOf(filePath), dir: dirname(filePath), base, ext, name: ext ? base.slice(0, -ext.length) : base };
}

export const sep = '/';
export const delimiter = typeof navigator !== 'undefined' && /win/i.test(navigator.platform || '') ? ';' : ':';

export const posix = { join, resolve, dirname, basename, extname, isAbsolute, normalize, relative, parse, sep, delimiter };

export default { join, resolve, dirname, basename, extname, isAbsolute, normalize, relative, parse, sep, delimiter, posix };
