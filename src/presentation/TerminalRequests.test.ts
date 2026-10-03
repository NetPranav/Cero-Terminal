import { describe, it, expect, beforeEach, vi } from 'vitest';
import { submitTerminalRequest, claimTerminalRequests, releaseTerminalRequests, resetTerminalRequestsForTests } from './TerminalRequests';

describe('TerminalRequests', () => {
  beforeEach(() => resetTerminalRequestsForTests());

  it('queues requests until a focused pane claims them', () => {
    submitTerminalRequest({ kind: 'goal', goal: 'run workflow a' });
    const handler = vi.fn();
    claimTerminalRequests('pane-1', handler);
    expect(handler).toHaveBeenCalledWith({ kind: 'goal', goal: 'run workflow a' });
    submitTerminalRequest({ kind: 'goal', goal: 'run workflow b' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('a pane that lost focus does not release the new owner', () => {
    const first = vi.fn();
    const second = vi.fn();
    claimTerminalRequests('pane-1', first);
    claimTerminalRequests('pane-2', second);
    releaseTerminalRequests('pane-1');
    submitTerminalRequest({ kind: 'goal', goal: 'x' });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
