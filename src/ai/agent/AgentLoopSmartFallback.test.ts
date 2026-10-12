import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentLoop } from './AgentLoop';
import { setChoiceHandlerForTests } from '../../presentation/ChoiceRequests';

// listRunningCommand() output: A = app with a window, P = other process
const PS = ['P\tsvchost', 'A\tObsidian', 'A\tmsedge', 'P\tpowershell'].join('\r\n');

function loopWith(execute: (tool: string, params: any) => Promise<any>, generate = vi.fn()) {
  const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
    getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
    getActiveModel: () => ({ modelId: 'mock' }), initialize: vi.fn(),
  } as any);
  const fn = vi.fn(execute);
  (loop as any).toolExecutor = { hasDriver: () => true, execute: fn };
  return { loop, fn, generate };
}
const mac = { os: 'macos', cwd: '/Users/me' };
const win = { os: 'windows', cwd: 'C:\\Users\\me' };

describe('"is the obsidain application running or not"', () => {
  it('lists what runs, matches the misspelling to the real app, and says so (no pgrep -x guess)', async () => {
    const { loop, fn, generate } = loopWith(async (_t, p) => (/MainWindowHandle/.test(p.command) ? { success: true, data: { stdout: PS } } : { success: true, data: { stdout: '' } }));
    const r = await loop.run('Hey there tell me is the obsidain application running or not', win);
    expect(r.success).toBe(true);
    expect(r.summary).toBe('Obsidian is running. (You wrote "obsidain"; that is the closest running app.)');
    expect(fn.mock.calls.some(c => /pgrep/.test(String(c[1]?.command)))).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
  it('an app that is installed but not running is reported as such', async () => {
    const { loop } = loopWith(async (_t, p) => {
      if (/MainWindowHandle/.test(p.command)) return { success: true, data: { stdout: 'P\tpowershell' } };
      if (/Get-StartApps/.test(p.command)) return { success: true, data: { stdout: '"Obsidian","md.obsidian"\r\n"Spotify","SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"' } };
      return { success: true, data: { stdout: '' } };
    });
    const r = await loop.run('is spotify running?', win);
    expect(r.summary).toBe('Spotify is installed but not running right now.');
  });
});

describe('smart fallbacks after a failed command', () => {
  afterEach(() => setChoiceHandlerForTests(null));

  it('a pgrep that finds nothing becomes a look at the real running apps', async () => {
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ action: 'execute', command: "pgrep -x 'obsidain'", explanation: 'check' }), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 1 });
    const { loop } = loopWith(async (_t, p) => {
      if (/MainWindowHandle/.test(p.command)) return { success: true, data: { stdout: PS } };
      if (/^pgrep/.test(p.command)) return { success: false, error: 'exit 1', data: { code: 1, stdout: '', stderr: '' } };
      return { success: true, data: { stdout: '' } };
    }, generate);
    const r = await loop.run('please look at the obsidain thing for me', win);
    expect(r.summary).toContain('Obsidian is running');
  });

  it('a missing folder is found by name and the same read-only command runs on the real path', async () => {
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ action: 'execute', command: 'ls /Users/me/Projects/gitbarins', explanation: 'list' }), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 1 });
    const { loop, fn } = loopWith(async (_t, p) => {
      if (p.command === 'ls /Users/me/Projects/gitbarins') return { success: false, error: 'ls: No such file or directory', data: { code: 1, stderr: 'ls: /Users/me/Projects/gitbarins: No such file or directory', stdout: '' } };
      return { success: true, data: { stdout: 'README.md' } };
    }, generate);
    loop.setPathProbe({
      home: '/Users/me',
      async exists(p) { return ['/Users/me', '/Users/me/Projects', '/Users/me/Projects/gitBrains'].includes(p); },
      async find(o) { return o.roots[0] === '/Users/me/Projects' ? [{ path: '/Users/me/Projects/gitBrains', name: 'gitBrains', isDir: true }] : []; },
    });
    setChoiceHandlerForTests(async () => ({ index: 0 }));
    const r = await loop.run('please show whatever is in that projects thing', mac);
    expect(fn.mock.calls.some(c => c[1]?.command === "ls '/Users/me/Projects/gitBrains'")).toBe(true);
    expect(r.summary).toContain('I found /Users/me/Projects/gitBrains');
  });
});
