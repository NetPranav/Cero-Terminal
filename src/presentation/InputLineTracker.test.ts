import { describe, it, expect } from 'vitest';
import { InputLineTracker, stripPrompt, parseCdTarget, type InputBuffer } from './InputLineTracker';

/** Minimal xterm-like buffer: fixed-width rows, wrapped flag per row */
function bufferOf(rows: Array<{ text: string; wrapped?: boolean }>, cols = 40): InputBuffer {
  return {
    getLine(y: number) {
      const r = rows[y];
      if (!r) return undefined;
      const padded = r.text.padEnd(cols, ' ');
      return {
        isWrapped: Boolean(r.wrapped),
        translateToString(trimRight = false, start = 0, end = cols) {
          const s = padded.slice(start, end);
          return trimRight ? s.replace(/\s+$/, '') : s;
        },
      };
    },
  };
}

describe('InputLineTracker', () => {
  it('reads from the first keystroke, ignoring $ % # inside the request', () => {
    const t = new InputLineTracker();
    const prompt = 'user@mac dir % ';
    t.noteKeystroke('>', { row: 0, col: prompt.length }, false);
    const buf = bufferOf([{ text: `${prompt}>what is $PATH and 50% # ok` }], 80);
    expect(t.read(buf, 0)).toBe('>what is $PATH and 50% # ok');
  });

  it('reads a request typed on a line with no prompt (agent output was printing)', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('>', { row: 3, col: 0 }, false);
    const buf = bufferOf([{ text: 'x % >first' }, { text: '' }, { text: '● Thinking...' }, { text: ">what's eating my RAM" }]);
    expect(t.read(buf, 3)).toBe(">what's eating my RAM");
  });

  it('joins wrapped rows and keeps a space at the wrap point', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('>', { row: 0, col: 4 }, false);
    // 10 columns: "$ % >list " wraps to "big files"
    const buf = bufferOf([{ text: '$ % >list ' }, { text: 'big files', wrapped: true }], 10);
    expect(t.read(buf, 1)).toBe('>list big files');
  });

  it('includes wrapped rows after the cursor', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('a', { row: 0, col: 2 }, false);
    const buf = bufferOf([{ text: '% abcdefgh' }, { text: 'ijk', wrapped: true }], 10);
    expect(t.read(buf, 0)).toBe('abcdefghijk');
  });

  it('only the first keystroke sets the anchor', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('>', { row: 0, col: 2 }, false);
    t.noteKeystroke('a', { row: 0, col: 3 }, false);
    expect(t.read(bufferOf([{ text: '% >a' }]), 0)).toBe('>a');
  });

  it('Ctrl+C and Ctrl+U discard the anchor', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('>', { row: 0, col: 2 }, false);
    t.noteKeystroke('\x03', { row: 0, col: 3 }, false);
    expect(t.hasAnchor()).toBe(false);
    t.noteKeystroke('l', { row: 1, col: 2 }, false);
    t.noteKeystroke('\x15', { row: 1, col: 3 }, false);
    expect(t.read(bufferOf([{ text: '' }, { text: '% l' }]), 1)).toBeNull();
  });

  it('returns null for type-ahead so the caller falls back to prompt stripping', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('l', { row: 0, col: 0 }, true);
    expect(t.hasAnchor()).toBe(false);
    expect(t.read(bufferOf([{ text: 'building...' }, { text: '% ls' }]), 1)).toBeNull();
  });

  it('returns null when the anchor is below the cursor or gone', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('x', { row: 5, col: 0 }, false);
    expect(t.read(bufferOf([{ text: 'a' }]), 2)).toBeNull();
    expect(t.read(bufferOf([{ text: 'a' }]), 5)).toBeNull();
  });
});

describe('stripPrompt', () => {
  it('cuts at the first prompt terminator, not the last', () => {
    expect(stripPrompt('user@mac dir % >show 50% of $HOME')).toBe('>show 50% of $HOME');
    expect(stripPrompt('[u@h ~]$ ls -la')).toBe('ls -la');
    expect(stripPrompt('~/src ❯ git status')).toBe('git status');
  });

  it('returns the text unchanged when there is no prompt', () => {
    expect(stripPrompt('>list files')).toBe('>list files');
  });
});

describe('InputLineTracker keystroke shadow', () => {
  const at = { row: 0, col: 0 };
  const type = (t: InputLineTracker, keys: string[]) => keys.forEach(k => t.noteKeystroke(k, at, false));

  it('reproduces plain typing, paste and backspace exactly', () => {
    const t = new InputLineTracker();
    type(t, ['>', 'w', 'h', 'a', 't', "'", 's', ' ', 'x', '\x7f', 'eating my RAM']);
    expect(t.typedText()).toBe(">what's eating my RAM");
  });

  it('handles Ctrl+W word deletion', () => {
    const t = new InputLineTracker();
    type(t, ['>list big files', '\x17']);
    expect(t.typedText()).toBe('>list big ');
  });

  it('gives up after editing keys so the screen is read instead', () => {
    const t = new InputLineTracker();
    type(t, ['>abc', '\x1b[D', 'x']);
    expect(t.typedText()).toBeNull();
    const u = new InputLineTracker();
    type(u, ['gi', '\t']);
    expect(u.typedText()).toBeNull();
  });

  it('starts fresh after reset', () => {
    const t = new InputLineTracker();
    type(t, ['ls', '\x1b[A']);
    t.reset();
    type(t, ['>hi']);
    expect(t.typedText()).toBe('>hi');
  });
});

describe('parseCdTarget', () => {
  it.each([
    ['cd', '~'],
    ['cd ~/src', '~/src'],
    ['cd /tmp/sandbox && clear', '/tmp/sandbox'],
    ['cd src; ls', 'src'],
    ['cd "My Folder" && ls', 'My Folder'],
    ["cd 'a b'", 'a b'],
    ['cd My\\ Folder', 'My Folder'],
    ['cd ..', '..'],
  ])('%s -> %s', (cmd, target) => {
    expect(parseCdTarget(cmd)).toBe(target);
  });

  it.each(['cd -', 'cd $HOME/x', 'cd `pwd`', 'cd src*', 'cdx foo', 'echo cd foo'])('%s -> unknown', (cmd) => {
    expect(parseCdTarget(cmd)).toBeNull();
  });
});
