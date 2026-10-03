import { describe, expect, it } from 'vitest';
import { decideApprovalPresentation, decideModalKey, COMPOSING_QUIET_MS } from './approvalPresentation';
import { InputLineTracker } from './InputLineTracker';

describe('decideApprovalPresentation', () => {
  it('docks while a draft is on the line, however long ago the last key was', () => {
    expect(decideApprovalPresentation({ hasDraft: true, msSinceLastKeystroke: 60_000 })).toBe('dock');
  });
  it('docks while the user is actively typing even with an empty line (they just deleted it)', () => {
    expect(decideApprovalPresentation({ hasDraft: false, msSinceLastKeystroke: 300 })).toBe('dock');
  });
  it('uses the modal when the user is idle with nothing typed', () => {
    expect(decideApprovalPresentation({ hasDraft: false, msSinceLastKeystroke: COMPOSING_QUIET_MS + 1 })).toBe('modal');
    expect(decideApprovalPresentation({ hasDraft: false, msSinceLastKeystroke: Infinity })).toBe('modal');
  });
});

describe('decideModalKey: typing is never an answer', () => {
  const base = { ctrlOrMeta: false, needsExplicitClick: false, armed: true, repeat: false };
  it('letters and Backspace dock the request and go back to the terminal', () => {
    expect(decideModalKey({ ...base, key: 'a' })).toBe('dock-and-forward');
    expect(decideModalKey({ ...base, key: ' ' })).toBe('dock-and-forward');
    expect(decideModalKey({ ...base, key: 'Backspace' })).toBe('dock-and-forward');
  });
  it('Escape denies, Enter approves only when armed and not a repeat', () => {
    expect(decideModalKey({ ...base, key: 'Escape' })).toBe('deny');
    expect(decideModalKey({ ...base, key: 'Enter' })).toBe('approve');
    expect(decideModalKey({ ...base, key: 'Enter', armed: false })).toBe('arm-only');
    expect(decideModalKey({ ...base, key: 'Enter', repeat: true })).toBe('arm-only');
  });
  it('risky requests are never approved by the keyboard', () => {
    expect(decideModalKey({ ...base, key: 'Enter', needsExplicitClick: true })).toBe('arm-only');
  });
  it('shortcuts and navigation keys are ignored', () => {
    expect(decideModalKey({ ...base, key: 'c', ctrlOrMeta: true })).toBe('ignore');
    expect(decideModalKey({ ...base, key: 'ArrowLeft' })).toBe('ignore');
  });
});

describe('InputLineTracker.hasDraft (guards every Cero-initiated write to the shell)', () => {
  const at = { row: 0, col: 2 };
  it('is false on a fresh line', () => {
    expect(new InputLineTracker().hasDraft()).toBe(false);
  });
  it('is true after typing, false after the line is discarded', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('h', at, false);
    t.noteKeystroke('i', at, false);
    expect(t.hasDraft()).toBe(true);
    t.noteKeystroke('\x15', at, false); // Ctrl+U
    expect(t.hasDraft()).toBe(false);
  });
  it('is false when everything typed was deleted', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('h', at, false);
    t.noteKeystroke('\x7f', at, false);
    expect(t.hasDraft()).toBe(false);
  });
  it('stays true when the content is no longer known exactly (paste, arrows)', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('\x1b[200~long pasted prompt\x1b[201~', at, false);
    expect(t.hasDraft()).toBe(true);
  });
  it('is false again after reset (Enter)', () => {
    const t = new InputLineTracker();
    t.noteKeystroke('x', at, false);
    t.reset();
    expect(t.hasDraft()).toBe(false);
  });
});
