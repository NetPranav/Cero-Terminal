import { describe, it, expect } from 'vitest';
import { CancelledError, throwIfAborted } from './Cancelled';

describe('Cancelled', () => {
  it('creates a CancelledError with default message', () => {
    const err = new CancelledError();
    expect(err.message).toBe('Task was cancelled');
    expect(err.name).toBe('CancelledError');
    expect(err.isCancelled).toBe(true);
  });

  it('creates a CancelledError with custom message', () => {
    const err = new CancelledError('User pressed stop');
    expect(err.message).toBe('User pressed stop');
    expect(err.isCancelled).toBe(true);
  });

  it('throwIfAborted does nothing when signal is undefined or not aborted', () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();

    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
  });

  it('throwIfAborted throws CancelledError when signal is aborted', () => {
    const controller = new AbortController();
    controller.abort('Abort requested by user');

    expect(() => throwIfAborted(controller.signal)).toThrow(CancelledError);
    try {
      throwIfAborted(controller.signal);
    } catch (e: any) {
      expect(e).toBeInstanceOf(CancelledError);
      expect(e.message).toBe('Abort requested by user');
      expect(e.isCancelled).toBe(true);
    }
  });
});
