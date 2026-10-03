import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentLoop } from './AgentLoop';
import { setChoiceHandlerForTests } from '../../presentation/ChoiceRequests';
import { AliasStore } from '../../domain/system/AliasStore';
import { clearCatalogCache } from '../../domain/system/AppCatalog';
import { TerminalWorkspace } from '../../domain/terminal/TerminalWorkspace';
import type { PathProbe } from '../../domain/system/PathResolver';

/** The .desktop entries on the machine the issue was reported from */
const DESKTOP = [
  '/usr/share/applications/code.desktop:Name=Visual Studio Code',
  '/usr/share/applications/code.desktop:GenericName=Text Editor',
  '/usr/share/applications/code.desktop:Exec=code %F',
  '/usr/share/applications/code.desktop:Keywords=vscode;',
  '/usr/share/applications/zen.desktop:Name=Zen Browser',
  '/usr/share/applications/zen.desktop:Exec=/opt/zen-browser-bin/zen-bin %u',
  '/usr/share/applications/zen.desktop:GenericName=Web Browser',
  '/usr/share/applications/zen.desktop:Keywords=Internet;WWW;Browser;Web;Explorer;',
].join('\n');

/** create-next-app's first question, as it is drawn when stdin is closed (it then exits 0) */
const NEXT_MENU = '\x1b[?25l\x1b[36m?\x1b[39m \x1b[1mWould you like to use the recommended Next.js defaults?\x1b[22m \x1b[90m›\x1b[39m \x1b[90m- Use arrow-keys. Return to submit.\x1b[39m\n❯   Yes, use recommended defaults\n    No, customize settings\n';

function probeFor(home: string): PathProbe {
  return {
    home,
    async exists(p) { return fs.existsSync(p); },
    async find(o) {
      const out: Array<{ path: string; name: string; isDir: boolean }> = [];
      const walk = (dir: string, depth: number) => {
        if (depth >= o.maxDepth) return;
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (e.name.toLowerCase().replace(/s$/, '') === o.query.toLowerCase().replace(/s$/, '')) out.push({ path: full, name: e.name, isDir: true });
            walk(full, depth + 1);
          }
        }
      };
      o.roots.forEach(r => walk(r, 0));
      return out;
    },
  };
}

describe('several actions in one request (open folder + app, scaffold + editor + app)', () => {
  let home: string;
  let loop: AgentLoop;
  let execute: ReturnType<typeof vi.fn>;
  let generate: ReturnType<typeof vi.fn>;
  let events: Array<{ type: string; message?: string }>;
  let approvals: any[];
  /** What each command should answer, checked in order; default is success with no output */
  let answers: Array<[RegExp, any]>;
  const commands = () => execute.mock.calls.map(c => String(c[1]?.command ?? ''));
  const zenLaunches = () => commands().filter(c => /gtk-launch 'zen'|zen-bin/.test(c));
  const editorLaunches = () => commands().filter(c => /(?:^|\s|\()code\s+(?!--)/.test(c) && !/command -v code >\/dev\/null 2>&1$/.test(c) && !/pgrep/.test(c));

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'cero-multi-'));
    fs.mkdirSync(path.join(home, 'padhai_in_linux/Projects/gitBrain'), { recursive: true });
    fs.mkdirSync(path.join(home, 'work'), { recursive: true });
    AliasStore.getInstance().setFile(path.join(home, '.aliases.json'));
    clearCatalogCache();
    TerminalWorkspace.resetForTests();
    setChoiceHandlerForTests(async () => ({ index: 0 }));
    generate = vi.fn();
    loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn(),
    } as any);
    answers = [];
    execute = vi.fn(async (_tool: string, params: any) => {
      const cmd = String(params?.command ?? '');
      if (/grep -H -E/.test(cmd)) return { success: true, data: { stdout: cmd.includes('/usr/share/applications') ? DESKTOP : '', code: 0 } };
      for (const [re, answer] of answers) if (re.test(cmd)) return typeof answer === 'function' ? answer(cmd) : answer;
      return { success: true, data: { stdout: '', stderr: '', code: 0 } };
    });
    (loop as any).toolExecutor = { hasDriver: () => false, execute };
    loop.setOpenVerifyDelay(0);
    loop.setPathProbe(probeFor(home));
    approvals = [];
    loop.setAuthorizationHandler(async (plan: any) => { approvals.push(plan); return true; });
    events = [];
    loop.onEvent(e => events.push(e as any));
    AgentLoop.INTERACTIVE_POLL_MS = 5;
    AgentLoop.INTERACTIVE_SETTLE_MS = 20;
  });
  afterEach(() => {
    setChoiceHandlerForTests(null);
    AliasStore.getInstance().setFile(undefined);
    clearCatalogCache();
    TerminalWorkspace.resetForTests();
    AgentLoop.INTERACTIVE_POLL_MS = 250;
    AgentLoop.INTERACTIVE_SETTLE_MS = 1000;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const ctx = () => ({ os: 'linux', cwd: path.join(home, 'work') });
  /** The terminal marks the whole prompt finished on "done": only the last event may be one */
  const finishedOnce = () => events.filter(e => e.type === 'done' || e.type === 'error').length === 1
    && ['done', 'error'].includes(events[events.length - 1].type);

  it('standalone "Open zen browser" still finds Zen among the installed apps and launches it', async () => {
    const r = await loop.run('Open zen browser', ctx());
    expect(r.success).toBe(true);
    expect(zenLaunches()).toHaveLength(1);
    expect(generate).not.toHaveBeenCalled();
  });

  it('gitBrains folder in VS Code and Zen Browser: both are found, opened and reported', async () => {
    const r = await loop.run('Please open a folder named gitBrains in VS Code. This folder is inside /padhai_in_linux/Projects/ and also open zen browser', ctx());
    expect(r.success).toBe(true);
    const editor = editorLaunches();
    expect(editor).toHaveLength(1);
    expect(editor[0]).toContain(path.join(home, 'padhai_in_linux/Projects/gitBrain'));
    // The folder is opened by itself: the zen clause is not part of its path any more
    expect(editor[0]).not.toMatch(/zen|also/);
    expect(zenLaunches()).toHaveLength(1);
    expect(generate).not.toHaveBeenCalled();
    expect(r.summary).toMatch(/Done: 2 steps/);
    expect(events.map(e => e.message).join('\n')).toMatch(/Opened ~\/padhai_in_linux\/Projects\/gitBrain in Visual Studio Code/);
    expect(events.map(e => e.message).join('\n')).toMatch(/Launched zen browser/);
    expect(finishedOnce()).toBe(true);
  });

  it('Next.js project, then VS Code on that project, then Zen: no question is left to a closed stdin', async () => {
    answers.push([/\[ -d 'cero-test' \]/, { success: true, data: { stdout: 'yes\n', code: 0 } }]);
    const r = await loop.run("Please create a NextJS project for me in the root folder named 'cero-test' and open it in vscode and also open zen browser", ctx());
    expect(r.success).toBe(true);
    const cmds = commands();
    const create = cmds.findIndex(c => c === 'npx --yes create-next-app@latest cero-test --yes');
    const code = cmds.findIndex(c => c === 'code cero-test');
    const zen = cmds.findIndex(c => /gtk-launch 'zen'/.test(c));
    expect(create).toBeGreaterThanOrEqual(0);
    expect(code).toBeGreaterThan(create);
    expect(zen).toBeGreaterThan(code);
    expect(generate).not.toHaveBeenCalled();
    expect(finishedOnce()).toBe(true);
  });

  it('a scaffolder that exits 0 without creating the project stops the chain instead of opening nothing', async () => {
    answers.push([/\[ -d 'cero-test' \]/, { success: true, data: { stdout: 'no\n', code: 0 } }]);
    const r = await loop.run("create a NextJS project named 'cero-test' and open it in vscode", ctx());
    expect(r.success).toBe(false);
    expect(r.summary).toMatch(/without creating "cero-test"/);
    expect(commands()).not.toContain('code cero-test');
  });

  it('a step that stops at a menu is handed to a pane the user answers, and the chain continues after it', async () => {
    // The model worked out an interactive command (a template nobody named)
    generate.mockResolvedValue({ content: JSON.stringify({ action: 'execute', command: 'npm create vite@latest web', explanation: 'scaffold' }) });
    answers.push([/npm create vite@latest web/, { success: true, data: { stdout: NEXT_MENU.replace('recommended Next.js defaults', 'Select a framework'), stderr: '', code: 0 } }]);
    const spawned: any[] = [];
    const workspace = TerminalWorkspace.getInstance();
    workspace.setSpawner(req => {
      spawned.push(req);
      // The pane's shell takes the command, runs it while the user answers, and returns to its prompt
      setTimeout(() => {
        workspace.takePendingCommand('pane-x');
        workspace.update('pane-x', { busy: true });
        setTimeout(() => workspace.update('pane-x', { busy: false }), 30);
      }, 10);
      return 'pane-x';
    });

    const r = await loop.run('scaffold a vite app called web and then open zen browser', ctx());
    expect(spawned).toHaveLength(1);
    expect(spawned[0].command).toContain('npm create vite@latest web');
    expect(spawned[0].focus).toBe(true);
    expect(events.some(e => /is asking questions\. Answer them in the/.test(e.message || ''))).toBe(true);
    expect(r.success).toBe(true);
    // Zen ran only after the pane had finished
    expect(zenLaunches()).toHaveLength(1);
    expect(finishedOnce()).toBe(true);
  });

  it('with no terminal to answer in, a menu step is a clear stop, not a silent success', async () => {
    generate.mockResolvedValue({ content: JSON.stringify({ action: 'execute', command: 'npm create vite@latest web', explanation: 'scaffold' }) });
    answers.push([/npm create vite@latest web/, { success: true, data: { stdout: NEXT_MENU, stderr: '', code: 0 } }]);
    const r = await loop.run('scaffold a vite app called web and then open zen browser', ctx());
    expect(r.success).toBe(false);
    expect(r.summary).toMatch(/asks questions that need your answers/);
    expect(zenLaunches()).toHaveLength(0);
  });
});
