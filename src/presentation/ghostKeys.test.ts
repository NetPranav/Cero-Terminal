import { describe, it, expect } from 'vitest';
import { decideGhostKey, type GhostKeyContext } from './ghostKeys';

const atEnd: GhostKeyContext = { cursorAtEnd: true, hasGhost: true, acceptRight: true };
const midLine: GhostKeyContext = { cursorAtEnd: false, hasGhost: true, acceptRight: true };
const noGhost: GhostKeyContext = { cursorAtEnd: true, hasGhost: false, acceptRight: true };
const rightOff: GhostKeyContext = { cursorAtEnd: true, hasGhost: true, acceptRight: false };

describe('decideGhostKey', () => {
  // --- Tab ---
  it('Tab at end with ghost: accept', () => {
    expect(decideGhostKey('\t', atEnd)).toBe('accept-ghost');
  });

  it('Tab mid-line: pass (shell tab completion)', () => {
    expect(decideGhostKey('\t', midLine)).toBe('pass');
  });

  it('Tab at end without ghost: pass', () => {
    expect(decideGhostKey('\t', noGhost)).toBe('pass');
  });

  // --- Right arrow ---
  it('Right at end with ghost: accept', () => {
    expect(decideGhostKey('\x1b[C', atEnd)).toBe('accept-ghost');
  });

  it('Right (alt form) at end with ghost: accept', () => {
    expect(decideGhostKey('\x1bOC', atEnd)).toBe('accept-ghost');
  });

  it('Right mid-line with ghost: clear and pass', () => {
    expect(decideGhostKey('\x1b[C', midLine)).toBe('clear-ghost-and-pass');
  });

  it('Right at end without ghost: pass', () => {
    expect(decideGhostKey('\x1b[C', noGhost)).toBe('pass');
  });

  it('Right at end with acceptRight off: clear and pass', () => {
    expect(decideGhostKey('\x1b[C', rightOff)).toBe('clear-ghost-and-pass');
  });

  // --- Left arrow ---
  it('Left always clears ghost', () => {
    expect(decideGhostKey('\x1b[D', atEnd)).toBe('clear-ghost-and-pass');
    expect(decideGhostKey('\x1bOD', midLine)).toBe('clear-ghost-and-pass');
  });

  // --- Up, Down ---
  it('Up clears ghost', () => {
    expect(decideGhostKey('\x1b[A', atEnd)).toBe('clear-ghost-and-pass');
  });

  it('Down clears ghost', () => {
    expect(decideGhostKey('\x1b[B', atEnd)).toBe('clear-ghost-and-pass');
  });

  // --- Home, End ---
  it('Home clears ghost', () => {
    expect(decideGhostKey('\x1b[H', atEnd)).toBe('clear-ghost-and-pass');
  });

  it('End clears ghost', () => {
    expect(decideGhostKey('\x1b[F', atEnd)).toBe('clear-ghost-and-pass');
  });

  // --- Word movement ---
  it('Ctrl+Left (word move) clears ghost', () => {
    expect(decideGhostKey('\x1b[1;5D', atEnd)).toBe('clear-ghost-and-pass');
  });

  it('Ctrl+Right (word move) clears ghost', () => {
    expect(decideGhostKey('\x1b[1;5C', atEnd)).toBe('clear-ghost-and-pass');
  });

  it('Alt+Left (macOS word) clears ghost', () => {
    expect(decideGhostKey('\x1bb', atEnd)).toBe('clear-ghost-and-pass');
  });

  it('Alt+Right (macOS word) clears ghost', () => {
    expect(decideGhostKey('\x1bf', atEnd)).toBe('clear-ghost-and-pass');
  });

  // --- Navigation without ghost: pass ---
  it('Left without ghost: pass', () => {
    expect(decideGhostKey('\x1b[D', noGhost)).toBe('pass');
  });

  // --- Printable characters pass ---
  it('Printable character: pass', () => {
    expect(decideGhostKey('a', atEnd)).toBe('pass');
    expect(decideGhostKey('Z', midLine)).toBe('pass');
  });
});
