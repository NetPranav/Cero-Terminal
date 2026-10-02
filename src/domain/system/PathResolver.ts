/**
 * PathResolver.ts: turn "gitBrains" (and maybe "inside /padhai_in_linux/Projects") into a real path.
 *
 * Order: an exact path, the place the person named, the current folder, the usual project folders,
 * then the home folder. It never creates anything. File access goes through a probe so the logic
 * is tested without a disk and the app supplies the real one.
 */
import { scoreName, type NameWhy } from './NameMatch';

export interface FoundPath { path: string; name: string; isDir: boolean }

export interface PathProbe {
  home: string;
  exists(path: string): Promise<boolean>;
  find(o: { roots: string[]; query: string; kind: 'dir' | 'file' | 'any'; maxDepth: number; limit: number }): Promise<FoundPath[]>;
}

export interface Candidate { path: string; score: number; why: NameWhy; inHint: boolean }

export type Resolution =
  | { type: 'found'; path: string }
  | { type: 'choose'; candidates: Candidate[]; reason: 'several' | 'close' | 'typo' }
  | { type: 'missing'; searched: string[] };

export interface ResolveInput {
  name: string;
  kind: 'folder' | 'file';
  locationHint?: string;
  /** a path the person confirmed for this spoken name before */
  remembered?: string;
}

export const COMMON_PLACES = ['Projects', 'projects', 'Project Folder', 'code', 'dev', 'src', 'work', 'Documents', 'Desktop', 'Downloads', 'repos', 'git', 'github'];
const EXACT = 95;
const GAP = 15;
const MIN_SCORE = 40;

const sepOf = (p: string) => (/\\/.test(p) && !/\//.test(p) ? '\\' : '/');
const join = (a: string, b: string) => `${a.replace(/[\\/]+$/, '')}${sepOf(a)}${b.replace(/^[\\/]+/, '')}`;
const base = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
const dirOf = (p: string) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '') || '/';
const isPathish = (s: string) => /^(?:~|\/|\.{1,2}[\\/]|[A-Za-z]:[\\/])/.test(s);

function expand(p: string, home: string, cwd: string): string {
  const t = p.trim();
  if (t === '~') return home;
  if (t.startsWith('~/') || t.startsWith('~\\')) return join(home, t.slice(2));
  if (/^\.{1,2}[\\/]/.test(t)) return join(cwd, t);
  return t;
}

export async function resolvePath(input: ResolveInput, ctx: { cwd: string }, probe: PathProbe): Promise<Resolution> {
  const { home } = probe;
  const kind = input.kind === 'folder' ? 'dir' : 'file';
  const searched: string[] = [];
  let name = input.name.trim();
  let hint = input.locationHint?.trim();

  if (input.remembered && (await probe.exists(input.remembered))) return { type: 'found', path: input.remembered };

  // 1. already a path
  if (isPathish(name)) {
    const full = expand(name, home, ctx.cwd);
    if (await probe.exists(full)) return { type: 'found', path: full };
    // a path that does not exist: look for the last part inside its parent
    hint = hint ?? dirOf(name);
    name = base(name);
  }

  const found = new Map<string, Candidate>();
  const add = (items: FoundPath[], inHint: boolean) => {
    for (const f of items) {
      if (kind === 'dir' && !f.isDir) continue;
      if (kind === 'file' && f.isDir) continue;
      const s = scoreName(name, f.name);
      if (s.score < MIN_SCORE) continue;
      const prev = found.get(f.path);
      if (!prev || prev.score < s.score || (inHint && !prev.inHint)) found.set(f.path, { path: f.path, score: s.score, why: s.why, inHint: inHint || !!prev?.inHint });
    }
  };
  const hasExact = () => [...found.values()].some(c => c.score >= EXACT);
  const search = async (root: string, depth: number, inHint: boolean) => {
    searched.push(root.startsWith(home) ? `~${root.slice(home.length)}` : root);
    add(await probe.find({ roots: [root], query: name, kind, maxDepth: depth, limit: 20 }), inHint);
  };

  // 2. the place the person named
  if (hint) {
    const asWritten = expand(hint, home, ctx.cwd);
    const underHome = hint.startsWith('/') ? join(home, hint) : join(home, hint.replace(/^~[\\/]?/, ''));
    const hintDirs: string[] = [];
    for (const d of [asWritten, underHome]) {
      if (!hintDirs.includes(d) && (await probe.exists(d))) hintDirs.push(d);
    }
    if (hintDirs.length === 0) {
      // neither exists: look for the last two parts of the hint somewhere under home
      const parts = hint.split(/[\\/]/).filter(Boolean);
      const tail = parts.slice(-2);
      if (tail.length) {
        searched.push(`~ (looking for ${tail.join('/')})`);
        const hits = await probe.find({ roots: [home], query: tail[tail.length - 1], kind: 'dir', maxDepth: 4, limit: 20 });
        for (const h of hits) {
          const segs = h.path.split(/[\\/]/).filter(Boolean);
          if (tail.length === 2 ? segs.slice(-2).join('/').toLowerCase() === tail.join('/').toLowerCase() : base(h.path).toLowerCase() === tail[0].toLowerCase()) hintDirs.push(h.path);
        }
      }
    }
    for (const d of hintDirs) await search(d, 2, true);
  }

  // 3. the current folder, 4. the usual places, 5. home
  if (!hasExact()) await search(ctx.cwd, 2, false);
  if (!hasExact()) {
    for (const place of COMMON_PLACES) {
      const dir = join(home, place);
      // every usual place is checked, so two folders with the same name are noticed and asked about
      if (await probe.exists(dir)) await search(dir, 2, false);
    }
  }
  if (!hasExact()) await search(home, 3, false);

  const ranked = [...found.values()].sort((a, b) => b.score - a.score || Number(b.inHint) - Number(a.inHint) || a.path.localeCompare(b.path));
  if (ranked.length === 0) return { type: 'missing', searched: [...new Set(searched)] };

  const top = ranked[0];
  const exact = ranked.filter(c => c.score >= EXACT);
  if (exact.length === 1 && (ranked.length === 1 || top.score - ranked[1].score >= GAP)) return { type: 'found', path: top.path };
  if (exact.length > 1) {
    const inside = exact.filter(c => c.inHint);
    if (inside.length === 1) return { type: 'found', path: inside[0].path };
    return { type: 'choose', candidates: ranked.slice(0, 8), reason: 'several' };
  }
  if (exact.length === 1) return { type: 'choose', candidates: ranked.slice(0, 8), reason: 'close' };
  return { type: 'choose', candidates: ranked.slice(0, 8), reason: top.why === 'typo' ? 'typo' : 'close' };
}
