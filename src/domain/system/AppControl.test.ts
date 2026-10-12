import { describe, it, expect } from 'vitest';
import { parseQuitRequest, parseRunning, matchRunning, quitCommand, listRunningCommand } from './AppControl';

describe('parseQuitRequest', () => {
  it.each([
    ['terminate or stop the claude application', { name: 'claude', appOnly: true, force: false, ifRunning: false }],
    ['quit safari', { name: 'safari', appOnly: false }],
    ['close the Google Chrome app', { name: 'Google Chrome', appOnly: true }],
    ['force quit spotify', { name: 'spotify', force: true }],
    ['kill -9 node', { name: 'node', force: true }],
    ['if music is running then close it', { name: 'music', ifRunning: true }],
    ['if any app named Slack is running, quit it', { name: 'Slack', ifRunning: true, appOnly: true }],
    ['please close vs code', { name: 'vs code' }],
  ])('%s', (goal, expected) => {
    expect(parseQuitRequest(goal)).toMatchObject(expected);
  });

  it('leaves terminals, servers, ports and tabs to their own handlers', () => {
    for (const goal of ['stop the server', 'stop the dev server', 'close this tab', 'close tab 2', 'stop tab 2', 'kill port 3000',
      'kill the process on port 8080', 'kill 1234', 'close settings', 'stop it', 'quit cero', 'stop the build',
      'kill the process using port 5173', 'run npm test in tab 2', 'what is running', 'close safari and mail']) {
      expect(parseQuitRequest(goal), goal).toBeNull();
    }
  });

  it('answers a bare "stop <name>" only when it is an app (so "stop the recording" can fall through)', () => {
    expect(parseQuitRequest('stop spotify')!.explicit).toBe(false);
    expect(parseQuitRequest('stop the spotify app')!.explicit).toBe(true);
    expect(parseQuitRequest('quit spotify')!.explicit).toBe(true);
  });
});

// Shape of listRunningCommand(): "A<tab>name" for apps with a window, "P<tab>name" for other processes
const WIN_PS = [
  'P\tsvchost',
  'A\tClaude',
  'P\tclaude',
  'A\tAntigravity IDE',
  'A\tmsedge',
  'P\tmsedge',
  'P\tnode',
].join('\r\n');

describe('running apps', () => {
  it('reads apps with a window and other processes, keeping both when they share a name', () => {
    const running = parseRunning(WIN_PS, 'windows');
    expect(running.filter(r => r.app).map(r => r.name).sort()).toEqual(['Antigravity IDE', 'Claude', 'msedge']);
    expect(running.find(r => r.name === 'claude')).toEqual({ name: 'claude', app: false });
    expect(listRunningCommand('windows')).toContain('MainWindowHandle');
  });

  it('finds "claude" as the Claude app, ignoring case, and never the CLI when an app matches', () => {
    const running = parseRunning(WIN_PS, 'windows');
    expect(matchRunning('claude', running, true)).toEqual({ kind: 'one', item: { name: 'Claude', app: true } });
    expect(matchRunning('claude', running, false)).toEqual({ kind: 'one', item: { name: 'Claude', app: true } });
    expect(matchRunning('antigravity', running, true)).toMatchObject({ kind: 'one', item: { name: 'Antigravity IDE' } });
    expect(matchRunning('edge', running, true)).toMatchObject({ kind: 'one', item: { name: 'msedge', app: true } });
  });

  it('says what is close when nothing matches, and asks when several do', () => {
    const running = parseRunning(WIN_PS, 'windows');
    const none = matchRunning('clade', running, true);
    expect(none.kind).toBe('none');
    expect(none.kind === 'none' && none.closest.map(c => c.name)).toContain('Claude');
    const many = matchRunning('code', [{ name: 'Visual Studio Code', app: true }, { name: 'Code', app: true }], true);
    expect(many.kind).toBe('many');
  });
});

describe('quitCommand', () => {
  it('asks an app to close its window, and force-stops only by exact name', () => {
    expect(quitCommand({ name: 'Claude', app: true }, 'windows', false)).toBe(`Get-Process -Name 'Claude' -ErrorAction Stop | ForEach-Object { [void]$_.CloseMainWindow() }`);
    expect(quitCommand({ name: 'Claude', app: true }, 'windows', true)).toBe(`Stop-Process -Name 'Claude' -Force -ErrorAction Stop`);
    expect(quitCommand({ name: "O'Brien", app: false }, 'windows', true)).toBe(`Stop-Process -Name 'O''Brien' -Force -ErrorAction Stop`);
  });
});
