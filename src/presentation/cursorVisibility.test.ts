import { describe, expect, it, vi } from 'vitest';
import { reviveCursor } from './cursorVisibility';

describe('reviveCursor', () => {
  it('restarts the blink and repaints every row, leaving the setting as it was', () => {
    const seen: boolean[] = [];
    let blink = true;
    const term = {
      rows: 24,
      options: { get cursorBlink() { return blink; }, set cursorBlink(v: boolean | undefined) { seen.push(v as boolean); blink = v as boolean; } },
      refresh: vi.fn(),
    };
    reviveCursor(term);
    expect(seen).toEqual([false, true]);
    expect(blink).toBe(true);
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
  });

  it('keeps a steady cursor steady', () => {
    let blink = false;
    const term = { rows: 5, options: { get cursorBlink() { return blink; }, set cursorBlink(v: boolean | undefined) { blink = v as boolean; } }, refresh: vi.fn() };
    reviveCursor(term);
    expect(blink).toBe(false);
  });

  it('ignores a disposed terminal', () => {
    expect(() => reviveCursor({ rows: 1, options: {}, refresh: () => { throw new Error('disposed'); } })).not.toThrow();
    expect(() => reviveCursor(null)).not.toThrow();
  });
});
