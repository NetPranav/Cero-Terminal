import { describe, it, expect } from 'vitest';
import { parseTerminalAction, parseTarget, resolveTarget, readyForInput, describePane } from './TerminalActions';
import type { PaneInfo } from './TerminalWorkspace';

const pane = (p: Partial<PaneInfo> & { paneId: string }): PaneInfo => ({ busy: false, spawnedByAgent: false, outputTail: [], updatedAt: 0, ...p });

describe('parseTerminalAction', () => {
  it.each([
    ["what's running in my terminals", 'status'],
    ['what is running in the other tabs?', 'status'],
    ['what are my terminals doing', 'status'],
    ['list my terminals', 'status'],
  ])('%s -> %s', (goal, kind) => expect(parseTerminalAction(goal)?.kind).toBe(kind));

  it('opens tabs and splits with folders and commands', () => {
    expect(parseTerminalAction('open a new tab in ~/projects/api and run npm run dev')).toEqual({ kind: 'open', placement: 'tab', cwd: '~/projects/api', command: 'npm run dev' });
    expect(parseTerminalAction('open a new terminal')).toEqual({ kind: 'open', placement: 'tab', cwd: undefined, command: undefined });
    expect(parseTerminalAction('split the screen horizontally and run htop')).toMatchObject({ kind: 'open', placement: 'split', direction: 'horizontal', command: 'htop' });
    expect(parseTerminalAction('split vertically')).toMatchObject({ kind: 'open', placement: 'split', direction: 'vertical' });
    expect(parseTerminalAction('open ~/Downloads in a new tab')).toMatchObject({ kind: 'open', placement: 'tab', cwd: '~/Downloads' });
  });

  it('sends commands to a named terminal', () => {
    expect(parseTerminalAction('run npm test in tab 2')).toMatchObject({ kind: 'send', target: { kind: 'tab', index: 2 }, command: 'npm test' });
    expect(parseTerminalAction('run `git pull` in the other terminal')).toMatchObject({ kind: 'send', target: { kind: 'other' }, command: 'git pull' });
    expect(parseTerminalAction('in terminal 3, run ls -la')).toMatchObject({ kind: 'send', target: { kind: 'number', number: 3 }, command: 'ls -la' });
    expect(parseTerminalAction('run the tests in the server tab')).toMatchObject({ kind: 'send', target: { kind: 'name', name: 'server' }, command: 'the tests' });
  });

  it('stops and reads other terminals', () => {
    expect(parseTerminalAction('stop the server')).toMatchObject({ kind: 'stop', target: { kind: 'name', name: 'server' } });
    expect(parseTerminalAction("stop what's running in tab 2")).toMatchObject({ kind: 'stop', target: { kind: 'tab', index: 2 } });
    expect(parseTerminalAction('what is the other terminal printing')).toMatchObject({ kind: 'read', target: { kind: 'other' } });
    expect(parseTerminalAction('show me the output of tab 3')).toMatchObject({ kind: 'read', target: { kind: 'tab', index: 3 } });
  });

  it('opens tabs "here" and understands "run X in a new tab"', () => {
    expect(parseTerminalAction('open a new tab here and run python3 -m http.server 8765')).toEqual({ kind: 'open', placement: 'tab', cwd: undefined, command: 'python3 -m http.server 8765' });
    expect(parseTerminalAction('open a new split in this folder and then run npm test')).toMatchObject({ placement: 'split', command: 'npm test' });
    expect(parseTerminalAction('run npm run dev in a new tab')).toMatchObject({ kind: 'open', placement: 'tab', command: 'npm run dev' });
    expect(parseTerminalAction('start the server in a new split in ../api')).toMatchObject({ placement: 'split', cwd: '../api', command: 'the server' });
    expect(parseTerminalAction('in a new tab, run htop')).toMatchObject({ placement: 'tab', command: 'htop' });
  });

  it('stops the terminal serving a port', () => {
    expect(parseTerminalAction('stop the server on port 8766')).toEqual({ kind: 'stop', target: { kind: 'name', name: '8766' }, phrase: 'the terminal using port 8766' });
    expect(parseTerminalAction("stop whatever's running on port 3000")).toMatchObject({ kind: 'stop', target: { name: '3000' } });
    const panes = [pane({ paneId: 'me', number: 1 }), pane({ paneId: 's', number: 2, busy: true, runningCommand: 'python3 -m http.server 8766' })];
    expect(resolveTarget({ kind: 'name', name: '8766' }, panes, 'me')).toMatchObject({ kind: 'one', pane: { paneId: 's' } });
  });

  it('leaves ordinary requests alone', () => {
    for (const goal of ['what is using port 3000', 'run the tests', 'open safari', 'stop docker', 'kill node', 'list the files', 'why is the build failing', 'show disk usage']) {
      expect(parseTerminalAction(goal), goal).toBeNull();
    }
  });
});

describe('resolveTarget', () => {
  const panes = [
    pane({ paneId: 'a', number: 1, tabIndex: 1, tabId: 't1', cwd: '/home/u/app' }),
    pane({ paneId: 'b', number: 2, tabIndex: 1, tabId: 't1', busy: true, runningCommand: 'python3 -m http.server 8000', title: 'python3' }),
    pane({ paneId: 'c', number: 3, tabIndex: 2, tabId: 't2', busy: true, runningCommand: 'tail -f app.log', title: 'tail app.log' }),
  ];

  it('resolves numbers, tabs, names and running commands', () => {
    expect(resolveTarget(parseTarget('terminal 3')!, panes, 'a')).toMatchObject({ kind: 'one', pane: { paneId: 'c' } });
    expect(resolveTarget(parseTarget('tab 2')!, panes, 'a')).toMatchObject({ kind: 'one', pane: { paneId: 'c' } });
    expect(resolveTarget(parseTarget('the server')!, panes, 'a')).toMatchObject({ kind: 'one', pane: { paneId: 'b' } });
    expect(resolveTarget(parseTarget('the log tab')!, panes, 'a')).toMatchObject({ kind: 'one', pane: { paneId: 'c' } });
  });

  it('asks instead of guessing', () => {
    expect(resolveTarget(parseTarget('the other terminal')!, panes, 'a').kind).toBe('ambiguous');
    expect(resolveTarget(parseTarget('the other pane')!, panes, 'a')).toMatchObject({ kind: 'one', pane: { paneId: 'b' } });
    expect(resolveTarget(parseTarget('the database')!, panes, 'a').kind).toBe('none');
  });

  it('matches folder names in Windows paths and accepts a PowerShell prompt', () => {
    const win = [
      pane({ paneId: 'me', number: 1, tabIndex: 1, cwd: 'C:\\Users\\u\\app' }),
      pane({ paneId: 'api', number: 2, tabIndex: 2, cwd: 'C:\\Users\\u\\api', outputTail: ['PS C:\\Users\\u\\api> '] }),
    ];
    const r = resolveTarget(parseTarget('the api tab')!, win, 'me');
    expect(r).toMatchObject({ kind: 'one', pane: { paneId: 'api' } });
    expect(describePane(win[1])).toBe('terminal 2 (tab 2, api)');
    expect(readyForInput(win[1]).ok).toBe(true);
  });

  it('only types into a terminal that is idle at a prompt', () => {
    expect(readyForInput(pane({ paneId: 'x', outputTail: ['user@mac app % '] })).ok).toBe(true);
    expect(readyForInput(pane({ paneId: 'x', busy: true, runningCommand: 'npm run dev' })).ok).toBe(false);
    expect(readyForInput(pane({ paneId: 'x', alternateScreen: true })).ok).toBe(false);
    expect(readyForInput(pane({ paneId: 'x', outputTail: ['Password:'] })).ok).toBe(false);
  });
});
