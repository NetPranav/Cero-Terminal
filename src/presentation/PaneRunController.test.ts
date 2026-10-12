import { beforeEach, describe, expect, it } from 'vitest';
import { PaneRunController } from './PaneRunController';
import { PromptQueue, type QueuedItem } from './PromptQueue';

/** A scripted agent: each started item is a promise the test settles by hand. */
class Pane {
  readonly started: string[] = [];
  private settlers = new Map<string, (cancelled?: boolean) => void>();

  constructor(readonly ctl: PaneRunController) {}

  /** What TerminalView.runAiGoal does around one agent call */
  start(label: string) {
    const run = this.ctl.begin({ label, kind: 'goal' });
    this.started.push(label);
    const done = new Promise<void>((resolve) => {
      this.settlers.set(label, () => resolve());
      run.signal.addEventListener('abort', () => { /* the agent notices the abort later */ });
    }).then(() => {
      const { owned, next } = this.ctl.finish(run);
      if (owned && next) this.start(next.label);
    });
    return { run, done };
  }

  /** the agent's promise for `label` settles (finished, or noticed the abort) */
  settle(label: string) { this.settlers.get(label)?.(); }

  /** Enter while busy queues, otherwise runs: the same rule as the Enter handler */
  submit(label: string) {
    if (this.ctl.busy) { this.ctl.enqueue({ label }); return 'queued' as const; }
    this.start(label);
    return 'started' as const;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const labels = (items: readonly QueuedItem[]) => items.map((i) => i.label);

describe('pane run and queue lifecycle', () => {
  let queue: PromptQueue;
  let pane: Pane;
  beforeEach(() => {
    queue = new (PromptQueue as any)() as PromptQueue;
    pane = new Pane(new PaneRunController('pane-1', queue));
  });

  it('one running task, two queued: they run in order and the queue empties', async () => {
    expect(pane.submit('A')).toBe('started');
    expect(pane.submit('B')).toBe('queued');
    expect(pane.submit('C')).toBe('queued');
    expect(labels(queue.list())).toEqual(['B', 'C']);
    expect(queue.getRunningItem('pane-1')?.label).toBe('A');

    pane.settle('A'); await flush();
    expect(pane.started).toEqual(['A', 'B']);
    expect(labels(queue.list())).toEqual(['C']);
    expect(queue.getRunningItem('pane-1')?.label).toBe('B');

    pane.settle('B'); await flush();
    expect(pane.started).toEqual(['A', 'B', 'C']);
    pane.settle('C'); await flush();
    expect(queue.size()).toBe(0);
    expect(queue.getRunningItem('pane-1')).toBeNull();
    expect(pane.ctl.busy).toBe(false);
  });

  it('removing one queued prompt leaves the running task and the other queued prompts alone', async () => {
    pane.submit('A'); pane.submit('B'); pane.submit('C'); pane.submit('D');
    expect(queue.remove(2)).toBe(true); // C
    expect(labels(queue.list())).toEqual(['B', 'D']);
    expect(pane.ctl.busy).toBe(true);
    expect(queue.getRunningItem('pane-1')?.label).toBe('A');
    pane.settle('A'); await flush();
    pane.settle('B'); await flush();
    expect(pane.started).toEqual(['A', 'B', 'D']); // C never ran
  });

  it('Ctrl+C on the running task aborts it, pauses the queue, and starts nothing', async () => {
    const { run } = pane.start('A');
    pane.submit('B'); pane.submit('C');

    const outcome = pane.ctl.cancel('stop');
    expect(outcome).toMatchObject({ cancelled: true, waiting: 2, pausedQueue: true });
    expect(run.signal.aborted).toBe(true);
    expect(pane.ctl.busy).toBe(false);
    expect(queue.getRunningItem('pane-1')).toBeNull();
    expect(queue.isPaused()).toBe(true);

    pane.settle('A'); await flush(); // the cancelled agent call finally settles
    expect(pane.started).toEqual(['A']); // B did not start behind the user's back
    expect(labels(queue.list())).toEqual(['B', 'C']);
  });

  it('resuming after a cancel starts the next prompt, in order', async () => {
    pane.start('A'); pane.submit('B'); pane.submit('C');
    pane.ctl.cancel('stop');
    pane.settle('A'); await flush();

    queue.setPaused(false);
    const next = pane.ctl.takeNextIfIdle();
    expect(next?.label).toBe('B');
    pane.start(next!.label);
    expect(labels(queue.list())).toEqual(['C']);
  });

  it('a new prompt right after Ctrl+C is not disturbed by the cancelled run finishing late', async () => {
    pane.start('A');
    pane.ctl.cancel('stop');
    expect(pane.submit('B')).toBe('started'); // idle, so it runs at once
    pane.submit('C');

    pane.settle('A'); await flush(); // the stale finish of A
    expect(pane.ctl.busy).toBe(true);
    expect(queue.getRunningItem('pane-1')?.label).toBe('B');
    expect(labels(queue.list())).toEqual(['C']);
    expect(pane.started).toEqual(['A', 'B']);
  });

  it('a second cancel with nothing running does nothing', () => {
    pane.start('A');
    expect(pane.ctl.cancel('stop').cancelled).toBe(true);
    expect(pane.ctl.cancel('stop')).toMatchObject({ cancelled: false, pausedQueue: false });
  });

  it('with an empty queue Ctrl+C just stops the task and does not pause anything', () => {
    pane.start('A');
    expect(pane.ctl.cancel('stop')).toMatchObject({ cancelled: true, waiting: 0, pausedQueue: false });
    expect(queue.isPaused()).toBe(false);
  });

  it('kill empties this pane\'s queue', () => {
    pane.start('A'); pane.submit('B'); pane.submit('C');
    expect(pane.ctl.cancel('kill')).toMatchObject({ cancelled: true, clearedQueue: 2 });
    expect(queue.size()).toBe(0);
    expect(queue.isPaused()).toBe(false);
  });

  it('the second Ctrl+C after a stop clears what the pause left waiting and un-pauses', () => {
    pane.start('A'); pane.submit('B'); pane.submit('C');
    pane.ctl.cancel('stop');
    expect(pane.ctl.clearWaiting()).toBe(2);
    expect(queue.size()).toBe(0);
    expect(queue.isPaused()).toBe(false);
  });

  it('a paused queue is not advanced by a normal completion either', async () => {
    pane.start('A'); pane.submit('B');
    queue.setPaused(true); // /queue pause
    pane.settle('A'); await flush();
    expect(pane.started).toEqual(['A']);
    expect(labels(queue.list())).toEqual(['B']);
  });

  it('panes are independent: stopping one leaves the other\'s task and queue alone', async () => {
    const other = new Pane(new PaneRunController('pane-2', queue));
    pane.start('A1'); pane.submit('A2');
    other.start('B1'); other.submit('B2');
    expect(queue.getRunningItems().map((i) => i.label).sort()).toEqual(['A1', 'B1']);

    pane.ctl.cancel('stop');
    expect(other.ctl.busy).toBe(true);
    expect(queue.getRunningItem('pane-2')?.label).toBe('B1');
    expect(labels(queue.list().filter((i) => i.ownerId === 'pane-2'))).toEqual(['B2']);

    // When pane 2 finishes it runs only its own next prompt, never pane 1's A2
    queue.setPaused(false);
    other.settle('B1'); await flush();
    expect(other.started).toEqual(['B1', 'B2']);
    expect(pane.started).toEqual(['A1']);
  });

  it('closing a pane drops its run and its queued prompts but not another pane\'s', () => {
    const other = new Pane(new PaneRunController('pane-2', queue));
    pane.start('A1'); pane.submit('A2');
    other.start('B1'); other.submit('B2');
    pane.ctl.dispose();
    expect(queue.getRunningItem('pane-1')).toBeNull();
    expect(labels(queue.list())).toEqual(['B2']);
    expect(other.ctl.busy).toBe(true);
  });
});
