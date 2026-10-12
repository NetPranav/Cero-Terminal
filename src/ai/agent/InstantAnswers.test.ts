import { describe, it, expect } from 'vitest';
import { findInstantAnswer, findInstantAnswers, instantRuleFor } from './InstantAnswers';
import { isReadOnlyCommandLine } from '../../domain/security/ReadOnlyCommandPolicy';

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
    ["what's eating my RAM", 'top-process'],
    ['who is using all my cpu', 'top-process'],
    ['how full is my disk', 'disk'],
    ["what's listening", 'listening-ports'],
    ["what's listening on which ports", 'listening-ports'],
  ])('recognises "%s" (%s)', (goal, id) => {
    expect(instantRuleFor(goal)).toBe(id);
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
    expect(instantRuleFor(goal)).toBeNull();
    expect(findInstantAnswer(goal)).toBeNull();
  });

  it('has no Windows command yet for the system rules, so the model answers them (TODO 4.3)', () => {
    for (const goal of ['check battery', 'disk usage', 'memory usage', 'show listening ports', "what's my ip", 'uptime']) {
      expect(findInstantAnswer(goal), goal).toBeNull();
    }
  });

  it.each([
    'what changed in the last commit here',
    'what changed in the last commit',
    'show me the last commit',
    'what did the last commit change?',
    'which files changed in the latest commit in this repo',
  ])('answers "%s" with git show --stat', (goal) => {
    const answer = findInstantAnswer(goal);
    expect(answer?.id).toBe('last-commit');
    expect(isReadOnlyCommandLine(answer!.command).readOnly).toBe(true);
  });

  it('answers a multi-part question only when every part has an instant answer', () => {
    expect(findInstantAnswers('what changed in the last commit')?.map(a => a.id)).toEqual(['last-commit']);
    expect(findInstantAnswers('check battery and install htop')).toBeNull();
    expect(findInstantAnswers('check disk, memory and uptime')).toBeNull();
  });
});
