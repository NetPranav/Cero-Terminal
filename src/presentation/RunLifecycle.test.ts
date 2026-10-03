import { describe, expect, it } from 'vitest';
import { RunLifecycle, decideQueueAdvance } from './RunLifecycle';
import { PromptQueue } from './PromptQueue';

describe('RunLifecycle', () => {
  it('is busy from begin() until finish() or cancel()', () => {
    const lc = new RunLifecycle();
    expect(lc.busy).toBe(false);
    const run = lc.begin();
    expect(lc.busy).toBe(true);
    expect(lc.finish(run)).toBe(true);
    expect(lc.busy).toBe(false);
  });

  it('cancel aborts the signal and settles immediately', () => {
    const lc = new RunLifecycle();
    const run = lc.begin();
    expect(run.signal.aborted).toBe(false);
    expect(lc.cancel()).toBe(true);
    expect(run.signal.aborted).toBe(true);
    expect(lc.busy).toBe(false);
    expect(lc.cancel()).toBe(false); // nothing left to cancel
  });

  it('a cancelled run that settles later owns nothing', () => {
    const lc = new RunLifecycle();
    const a = lc.begin();
    lc.cancel();
    expect(lc.finish(a)).toBe(false);
  });

  it('the late finish of a cancelled run cannot clear a newer run (the stale-task bug)', () => {
    const lc = new RunLifecycle();
    const a = lc.begin();
    lc.cancel(); // Ctrl+C
    const b = lc.begin(); // the user submits Prompt B straight away
    expect(lc.finish(a)).toBe(false); // A's promise settles late
    expect(lc.busy).toBe(true); // B is still running
    expect(lc.isCurrent(b)).toBe(true);
    expect(lc.finish(b)).toBe(true);
  });

  it('begin() never leaves two runs active', () => {
    const lc = new RunLifecycle();
    const a = lc.begin();
    const b = lc.begin();
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
    expect(lc.finish(a)).toBe(false);
  });
});

describe('decideQueueAdvance', () => {
  it('advances after a run that finished on its own', () => {
    expect(decideQueueAdvance({ finishedOnItsOwn: true, cancelled: false, waiting: 2, paused: false })).toBe('advance');
  });
  it('holds when nothing waits or the queue is paused', () => {
    expect(decideQueueAdvance({ finishedOnItsOwn: true, cancelled: false, waiting: 0, paused: false })).toBe('hold');
    expect(decideQueueAdvance({ finishedOnItsOwn: true, cancelled: false, waiting: 2, paused: true })).toBe('hold');
  });
  it('pauses (does not start the next prompt) when the user cancelled and prompts are waiting', () => {
    expect(decideQueueAdvance({ finishedOnItsOwn: false, cancelled: true, waiting: 2, paused: false })).toBe('pause');
    expect(decideQueueAdvance({ finishedOnItsOwn: false, cancelled: true, waiting: 0, paused: false })).toBe('hold');
  });
  it('a stale finish never advances', () => {
    expect(decideQueueAdvance({ finishedOnItsOwn: false, cancelled: false, waiting: 3, paused: false })).toBe('hold');
  });
});

describe('PromptQueue ownership (panes do not run each other\'s prompts)', () => {
  const fresh = () => {
    const q = new (PromptQueue as any)() as PromptQueue;
    return q;
  };

  it('takeNext(owner) only returns that pane\'s items, in order', () => {
    const q = fresh();
    q.enqueue({ label: 'a1', ownerId: 'A' });
    q.enqueue({ label: 'b1', ownerId: 'B' });
    q.enqueue({ label: 'a2', ownerId: 'A' });
    expect(q.takeNext('B')?.label).toBe('b1');
    expect(q.takeNext('B')).toBeUndefined();
    expect(q.takeNext('A')?.label).toBe('a1');
    expect(q.takeNext('A')?.label).toBe('a2');
  });

  it('clear(owner) leaves other panes\' prompts alone', () => {
    const q = fresh();
    q.enqueue({ label: 'a1', ownerId: 'A' });
    q.enqueue({ label: 'b1', ownerId: 'B' });
    q.clear('A');
    expect(q.list().map(i => i.label)).toEqual(['b1']);
  });

  it('each pane has its own running item', () => {
    const q = fresh();
    const a = q.enqueue({ label: 'a', ownerId: 'A' });
    const b = q.enqueue({ label: 'b', ownerId: 'B' });
    q.setRunningItem(a, 'A');
    q.setRunningItem(b, 'B');
    expect(q.getRunningItems()).toHaveLength(2);
    q.setRunningItem(null, 'A'); // A finishes: B is untouched
    expect(q.getRunningItem('A')).toBeNull();
    expect(q.getRunningItem('B')?.label).toBe('b');
  });

  it('removing one waiting prompt leaves the order of the others intact', () => {
    const q = fresh();
    const i1 = q.enqueue({ label: 'one', ownerId: 'A' });
    q.enqueue({ label: 'two', ownerId: 'A' });
    q.enqueue({ label: 'three', ownerId: 'A' });
    expect(q.remove(2)).toBe(true);
    expect(q.list().map(i => i.label)).toEqual(['one', 'three']);
    expect(q.takeNext('A')?.id).toBe(i1.id);
  });

  it('size(owner) counts what that pane would run', () => {
    const q = fresh();
    q.enqueue({ label: 'a', ownerId: 'A' });
    q.enqueue({ label: 'b', ownerId: 'B' });
    expect(q.size('A')).toBe(1);
    expect(q.size()).toBe(2);
  });
});
