/**
 * RunLifecycle.ts — which request a pane is running, and who may clean up after it.
 *
 * Cancelling a run settles the pane at once (idle, UI updated). The cancelled run's promise only
 * finishes later, and its `finally` used to clear the busy flag and start the next queued prompt
 * again: wiping out a newer run's state, or starting a prompt the user had not asked for.
 * `finish()` therefore tells the caller whether its run is still the current one; a run that was
 * cancelled (or replaced) owns nothing and must leave shared state alone.
 */

export interface RunHandle {
  readonly id: number;
  readonly signal: AbortSignal;
}

export class RunLifecycle {
  private seq = 0;
  private current: { id: number; controller: AbortController } | null = null;

  /** Start a run. A run that is somehow still current is cancelled first: one run per pane. */
  public begin(): RunHandle {
    this.cancel();
    const controller = new AbortController();
    const id = ++this.seq;
    this.current = { id, controller };
    return { id, signal: controller.signal };
  }

  public get busy(): boolean {
    return this.current !== null;
  }

  public isCurrent(run: RunHandle): boolean {
    return this.current?.id === run.id;
  }

  /** Abort the current run and settle immediately. Returns false when nothing was running. */
  public cancel(): boolean {
    if (!this.current) return false;
    const { controller } = this.current;
    this.current = null;
    controller.abort();
    return true;
  }

  /**
   * The run's promise has settled, however it ended. Returns true only if this run was still the
   * current one (it finished on its own): then the caller does the shared cleanup and may start
   * the next queued prompt. False when it was cancelled or replaced: do nothing shared.
   */
  public finish(run: RunHandle): boolean {
    if (this.current?.id !== run.id) return false;
    this.current = null;
    return true;
  }
}

/** What happens to the queue when a run ends. */
export type QueueAdvance = 'advance' | 'hold' | 'pause';

export function decideQueueAdvance(input: {
  /** The run finished by itself (not cancelled or replaced) */
  finishedOnItsOwn: boolean;
  /** The run was cancelled by the user */
  cancelled: boolean;
  waiting: number;
  paused: boolean;
}): QueueAdvance {
  if (input.cancelled) {
    // The user stopped the task: do not start the next prompt behind their back
    return input.waiting > 0 && !input.paused ? 'pause' : 'hold';
  }
  if (!input.finishedOnItsOwn) return 'hold';
  if (input.paused || input.waiting === 0) return 'hold';
  return 'advance';
}
