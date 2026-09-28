import { describe, it, expect } from 'vitest';
import { findInstantAnswer } from './InstantAnswers';
import { isReadOnlyCommandLine } from '../../domain/security/ReadOnlyCommandPolicy';
import { ShellAstParser } from '../../domain/security/ShellAstParser';

describe('InstantAnswers', () => {
  it.each([
    ['check battery', 'battery'],
    ['battery status?', 'battery'],
    ['how much battery is left', 'battery'],
    ['check disk space', 'disk'],
    ['how much disk space do i have', 'disk'],
    ['disk usage', 'disk'],
    ['memory usage', 'memory'],
    ['how much ram is free', 'memory'],
    ['which process is using the most cpu', 'top-process'],
    ['what app is eating the most memory?', 'top-process'],
    ['show listening ports', 'listening-ports'],
    ['what ports are open', 'listening-ports'],
    ['what is using port 3000', 'port-owner'],
    ["what's my ip", 'local-ip'],
    ['my ip address', 'local-ip'],
    ['uptime', 'uptime'],
    ['what is my kernel version', 'kernel'],
    ['which distro am i using', 'distro'],
  ])('answers "%s" instantly (%s)', (goal, id) => {
    const answer = findInstantAnswer(goal, 'linux');
    expect(answer?.id).toBe(id);
  });

  it.each([
    'check battery and then lock the screen',
    'why is my disk full',
    'free up disk space',
    'kill the process using the most cpu',
    'close port 3000',
    'what is my public ip',
    'change my ip address',
    'install htop',
    'what is using port 99999999',
  ])('leaves "%s" to the model', (goal) => {
    expect(findInstantAnswer(goal, 'linux')).toBeNull();
  });

  it.each([
    ["what's eating my RAM", 'top-process'],
    ['who is using all my cpu', 'top-process'],
    ['how full is my disk', 'disk'],
    ["what's listening", 'listening-ports'],
    ["what's listening on which ports", 'listening-ports'],
  ])('understands the everyday phrasing "%s" (%s)', (goal, id) => {
    expect(findInstantAnswer(goal, 'linux')?.id).toBe(id);
    expect(findInstantAnswer(goal, 'macos')?.id).toBe(id);
  });

  it('answers on macOS with macOS commands and not on Windows', () => {
    expect(findInstantAnswer('check battery', 'macos')).toMatchObject({ command: 'pmset -g batt', tool: 'system.battery' });
    expect(findInstantAnswer('what ports are open', 'macos')?.command).toContain('lsof');
    expect(findInstantAnswer('what is using port 3000', 'mac')?.command).toBe('lsof -nP -iTCP:3000 -sTCP:LISTEN');
    expect(findInstantAnswer('what os version am i on', 'macos')?.command).toContain('sw_vers');
    expect(findInstantAnswer('check battery', 'windows')).toBeNull();
  });

  it('every macOS instant command is valid, read-only shell', () => {
    const goals = ['check battery', 'disk usage', 'memory usage', "what's eating my ram", 'show listening ports',
      'what is using port 3000', "what's my ip", 'uptime', 'kernel version', 'which os am i using'];
    for (const goal of goals) {
      const answer = findInstantAnswer(goal, 'macos')!;
      expect(answer, goal).not.toBeNull();
      expect(ShellAstParser.validateSyntax(answer.command).valid, answer.command).toBe(true);
      const verdict = isReadOnlyCommandLine(answer.command);
      expect(verdict.readOnly, `${answer.command}: ${verdict.reason}`).toBe(true);
    }
  });

  it('takes macOS screenshots with screencapture', () => {
    expect(findInstantAnswer('take a screenshot', 'macos')?.command).toContain('screencapture -x');
    expect(findInstantAnswer('take a region screenshot', 'macos')?.command).toContain('screencapture -i');
  });

  it('every instant command is valid, read-only shell (runs without a consent prompt)', () => {
    const goals = ['check battery', 'disk usage', 'memory usage', 'which process is using the most cpu',
      'show listening ports', 'what is using port 3000', "what's my ip", 'uptime', 'kernel version', 'which distro am i using'];
    for (const goal of goals) {
      const answer = findInstantAnswer(goal, 'linux')!;
      expect(ShellAstParser.validateSyntax(answer.command).valid, answer.command).toBe(true);
      const verdict = isReadOnlyCommandLine(answer.command);
      expect(verdict.readOnly, `${answer.command}: ${verdict.reason}`).toBe(true);
    }
  });
});
