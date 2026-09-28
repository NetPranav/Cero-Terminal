/**
 * InputLineTracker.ts — finds the text the user typed on the current input line.
 *
 * The old approach scraped the screen line and cut at the last `$`, `%` or `#` it could find.
 * That broke in two ways that both sent an AI request to the shell, where a leading `>` is a
 * redirection (`>what is $PATH` truncates a file named "what"):
 *  - a request containing `$`, `%` or `#` was cut in the middle, so it no longer started with `>`;
 *  - text typed while Sentinel was printing agent output had no prompt on its line.
 *
 * Instead we keep two independent records of the line:
 *  - a shadow of the keystrokes (exact when the user only typed, pasted plain text and used
 *    backspace; marked uncertain after arrows, Tab or other editing keys), and
 *  - the buffer position of the first keystroke (the cursor sits right after the prompt then),
 *    read on Enter when the shadow is uncertain.
 */

export interface InputBufferLine {
  isWrapped: boolean;
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
}

export interface InputBuffer {
  getLine(y: number): InputBufferLine | undefined;
}

export interface InputAnchor {
  /** Absolute buffer row (baseY + cursorY) */
  row: number;
  col: number;
}

/** Legacy prompt stripping, used only when no anchor is known (e.g. Enter on an untouched line). */
export function stripPrompt(lineText: string): string {
  // First prompt terminator followed by whitespace: user text after the prompt may itself
  // contain `$`, `%` or `#`, so the last occurrence is the wrong one.
  const match = lineText.match(/^[^\r\n]*?[$%#❯]\s+/);
  return match ? lineText.slice(match[0].length) : lineText;
}

export class InputLineTracker {
  private anchor: InputAnchor | null = null;
  /** Set when typing began while a command was still running (type-ahead), where the anchor
   *  precedes the prompt that is printed later. */
  private typedAhead = false;
  private shadow = '';
  private shadowExact = true;

  /** Call for every keystroke that is not Enter, before it is sent to the shell. */
  public noteKeystroke(data: string, cursor: InputAnchor, processRunning: boolean): void {
    // Ctrl+C and Ctrl+U discard the line
    if (data === '\x03' || data === '\x15') {
      this.reset();
      return;
    }
    if (!this.anchor) {
      this.anchor = { ...cursor };
      this.typedAhead = processRunning;
      this.shadow = '';
      this.shadowExact = true;
    }
    this.updateShadow(data);
  }

  private updateShadow(data: string): void {
    if (!this.shadowExact) return;
    if (data === '\x7f' || data === '\b') {
      this.shadow = Array.from(this.shadow).slice(0, -1).join('');
    } else if (data === '\x17') {
      this.shadow = this.shadow.replace(/\S*\s*$/, '');
    } else if (/^[^\x00-\x1f\x7f]+$/.test(data)) {
      this.shadow += data;
    } else {
      // Cursor movement, Tab completion, history recall, bracketed paste: only the screen knows
      this.shadowExact = false;
    }
  }

  /** The typed line when it is known exactly from keystrokes alone, otherwise null. */
  public typedText(): string | null {
    return this.anchor && this.shadowExact ? this.shadow : null;
  }

  public hasAnchor(): boolean {
    return this.anchor !== null && !this.typedAhead;
  }

  public reset(): void {
    this.anchor = null;
    this.typedAhead = false;
    this.shadow = '';
    this.shadowExact = true;
  }

  /**
   * Text typed on the current line, or null when it cannot be located reliably
   * (no anchor, type-ahead, or the anchor scrolled out of the buffer).
   */
  public read(buffer: InputBuffer, cursorRow: number): string | null {
    if (!this.anchor || this.typedAhead) return null;
    const { row, col } = this.anchor;
    if (cursorRow < row) return null;
    const first = buffer.getLine(row);
    if (!first) return null;

    // Rows from the anchor to the cursor, plus any rows the line wrapped onto after the cursor
    let last = cursorRow;
    while (buffer.getLine(last + 1)?.isWrapped) last++;

    let text = '';
    for (let y = row; y <= last; y++) {
      const line = buffer.getLine(y);
      if (!line) break;
      // Keep trailing spaces on rows that continue on the next row (a space may sit at the wrap point)
      const continues = y < last;
      text += y === row ? line.translateToString(!continues, col) : line.translateToString(!continues);
    }
    return text.replace(/\s+$/, '');
  }
}

/**
 * Directory a `cd` at the start of a command line changes to, for path tracking.
 * Stops at the first shell operator (`cd src && make` -> "src"). Returns null when the
 * target cannot be known without the shell (`cd -`, variables, substitutions, globs).
 */
export function parseCdTarget(command: string): string | null {
  const m = command.trim().match(/^cd(?:\s+(?:"([^"]*)"|'([^']*)'|((?:\\.|[^\s;&|<>])+)))?\s*(?:$|&&|\|\||;|\|)/);
  if (!m) return null;
  const target = m[1] ?? m[2] ?? (m[3] !== undefined ? m[3].replace(/\\(.)/g, '$1') : undefined);
  if (target === undefined || target === '') return '~';
  if (target === '-' || /[$`*?]/.test(target)) return null;
  return target;
}
