import { describe, it, expect } from 'vitest';
import { PromptNavigationEngine, BufferLineInfo } from './PromptNavigationEngine';

describe('PromptNavigationEngine (Issue 9 Behavioral Specifications)', () => {
  describe('getPromptRowRange', () => {
    it('calculates single-line range correctly', () => {
      const lines: BufferLineInfo[] = [
        { text: 'user@host:~$ ls', isWrapped: false },
      ];
      const range = PromptNavigationEngine.getPromptRowRange(lines, 0);
      expect(range.startRow).toBe(0);
      expect(range.endRow).toBe(0);
      expect(range.totalRows).toBe(1);
      expect(range.currentRowOffset).toBe(0);
    });

    it('calculates multi-row wrapped range correctly', () => {
      const lines: BufferLineInfo[] = [
        { text: 'previous command output', isWrapped: false },
        { text: 'user@host:~$ > Create a temporary testing workspace', isWrapped: false }, // row 1
        { text: 'at /tmp/cero-workflow-test. Inside it: create', isWrapped: true },  // row 2
        { text: 'frontend.txt and backend.txt', isWrapped: true },                       // row 3
      ];

      // Cursor on row 3 (bottom line, offset 2)
      const rangeRow3 = PromptNavigationEngine.getPromptRowRange(lines, 3);
      expect(rangeRow3.startRow).toBe(1);
      expect(rangeRow3.endRow).toBe(3);
      expect(rangeRow3.totalRows).toBe(3);
      expect(rangeRow3.currentRowOffset).toBe(2);

      // Cursor on row 2 (middle line, offset 1)
      const rangeRow2 = PromptNavigationEngine.getPromptRowRange(lines, 2);
      expect(rangeRow2.startRow).toBe(1);
      expect(rangeRow2.endRow).toBe(3);
      expect(rangeRow2.totalRows).toBe(3);
      expect(rangeRow2.currentRowOffset).toBe(1);

      // Cursor on row 1 (top line, offset 0)
      const rangeRow1 = PromptNavigationEngine.getPromptRowRange(lines, 1);
      expect(rangeRow1.startRow).toBe(1);
      expect(rangeRow1.endRow).toBe(3);
      expect(rangeRow1.totalRows).toBe(3);
      expect(rangeRow1.currentRowOffset).toBe(0);
    });

    it('calculates multi-row range when lines have isWrapped: false (GNU Readline redisplay)', () => {
      const lines: BufferLineInfo[] = [
        { text: 'previous command output', isWrapped: false },
        { text: '[overxpowered@archlinux ~]$ git commit -m "First line', isWrapped: false }, // row 1
        { text: 'Second line of message', isWrapped: false },                               // row 2
        { text: 'Third line of message"', isWrapped: false },                               // row 3
        { text: '', isWrapped: false },                                                     // row 4 (empty)
      ];

      // Cursor on row 2 (middle line)
      const range = PromptNavigationEngine.getPromptRowRange(lines, 2);
      expect(range.startRow).toBe(1);
      expect(range.endRow).toBe(3);
      expect(range.totalRows).toBe(3);
      expect(range.currentRowOffset).toBe(1);
    });
  });

  describe('evaluateNavigation', () => {
    it('passes arrow keys directly to history on single-line commands', () => {
      const lines: BufferLineInfo[] = [
        { text: 'user@host:~$ ls -la', isWrapped: false },
      ];
      const decision = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 20,
        cursorY: 0,
        cols: 80,
        lines,
      });
      expect(decision.handled).toBe(false);
      expect(decision.action).toBe('pass-to-history');
    });

    it('passes arrow keys directly to history on empty prompt line', () => {
      const decision = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 13,
        cursorY: 0,
        cols: 80,
        lines: [{ text: 'user@host:~$ ', isWrapped: false }],
      });
      expect(decision.handled).toBe(false);
      expect(decision.action).toBe('pass-to-history');
    });

    it('passes arrow keys directly when alternate screen buffer is active (vim/htop)', () => {
      const decision = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 5,
        cursorY: 2,
        cols: 80,
        lines: [{ text: 'vim editing buffer', isWrapped: false }],
        isAlternateBuffer: true,
      });
      expect(decision.handled).toBe(false);
      expect(decision.action).toBe('pass-to-history');
    });

    // Rule: "If the cursor is behind the last character user should be able to perform the Default History Browsing using the up and down arrow."
    it('performs Default History Browsing when cursor is behind the last character (trailing space) in a long prompt', () => {
      const lines: BufferLineInfo[] = [
        { text: 'user@host:~$ > Create test workspace', isWrapped: false }, // row 0
        { text: 'with three files inside.', isWrapped: true },              // row 1 (last char '.' is at col 23)
      ];

      // Cursor is at col 24 (behind '.' at col 23)
      const decisionUp = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 24,
        cursorY: 1,
        cols: 50,
        lines,
      });
      expect(decisionUp.handled).toBe(false);
      expect(decisionUp.action).toBe('pass-to-history');

      const decisionDown = PromptNavigationEngine.evaluateNavigation({
        direction: 'down',
        cursorX: 24,
        cursorY: 1,
        cols: 50,
        lines,
      });
      expect(decisionDown.handled).toBe(false);
      expect(decisionDown.action).toBe('pass-to-history');
    });

    // Rule: "or on the first character user should be able to perform the Default History Browsing using the up and down arrow."
    it('performs Default History Browsing when cursor is on or ahead of the first character', () => {
      const lines: BufferLineInfo[] = [
        { text: 'user@host:~$ > Create test workspace', isWrapped: false }, // row 0 (prefix len 14, '>' at col 14)
        { text: 'with three files inside.', isWrapped: true },              // row 1
      ];

      // Cursor ON the first character '>' (col 13)
      const decisionOnFirst = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 13,
        cursorY: 0,
        cols: 50,
        lines,
      });
      expect(decisionOnFirst.handled).toBe(false);
      expect(decisionOnFirst.action).toBe('pass-to-history');

      // Cursor ahead/before the first character (col 5)
      const decisionBeforeFirst = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 5,
        cursorY: 0,
        cols: 50,
        lines,
      });
      expect(decisionBeforeFirst.handled).toBe(false);
      expect(decisionBeforeFirst.action).toBe('pass-to-history');
    });

    // Rule: "once the user has used the left arrow to move on or ahead of the last character... then user should be able to use the up and down arrows to move between lines in the long prompt or command."
    it('moves between lines when user has moved on or ahead of the last character', () => {
      const cols = 50;
      const lines: BufferLineInfo[] = [
        { text: 'user@host:~$ > Create test workspace', isWrapped: false }, // row 0
        { text: 'with three files inside.', isWrapped: true },              // row 1 (last char '.' is at col 23)
      ];

      // Cursor is ON the last character '.' (col 23)
      const decisionOnLastChar = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 23,
        cursorY: 1,
        cols,
        lines,
      });
      expect(decisionOnLastChar.handled).toBe(true);
      expect(decisionOnLastChar.action).toBe('move-up-line');
      expect(decisionOnLastChar.payload).toBe('\x1b[D'.repeat(cols));

      // Cursor is ahead of the last character (col 15, into the text to the left)
      const decisionInside = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 15,
        cursorY: 1,
        cols,
        lines,
      });
      expect(decisionInside.handled).toBe(true);
      expect(decisionInside.action).toBe('move-up-line');
      expect(decisionInside.payload).toBe('\x1b[D'.repeat(cols));
    });

    // Rule: "or used the right arrow to move behind the first character, then user should be able to use the up and down arrows to move between lines in the long prompt or command."
    it('moves between lines when user has moved behind the first character (into the text to the right)', () => {
      const cols = 50;
      const lines: BufferLineInfo[] = [
        { text: 'user@host:~$ > Create test workspace', isWrapped: false }, // row 0 ('>' at col 14)
        { text: 'with three files inside.', isWrapped: true },              // row 1
      ];

      // Cursor is behind the first character (col 16, on 'C')
      const decisionDown = PromptNavigationEngine.evaluateNavigation({
        direction: 'down',
        cursorX: 16,
        cursorY: 0,
        cols,
        lines,
      });
      expect(decisionDown.handled).toBe(true);
      expect(decisionDown.action).toBe('move-down-line');
      expect(decisionDown.payload).toBe('\x1b[C'.repeat(cols));

      // Up arrow from row 0 behind first character moves to start of text (onto first character)
      const decisionUp = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 16,
        cursorY: 0,
        cols,
        lines,
      });
      expect(decisionUp.handled).toBe(true);
      expect(decisionUp.action).toBe('move-to-start');
      // Moves 3 characters left onto '>' at col 13
      expect(decisionUp.payload).toBe('\x1b[D'.repeat(3));
    });

    it('moves up and down lines on middle lines of a 3-line prompt', () => {
      const cols = 50;
      const lines: BufferLineInfo[] = [
        { text: 'user@host:~$ > First line of prompt', isWrapped: false }, // row 0 (prefix + '>' = 13)
        { text: 'Second line of prompt', isWrapped: true },                // row 1
        { text: 'Third line of prompt.', isWrapped: true },                // row 2
      ];

      // On row 1 (middle line) at col 20 (where 20 >= firstCharCol 13) moving up
      const moveUp = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 20,
        cursorY: 1,
        cols,
        lines,
      });
      expect(moveUp.handled).toBe(true);
      expect(moveUp.action).toBe('move-up-line');
      expect(moveUp.payload).toBe('\x1b[D'.repeat(cols));

      // On row 1 (middle line) at col 20 moving down
      const moveDown = PromptNavigationEngine.evaluateNavigation({
        direction: 'down',
        cursorX: 20,
        cursorY: 1,
        cols,
        lines,
      });
      expect(moveDown.handled).toBe(true);
      expect(moveDown.action).toBe('move-down-line');
      expect(moveDown.payload).toBe('\x1b[C'.repeat(cols));
    });

    it('clamps target column to firstCharCol when cursor is left of prompt terminator', () => {
      const cols = 50;
      const lines: BufferLineInfo[] = [
        { text: 'user@host:~$ > First line of prompt', isWrapped: false }, // row 0: prefix len 13, '>' at 13
        { text: 'Second line of prompt', isWrapped: true },                // row 1
      ];

      // Cursor at col 10 on row 1 (left of firstCharCol 13 on row 0)
      const decision = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 10,
        cursorY: 1,
        cols,
        lines,
      });
      expect(decision.handled).toBe(true);
      expect(decision.action).toBe('move-up-line');
      // 10 chars to start of row 1 + (50 - 13) chars to '>' at col 13 on row 0 = 47 chars
      expect(decision.payload).toBe('\x1b[D'.repeat(47));
    });

    it('moves between non-wrapped lines with exact character distance based on line lengths', () => {
      const cols = 80;
      const lines: BufferLineInfo[] = [
        { text: 'user@host:~$ echo "line 1"', isWrapped: false }, // row 0: len 27, prefix 13, 'e' at 13
        { text: 'echo "line 2"', isWrapped: false },              // row 1: len 13, starts at 0
      ];

      // Cursor at col 5 on row 1 moving up to col 5 on row 0 (clamped to firstCharCol 13)
      const moveUp = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 5,
        cursorY: 1,
        cols,
        lines,
      });
      expect(moveUp.handled).toBe(true);
      expect(moveUp.action).toBe('move-up-line');
      // 5 chars to start of row 1 + (26 - 13) chars to col 13 on row 0 = 18 chars
      expect(moveUp.payload).toBe('\x1b[D'.repeat(18));
    });

    it('moves to end of text when Down arrow is pressed on bottom row inside text', () => {
      const cols = 50;
      const lines: BufferLineInfo[] = [
        { text: 'user@host:~$ > First line of prompt', isWrapped: false }, // row 0
        { text: 'Second line of prompt.', isWrapped: true },               // row 1 (last char '.' at col 21)
      ];

      // On row 1 at col 10 (inside text) moving down
      const decision = PromptNavigationEngine.evaluateNavigation({
        direction: 'down',
        cursorX: 10,
        cursorY: 1,
        cols,
        lines,
      });
      expect(decision.handled).toBe(true);
      expect(decision.action).toBe('move-to-end');
      // Moves 12 characters right behind '.' at col 22
      expect(decision.payload).toBe('\x1b[C'.repeat(12));
    });

    it('correctly parses Arch Linux bash prompt without greedily matching command variables', () => {
      const promptLine = '[overxpowered@archlinux sentinal]$ echo $PATH $USER';
      const prefixLen = PromptNavigationEngine.detectPromptPrefixLength(promptLine);
      expect(prefixLen).toBe(35);
      expect(promptLine.substring(prefixLen)).toBe('echo $PATH $USER');
    });

    it('correctly parses Oh-My-Zsh and Starship prompts', () => {
      const zshLine = '➜  sentinal git:(main) ✗ git status';
      const zshPrefixLen = PromptNavigationEngine.detectPromptPrefixLength(zshLine);
      expect(zshPrefixLen).toBe(25);
      expect(zshLine.substring(zshPrefixLen)).toBe('git status');

      const starshipLine = 'user@arch ❯ ls -la';
      const starshipPrefixLen = PromptNavigationEngine.detectPromptPrefixLength(starshipLine);
      expect(starshipPrefixLen).toBe(12);
      expect(starshipLine.substring(starshipPrefixLen)).toBe('ls -la');
    });

    it('navigates history on subsequent arrow press after landing on first character or behind last character', () => {
      const cols = 50;
      const lines: BufferLineInfo[] = [
        { text: '[overxpowered@archlinux ~]$ git commit -m "long message', isWrapped: false }, // row 0: prefix 28, 'g' at 28
        { text: 'wrapped onto second line"', isWrapped: true },                                 // row 1: last char '"' at col 24
      ];

      // 1. Moving to start: Cursor at col 30 on row 0
      const stepToStart = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 30,
        cursorY: 0,
        cols,
        lines,
      });
      expect(stepToStart.handled).toBe(true);
      expect(stepToStart.action).toBe('move-to-start');
      expect(stepToStart.payload).toBe('\x1b[D'.repeat(2)); // Moves left from 30 to 28 ('g')

      // 2. Now on first character ('g' at col 28): Next Up arrow passes to history!
      const nextUp = PromptNavigationEngine.evaluateNavigation({
        direction: 'up',
        cursorX: 28,
        cursorY: 0,
        cols,
        lines,
      });
      expect(nextUp.handled).toBe(false);
      expect(nextUp.action).toBe('pass-to-history');

      // 3. Moving to end: Cursor at col 20 on row 1
      const stepToEnd = PromptNavigationEngine.evaluateNavigation({
        direction: 'down',
        cursorX: 20,
        cursorY: 1,
        cols,
        lines,
      });
      expect(stepToEnd.handled).toBe(true);
      expect(stepToEnd.action).toBe('move-to-end');
      expect(stepToEnd.payload).toBe('\x1b[C'.repeat(5)); // Moves right from 20 to 25 (behind '"')

      // 4. Now behind last character (col 25 on row 1): Next Down arrow passes to history!
      const nextDown = PromptNavigationEngine.evaluateNavigation({
        direction: 'down',
        cursorX: 25,
        cursorY: 1,
        cols,
        lines,
      });
      expect(nextDown.handled).toBe(false);
      expect(nextDown.action).toBe('pass-to-history');
    });
  });
});
