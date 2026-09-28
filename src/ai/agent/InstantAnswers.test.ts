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

  it('only answers on Linux', () => {
    expect(findInstantAnswer('check battery', 'macos')).toBeNull();
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
