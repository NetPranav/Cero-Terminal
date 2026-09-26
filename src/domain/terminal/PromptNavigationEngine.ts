/**
 * PromptNavigationEngine.ts — Terminal Line & Cursor Navigation vs History Guard
 * 
 * Issue 9 Specification:
 * 1. Default History Browsing:
 *    If the cursor is behind the last character (trailing space at end of line)
 *    or on the first character (first symbol, number, or alphabet), Up and Down
 *    arrow perform Default History Browsing through previous commands and prompts.
 * 2. In-Command Horizontal Navigation:
 *    Left and Right arrow navigate within the written command.
 * 3. In-Buffer Line Navigation in Long Prompts/Commands:
 *    Once the user has used the Left Arrow to move on or ahead of the last character
 *    (inside the text, cursorX <= lastCharCol) or used the Right Arrow to move behind
 *    the first character (inside the text, cursorX > firstCharCol), Up and Down arrows
 *    move between lines in the long prompt or command (totalRows > 1).
 * 
 * By last and first character: the last or first symbol, number or alphabet present in the command or prompt.
 */

export interface BufferLineInfo {
  text: string;
  isWrapped: boolean;
}

export interface NavigationEvaluationInput {
  direction: 'up' | 'down';
  cursorX: number;
  cursorY: number;
  cols: number;
  lines: BufferLineInfo[];
  baseY?: number;
  isAlternateBuffer?: boolean;
}

export interface NavigationDecision {
  handled: boolean;
  action: 'move-up-line' | 'move-down-line' | 'move-to-start' | 'move-to-end' | 'pass-to-history';
  payload?: string;
}

export class PromptNavigationEngine {
  /**
   * Robustly detect the length of any shell prompt prefix (e.g. "user@host:~$ ",
   * "[user@host path]$ ", "➜  sentinal git:(main) ✗ ", "❯ ", "> ", "bash-5.3$ ").
   * Uses non-greedy matching to avoid capturing command content containing $, #, %, or >.
   */
  public static detectPromptPrefixLength(lineText: string): number {
    if (!lineText) return 0;

    // 1. Sentinel AI prompt starting with '>' (e.g. "> Create workspace...")
    const trimmed = lineText.trimStart();
    const leadingSpaces = lineText.length - trimmed.length;
    if (trimmed.startsWith('>')) {
      const afterPrompt = trimmed.substring(1);
      const postSpaces = afterPrompt.length - afterPrompt.trimStart().length;
      return leadingSpaces + 1 + postSpaces;
    }

    // 2. Standard shell prompts with username@host or bracketed formats:
    //    e.g. "[overxpowered@archlinux sentinal]$ ", "user@host:~$ ", "bash-5.3$ "
    const standardPromptMatch = lineText.match(/^(?:\[?[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+[^$%#❯>➜→\n]*?|bash-[0-9.]+|zsh|fish|root|[a-zA-Z0-9_.-]+)?.*?[@:][^$%#❯>➜→\n]*?([$%#❯>➜→:]|\u2713|\u2717)\s+/);
    if (standardPromptMatch) {
      return standardPromptMatch[0].length;
    }

    // 3. Prompt termination with prompt symbol followed by space:
    const simpleMatch = lineText.match(/^.*?[^a-zA-Z0-9_.-]([$%#❯➜→]|\u2713|\u2717)\s+/);
    if (simpleMatch) {
      return simpleMatch[0].length;
    }

    // 4. Standalone prompt symbol at start of line, e.g. "$ ", "# ", "% ", "❯ ", "> "
    const standaloneMatch = lineText.match(/^[$%#❯>➜→]\s+/);
    if (standaloneMatch) {
      return standaloneMatch[0].length;
    }

    // 5. Fallback non-greedy match ending in prompt symbol followed by whitespace
    const fallbackMatch = lineText.match(/^.*?(?:[$%#❯])\s+/);
    if (fallbackMatch) {
      return fallbackMatch[0].length;
    }

    return 0;
  }

  /**
   * Determine boundaries of the current command/prompt in the terminal buffer.
   */
  public static getPromptRowRange(
    lines: BufferLineInfo[],
    cursorY: number
  ): {
    startRow: number;
    endRow: number;
    totalRows: number;
    currentRowOffset: number;
  } {
    const safeCursorY = Math.max(0, Math.min(cursorY, lines.length - 1));

    // Walk backwards while current row is a wrapped continuation of previous row
    let startRow = safeCursorY;
    while (startRow > 0 && lines[startRow]?.isWrapped) {
      startRow--;
    }

    // Walk forwards while next row is a wrapped continuation
    let endRow = safeCursorY;
    while (endRow < lines.length - 1 && lines[endRow + 1]?.isWrapped) {
      endRow++;
    }

    const totalRows = Math.max(1, endRow - startRow + 1);
    const currentRowOffset = Math.max(0, safeCursorY - startRow);

    return {
      startRow,
      endRow,
      totalRows,
      currentRowOffset,
    };
  }

  /**
   * Evaluates an arrow key event (Up or Down) and determines whether to perform
   * in-buffer line navigation or allow standard shell history cycling.
   */
  public static evaluateNavigation(input: NavigationEvaluationInput): NavigationDecision {
    // 1. TUI / Full-screen alternate buffer guard (vim, nano, htop, less)
    if (input.isAlternateBuffer) {
      return { handled: false, action: 'pass-to-history' };
    }

    if (!input.lines || input.lines.length === 0) {
      return { handled: false, action: 'pass-to-history' };
    }

    const { startRow, endRow, totalRows, currentRowOffset } = this.getPromptRowRange(
      input.lines,
      input.cursorY
    );

    // Single-row commands: Up and Down arrow always navigate through previous commands and prompts
    if (totalRows <= 1) {
      return { handled: false, action: 'pass-to-history' };
    }

    // Find first character of the prompt/command on startRow
    // The command/prompt starts after any standard shell prompt prefix
    const startLineRaw = input.lines[startRow]?.text || '';
    const prefixLen = this.detectPromptPrefixLength(startLineRaw);
    const commandPart = startLineRaw.substring(prefixLen);
    const firstCharRelIdx = commandPart.search(/\S/);
    const firstCharCol = firstCharRelIdx !== -1 ? prefixLen + firstCharRelIdx : prefixLen;

    // Find last character of the prompt/command across endRow (walking backwards if empty)
    let lastCharCol = -1;
    let targetEndRow = endRow;
    while (targetEndRow >= startRow && lastCharCol === -1) {
      const endLineText = input.lines[targetEndRow]?.text || '';
      for (let c = endLineText.length - 1; c >= 0; c--) {
        if (/\S/.test(endLineText[c])) {
          lastCharCol = c;
          break;
        }
      }
      if (lastCharCol === -1) {
        targetEndRow--;
      }
    }

    // If completely empty prompt, allow normal history cycling
    if (lastCharCol === -1) {
      return { handled: false, action: 'pass-to-history' };
    }

    // Rule: "when the cursor is behind the last character of the command or ahead or on the first character of the command user should be able to use the up and down arraow to navigate through the previously ran commands."
    // 1. Behind the last character of the command (trailing space or line after targetEndRow)
    const isBehindLastChar = input.cursorY > targetEndRow || 
      (input.cursorY === targetEndRow && input.cursorX > lastCharCol);

    // 2. Ahead of or on the first character of the command (line before or col <= firstCharCol on startRow)
    const isAheadOrOnFirstChar = input.cursorY < startRow || 
      (input.cursorY === startRow && input.cursorX <= firstCharCol);

    if (isBehindLastChar || isAheadOrOnFirstChar) {
      return { handled: false, action: 'pass-to-history' };
    }

    // Rule: "But if user uses right arrow to move cursor behind the first character or left arrow to move cursor ahead of the last character, user should be able be able to use up and down arrow to move between lines in the long command."
    const cols = Math.max(1, input.cols);

    if (input.direction === 'up') {
      if (currentRowOffset > 0) {
        // Move up one visual line
        return {
          handled: true,
          action: 'move-up-line',
          payload: '\x1b[D'.repeat(cols),
        };
      } else {
        // Already on top line (startRow), but cursor is inside text (cursorX > firstCharCol).
        // Move cursor to the first character of the command so that a subsequent Up arrow will pass to history.
        const distToFirst = Math.max(1, input.cursorX - firstCharCol);
        return {
          handled: true,
          action: 'move-to-start',
          payload: '\x1b[D'.repeat(distToFirst),
        };
      }
    } else {
      // direction === 'down'
      if (input.cursorY < targetEndRow) {
        // Move down one visual line
        return {
          handled: true,
          action: 'move-down-line',
          payload: '\x1b[C'.repeat(cols),
        };
      } else {
        // Already on bottom line (targetEndRow), but cursor is inside text (cursorX <= lastCharCol).
        // Move cursor behind the last character of the command so that a subsequent Down arrow will pass to history.
        const distToEnd = Math.max(1, (lastCharCol + 1) - input.cursorX);
        return {
          handled: true,
          action: 'move-to-end',
          payload: '\x1b[C'.repeat(distToEnd),
        };
      }
    }
  }
}
