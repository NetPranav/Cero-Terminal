import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentLoop } from './AgentLoop';
import { setChoiceHandlerForTests } from '../../presentation/ChoiceRequests';

const PS = ['/sbin/launchd', '/Applications/Amphetamine.app/Contents/MacOS/Amphetamine', '/Applications/Safari.app/Contents/MacOS/Safari', '/bin/zsh'].join('\n');

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

describe('"is the amphetmine application running or not"', () => {
  it('lists what runs, matches the misspelling to the real app, and says so (no pgrep -x guess)', async () => {
    const { loop, fn, generate } = loopWith(async (_t, p) => (/^ps /.test(p.command) ? { success: true, data: { stdout: PS } } : { success: true, data: { stdout: '' } }));
    const r = await loop.run('Hey there tell me is the amphetmine application running or not', mac);
    expect(r.success).toBe(true);
    expect(r.summary).toBe('Amphetamine is running. (You wrote "amphetmine"; that is the closest running app.)');
    expect(fn.mock.calls.some(c => /pgrep/.test(String(c[1]?.command)))).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
  it('an app that is installed but not running is reported as such', async () => {
    const { loop } = loopWith(async (_t, p) => {
      if (/^ps /.test(p.command)) return { success: true, data: { stdout: '/bin/zsh' } };
      if (/^ls -1 \/Applications/.test(p.command)) return { success: true, data: { stdout: 'Amphetamine.app\nSafari.app' } };
      return { success: true, data: { stdout: '' } };
    });
    const r = await loop.run('is safari running?', mac);
    expect(r.summary).toBe('Safari is installed but not running right now.');
  });
});

describe('smart fallbacks after a failed command', () => {
  afterEach(() => setChoiceHandlerForTests(null));

  it('a pgrep that finds nothing becomes a look at the real running apps', async () => {
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ action: 'execute', command: "pgrep -x 'amphetmine'", explanation: 'check' }), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 1 });
    const { loop } = loopWith(async (_t, p) => {
      if (/^ps /.test(p.command)) return { success: true, data: { stdout: PS } };
      if (/^pgrep/.test(p.command)) return { success: false, error: 'exit 1', data: { code: 1, stdout: '', stderr: '' } };
      return { success: true, data: { stdout: '' } };
    }, generate);
    const r = await loop.run('please look at the amphetmine thing for me', mac);
    expect(r.summary).toContain('Amphetamine is running');
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

describe('a program that is not installed', () => {
  afterEach(() => setChoiceHandlerForTests(null));
  it('offers the programs with a similar name and runs the one chosen', async () => {
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ action: 'execute', command: 'htpo', explanation: 'monitor' }), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 1 });
    const { loop, fn } = loopWith(async (_t, p) => {
      if (p.command === 'htpo') return { success: false, error: 'zsh: command not found: htpo', data: { code: 127, stderr: 'zsh: command not found: htpo', stdout: '' } };
      if (/IFS=:/.test(p.command)) return { success: true, data: { stdout: 'htop\nls\ngit' } };
      return { success: true, data: { stdout: 'ok' } };
    }, generate);
    const asked: string[] = [];
    setChoiceHandlerForTests(async q => { asked.push(q.title); return { index: 0 }; });
    await loop.run('give me that viewer I like', mac);
    expect(asked[0]).toBe('"htpo" is not installed. Did you mean "htop"?');
    expect(fn.mock.calls.some(c => c[1]?.command === 'htop')).toBe(true);
  });
});
