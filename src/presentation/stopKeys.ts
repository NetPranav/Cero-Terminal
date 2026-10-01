/**
 * Pure decision logic for interrupt/stop key combinations (Ctrl+C).
 * Distinguishes between copying text, passing interrupt to PTY, and stopping running AI tasks.
 */

export interface StopKeyContext {
  data: string;
  hasSelection: boolean;
  isAiBusy: boolean;
  lastInterruptTime?: number;
  now?: number;
}

export type StopKeyAction =
  | 'copy-selection'
  | 'pass-to-pty'
  | 'abort-ai-task'
  | 'force-kill-ai-task'
  | 'ignore';

export function decideStopKey(ctx: StopKeyContext): StopKeyAction {
  if (ctx.data !== '\x03') {
    return 'ignore';
  }

  // If text is selected in the terminal, Ctrl+C copies text
  if (ctx.hasSelection) {
    return 'copy-selection';
  }

  // When Sentinel is idle and only shell commands run in PTY, pass Ctrl+C to PTY
  if (!ctx.isAiBusy) {
    return 'pass-to-pty';
  }

  // When Sentinel itself is running an agent loop, workflow, or LLM call:
  const now = ctx.now ?? Date.now();
  if (ctx.lastInterruptTime && (now - ctx.lastInterruptTime) <= 500) {
    return 'force-kill-ai-task';
  }

  return 'abort-ai-task';
}
