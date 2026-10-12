/**
 * fsPolyfill.ts — synchronous `fs` for the Tauri webview, backed by ~/.cero.
 *
 * Several learning stores (knowledge deficits, DPO pairs, steering vectors, dream records, the
 * model manifest) were written against Node's synchronous fs. In the webview `fs` used to be a
 * no-op, so none of them ever persisted or reloaded. Now:
 * - hydrateCeroStore() loads the small .json/.jsonl files under ~/.cero once at startup;
 * - reads of any path containing "/.cero/" are served from that cache;
 * - writes and appends update the cache and are persisted by Rust commands confined to
 *   ~/.cero.
 * Paths outside ~/.cero behave as before (absent / no-op).
 */

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const cache = new Map<string, string>();
let invokeFn: Invoke | null = null;

/** "/home/u/.cero/learning/x.jsonl" (or "/tmp/.cero/...") -> "learning/x.jsonl" */
export function ceroRelativePath(filePath: unknown): string | null {
  if (typeof filePath !== 'string') return null;
  const normalized = filePath.replace(/\\/g, '/');
  const marker = '/.cero/';
  const idx = normalized.indexOf(marker);
  if (idx === -1) return null;
  const rel = normalized.slice(idx + marker.length).replace(/^\/+/, '');
  return rel && !rel.split('/').includes('..') ? rel : null;
}

function persist(command: string, args: Record<string, unknown>): void {
  invokeFn?.(command, args).catch(err => console.warn(`[fsPolyfill] ${command} failed:`, err));
}

/** Load ~/.cero state into the cache. Safe to call outside Tauri (it simply does nothing). */
export async function hydrateCeroStore(invoke?: Invoke): Promise<number> {
  try {
    invokeFn = invoke ?? (await import('@tauri-apps/api/core')).invoke;
    const snapshot = await invokeFn<{ home: string; files: Record<string, string> }>('cero_store_snapshot');
    for (const [rel, content] of Object.entries(snapshot.files || {})) cache.set(rel, content);
    return cache.size;
  } catch {
    return 0;
  }
}

/** Test helper */
export function __resetCeroStore(): void {
  cache.clear();
  invokeFn = null;
}

export function existsSync(filePath?: unknown): boolean {
  const rel = ceroRelativePath(filePath);
  if (rel === null) return false;
  if (cache.has(rel)) return true;
  const prefix = `${rel.replace(/\/+$/, '')}/`;
  for (const key of cache.keys()) if (key.startsWith(prefix)) return true;
  return false;
}

export function readFileSync(filePath?: unknown): string {
  const rel = ceroRelativePath(filePath);
  return rel === null ? '' : (cache.get(rel) ?? '');
}

export function writeFileSync(filePath?: unknown, data?: unknown): void {
  const rel = ceroRelativePath(filePath);
  if (rel === null) return;
  const contents = typeof data === 'string' ? data : String(data ?? '');
  cache.set(rel, contents);
  persist('cero_store_write', { relativePath: rel, contents });
}

export function appendFileSync(filePath?: unknown, data?: unknown): void {
  const rel = ceroRelativePath(filePath);
  if (rel === null) return;
  const contents = typeof data === 'string' ? data : String(data ?? '');
  cache.set(rel, (cache.get(rel) ?? '') + contents);
  persist('cero_store_append', { relativePath: rel, contents });
}

export function unlinkSync(filePath?: unknown): void {
  const rel = ceroRelativePath(filePath);
  if (rel === null) return;
  cache.delete(rel);
  persist('cero_store_remove', { relativePath: rel });
}

export function rmdirSync(): void {
  // Directories are implicit in the store
}

export function copyFileSync(from?: unknown, to?: unknown): void {
  const src = ceroRelativePath(from);
  if (src !== null && cache.has(src)) writeFileSync(to, cache.get(src));
}

export function mkdirSync(): void {
  // Parents are created on write
}

export function readdirSync(dirPath?: unknown): string[] {
  const rel = ceroRelativePath(typeof dirPath === 'string' ? `${dirPath.replace(/\/+$/, '')}/` : dirPath);
  const prefix = rel === null ? null : (rel ? `${rel.replace(/\/+$/, '')}/` : '');
  if (prefix === null) return [];
  const names = new Set<string>();
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]);
  }
  return [...names];
}

export function statSync(filePath?: unknown): { isFile: () => boolean; isDirectory: () => boolean; size: number } {
  const rel = ceroRelativePath(filePath);
  const isFile = rel !== null && cache.has(rel);
  const isDirectory = !isFile && existsSync(filePath);
  return { isFile: () => isFile, isDirectory: () => isDirectory, size: isFile ? cache.get(rel!)!.length : 0 };
}

export const promises = {
  readFile: async (filePath?: unknown): Promise<string> => readFileSync(filePath),
  writeFile: async (filePath?: unknown, data?: unknown): Promise<void> => writeFileSync(filePath, data),
  readdir: async (dirPath?: unknown): Promise<string[]> => readdirSync(dirPath),
  stat: async (filePath?: unknown) => statSync(filePath),
  access: async (): Promise<void> => {},
};

export default {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  unlinkSync,
  rmdirSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  promises,
};
