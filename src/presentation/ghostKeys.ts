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

/** One printable character or Backspace: an edit at the cursor, as opposed to paste, movement or control keys. */
export function isSingleEditKey(data: string): boolean {
  return data === '\x7f' || data === '\b' || (Array.from(data).length === 1 && /^[^\x00-\x1f\x7f]$/.test(data));
}

/**
 * Decide what to do when a key is pressed and the ghost text system is active.
 *
 * - Tab at the end of the line with a ghost: accept
 * - Tab mid-line: pass (let the shell do tab completion)
 * - Right at the end with a ghost and acceptRight on: accept
 * - Right mid-line: clear the ghost and pass to the shell
 * - Left, Home, End, Up, Down, word-move: clear the ghost and pass
 * - A single printable character or Backspace: pass (the ghost recompute happens separately)
 * - Everything else (paste, control keys, escape sequences): clear the ghost and pass
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

  // One printable character or Backspace edits the line the suggestion was built for;
  // the recompute that follows replaces it, and accepting is checked against the live line.
  if (isSingleEditKey(data)) return 'pass';

  // Anything else (paste, control keys, escape sequences, Enter) changes the line in a way the
  // suggestion knows nothing about: it must not survive to be accepted later.
  if (ctx.hasGhost) return 'clear-ghost-and-pass';
  return 'pass';
}
