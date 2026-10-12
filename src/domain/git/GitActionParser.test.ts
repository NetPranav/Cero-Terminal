import { describe, it, expect } from 'vitest';
import { parseGitAction } from './GitActionParser';

describe('GitActionParser', () => {
  const phrasings = [
    { input: 'git status', action: 'status' },
    { input: 'check git status', action: 'status' },
    { input: 'show git status', action: 'status' },
    { input: 'what is my git status', action: 'status' },
    { input: 'git branch', action: 'branch' },
    { input: 'what git branch am i on', action: 'branch' },
    { input: 'which git branch am i on', action: 'branch' },
    { input: 'list git branches', action: 'branch' },
    { input: 'git log', action: 'log' },
    { input: 'show recent commits', action: 'log' },
    { input: 'show commit history', action: 'log' },
    { input: 'git diff', action: 'diff' },
    { input: 'show unstaged changes', action: 'diff' }
  ];

  for (const { input, action } of phrasings) {
    it(`parses "${input}" -> action: "${action}"`, () => {
      const parsed = parseGitAction(input);
      expect(parsed).not.toBeNull();
      expect(parsed?.action).toBe(action);
      expect(parsed?.command).toContain('git');
    });
  }

  it('rejects mutating or ambiguous requests', () => {
    expect(parseGitAction('git push origin main')).toBeNull();
    expect(parseGitAction('git commit -m "fix"')).toBeNull();
    expect(parseGitAction('make a commit')).toBeNull();
    expect(parseGitAction('git checkout -b new-branch')).toBeNull();
  });
});
