/**
 * Cancelled.ts — Error class and check helper for task cancellation.
 *
 * Task 2.1: A cancel signal that reaches everything.
 */

export class CancelledError extends Error {
  readonly isCancelled = true;
  constructor(message = 'Task was cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

/**
 * Throws CancelledError if the provided AbortSignal is aborted.
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const reason = typeof signal.reason === 'string'
      ? signal.reason
      : (signal.reason instanceof Error ? signal.reason.message : 'Task was cancelled');
    throw new CancelledError(reason);
  }
}
