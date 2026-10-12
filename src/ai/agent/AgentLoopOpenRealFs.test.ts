import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentLoop } from './AgentLoop';
import { setChoiceHandlerForTests } from '../../presentation/ChoiceRequests';
import { AliasStore } from '../../domain/system/AliasStore';
import type { FoundPath, PathProbe } from '../../domain/system/PathResolver';

/** A probe over the real disk, walking like src-tauri/src/path_search.rs (breadth first, loose name filter). */
function realDiskProbe(home: string): PathProbe {
  const compact = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  const dist = (a: string, b: string) => {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  };
  const could = (q: string, n: string) => {
    const a = compact(q), b = compact(n);
    if (!a || !b) return false;
    return b.includes(a) || (a.includes(b) && b.length >= 3) || (Math.abs(a.length - b.length) <= 3 && dist(a, b) <= 3);
  };
  return {
    home,
    async exists(p) { try { return fs.statSync(p.replace(/\/+$/, '') || '/').isDirectory() || fs.existsSync(p); } catch { return false; } },
    async find(o) {
      const out: FoundPath[] = [];
      const queue: Array<[string, number]> = o.roots.map(r => [r, 0] as [string, number]);
      while (queue.length) {
        const [dir, depth] = queue.shift()!;
        if (depth >= o.maxDepth) continue;
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries.sort((x, y) => x.name.localeCompare(y.name))) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) queue.push([full, depth + 1]);
          const kindOk = o.kind === 'dir' ? e.isDirectory() : o.kind === 'file' ? e.isFile() : true;
          if (kindOk && could(o.query, e.name)) out.push({ path: full, name: e.name, isDir: e.isDirectory() });
        }
      }
      return out.slice(0, o.limit * 10);
    },
  };
}

/** Every path under a tree, so a test can prove nothing was created or removed */
function snapshot(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      out.push(p);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(root);
  return out.sort();
}

describe('Opening existing folders on a real directory tree (issues 6 and 7)', () => {
  let home: string;
  let loop: AgentLoop;
  let execute: ReturnType<typeof vi.fn>;
  let generate: ReturnType<typeof vi.fn>;
  const mk = (...dirs: string[]) => dirs.forEach(d => fs.mkdirSync(path.join(home, d), { recursive: true }));
  const editorLaunches = () => execute.mock.calls.map(c => String(c[1]?.command)).filter(c => /setsid -f (?:code|flatpak run com\.visualstudio\.code)\b/.test(c));

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'cero-realfs-'));
    AliasStore.getInstance().setFile(path.join(home, '.aliases.json'));
    generate = vi.fn();
    loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn(),
    } as any);
    execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: '', code: 0 } });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    loop.setOpenVerifyDelay(0);
    loop.setPathProbe(realDiskProbe(home));
  });
  afterEach(() => {
    setChoiceHandlerForTests(null);
    AliasStore.getInstance().setFile(undefined);
    fs.rmSync(home, { recursive: true, force: true });
  });

  const ctx = () => ({ os: 'linux', cwd: path.join(home, 'elsewhere') });
  const prompt = (name: string) => `Please open a folder named ${name} in VS Code. This folder is inside /padhai_in_linux/Projects/`;

  it('exact name, place written with a leading slash but living under the home folder: opens it, creates nothing', async () => {
    mk('padhai_in_linux/Projects/gitBrain', 'padhai_in_linux/Projects/other', 'elsewhere');
    const before = snapshot(home);
    const r = await loop.run(prompt('gitBrain'), ctx());
    expect(r.success).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    const launches = editorLaunches();
    expect(launches).toHaveLength(1);
    expect(launches[0]).toContain(path.join(home, 'padhai_in_linux/Projects/gitBrain'));
    expect(execute.mock.calls.some(c => /mkdir|touch|tee|>\s*\S/.test(String(c[1]?.command).replace(/>\/dev\/null 2>&1/g, '')))).toBe(false);
    expect(snapshot(home)).toEqual(before);
  });

  it('slightly wrong name (gitBrains for gitBrain): opens the existing folder instead of creating or failing', async () => {
    mk('padhai_in_linux/Projects/gitBrain', 'padhai_in_linux/Projects/portfolio', 'elsewhere');
    const before = snapshot(home);
    const asked: string[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q.title); return { index: 0 }; });
    const r = await loop.run(prompt('gitBrains'), ctx());
    expect(r.success).toBe(true);
    const launches = editorLaunches();
    expect(launches).toHaveLength(1);
    expect(launches[0]).toContain(path.join(home, 'padhai_in_linux/Projects/gitBrain'));
    expect(snapshot(home)).toEqual(before);
  });

  it('wrong case and spacing resolve without asking', async () => {
    mk('padhai_in_linux/Projects/gitBrain', 'elsewhere');
    for (const spoken of ['gitbrain', 'GITBRAIN', 'git brain', 'git-brain']) {
      execute.mockClear();
      const asked: string[] = [];
      setChoiceHandlerForTests(async q => { asked.push(q.title); return { index: 0 }; });
      const r = await loop.run(prompt(spoken), ctx());
      expect(r.success, spoken).toBe(true);
      expect(editorLaunches(), spoken).toHaveLength(1);
      expect(asked, spoken).toEqual([]);
    }
  });

  it('ambiguous (two near matches): asks, never picks one itself, and opens nothing until answered', async () => {
    mk('padhai_in_linux/Projects/gitBrain-old', 'padhai_in_linux/Projects/gitBrain-new', 'elsewhere');
    // no screen to ask on: it must stop and say why instead of guessing
    const noScreen = await loop.run(prompt('gitBrain'), ctx());
    expect(noScreen.success).toBe(false);
    expect(editorLaunches()).toHaveLength(0);

    const asked: any[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q); return null; }); // the user cancels
    const cancelled = await loop.run(prompt('gitBrain'), ctx());
    expect(asked).toHaveLength(1);
    expect(asked[0].options.length).toBeGreaterThanOrEqual(3); // both folders and "None of these"
    expect(cancelled.success).toBe(false);
    expect(editorLaunches()).toHaveLength(0);

    setChoiceHandlerForTests(async () => ({ index: 1 }));
    const picked = await loop.run(prompt('gitBrain'), ctx());
    expect(picked.success).toBe(true);
    expect(editorLaunches()).toHaveLength(1);
  });

  it('other phrasings open the same existing folder, still creating nothing', async () => {
    mk('padhai_in_linux/Projects/gitBrain', 'padhai_in_linux/Projects/portfolio', 'elsewhere');
    const before = snapshot(home);
    for (const p of [
      'In VS Code open the gitBrain folder inside ~/padhai_in_linux/Projects',
      'open the folder gitBrain which is located in /padhai_in_linux/Projects in vs code',
      'launch vscode with the gitBrain folder, it is in /padhai_in_linux/Projects/',
      'open vs code and open the folder gitBrain from Projects',
      'edit gitBrain project in vscode',
    ]) {
      execute.mockClear();
      setChoiceHandlerForTests(async () => ({ index: 0 }));
      const r = await loop.run(p, ctx());
      expect(r.success, p).toBe(true);
      const launches = editorLaunches();
      expect(launches, p).toHaveLength(1);
      expect(launches[0], p).toContain(path.join(home, 'padhai_in_linux/Projects/gitBrain'));
      expect(launches[0], p).not.toMatch(/ -n /);
      expect(generate).not.toHaveBeenCalled();
    }
    expect(snapshot(home)).toEqual(before);
  });

  it('a window of its own is requested only when asked for', async () => {
    mk('padhai_in_linux/Projects/gitBrain', 'elsewhere');
    const r = await loop.run('open gitBrain from /padhai_in_linux/Projects in a new vscode window', ctx());
    expect(r.success).toBe(true);
    expect(editorLaunches()[0]).toContain(`setsid -f code -n '${path.join(home, 'padhai_in_linux/Projects/gitBrain')}'`);
  });

  it('a folder that really is not there: reports where it looked and creates nothing', async () => {
    mk('padhai_in_linux/Projects/portfolio', 'elsewhere');
    const before = snapshot(home);
    const r = await loop.run(prompt('totallyunrelated'), ctx());
    expect(r.success).toBe(false);
    expect(r.summary).toMatch(/could not find/i);
    expect(editorLaunches()).toHaveLength(0);
    expect(snapshot(home)).toEqual(before);
  });

  it('a name that is only a file elsewhere does not get created as a folder', async () => {
    mk('padhai_in_linux/Projects/portfolio', 'elsewhere');
    fs.writeFileSync(path.join(home, 'padhai_in_linux/Projects/gitBrain.txt'), 'x');
    const before = snapshot(home);
    const r = await loop.run(prompt('gitBrain'), ctx());
    expect(editorLaunches().every(c => !/mkdir|touch/.test(c))).toBe(true);
    expect(snapshot(home)).toEqual(before);
    expect(typeof r.success).toBe('boolean');
  });
});

describe('Opening an app with an imperfect name (issue 7)', () => {
  let tmp: string;
  let loop: AgentLoop;
  let execute: ReturnType<typeof vi.fn>;
  const listing = [
    '/usr/share/applications/code.desktop:Name=Visual Studio Code',
    '/usr/share/applications/code.desktop:Exec=/usr/share/code/code %F',
    '/usr/share/applications/chromium.desktop:Name=Chromium Web Browser',
    '/usr/share/applications/chromium.desktop:Exec=chromium %U',
    '/usr/share/applications/google-chrome.desktop:Name=Google Chrome',
    '/usr/share/applications/google-chrome.desktop:Exec=/usr/bin/google-chrome-stable %U',
    '/usr/share/applications/firefox.desktop:Name=Firefox',
    '/usr/share/applications/firefox.desktop:Exec=firefox %u',
    '/usr/share/applications/spotify.desktop:Name=Spotify',
    '/usr/share/applications/spotify.desktop:Exec=spotify %U',
  ].join('\n');
  const ctx = { os: 'linux', cwd: '/home/me' };

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cero-appnames-'));
    AliasStore.getInstance().setFile(path.join(tmp, 'aliases.json'));
    const { clearCatalogCache } = await import('../../domain/system/AppCatalog');
    clearCatalogCache();
    loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate: vi.fn() }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn(),
    } as any);
    execute = vi.fn().mockImplementation(async (_t: string, p: any) => {
      if (/grep -H/.test(p.command) && p.command.includes('/usr/share/applications') && !p.command.includes('/usr/local')) return { success: true, data: { stdout: listing } };
      if (/^command -v/.test(p.command)) return { success: false, error: 'not found' };
      return { success: true, data: { stdout: '', code: 0 } };
    });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
  });
  afterEach(() => {
    setChoiceHandlerForTests(null);
    AliasStore.getInstance().setFile(undefined);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const launched = () => execute.mock.calls.map(c => String(c[1]?.command)).filter(c => /gtk-launch/.test(c));

  it('exact and equivalent spellings launch the right app without asking', async () => {
    for (const [spoken, desktop] of [['spotify', 'spotify'], ['vscode', 'code'], ['VS Code', 'code'], ['visual studio code', 'code'], ['fire fox', 'firefox'], ['chrome', 'google-chrome']] as const) {
      execute.mockClear();
      const asked: string[] = [];
      setChoiceHandlerForTests(async q => { asked.push(q.title); return { index: 0 }; });
      const r = await loop.run(`open ${spoken}`, ctx);
      expect(r.success, spoken).toBe(true);
      expect(asked, spoken).toEqual([]);
      expect(launched()[0], spoken).toContain(`gtk-launch '${desktop}'`);
    }
  });

  it('a slightly wrong name asks "did you mean" and launches only after a yes', async () => {
    for (const [spoken, suggestion] of [['spotfy', 'Spotify'], ['firefx', 'Firefox'], ['crome', 'Google Chrome']] as const) {
      execute.mockClear();
      const asked: string[] = [];
      setChoiceHandlerForTests(async q => { asked.push(q.title); return { index: 1 }; }); // "No"
      const declined = await loop.run(`open ${spoken}`, ctx);
      expect(asked[0], spoken).toContain(`Did you mean "${suggestion}"?`);
      expect(declined.success, spoken).toBe(false);
      expect(launched(), spoken).toEqual([]);

      setChoiceHandlerForTests(async () => ({ index: 0 }));
      const accepted = await loop.run(`open ${spoken}`, ctx);
      expect(accepted.success, spoken).toBe(true);
      expect(launched().length, spoken).toBe(1);
    }
  });

  it('a single close match is a confirmation, not a one-item menu', async () => {
    const asked: string[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q.title); return { index: 0 }; });
    const r = await loop.run('open Visual Studio Cod', ctx);
    expect(asked[0]).toMatch(/Did you mean "Visual Studio Code"\?/);
    expect(asked[0]).not.toMatch(/1 apps/);
    expect(r.success).toBe(true);
  });

  it('ambiguous (two real matches): asks which, launches nothing on cancel, and never guesses with no screen', async () => {
    const noScreen = await loop.run('open chrom', ctx);
    expect(noScreen.success).toBe(false);
    expect(launched()).toEqual([]);

    const asked: any[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q); return null; });
    const cancelled = await loop.run('open chrom', ctx);
    expect(asked[0].title).toMatch(/2 apps that could be "chrom"/);
    expect(asked[0].options.map((o: any) => o.label)).toEqual(['Chromium Web Browser', 'Google Chrome', 'None of these']);
    expect(cancelled.success).toBe(false);
    expect(launched()).toEqual([]);

    setChoiceHandlerForTests(async () => ({ index: 1 }));
    const picked = await loop.run('open chrom', ctx);
    expect(picked.success).toBe(true);
    expect(launched()[0]).toContain("gtk-launch 'google-chrome'");
  });

  it('an app that does not exist is reported and nothing is launched or installed', async () => {
    const r = await loop.run('open quuxzzy', ctx);
    expect(r.success).toBe(false);
    expect(r.summary).toContain('No app called "quuxzzy" is installed');
    expect(launched()).toEqual([]);
    expect(execute.mock.calls.some(c => /apt|pacman|dnf|brew|install/.test(String(c[1]?.command)))).toBe(false);
  });
});
