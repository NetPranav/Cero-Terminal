import { describe, it, expect } from 'vitest';
import { parsePortRequest, listListenersCommand, parseListeners, stopCommand, describeListeners } from './PortControl';

describe('parsePortRequest', () => {
  it.each([
    ['close port 8765', { port: 8765, force: false }],
    ['free up port 3000', { port: 3000, force: false }],
    ['kill the process on port 5173', { port: 5173, force: false }],
    ['please release port 8080 for me', { port: 8080, force: false }],
    ['force close port 9000', { port: 9000, force: true }],
    ['kill -9 port 4000', { port: 4000, force: true }],
    ['terminate whatever is using port 3000', { port: 3000, force: false }],
  ])('%s', (goal, expected) => {
    expect(parsePortRequest(goal)).toEqual(expected);
  });

  it('leaves everything else to the routes that own it', () => {
    for (const goal of ['what is using port 8765', 'stop the server on port 3000', 'kill the server on port 3000', 'close tab 2', 'close port 0',
      'close port 70000', 'kill 1234', 'quit chrome', 'open port 3000', 'free up disk space', 'kill port']) {
      expect(parsePortRequest(goal), goal).toBeNull();
    }
  });
});

describe('listeners', () => {
  it('reads Get-NetTCPConnection output by exact port, one entry per process', () => {
    const out = '63988\tpython\r\n63988\tpython\r\n1200\tnode\r\n';
    expect(parseListeners(out, 'windows')).toEqual([{ pid: 63988, name: 'python' }, { pid: 1200, name: 'node' }]);
    expect(describeListeners(parseListeners(out, 'windows'))).toBe('python (PID 63988), node (PID 1200)');
    expect(parseListeners('', 'windows')).toEqual([]);
    expect(parseListeners('4321\t\r\n', 'windows')).toEqual([{ pid: 4321, name: 'process' }]);
  });

  it('uses the exact port in the lookup', () => {
    expect(listListenersCommand(8765, 'windows')).toContain('-LocalPort 8765 -State Listen');
  });

  it('asks the program to exit; force only when asked', () => {
    const l = [{ pid: 10, name: 'a' }, { pid: 20, name: 'b' }];
    expect(stopCommand(l, 'windows', false)).toBe('Stop-Process -Id 10,20 -ErrorAction Stop');
    expect(stopCommand(l, 'windows', true)).toBe('Stop-Process -Id 10,20 -Force -ErrorAction Stop');
  });
});
