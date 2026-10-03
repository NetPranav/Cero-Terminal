import { describe, expect, it } from 'vitest';
import { decideStopKey } from './stopKeys';

describe('decideStopKey (Task 2.2)', () => {
  it('returns ignore for non-Ctrl+C data', () => {
    expect(decideStopKey({ data: 'a', hasSelection: false, isAiBusy: false })).toBe('ignore');
    expect(decideStopKey({ data: '\r', hasSelection: false, isAiBusy: true })).toBe('ignore');
  });

  it('returns copy-selection when text is selected, regardless of AI state', () => {
    expect(decideStopKey({ data: '\x03', hasSelection: true, isAiBusy: false })).toBe('copy-selection');
    expect(decideStopKey({ data: '\x03', hasSelection: true, isAiBusy: true })).toBe('copy-selection');
  });

  it('returns pass-to-pty when Ctrl+C is pressed and Cero is not running an AI task', () => {
    expect(decideStopKey({ data: '\x03', hasSelection: false, isAiBusy: false })).toBe('pass-to-pty');
  });

  it('returns abort-ai-task on first Ctrl+C when Cero is running an AI task', () => {
    expect(decideStopKey({ data: '\x03', hasSelection: false, isAiBusy: true })).toBe('abort-ai-task');
  });

  it('returns force-kill-ai-task when second Ctrl+C arrives within 500ms', () => {
    const t0 = 1000;
    expect(decideStopKey({
      data: '\x03',
      hasSelection: false,
      isAiBusy: true,
      lastInterruptTime: t0,
      now: t0 + 250
    })).toBe('force-kill-ai-task');

    expect(decideStopKey({
      data: '\x03',
      hasSelection: false,
      isAiBusy: true,
      lastInterruptTime: t0,
      now: t0 + 500
    })).toBe('force-kill-ai-task');
  });

  it('returns abort-ai-task when second Ctrl+C arrives after 500ms', () => {
    const t0 = 1000;
    expect(decideStopKey({
      data: '\x03',
      hasSelection: false,
      isAiBusy: true,
      lastInterruptTime: t0,
      now: t0 + 501
    })).toBe('abort-ai-task');
  });
});
