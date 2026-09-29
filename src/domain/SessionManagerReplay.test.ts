import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from './SessionManager';

describe('SessionManager replay', () => {
  it('marks buffered history as replay and does not grow the buffer when a pane remounts', () => {
    const sm = SessionManager.getInstance() as any;
    const id = `test-${Date.now()}`;
    sm.outputListeners.set(id, []);
    sm.recordOutput(id, 'line 1\r\n');
    sm.recordOutput(id, 'line 2\r\n');

    // A remounted pane that (like TerminalView) records what it writes, but only for live output
    const received: Array<[string, boolean | undefined]> = [];
    const callback = vi.fn((data: Uint8Array, replay?: boolean) => {
      received.push([new TextDecoder().decode(data), replay]);
      if (!replay) sm.recordOutput(id, data);
    });
    sm.onOutput(id, callback);

    expect(received).toEqual([['line 1\r\n', true], ['line 2\r\n', true]]);
    expect(sm.sessionBuffers.get(id)).toHaveLength(2);
  });
});
