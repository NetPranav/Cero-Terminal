/**
 * cursorVisibility.ts — keep the prompt cursor on screen.
 *
 * xterm draws the cursor from a blink timer that is paused while the terminal is hidden or
 * unfocused and is only restarted by a later cursor move. After a tab switch, Settings closing,
 * a window focus change or a lost WebGL context, the timer could stay in its "off" half, so the
 * input kept working while the cursor stayed invisible until something moved it. Restarting the
 * blink and repainting the cursor row puts it back at once.
 */

interface CursorTerminal {
  rows: number;
  options: { cursorBlink?: boolean };
  refresh(start: number, end: number): void;
}

export function reviveCursor(term: CursorTerminal | null | undefined): void {
  if (!term) return;
  try {
    const blink = term.options.cursorBlink !== false;
    // Setting the option restarts xterm's blink state machine in the visible phase
    term.options.cursorBlink = !blink;
    term.options.cursorBlink = blink;
    term.refresh(0, Math.max(0, term.rows - 1));
  } catch {
    // Disposed terminal: nothing to repaint
  }
}
