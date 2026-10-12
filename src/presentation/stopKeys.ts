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
  /** Prompts of this pane still waiting in the queue */
  queueWaiting?: number;
}

export type StopKeyAction =
  | 'copy-selection'
  | 'pass-to-pty'
  | 'abort-ai-task'
  | 'force-kill-ai-task'
  | 'clear-queue'
  | 'ignore';

/** A second Ctrl+C this soon after stopping a task clears the queue it left paused */
export const CLEAR_QUEUE_WINDOW_MS = 1500;

export function decideStopKey(ctx: StopKeyContext): StopKeyAction {
  if (ctx.data !== '\x03') {
    return 'ignore';
  }

  // If text is selected in the terminal, Ctrl+C copies text
  if (ctx.hasSelection) {
    return 'copy-selection';
  }

  // When Cero is idle and only shell commands run in PTY, pass Ctrl+C to PTY
  if (!ctx.isAiBusy) {
    // Stopping a task pauses the queue behind it; pressing again right away empties it
    const sinceStop = (ctx.now ?? Date.now()) - (ctx.lastInterruptTime ?? 0);
    if (ctx.lastInterruptTime && sinceStop <= CLEAR_QUEUE_WINDOW_MS && (ctx.queueWaiting ?? 0) > 0) {
      return 'clear-queue';
    }
    return 'pass-to-pty';
  }

  // When Cero itself is running an agent loop, workflow, or LLM call:
  const now = ctx.now ?? Date.now();
  if (ctx.lastInterruptTime && (now - ctx.lastInterruptTime) <= 500) {
    return 'force-kill-ai-task';
  }

  return 'abort-ai-task';
}
