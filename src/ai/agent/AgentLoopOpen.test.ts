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
  const ctx = { os: 'windows', cwd: '/home/me/elsewhere' };

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
    const opened = commands().filter(c => /Start-Process -FilePath 'code'/.test(c));
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
    loop.setPathProbe(fakeProbe(['/home/me/Projects/gitBrains', '/home/me/code/gitBrains']));
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
    expect(commands().some(c => /Start-Process -FilePath 'code'/.test(c))).toBe(false);
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
    loop.setPathProbe(fakeProbe(['/home/me/Projects/gitBrains', '/home/me/code/gitBrains']));
    const r = await loop.run('open the folder gitBrains in code', ctx);
    expect(r.success).toBe(false);
    expect(r.summary).toContain('Several places could be "gitBrains"');
    expect(execute).not.toHaveBeenCalled();
  });

  it('create only when asked to', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects']));
    const r = await loop.run('open the folder newapp inside ~/Projects in code, create it if missing', ctx);
    expect(commands()[0]).toContain("New-Item -ItemType Directory -Force -Path '/home/me/Projects/newapp'");
    expect(r.success).toBe(true);
  });
});

describe('Opening an app by name', () => {
  let tmp: string;
  let loop: AgentLoop;
  let execute: ReturnType<typeof vi.fn>;
  // Get-StartApps output, as listCommands() prints it
  const listing = [
    '"Visual Studio Code","Microsoft.VisualStudioCode"',
    '"Chromium Web Browser","Chromium.F2KQ5B6G7J"',
    '"Firefox","308046B0AF4A39CB"',
  ].join('\r\n');
  const ctx = { os: 'windows', cwd: 'C:\\Users\\me' };

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
      if (/Get-StartApps/.test(p.command)) return { success: true, data: { stdout: listing } };
      return { success: true, data: { stdout: '', code: 0 } };
    });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
  });
  afterEach(() => {
    setChoiceHandlerForTests(null);
    AliasStore.getInstance().setFile(undefined);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const launched = () => execute.mock.calls.map(c => c[1]?.command as string).filter(c => /Start-Process 'shell:AppsFolder/.test(c));

  it('"open vs code" launches the real Start-menu app', async () => {
    const r = await loop.run('open vs code', ctx);
    expect(r.success).toBe(true);
    expect(launched()[0]).toBe("Start-Process 'shell:AppsFolder\\Microsoft.VisualStudioCode'");
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
});

describe('cd and remembered names', () => {
  let tmp: string;
  let loop: AgentLoop;
  const ctx = { os: 'windows', cwd: '/home/me/elsewhere' };
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
    loop.setPathProbe(fakeProbe(['/home/me/Projects/gitBrains', '/home/me/code/gitBrains']));
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

describe('showing a file and listing a named folder', () => {
  let loop: AgentLoop;
  let execute: ReturnType<typeof vi.fn>;
  const ctx = { os: 'windows', cwd: '/home/me/work' };
  beforeEach(() => {
    loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate: vi.fn() }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn(),
    } as any);
    execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: 'name,team\nana,red' } });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
  });
  afterEach(() => setChoiceHandlerForTests(null));

  it('"what is in data.csv" reads the file, without the model', async () => {
    const r = await loop.run('what is in data.csv', ctx);
    expect(execute.mock.calls[0][1].command).toBe("Get-Content -LiteralPath 'data.csv' -TotalCount 60");
    expect(r.summary).toContain('ana,red');
  });

  it('"list the files in my notes folder" finds "my notes" and lists that real path', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/work/my notes']));
    await loop.run('list the files in my notes folder', ctx);
    expect(execute.mock.calls[0][1].command).toBe("Get-ChildItem -Force -LiteralPath '/home/me/work/my notes'");
  });

  it('a folder that cannot be found falls through instead of listing a guessed path', async () => {
    loop.setPathProbe(fakeProbe(['/home/me/Projects/other']));
    await loop.run('list the files in nowhere-xyz folder', ctx).catch(() => null);
    expect(execute.mock.calls.every(c => !/nowhere-xyz/.test(String(c[1]?.command)) || !/^ls /.test(String(c[1]?.command)))).toBe(true);
  });
});

describe('find by file type, and a workflow request with no steps', () => {
  let loop: AgentLoop;
  let execute: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate: vi.fn() }),
      getActiveModel: () => ({ modelId: 'mock' }), initialize: vi.fn(),
    } as any);
    execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: 'C:\\logs\\a.log' } });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
  });

  it('"locate all log files in C:\\logs" is a plain search: no elevation, no index', async () => {
    await loop.run('locate all log files in C:\\logs', { os: 'windows', cwd: 'C:\\tmp' });
    const cmd = execute.mock.calls[0][1].command as string;
    expect(cmd).toContain("Get-ChildItem -LiteralPath 'C:\\logs' -Recurse -File -Filter '*.log'");
    expect(cmd).toContain('(node_modules|\\.git)');
    expect(cmd).not.toMatch(/sudo|updatedb|locate |RunAs/);
  });
  it('"find all python files in this directory" searches here', async () => {
    await loop.run('find all python files in this directory', { os: 'windows', cwd: 'C:\\tmp' });
    expect(execute.mock.calls[0][1].command).toContain("Get-ChildItem -LiteralPath '.' -Recurse -File -Filter '*.py'");
  });
  it('"create a new workflow called backup-db" asks for the steps and runs nothing', async () => {
    const r = await loop.run('create a new workflow called backup-db', { os: 'windows', cwd: '/tmp' });
    expect(r.summary).toContain('A workflow needs steps');
    expect(execute).not.toHaveBeenCalled();
  });
});
