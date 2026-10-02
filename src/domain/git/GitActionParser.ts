/**
 * GitActionParser.ts — Pure deterministic parser for Git inspection queries
 *
 * Direct routing for status, branch, log, and diff inspection requests
 * before calling the model.
 */

export interface GitActionRequest {
  action: 'status' | 'branch' | 'log' | 'diff';
  command: string;
}

export function parseGitAction(goal: string): GitActionRequest | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const cleaned = text.replace(/^(?:please\s+|can\s+you\s+|could\s+you\s+|kindly\s+|just\s+|show\s+me\s+)+/i, '');

  // 1. Git Status
  if (/^(?:check\s+|show\s+|view\s+|get\s+|what\s+is\s+the\s+)?git\s+status$/i.test(cleaned)
    || /^(?:what\s+is\s+my\s+git\s+status|git\s+status\s+now)$/i.test(cleaned)) {
    return {
      action: 'status',
      command: 'git status'
    };
  }

  // 2. Git Branch
  if (/^(?:check\s+|show\s+|view\s+|list\s+|get\s+)?(?:current\s+)?git\s+branch(?:es)?$/i.test(cleaned)
    || /^(?:what\s+git\s+branch\s+am\s+i\s+on|which\s+git\s+branch\s+am\s+i\s+on|show\s+current\s+branch)$/i.test(cleaned)) {
    return {
      action: 'branch',
      command: 'git branch'
    };
  }

  // 3. Git Log
  if (/^(?:check\s+|show\s+|view\s+|get\s+)?(?:recent\s+)?git\s+log$/i.test(cleaned)
    || /^(?:show\s+(?:recent\s+|last\s+)?commits|git\s+commits|show\s+commit\s+history)$/i.test(cleaned)) {
    return {
      action: 'log',
      command: 'git log -n 5 --oneline'
    };
  }

  // 4. Git Diff
  if (/^(?:check\s+|show\s+|view\s+|get\s+)?git\s+diff$/i.test(cleaned)
    || /^(?:show\s+unstaged\s+changes|show\s+git\s+changes)$/i.test(cleaned)) {
    return {
      action: 'diff',
      command: 'git diff'
    };
  }

  return null;
}
