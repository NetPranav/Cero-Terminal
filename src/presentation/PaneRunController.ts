/**
 * PaneRunController.ts — the run/queue state of one terminal pane, without any UI.
 *
 * TerminalView owns the xterm output and the agent calls; this owns the rules:
 *  - one request at a time; anything typed meanwhile waits in the shared queue, tagged with this pane
 *  - a finished request starts the next waiting prompt of this pane (never another pane's)
 *  - cancelling settles the pane at once, aborts the run's signal, and PAUSES the queue instead of
 *    starting the next prompt; a stale finish of the cancelled run then changes nothing
 */

import { PromptQueue, type QueuedItem, type QueuedPromptKind } from './PromptQueue';
import { RunLifecycle, type RunHandle } from './RunLifecycle';

export type CancelMode = 'stop' | 'kill';

export interface CancelOutcome {
  /** There was a run to cancel */
  cancelled: boolean;
  /** Prompts of this pane left waiting (paused, not started) */
  waiting: number;
  /** This call paused the queue */
  pausedQueue: boolean;
  /** This call emptied this pane's queue (kill) */
  clearedQueue: number;
}

export class PaneRunController {
  public readonly lifecycle = new RunLifecycle();

  constructor(
    public readonly ownerId: string,
    private readonly queue: PromptQueue = PromptQueue.getInstance(),
  ) {}

  public get busy(): boolean {
    return this.lifecycle.busy;
  }

  /** Queue a prompt behind the running one. */
  public enqueue(item: {
    label: string;
    kind?: QueuedPromptKind;
    runner?: (context: any) => Promise<any>;
    flowPlan?: any;
    source?: string;
  }): QueuedItem {
    return this.queue.enqueue({ ...item, ownerId: this.ownerId });
  }

  /** A request starts running now. */
  public begin(item: { label: string; kind: QueuedPromptKind; runner?: (context: any) => Promise<any>; flowPlan?: any; source?: string }): RunHandle {
    const run = this.lifecycle.begin();
    const now = Date.now();
    this.queue.setRunningItem({
      id: `running_${now}_${run.id}`,
      goal: item.label,
      label: item.label,
      kind: item.kind,
      runner: item.runner,
      flowPlan: item.flowPlan,
      source: item.source,
      ownerId: this.ownerId,
      timestamp: now,
      addedAt: now,
    }, this.ownerId);
    return run;
  }

  /**
   * The run's promise settled, however it ended. Returns the next prompt to start, or undefined.
   * `owned` tells the caller whether to do its own shared cleanup (redraw the prompt, ...):
   * false for a cancelled or replaced run, which must leave everything alone.
   */
  public finish(run: RunHandle): { owned: boolean; next?: QueuedItem } {
    if (!this.lifecycle.finish(run)) return { owned: false };
    this.queue.setRunningItem(null, this.ownerId);
    return { owned: true, next: this.queue.takeNext(this.ownerId) };
  }

  /** The queue was resumed: start this pane's next prompt if it is idle. */
  public takeNextIfIdle(): QueuedItem | undefined {
    return this.lifecycle.busy ? undefined : this.queue.takeNext(this.ownerId);
  }

  /** Stop the running request. 'stop' pauses a non-empty queue; 'kill' empties this pane's queue. */
  public cancel(mode: CancelMode): CancelOutcome {
    if (!this.lifecycle.cancel()) {
      return { cancelled: false, waiting: this.queue.size(this.ownerId), pausedQueue: false, clearedQueue: 0 };
    }
    this.queue.setRunningItem(null, this.ownerId);
    if (mode === 'kill') {
      const dropped = this.queue.size(this.ownerId);
      this.queue.clear(this.ownerId);
      return { cancelled: true, waiting: 0, pausedQueue: false, clearedQueue: dropped };
    }
    const waiting = this.queue.size(this.ownerId);
    const pause = waiting > 0 && !this.queue.isPaused();
    if (pause) this.queue.setPaused(true);
    return { cancelled: true, waiting, pausedQueue: pause, clearedQueue: 0 };
  }

  /** Empty this pane's waiting prompts and un-pause (second Ctrl+C after a stop). */
  public clearWaiting(): number {
    const dropped = this.queue.size(this.ownerId);
    this.queue.clear(this.ownerId);
    this.queue.setPaused(false);
    return dropped;
  }

  /** The pane closed: end its run and drop what it queued. */
  public dispose(): void {
    this.lifecycle.cancel();
    this.queue.setRunningItem(null, this.ownerId);
    this.queue.clear(this.ownerId);
  }
}
