import { describe, it, expect } from 'vitest';
import { resolvePath, type PathProbe, type FoundPath } from './PathResolver';

/** A fake disk: a list of directories (and files) */
function fakeDisk(entries: string[], files: string[] = []): PathProbe & { calls: number } {
  const dirs = new Set<string>();
  for (const e of entries) {
    const parts = e.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) dirs.add('/' + parts.slice(0, i).join('/'));
  }
  const fileSet = new Set(files);
  const probe = {
    home: '/home/me',
    calls: 0,
    async exists(p: string) { return dirs.has(p.replace(/\/+$/, '')) || fileSet.has(p); },
    async find(o: { roots: string[]; kind: string; maxDepth: number }): Promise<FoundPath[]> {
      probe.calls++;
      const out: FoundPath[] = [];
      for (const root of o.roots) {
        const rootDepth = root.split('/').filter(Boolean).length;
        const all: Array<[string, boolean]> = [...[...dirs].map(d => [d, true] as [string, boolean]), ...[...fileSet].map(f => [f, false] as [string, boolean])];
        for (const [p, isDir] of all) {
          if (!p.startsWith(root.replace(/\/$/, '') + '/')) continue;
          const depth = p.split('/').filter(Boolean).length - rootDepth;
          if (depth < 1 || depth > o.maxDepth) continue;
          out.push({ path: p, name: p.split('/').pop()!, isDir });
        }
      }
      return out;
    },
  };
  return probe;
}

const ctx = { cwd: '/home/me/elsewhere' };

describe('resolvePath', () => {
  it('uses a path that exists as written', async () => {
    const disk = fakeDisk(['/home/me/Projects/gitBrains']);
    expect(await resolvePath({ name: '~/Projects/gitBrains', kind: 'folder' }, ctx, disk)).toEqual({ type: 'found', path: '/home/me/Projects/gitBrains' });
  });

  it('finds the folder inside the location hint as written', async () => {
    const disk = fakeDisk(['/padhai_in_linux/Projects/gitBrains', '/home/me/x']);
    expect(await resolvePath({ name: 'gitBrains', kind: 'folder', locationHint: '/padhai_in_linux/Projects/' }, ctx, disk))
      .toEqual({ type: 'found', path: '/padhai_in_linux/Projects/gitBrains' });
  });

  it('reads a leading-slash hint as relative to home (the report 6 case)', async () => {
    const disk = fakeDisk(['/home/me/padhai_in_linux/Projects/gitbrains']);
    expect(await resolvePath({ name: 'gitBrains', kind: 'folder', locationHint: '/padhai_in_linux/Projects/' }, ctx, disk))
      .toEqual({ type: 'found', path: '/home/me/padhai_in_linux/Projects/gitbrains' });
  });

  it('searches for the hint by its last two parts when it is not where it was written', async () => {
    const disk = fakeDisk(['/home/me/Documents/padhai_in_linux/Projects/gitbrains']);
    expect(await resolvePath({ name: 'gitBrains', kind: 'folder', locationHint: '/padhai_in_linux/Projects' }, ctx, disk))
      .toEqual({ type: 'found', path: '/home/me/Documents/padhai_in_linux/Projects/gitbrains' });
  });

  it('matches a different spelling', async () => {
    const disk = fakeDisk(['/home/me/Projects/git-brains']);
    expect(await resolvePath({ name: 'gitBrains', kind: 'folder' }, ctx, disk)).toEqual({ type: 'found', path: '/home/me/Projects/git-brains' });
  });

  it('asks when two folders have the same name', async () => {
    const disk = fakeDisk(['/home/me/Projects/gitBrains', '/home/me/code/gitBrains']);
    const r = await resolvePath({ name: 'gitBrains', kind: 'folder' }, ctx, disk);
    expect(r.type).toBe('choose');
    if (r.type === 'choose') { expect(r.reason).toBe('several'); expect(r.candidates).toHaveLength(2); }
  });

  it('a match inside the named place beats an equal match elsewhere', async () => {
    const disk = fakeDisk(['/home/me/Projects/gitBrains', '/home/me/Documents/gitBrains']);
    expect(await resolvePath({ name: 'gitBrains', kind: 'folder', locationHint: 'Documents' }, ctx, disk))
      .toEqual({ type: 'found', path: '/home/me/Documents/gitBrains' });
  });

  it('a typo asks "did you mean"', async () => {
    const disk = fakeDisk(['/home/me/Projects/gitBrains']);
    const r = await resolvePath({ name: 'gitbarins', kind: 'folder' }, ctx, disk);
    expect(r.type).toBe('choose');
    if (r.type === 'choose') { expect(r.reason).toBe('typo'); expect(r.candidates[0].path).toBe('/home/me/Projects/gitBrains'); }
  });

  it('a partial name is a question, not a guess', async () => {
    const disk = fakeDisk(['/home/me/Projects/api-server']);
    const r = await resolvePath({ name: 'api', kind: 'folder' }, ctx, disk);
    expect(r.type).toBe('choose');
  });

  it('nothing found lists where it looked and never invents a path', async () => {
    const disk = fakeDisk(['/home/me/Projects/other']);
    const r = await resolvePath({ name: 'gitBrains', kind: 'folder', locationHint: '~/Projects' }, ctx, disk);
    expect(r.type).toBe('missing');
    if (r.type === 'missing') { expect(r.searched.length).toBeGreaterThan(1); expect(r.searched.join(' ')).toContain('Projects'); }
  });

  it('finds files by kind and ignores folders of the same name', async () => {
    const disk = fakeDisk(['/home/me/Documents/notes.txt'], ['/home/me/Documents/notes.txt.bak', '/home/me/Documents/notes.txt-real']);
    const r = await resolvePath({ name: 'notes.txt', kind: 'file', locationHint: 'Documents' }, ctx, disk);
    expect(r.type === 'found' || r.type === 'choose').toBe(true);
    if (r.type === 'choose') expect(r.candidates.every(c => !c.path.endsWith('/notes.txt'))).toBe(true);
  });

  it('uses a remembered path first when it still exists', async () => {
    const disk = fakeDisk(['/home/me/Projects/gitBrains', '/srv/gb']);
    expect(await resolvePath({ name: 'gitbrains', kind: 'folder', remembered: '/srv/gb' }, ctx, disk)).toEqual({ type: 'found', path: '/srv/gb' });
    expect((await resolvePath({ name: 'gitBrains', kind: 'folder', remembered: '/gone' }, ctx, disk)).type).toBe('found');
  });

  it('a place that exists under two spellings (case-insensitive disk) is searched once', async () => {
    const real = fakeDisk(['/home/me/Projects/gitBrains']);
    // a case-insensitive disk answers yes for both "Projects" and "projects" and lists the same folders under each
    const disk: PathProbe = {
      ...real,
      exists: async (p: string) => real.exists(p.replace(/\/projects(\/|$)/, '/Projects$1')),
      find: async (o: any) => {
        const rows = await real.find({ ...o, roots: o.roots.map((r: string) => r.replace(/\/projects$/, '/Projects')) });
        return rows.map(r => ({ ...r, path: o.roots[0].endsWith('/projects') ? r.path.replace('/Projects/', '/projects/') : r.path }));
      },
    };
    expect(await resolvePath({ name: 'gitBrains', kind: 'folder' }, ctx, disk)).toEqual({ type: 'found', path: '/home/me/Projects/gitBrains' });
  });

  it('finds a folder in the current folder first', async () => {
    const disk = fakeDisk(['/home/me/elsewhere/gitBrains', '/home/me/Projects/gitBrains']);
    expect(await resolvePath({ name: 'gitBrains', kind: 'folder' }, ctx, disk)).toEqual({ type: 'found', path: '/home/me/elsewhere/gitBrains' });
  });
});

describe('folders macOS asks permission for', () => {
  it('are not searched when the name is found elsewhere, but are when nothing else matched', async () => {
    const disk = fakeDisk(['/home/me/Projects/gitBrains', '/home/me/Documents/gitBrains']);
    const seen: string[] = [];
    const spy = { ...disk, find: async (o: any) => { seen.push(o.roots[0]); return disk.find(o); } };
    expect(await resolvePath({ name: 'gitBrains', kind: 'folder' }, ctx, spy)).toEqual({ type: 'found', path: '/home/me/Projects/gitBrains' });
    expect(seen.some(r => /Documents|Desktop|Downloads/.test(r))).toBe(false);
    const only = fakeDisk(['/home/me/Documents/lonely']);
    expect(await resolvePath({ name: 'lonely', kind: 'folder' }, ctx, only)).toEqual({ type: 'found', path: '/home/me/Documents/lonely' });
  });
});
