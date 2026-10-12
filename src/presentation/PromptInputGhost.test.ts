import { describe, expect, it } from 'vitest';
import { GhostTextRenderer } from '../ui/components/GhostText';
import { InputLineTracker } from './InputLineTracker';
import { decideGhostKey, isSingleEditKey } from './ghostKeys';
import { readGhostAcceptRight } from './ghostPrefs';

const RIGHT = '\x1b[C';
const LEFT = '\x1b[D';
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

/** A one-prompt terminal: "$ " followed by whatever has been typed, cursor tracked by the test. */
class FakeTerm {
  text = '';
  cursor = 0; // index into text
  readonly prompt = '$ ';
  get buffer() {
    const self = this;
    return {
      active: {
        baseY: 0,
        cursorY: 0,
        get cursorX() { return self.prompt.length + self.cursor; },
        getLine: (y: number) => (y === 0
          ? { isWrapped: false, translateToString: (trim?: boolean, start = 0) => { const t = (self.prompt + self.text).slice(start); return trim ? t.replace(/\s+$/, '') : t; } }
          : undefined),
      },
    };
  }
  /** What the shell would do with a key */
  shell(data: string) {
    if (data === LEFT) this.cursor = Math.max(0, this.cursor - 1);
    else if (data === RIGHT) this.cursor = Math.min(this.text.length, this.cursor + 1);
    else if (data === '\x7f') { if (this.cursor > 0) { this.text = this.text.slice(0, this.cursor - 1) + this.text.slice(this.cursor); this.cursor--; } }
    else if (!data.startsWith('\x1b') || data.startsWith(PASTE_START)) {
      const plain = data.replace(PASTE_START, '').replace(PASTE_END, '');
      this.text = this.text.slice(0, this.cursor) + plain + this.text.slice(this.cursor);
      this.cursor += plain.length;
    }
  }
}

/** Mirrors what TerminalView's onData does for the ghost, using the real classes. */
class PromptHarness {
  readonly term = new FakeTerm();
  readonly tracker = new InputLineTracker();
  readonly ghost: GhostTextRenderer;
  /** The real default, as a fresh install reads it */
  acceptRight = readGhostAcceptRight({ getItem: () => null });

  constructor() {
    const termForGhost: any = { get buffer() { return harnessTerm.buffer; } };
    const harnessTerm = this.term;
    this.ghost = new GhostTextRenderer(termForGhost);
    this.ghost.setOverlayElement({ style: {}, textContent: '' } as any);
  }

  private note(data: string) {
    const b = this.term.buffer.active;
    this.tracker.noteKeystroke(data, { row: b.baseY + b.cursorY, col: b.cursorX }, false);
  }

  /** keystroke through the same decision chain as TerminalView.onData; returns what was sent to the shell */
  key(data: string): string {
    const b0 = this.term.buffer.active;
    this.note(data);
    const end = this.tracker.getCursorEndInfo(this.term as any);
    const action = decideGhostKey(data, { cursorAtEnd: end.atEnd, hasGhost: !!this.ghost.getRemaining(), acceptRight: this.acceptRight });
    if (action === 'accept-ghost') {
      const typedNow = this.tracker.read(b0 as any, 0);
      const remaining = this.ghost.acceptableRemaining(typedNow);
      this.ghost.invalidate();
      if (remaining) { this.term.shell(remaining); return remaining; }
    } else if (action === 'clear-ghost-and-pass') {
      this.ghost.invalidate();
    } else if (!isSingleEditKey(data)) {
      this.ghost.invalidate();
    }
    this.term.shell(data);
    return data;
  }

  type(s: string) { for (const ch of s) this.key(ch); }

  /** the Ctrl+V path: bypasses onData entirely, like handlePaste */
  paste(text: string, bracketed = false) {
    this.ghost.invalidate();
    const payload = bracketed ? PASTE_START + text + PASTE_END : text;
    this.note(payload);
    this.term.shell(payload);
  }

  /** what the recompute does once suggestions arrive */
  showSuggestion(value: string) {
    const typed = this.tracker.read(this.term.buffer.active as any, 0) ?? '';
    const end = this.tracker.getCursorEndInfo(this.term as any);
    this.ghost.render(value, typed, end.endCol, end.atEnd);
  }
}

describe('decideGhostKey: arrows only move the cursor', () => {
  const at = { cursorAtEnd: true, hasGhost: true };
  it('Right accepts at the end unless the user turned it off', () => {
    expect(decideGhostKey(RIGHT, { ...at, acceptRight: false })).toBe('clear-ghost-and-pass');
    expect(decideGhostKey(RIGHT, { ...at, acceptRight: true })).toBe('accept-ghost');
  });
  it('Right in the middle of the line never accepts', () => {
    expect(decideGhostKey(RIGHT, { cursorAtEnd: false, hasGhost: true, acceptRight: true })).toBe('clear-ghost-and-pass');
  });
  it('Left and the other movement keys clear the ghost and pass through', () => {
    for (const k of [LEFT, '\x1b[A', '\x1b[B', '\x1b[H', '\x1b[F', '\x1b[1;5D', '\x1b[1;5C']) {
      expect(decideGhostKey(k, { ...at, acceptRight: true })).toBe('clear-ghost-and-pass');
    }
  });
  it('Tab at the end is the explicit accept', () => {
    expect(decideGhostKey('\t', { ...at, acceptRight: false })).toBe('accept-ghost');
    expect(decideGhostKey('\t', { cursorAtEnd: false, hasGhost: true, acceptRight: false })).toBe('pass');
  });
  it('paste and control keys invalidate the ghost; plain typing does not', () => {
    expect(decideGhostKey('pasted text', { ...at, acceptRight: false })).toBe('clear-ghost-and-pass');
    expect(decideGhostKey(PASTE_START + 'x' + PASTE_END, { ...at, acceptRight: false })).toBe('clear-ghost-and-pass');
    expect(decideGhostKey('\x17', { ...at, acceptRight: false })).toBe('clear-ghost-and-pass');
    expect(decideGhostKey('\x0b', { ...at, acceptRight: false })).toBe('clear-ghost-and-pass');
    expect(decideGhostKey('a', { ...at, acceptRight: false })).toBe('pass');
    expect(decideGhostKey('\x7f', { ...at, acceptRight: false })).toBe('pass');
  });
});

describe('ghost preference', () => {
  it('Right-arrow accept is on unless the user turned it off in Settings', () => {
    expect(readGhostAcceptRight({ getItem: () => null })).toBe(true);
    expect(readGhostAcceptRight({ getItem: () => 'true' })).toBe(true);
    expect(readGhostAcceptRight({ getItem: () => 'false' })).toBe(false);
    expect(readGhostAcceptRight({ getItem: () => { throw new Error('blocked'); } })).toBe(true);
  });
});

describe('prompt input with grey suggestion text', () => {
  it('normal typing leaves the text exactly as typed', () => {
    const h = new PromptHarness();
    h.type('git st');
    expect(h.term.text).toBe('git st');
  });

  it('a visible suggestion is not part of the real text and arrows never change the real text', () => {
    const h = new PromptHarness();
    h.type('git st');
    h.showSuggestion('git status');
    expect(h.ghost.getRemaining()).toBe('atus');
    for (const k of [LEFT, LEFT, RIGHT, RIGHT, RIGHT, LEFT, RIGHT, RIGHT]) h.key(k);
    expect(h.term.text).toBe('git st');
  });

  it('moving through existing text with the Right-accept option ON still never commits the suggestion', () => {
    const h = new PromptHarness();
    h.acceptRight = true;
    h.type('git st');
    h.showSuggestion('git status');
    h.key(LEFT); // clears the ghost
    h.key(RIGHT); // back at the end, ghost is gone: must only move the cursor
    h.key(RIGHT);
    expect(h.term.text).toBe('git st');
  });

  it('Tab accepts the visible suggestion exactly once', () => {
    const h = new PromptHarness();
    h.type('git st');
    h.showSuggestion('git status');
    expect(h.key('\t')).toBe('atus');
    expect(h.term.text).toBe('git status');
    // nothing left to accept: the Tab is passed through to the shell (completion), not replaced by text
    expect(h.key('\t')).toBe('\t');
  });

  it('Right accepts at the end by default, exactly like Tab', () => {
    const viaRight = new PromptHarness();
    viaRight.type('git st');
    viaRight.showSuggestion('git status');
    expect(viaRight.key(RIGHT)).toBe('atus');

    const viaTab = new PromptHarness();
    viaTab.type('git st');
    viaTab.showSuggestion('git status');
    expect(viaTab.key('\t')).toBe('atus');

    expect(viaRight.term.text).toBe('git status');
    expect(viaRight.term.text).toBe(viaTab.term.text);
    expect(viaRight.term.cursor).toBe(viaRight.term.text.length);
    expect(viaRight.term.cursor).toBe(viaTab.term.cursor);
  });

  it('Right pressed several times inserts the suggestion once, then only moves the cursor', () => {
    const h = new PromptHarness();
    h.type('npm run b');
    h.showSuggestion('npm run build');
    for (let i = 0; i < 5; i++) h.key(RIGHT);
    expect(h.term.text).toBe('npm run build');
    expect(h.term.text.split('uild').length - 1).toBe(1);
    expect(h.term.cursor).toBe('npm run build'.length);
  });

  it('Right with no suggestion only moves the cursor', () => {
    const h = new PromptHarness();
    h.type('echo hello');
    h.key(LEFT); h.key(LEFT); h.key(LEFT);
    expect(h.term.cursor).toBe(7);
    h.key(RIGHT);
    expect(h.term.cursor).toBe(8);
    h.key(RIGHT); h.key(RIGHT); h.key(RIGHT);
    expect(h.term.cursor).toBe(10);
    expect(h.term.text).toBe('echo hello');
  });

  it('turned off in Settings, Right only moves the cursor and Tab still accepts', () => {
    const h = new PromptHarness();
    h.acceptRight = readGhostAcceptRight({ getItem: () => 'false' });
    h.type('git st');
    h.showSuggestion('git status');
    h.key(RIGHT);
    expect(h.term.text).toBe('git st');
    h.showSuggestion('git status');
    h.key('\t');
    expect(h.term.text).toBe('git status');
  });

  it('a recompute that finishes after the user moved is discarded (no ghost reappears mid-line)', () => {
    const h = new PromptHarness();
    h.type('git st');
    const epoch = h.ghost.beginRecompute(); // suggestions requested for "git st"
    h.key(LEFT); // user moves before they arrive
    expect(h.ghost.isCurrent(epoch)).toBe(false);
  });

  it('a stale suggestion can never be accepted, even if it somehow survived', () => {
    const h = new PromptHarness();
    h.type('git st');
    h.showSuggestion('git status');
    h.term.text = 'git stash'; // line changed behind the ghost's back
    h.term.cursor = h.term.text.length;
    expect(h.ghost.acceptableRemaining('git stash')).toBe('');
    expect(h.ghost.acceptableRemaining(null)).toBe('');
  });
});

describe('paste then arrow keys (the duplicated-prompt bug)', () => {
  const PROMPT = 'write a function that reverses a linked list and explain it';

  it('paste while a suggestion for an earlier keystroke is showing: Right does not append it again', () => {
    for (const acceptRight of [false, true]) {
      const h = new PromptHarness();
      h.acceptRight = acceptRight;
      h.type('w'); // history suggests the whole prompt for "w"
      h.showSuggestion(PROMPT);
      expect(h.ghost.getRemaining()).toBe(PROMPT.slice(1));

      h.paste(PROMPT.slice(1)); // the user pastes the rest of that very prompt
      expect(h.term.text).toBe(PROMPT);

      h.key(RIGHT);
      h.key(RIGHT);
      expect(h.term.text).toBe(PROMPT); // exactly once
      expect(h.term.text.split('write a function').length - 1).toBe(1);
    }
  });

  it('same with bracketed paste', () => {
    const h = new PromptHarness();
    h.acceptRight = true;
    h.type('w');
    h.showSuggestion(PROMPT);
    h.paste(PROMPT.slice(1), true);
    h.key(RIGHT);
    expect(h.term.text).toBe(PROMPT);
  });

  it('pasting into an empty prompt and pressing Right only moves the cursor', () => {
    const h = new PromptHarness();
    h.acceptRight = true;
    h.paste(PROMPT);
    h.key(RIGHT);
    expect(h.term.text).toBe(PROMPT);
  });

  it('paste, Left, Right, Left: text is untouched and the cursor lands where expected', () => {
    const h = new PromptHarness();
    h.paste(PROMPT);
    h.key(LEFT); h.key(LEFT); h.key(RIGHT); h.key(LEFT);
    expect(h.term.text).toBe(PROMPT);
    expect(h.term.cursor).toBe(PROMPT.length - 2);
  });

  it('even if the ghost were not invalidated by the paste, the live-line check refuses the stale remainder', () => {
    const h = new PromptHarness();
    h.acceptRight = true;
    h.type('w');
    h.showSuggestion(PROMPT);
    // simulate a paste path that forgot to invalidate
    h.term.shell(PROMPT.slice(1));
    h.tracker.noteKeystroke(PROMPT.slice(1), { row: 0, col: 3 }, false);
    h.key(RIGHT);
    expect(h.term.text).toBe(PROMPT);
  });
});

describe('typing while another task runs', () => {
  it('no suggestion is offered for text typed ahead of the prompt (the line cannot be located)', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('h', { row: 0, col: 0 }, true); // a program is running
    const line = { isWrapped: false, translateToString: () => 'h' };
    expect(t.read({ getLine: () => line }, 0)).toBeNull();
    const g = new GhostTextRenderer({} as any);
    expect(g.acceptableRemaining(null)).toBe('');
  });
});
