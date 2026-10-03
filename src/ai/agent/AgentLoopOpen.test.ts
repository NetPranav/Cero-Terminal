import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { AgentLoop } from './AgentLoop';
import { setChoiceHandlerForTests } from '../../presentation/ChoiceRequests';
import { AliasStore } from '../../domain/system/AliasStore';
import type { PathProbe, FoundPath } from '../../domain/system/PathResolver';

function fakeProbe(dirs: string[]): PathProbe {
  const all = new Set<string>();
  for (const d of dirs) {
    const parts = d.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) all.add('/' + parts.slice(0, i).join('/'));
  }
  return {
    home: '/home/me',
    async exists(p) { return all.has(p.replace(/\/+$/, '')); },
    async find(o): Promise<FoundPath[]> {
      const out: FoundPath[] = [];
      for (const root of o.roots) {
        const rd = root.split('/').filter(Boolean).length;
        for (const p of all) {
          if (!p.startsWith(root.replace(/\/$/, '') + '/')) continue;
          const depth = p.split('/').filter(Boolean).length - rd;
          if (depth >= 1 && depth <= o.maxDepth) out.push({ path: p, name: p.split('/').pop()!, isDir: true });
        }
      }
      return out;
    },
  };
}

describe('Opening a folder by name', () => {
  let tmp: string;
  let loop: AgentLoop;
  let execute: ReturnType<typeof vi.fn>;
  let generate: ReturnType<typeof vi.fn>;
  const ctx = { os: 'linux', cwd: '/home/me/elsewhere' };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cero-open-'));
    AliasStore.getInstance().setFile(path.join(tmp, 'aliases.json'));
    generate = vi.fn();
    loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn(),
    } as any);
    execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: '', code: 0 } });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    loop.setOpenVerifyDelay(0);
  });
  afterEach(() => {
    setChoiceHandlerForTests(null);
    AliasStore.getInstance().setFile(undefined);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const commands = () => execute.mock.calls.map(c => c[1]?.command as string);

  it('report 6: opens the folder inside the named place in one editor window, no model, nothing created', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/padhai_in_linux/Projects/gitbrains']));
    const r = await loop.run('Please open a folder named gitBrains in VS Code. This folder is inside /padhai_in_linux/Projects/', ctx);
    expect(r.success).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    const opened = commands().filter(c => /setsid -f code/.test(c));
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("'/home/me/padhai_in_linux/Projects/gitbrains'");
    expect(commands().some(c => /mkdir|touch|New-Item/.test(c))).toBe(false);
    expect(r.summary).toBe('Opened ~/padhai_in_linux/Projects/gitbrains in Visual Studio Code.');
    expect(r.steps[0].flowAction).toEqual({ type: 'app', app: 'Visual Studio Code', path: '~/padhai_in_linux/Projects/gitbrains' });
  });

  it('a differently spelled folder opens without asking', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects/git-brains']));
    const asked: string[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q.title); return { index: 0 }; });
    const r = await loop.run('open the folder gitBrains in code', ctx);
    expect(r.success).toBe(true);
    expect(asked).toEqual([]);
  });

  it('two folders of the same name: asks, opens the choice, and remembers it', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects/gitBrains', '/home/me/Documents/gitBrains']));
    const asked: any[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q); return { index: 1 }; });
    const first = await loop.run('open the folder gitBrains in code', ctx);
    expect(asked).toHaveLength(1);
    expect(asked[0].title).toBe('I found 2 folders called "gitBrains". Which one?');
    expect(asked[0].options.at(-1).label).toBe('None of these');
    const chosen = asked[0].options[1].label.replace('~', '/home/me');
    expect(first.success).toBe(true);
    expect(commands().some(c => c.includes(`'${chosen}'`))).toBe(true);

    asked.length = 0;
    const second = await loop.run('open the folder gitBrains in code', ctx);
    expect(asked).toEqual([]);
    expect(second.success).toBe(true);
  });

  it('a typo asks "did you mean" and opens nothing when declined', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects/gitBrains']));
    const asked: any[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q); return { index: 2 }; });
    const r = await loop.run('open the folder gitbarins in code', ctx);
    expect(asked[0].title).toBe('I could not find "gitbarins". Did you mean "gitBrains" in ~/Projects?');
    expect(r.success).toBe(false);
    expect(commands().some(c => /setsid -f code/.test(c))).toBe(false);
  });

  it('a folder that does not exist is reported with where it looked, and nothing is created', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects/other']));
    const r = await loop.run('open the folder gitBrains in code', ctx);
    expect(r.success).toBe(false);
    expect(r.summary).toContain('I could not find a folder called "gitBrains".');
    expect(r.summary).toContain('I looked in:');
    expect(r.summary).toContain('Nothing was created or opened.');
    expect(execute).not.toHaveBeenCalled();
  });

  it('with no screen to ask on, it lists the candidates instead of guessing', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects/gitBrains', '/home/me/Documents/gitBrains']));
    const r = await loop.run('open the folder gitBrains in code', ctx);
    expect(r.success).toBe(false);
    expect(r.summary).toContain('Several places could be "gitBrains"');
    expect(execute).not.toHaveBeenCalled();
  });

  it('create only when asked to', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects']));
    const r = await loop.run('open the folder newapp inside ~/Projects in code, create it if missing', ctx);
    expect(commands()[0]).toContain("mkdir -p '/home/me/Projects/newapp'");
    expect(r.success).toBe(true);
  });

  it('falls back when the editor command is not installed', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects/gitBrains']));
    execute.mockImplementation(async (_t: string, p: any) => (/^command -v code/.test(p.command) ? { success: false, error: 'not found' } : { success: true, data: { stdout: '', code: 0 } }));
    const r = await loop.run('open the folder gitBrains in code', ctx);
    expect(r.success).toBe(true);
    expect(commands().some(c => c.includes('flatpak run com.visualstudio.code'))).toBe(true);
  });
});

describe('Opening an app by name', () => {
  let tmp: string;
  let loop: AgentLoop;
  let execute: ReturnType<typeof vi.fn>;
  const listing = [
    '/usr/share/applications/code.desktop:Name=Visual Studio Code',
    '/usr/share/applications/code.desktop:Exec=/usr/share/code/code %F',
    '/usr/share/applications/chromium.desktop:Name=Chromium Web Browser',
    '/usr/share/applications/chromium.desktop:Exec=chromium %U',
    '/usr/share/applications/firefox.desktop:Name=Firefox',
    '/usr/share/applications/firefox.desktop:Exec=firefox %u',
    '/var/lib/flatpak/exports/share/applications/org.mozilla.firefox.desktop:Name=Firefox',
    '/var/lib/flatpak/exports/share/applications/org.mozilla.firefox.desktop:Exec=flatpak run org.mozilla.firefox',
  ].join('\n');
  const ctx = { os: 'linux', cwd: '/home/me' };

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cero-app-'));
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
  const launched = () => execute.mock.calls.map(c => c[1]?.command as string).filter(c => /gtk-launch/.test(c));

  it('"open vs code" launches the real desktop entry', async () => {
    const r = await loop.run('open vs code', ctx);
    expect(r.success).toBe(true);
    expect(launched()[0]).toContain("gtk-launch 'code'");
  });

  it('a misspelled app asks "did you mean"', async () => {
    const asked: string[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q.title); return { index: 0 }; });
    const r = await loop.run('open crome', ctx);
    expect(asked[0]).toMatch(/Did you mean "Chromium Web Browser"\?/);
    expect(r.success).toBe(true);
  });

  it('an app that is not installed is reported and nothing runs', async () => {
    const r = await loop.run('open nonexistentapp', ctx);
    expect(r.success).toBe(false);
    expect(r.summary).toContain('No app called "nonexistentapp" is installed');
    expect(launched()).toEqual([]);
  });

  it('two copies of an app (deb and Flatpak) ask which one, then remember', async () => {
    const asked: any[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q); return { index: 0 }; });
    await loop.run('open firefox', ctx);
    expect(asked).toHaveLength(1);
    expect(asked[0].options.at(-1).label).toBe('None of these');
    asked.length = 0;
    await loop.run('open firefox', ctx);
    expect(asked).toEqual([]);
  });
});

describe('cd and remembered names', () => {
  let tmp: string;
  let loop: AgentLoop;
  const ctx = { os: 'linux', cwd: '/home/me/elsewhere' };
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cero-cd-'));
    AliasStore.getInstance().setFile(path.join(tmp, 'aliases.json'));
    loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate: vi.fn() }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn(),
    } as any);
    (loop as any).toolExecutor = { hasDriver: () => true, execute: vi.fn().mockResolvedValue({ success: true, data: { stdout: '' } }) };
  });
  afterEach(() => {
    setChoiceHandlerForTests(null);
    AliasStore.getInstance().setFile(undefined);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('"cd gitbrains" works from anywhere', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects/gitBrains']));
    const r = await loop.run('cd gitbrains', ctx);
    expect(r.cdPath).toBe('/home/me/Projects/gitBrains');
  });

  it('remembers a choice, reports it, and forgets it on request', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects/gitBrains', '/home/me/Documents/gitBrains']));
    setChoiceHandlerForTests(async () => ({ index: 0 }));
    const first = await loop.run('cd gitbrains', ctx);
    expect(first.cdPath).toBeTruthy();
    setChoiceHandlerForTests(null);
    const again = await loop.run('cd gitbrains', ctx);
    expect(again.cdPath).toBe(first.cdPath);
    const asked = await loop.run('what do you remember about gitbrains', ctx);
    expect(asked.summary).toContain(first.cdPath!);
    const forgot = await loop.run('forget gitbrains', ctx);
    expect(forgot.summary).toContain('Forgot 1 remembered choice');
    expect((await loop.run('what do you remember about gitbrains', ctx)).summary).toContain('do not remember anything');
  });

  it('forget with nothing remembered is not hijacked', async () => {
    const r = await loop.run('forget my folder shortcuts', ctx);
    expect(r.summary).toBe('There was nothing remembered.');
  });
});
