/**
 * approvalPresentation.ts — how an approval request from a running task is shown.
 *
 * A full-screen dialog takes keyboard focus. If the user is in the middle of writing their next
 * prompt, that moves the rest of their typing into the dialog: Escape denies the other task,
 * Enter approves it, and the draft is cut in two. So while the user is composing, the request is
 * shown as a docked card that never takes focus, and only a click answers it.
 */

export type ApprovalPresentation = 'modal' | 'dock';

/** No keystroke for this long means the user is not in the middle of typing. */
export const COMPOSING_QUIET_MS = 2500;

export function decideApprovalPresentation(input: {
  /** Unsubmitted text is on the input line */
  hasDraft: boolean;
  /** Milliseconds since the last key the user pressed in this terminal (Infinity if none) */
  msSinceLastKeystroke: number;
  quietMs?: number;
}): ApprovalPresentation {
  if (input.hasDraft) return 'dock';
  if (input.msSinceLastKeystroke < (input.quietMs ?? COMPOSING_QUIET_MS)) return 'dock';
  return 'modal';
}

/**
 * A key pressed inside the full dialog. Anything that looks like the user typing is not an answer:
 * the request moves to the dock and the key goes back to the terminal.
 */
export type ModalKeyAction = 'deny' | 'approve' | 'arm-only' | 'dock-and-forward' | 'ignore';

export function decideModalKey(input: {
  key: string;
  ctrlOrMeta: boolean;
  needsExplicitClick: boolean;
  armed: boolean;
  repeat: boolean;
}): ModalKeyAction {
  const { key } = input;
  if (key === 'Escape') return 'deny';
  if (key === 'Enter') {
    if (input.needsExplicitClick) return 'arm-only';
    return input.armed && !input.repeat ? 'approve' : 'arm-only';
  }
  if (input.ctrlOrMeta) return 'ignore';
  if (key.length === 1 || key === 'Backspace') return 'dock-and-forward';
  return 'ignore';
}
