import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TerminalWorkspace, isLongRunningCommand, paneTitleFor } from './TerminalWorkspace';

describe('isLongRunningCommand', () => {
  it.each([
    'ros2 run demo_nodes_cpp talker',
    'ros2 launch nav2_bringup navigation_launch.py',
    'ros2 topic echo /turtle1/pose',
    'ros2 bag record -a',
    'rviz2',
    'tail -f logs/app.log',
    'tail -n 50 -f app.log',
    'journalctl -u nginx -f',
    'npm run dev',
    'pnpm dev',
    'python3 -m http.server 8000',
    'uvicorn main:app --reload',
    'docker compose up',
    'kubectl logs web-1 -f',
    'ros2 run turtlesim turtle_teleop_key',
    'cd ~/ws && ros2 launch my_pkg bringup.launch.py',
  ])('%s gets its own pane', (cmd) => expect(isLongRunningCommand(cmd)).toBe(true));

  it.each([
    'ls -la',
    'git status',
    'ros2 node list',
    'ros2 topic list',
    'ros2 topic echo /chatter --once',
    'tail -n 20 app.log',
    'npm install',
    'npm test',
    'docker compose up -d',
    'python3 -m http.server 8000 &',
    'nohup npm run dev > dev.log 2>&1 &',
    'colcon build',
  ])('%s runs inline', (cmd) => expect(isLongRunningCommand(cmd)).toBe(false));
});

describe('paneTitleFor', () => {
  it('names panes after what they run', () => {
    expect(paneTitleFor('ros2 run turtlesim turtlesim_node')).toBe('turtlesim_node');
    expect(paneTitleFor('ros2 launch my_pkg bringup.launch.py')).toBe('bringup');
    expect(paneTitleFor('ros2 topic echo /turtle1/pose')).toBe('echo /turtle1/pose');
    expect(paneTitleFor('tail -f /var/log/app.log')).toBe('tail app.log');
    expect(paneTitleFor('npm run dev')).toBe('dev server');
  });
});

describe('TerminalWorkspace', () => {
  beforeEach(() => TerminalWorkspace.resetForTests());

  it('keeps a bounded, ANSI-free output tail and joins lines split across chunks', () => {
    const ws = TerminalWorkspace.getInstance();
    ws.register('p1', { sessionId: 's1' });
    ws.appendOutput('p1', '\x1b[32mhello\x1b[0m wor');
    ws.appendOutput('p1', 'ld\r\nsecond line\r\n');
    expect(ws.get('p1')!.outputTail).toEqual(['hello world', 'second line']);
    for (let i = 0; i < 30; i++) ws.appendOutput('p1', `line ${i}\n`);
    expect(ws.get('p1')!.outputTail).toHaveLength(20);
  });

  it('opens a new pane through the app and hands the command over once', () => {
    const ws = TerminalWorkspace.getInstance();
    const spawner = vi.fn().mockReturnValue('new-pane');
    ws.setSpawner(spawner);
    const result = ws.spawn({ command: 'ros2 run demo_nodes_cpp talker', cwd: '/ws', title: 'talker', requesterPaneId: 'main' });
    expect(result).toEqual({ paneId: 'new-pane', reused: false });
    expect(spawner).toHaveBeenCalledWith(expect.objectContaining({ requesterPaneId: 'main' }));
    expect(ws.get('new-pane')).toMatchObject({ spawnedByAgent: true, busy: true, title: 'talker' });
    expect(ws.takePendingCommand('new-pane')?.command).toBe('ros2 run demo_nodes_cpp talker');
    expect(ws.takePendingCommand('new-pane')).toBeUndefined();
  });

  it('reuses an idle agent pane before opening another', () => {
    const ws = TerminalWorkspace.getInstance();
    const spawner = vi.fn();
    const writer = vi.fn();
    ws.setSpawner(spawner);
    ws.setWriter(writer);
    ws.register('agent-pane', { sessionId: 's2', spawnedByAgent: true, busy: false, cwd: '/a' });
    const result = ws.spawn({ command: 'tail -f x.log', cwd: '/b', requesterPaneId: 'main' });
    expect(result).toEqual({ paneId: 'agent-pane', reused: true });
    expect(writer).toHaveBeenCalledWith('s2', "cd '/b' && tail -f x.log\r");
    expect(spawner).not.toHaveBeenCalled();
    expect(ws.get('agent-pane')!.busy).toBe(true);
  });

  it('never reuses the user\'s own panes or the requester', () => {
    const ws = TerminalWorkspace.getInstance();
    const spawner = vi.fn().mockReturnValue('fresh');
    ws.setSpawner(spawner);
    ws.setWriter(vi.fn());
    ws.register('user-pane', { sessionId: 's1', spawnedByAgent: false, busy: false });
    expect(ws.spawn({ command: 'npm run dev', requesterPaneId: 'user-pane' }).paneId).toBe('fresh');
  });

  it('fails clearly when there is no layout (CLI, tests)', () => {
    expect(() => TerminalWorkspace.getInstance().spawn({ command: 'npm run dev' })).toThrow(/No terminal layout/);
  });

  it('describes the other terminals for the prompt, bounded', () => {
    const ws = TerminalWorkspace.getInstance();
    ws.register('main', { cwd: '/home/u' });
    ws.register('talker', { title: 'talker', cwd: '/ws', busy: true, runningCommand: 'ros2 run demo_nodes_cpp talker' });
    ws.appendOutput('talker', '[INFO] Publishing: "Hello World: 1"\n');
    const text = ws.describeForPrompt('main');
    expect(text).toContain('Terminal 2 "talker", in /ws, running: ros2 run demo_nodes_cpp talker');
    expect(text).toContain('| [INFO] Publishing: "Hello World: 1"');
    expect(text).not.toContain('/home/u');
    expect(ws.describeForPrompt('main').split('\n').length).toBeLessThanOrEqual(6 * 6);
  });
});

describe('TerminalWorkspace change-only context', () => {
  beforeEach(() => TerminalWorkspace.resetForTests());

  it('numbers panes and shows only terminals with new output since the last look', () => {
    const ws = TerminalWorkspace.getInstance();
    ws.register('me');
    ws.register('srv', { title: 'server', busy: true, runningCommand: 'npm run dev' });
    expect(ws.get('me')!.number).toBe(1);
    expect(ws.get('srv')!.number).toBe(2);
    ws.appendOutput('srv', 'ready on :5173\n');

    const first = ws.describeForPrompt('me', undefined);
    expect(first).toContain('| ready on :5173');
    const seen = ws.snapshotSeq();
    const unchanged = ws.describeForPrompt('me', seen);
    expect(unchanged).toContain('(no new output since the last request)');
    expect(unchanged).toContain('| ready on :5173');

    ws.appendOutput('srv', 'GET / 200\n');
    const next = ws.describeForPrompt('me', seen);
    expect(next).toContain('| GET / 200');
    expect(next).not.toContain('ready on :5173');
    expect(ws.outputSince('srv', seen.get('srv')!)).toEqual(['GET / 200']);
  });

  it('keeps the latest error and last line of a terminal with nothing new', () => {
    const ws = TerminalWorkspace.getInstance();
    ws.register('me');
    ws.register('srv', { busy: true, runningCommand: 'npm run dev' });
    ws.appendOutput('srv', 'starting\nError: listen EADDRINUSE :5173\nretrying in 5s\nstill retrying\n');
    const text = ws.describeForPrompt('me', ws.snapshotSeq());
    expect(text).toContain('| Error: listen EADDRINUSE :5173');
    expect(text).toContain('| still retrying');
    expect(text).not.toContain('starting');
    expect(text).not.toContain('retrying in 5s');
  });

  it('uses tab positions from the app layout', () => {
    const ws = TerminalWorkspace.getInstance();
    ws.register('a');
    ws.setLayout([{ tabId: 't1', index: 1, title: 'app', paneIds: ['a'] }, { tabId: 't2', index: 2, title: 'api', paneIds: ['b'] }]);
    ws.register('b');
    expect(ws.get('a')).toMatchObject({ tabIndex: 1, tabTitle: 'app' });
    expect(ws.get('b')).toMatchObject({ tabIndex: 2, tabTitle: 'api' });
  });
});
