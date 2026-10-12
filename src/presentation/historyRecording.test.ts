import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PtyStateTracker, stripControlSequences } from '../domain/terminal/PtyStateTracker';
import { InputLineTracker } from './InputLineTracker';
import { HistoryProvider } from '../domain/autocomplete/HistoryProvider';

/**
 * Bash on a systemd 257+ system (Arch): every command is wrapped in OSC 3008 context markers and
 * the prompt is preceded by the window title, all on the prompt's line. Same shape as captured
 * from a real `bash -l -i`; machine and boot ids replaced.
 */
const ID = 'machineid=0000;user=me;hostname=box;bootid=1111;pid=42';
const prompt = (cwd: string, shown: string) =>
  `\x1b]3008;start=${cwd.length}-shell;type=shell;${ID};cwd=${cwd}\x1b\\\x1b]0;me@box:${shown}\x07\x1b[?2004h[me@box ${shown.split('/').pop()}]$ `;
const afterCommand = (cmd: string, out: string, cwd: string, shown: string) =>
  `${cmd}\r\n\x1b[?2004l\r\x1b]3008;start=c1;type=command;${ID};cwd=${cwd}\x1b\\${out}\x1b]3008;end=c1;exit=success\x1b\\${prompt(cwd, shown)}`;

/** What TerminalView does with one line typed at the prompt and Enter (history part) */
function submit(text: string, pty: PtyStateTracker, line: InputLineTracker, history: HistoryProvider, cwd: string) {
  for (const ch of text) line.noteKeystroke(ch, { row: 0, col: 30 }, pty.isProcessRunning());
  const typedWhileRunning = line.startedWhileRunning();
  line.reset();
  const atShellPrompt = !typedWhileRunning && !pty.isProcessRunning() && !pty.isAlternateBuffer();
  if (text.trim() && atShellPrompt) history.addHistory(text.trim(), cwd);
  if (!text.startsWith('>')) pty.notifyCommandStarted(text);
}

describe('command history with a shell that prints long invisible prompt markers', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    };
  });
  afterEach(() => { delete (globalThis as any).localStorage; });

  it('the prompt is recognised again after a command (it used to stay "running" forever)', () => {
    const pty = new PtyStateTracker();
    pty.feedOutput(prompt('/home/me/padhai_in_linux/Projects/Cero', '~/padhai_in_linux/Projects/Cero'));
    expect(pty.isIdleAtPrompt()).toBe(true);
    pty.notifyCommandStarted('ls');
    pty.feedOutput(afterCommand('ls', 'a.txt  b.txt\r\n', '/home/me/padhai_in_linux/Projects/Cero', '~/padhai_in_linux/Projects/Cero'));
    expect(pty.isIdleAtPrompt()).toBe(true);
  });

  it('markers split across reads are still removed whole', () => {
    const pty = new PtyStateTracker();
    const full = afterCommand('ls', '', '/home/me/x', '~/x');
    pty.notifyCommandStarted('ls');
    const cut = full.indexOf('type=command') + 4;
    pty.feedOutput(full.slice(0, cut));
    expect(pty.isProcessRunning()).toBe(true);
    pty.feedOutput(full.slice(cut));
    expect(pty.isIdleAtPrompt()).toBe(true);
  });

  it('every command and prompt typed in a session is recorded, in order, and survives a restart', () => {
    const pty = new PtyStateTracker();
    const line = new InputLineTracker();
    const history = new HistoryProvider();
    const cwd = '/home/me/padhai_in_linux/Projects/Cero';
    const shown = '~/padhai_in_linux/Projects/Cero';
    pty.feedOutput(prompt(cwd, shown));

    submit('git status', pty, line, history, shown);
    pty.feedOutput(afterCommand('git status', 'On branch main\r\n', cwd, shown));
    submit('npm test', pty, line, history, shown);
    pty.feedOutput(afterCommand('npm test', 'Tests 12 passed\r\n', cwd, shown));
    // An AI request: the shell line is discarded with ^C and the shell prints a fresh prompt
    submit('> open zen browser', pty, line, history, shown);
    pty.feedOutput(`^C\r\n\x1b[?2004l\r${prompt(cwd, shown)}`);
    submit('ls -la', pty, line, history, shown);

    expect(history.getHistory().map(h => h.command)).toEqual(['git status', 'npm test', '> open zen browser', 'ls -la']);

    // Next launch: a new provider reads what was saved
    const reopened = new HistoryProvider();
    expect(reopened.getHistory().map(h => h.command)).toEqual(['git status', 'npm test', '> open zen browser', 'ls -la']);
  });

  it('input typed into a running program is still not kept (password prompts, REPLs)', () => {
    const pty = new PtyStateTracker();
    const line = new InputLineTracker();
    const history = new HistoryProvider({ persist: false });
    pty.feedOutput(prompt('/home/me', '~'));
    submit('sudo pacman -Syu', pty, line, history, '~');
    pty.feedOutput('sudo pacman -Syu\r\n\x1b[?2004l\r[sudo] password for me: ');
    submit('hunter2', pty, line, history, '~');
    expect(history.getHistory().map(h => h.command)).toEqual(['sudo pacman -Syu']);
  });
});

describe('stripControlSequences', () => {
  it('keeps only visible text', () => {
    expect(stripControlSequences('\x1b]0;title\x07\x1b[?2004h\x1b[1;32m[me@box ~]$\x1b[0m ')).toBe('[me@box ~]$ ');
    expect(stripControlSequences('a\x1b]3008;start=x;cwd=/h\x1b\\b')).toBe('ab');
    expect(stripControlSequences('a\x1b]3008;start=x;still-arriv')).toBe('a');
    expect(stripControlSequences('\x1b(Bplain')).toBe('plain');
  });
});
