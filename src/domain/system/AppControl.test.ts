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

const MAC_PS = [
  '/sbin/launchd',
  '/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder',
  '/Applications/Claude.app/Contents/MacOS/Claude',
  '/Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper (Renderer)',
  '/Applications/Antigravity IDE.app/Contents/MacOS/Electron',
  '/System/Applications/Journal.app/Contents/PlugIns/JournalWidgets.appex/Contents/MacOS/JournalWidgets',
  '/Applications/Safari.app/Contents/MacOS/Safari',
  '/Users/me/.local/bin/claude',
  '/private/tmp/claude-501/x/Cero.app/Contents/MacOS/cero-terminal',
  'node',
].join('\n');

describe('running apps', () => {
  it('reads app bundles on macOS, not their helpers, widgets or system agents', () => {
    const running = parseRunning(MAC_PS, 'macos');
    expect(running.filter(r => r.app).map(r => r.name).sort()).toEqual(['Antigravity IDE', 'Cero', 'Claude', 'Safari']);
    expect(running.find(r => r.name === 'claude')).toEqual({ name: 'claude', app: false });
    expect(running.some(r => /Helper|Journal|Finder/.test(r.name))).toBe(false);
  });

  it('finds "claude" as the Claude app, ignoring case, and never the CLI when an app matches', () => {
    const running = parseRunning(MAC_PS, 'macos');
    expect(matchRunning('claude', running, true)).toEqual({ kind: 'one', item: { name: 'Claude', app: true } });
    expect(matchRunning('claude', running, false)).toEqual({ kind: 'one', item: { name: 'Claude', app: true } });
    expect(matchRunning('antigravity', running, true)).toMatchObject({ kind: 'one', item: { name: 'Antigravity IDE' } });
  });

  it('says what is close when nothing matches, and asks when several do', () => {
    const running = parseRunning(MAC_PS, 'macos');
    const none = matchRunning('safary', running, true);
    expect(none.kind).toBe('none');
    expect(none.kind === 'none' && none.closest.map(c => c.name)).toContain('Safari');
    const many = matchRunning('code', [{ name: 'Visual Studio Code', app: true }, { name: 'Code', app: true }], true);
    expect(many.kind).toBe('many');
  });

  it('reads Windows windows and processes, and Linux processes', () => {
    const win = parseRunning('A\tChrome\nP\tchrome\nA\tClaude\nP\tsvchost', 'windows');
    expect(matchRunning('claude', win, true)).toMatchObject({ kind: 'one', item: { name: 'Claude', app: true } });
    const linux = parseRunning('systemd\nfirefox\nclaude\n', 'linux');
    expect(matchRunning('Firefox', linux, false)).toMatchObject({ kind: 'one', item: { name: 'firefox' } });
    expect(listRunningCommand('linux')).toBe('ps -eo comm=');
  });
});

describe('quitCommand', () => {
  it('quits the exact app the normal way, and a forced quit touches only that bundle', () => {
    expect(quitCommand({ name: 'Claude', app: true }, 'macos', false)).toBe(`osascript -e 'quit app "Claude"'`);
    expect(quitCommand({ name: 'Antigravity IDE', app: true }, 'macos', true)).toBe(`pkill -9 -f -- '/Antigravity IDE\\.app/Contents/'`);
    expect(quitCommand({ name: 'firefox', app: false }, 'linux', false)).toBe(`pkill -x -- 'firefox'`);
    expect(quitCommand({ name: 'Claude', app: true }, 'windows', false)).toContain(`Get-Process -Name 'Claude'`);
    expect(quitCommand({ name: "O'Brien", app: false }, 'windows', true)).toBe(`Stop-Process -Name 'O''Brien' -Force -ErrorAction Stop`);
  });
});
