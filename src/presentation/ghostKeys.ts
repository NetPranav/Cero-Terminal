/**
 * ghostKeys.ts — pure decision function for ghost-text key handling.
 *
 * Task 1.4: Arrow keys must move the cursor without inserting ghost text.
 * Only Tab (always) and Right (when cursor is at the end of the line and a
 * suggestion is showing) may accept the suggestion.  Every other key clears
 * the ghost and passes through to the shell.
 */

export type KeyAction = 'accept-ghost' | 'clear-ghost-and-pass' | 'pass';

export interface GhostKeyContext {
  /** True when the cursor sits at the end of what the user typed (no characters after it). */
  cursorAtEnd: boolean;
  /** True when there is a visible ghost suggestion. */
  hasGhost: boolean;
  /** Whether the "accept suggestion with Right arrow" setting is on. */
  acceptRight: boolean;
}

// ANSI escape sequences for navigation keys
const RIGHT = '\x1b[C';
const RIGHT_ALT = '\x1bOC';
const LEFT = '\x1b[D';
const LEFT_ALT = '\x1bOD';
const UP = '\x1b[A';
const UP_ALT = '\x1bOA';
const DOWN = '\x1b[B';
const DOWN_ALT = '\x1bOB';
const HOME = '\x1b[H';
const END = '\x1b[F';
const WORD_LEFT = '\x1b[1;5D';
const WORD_RIGHT = '\x1b[1;5C';
// Alt + arrow variants (macOS word movement)
const ALT_LEFT = '\x1bb';
const ALT_RIGHT = '\x1bf';

/** All navigation-like escape sequences that should clear the ghost. */
const NAVIGATION_KEYS = new Set([
  LEFT, LEFT_ALT,
  UP, UP_ALT,
  DOWN, DOWN_ALT,
  HOME, END,
  WORD_LEFT, WORD_RIGHT,
  ALT_LEFT, ALT_RIGHT,
]);

/**
 * Decide what to do when a key is pressed and the ghost text system is active.
 *
 * - Tab at the end of the line with a ghost: accept
 * - Tab mid-line: pass (let the shell do tab completion)
 * - Right at the end with a ghost and acceptRight on: accept
 * - Right mid-line: clear the ghost and pass to the shell
 * - Left, Home, End, Up, Down, word-move: clear the ghost and pass
 * - Everything else: pass (the ghost recompute happens separately)
 */
export function decideGhostKey(data: string, ctx: GhostKeyContext): KeyAction {
  // Tab key
  if (data === '\t') {
    if (ctx.cursorAtEnd && ctx.hasGhost) return 'accept-ghost';
    return 'pass';
  }

  // Right arrow
  if (data === RIGHT || data === RIGHT_ALT) {
    if (ctx.cursorAtEnd && ctx.hasGhost && ctx.acceptRight) return 'accept-ghost';
    if (ctx.hasGhost) return 'clear-ghost-and-pass';
    return 'pass';
  }

  // All other navigation keys: clear ghost and pass
  if (NAVIGATION_KEYS.has(data)) {
    if (ctx.hasGhost) return 'clear-ghost-and-pass';
    return 'pass';
  }

  // Everything else: pass (no ghost decision here; ghost recompute is done in the timeout)
  return 'pass';
}
