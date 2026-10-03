import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PtyStateTracker, PtyState } from './PtyStateTracker';

describe('PtyStateTracker', () => {
  let tracker: PtyStateTracker;

  beforeEach(() => {
    tracker = new PtyStateTracker();
  });

  it('initializes in idle-at-prompt state and permits Ctrl+C', () => {
    expect(tracker.getState()).toBe('idle-at-prompt');
    expect(tracker.isIdleAtPrompt()).toBe(true);
    expect(tracker.canSafelyInjectCtrlC()).toBe(true);
  });

  it('transitions to process-running when a command is submitted', () => {
    tracker.notifyCommandStarted('cargo build --release');
    expect(tracker.getState()).toBe('process-running');
    expect(tracker.isProcessRunning()).toBe(true);
    expect(tracker.canSafelyInjectCtrlC()).toBe(false);
  });

  it('returns to idle-at-prompt when shell prompt appears in output', () => {
    tracker.notifyCommandStarted('npm test');
    expect(tracker.getState()).toBe('process-running');

    // Simulate process producing output followed by fresh prompt
    tracker.feedOutput('Running test suite...\nTests passed: 42\n');
    expect(tracker.getState()).toBe('process-running');

    tracker.feedOutput('user@cero:~/project$ ');
    expect(tracker.getState()).toBe('idle-at-prompt');
    expect(tracker.canSafelyInjectCtrlC()).toBe(true);
  });

  it('handles zsh, fish, and starship prompts', () => {
    tracker.notifyCommandStarted('ls -la');
    tracker.feedOutput('\r\n➜  sentinal git:(main) ✗ ');
    expect(tracker.getState()).toBe('idle-at-prompt');

    tracker.notifyCommandStarted('df -h');
    tracker.feedOutput('\r\nuser@host ~/dir ❯ ');
    expect(tracker.getState()).toBe('idle-at-prompt');
  });

  it('detects alternate screen buffer entry and exit (vim, htop, less)', () => {
    // Enter alternate screen buffer
    tracker.feedOutput('\x1b[?1049h[VIM SCREEN DATA]');
    expect(tracker.getState()).toBe('alternate-screen-buffer');
    expect(tracker.isAlternateBuffer()).toBe(true);
    expect(tracker.canSafelyInjectCtrlC()).toBe(false);

    // Redraws inside alternate buffer do not transition state
    tracker.feedOutput('Some output with $ inside vim buffer');
    expect(tracker.getState()).toBe('alternate-screen-buffer');

    // Exit alternate screen buffer
    tracker.feedOutput('\x1b[?1049l');
    expect(tracker.getState()).toBe('idle-at-prompt');
    expect(tracker.canSafelyInjectCtrlC()).toBe(true);
  });

  it('uses safeClearLine to inject \\x03 only when idle, and \\x15 (Ctrl+U) when process is running', async () => {
    const writeFn = vi.fn();

    // 1. Idle state
    const injected1 = await tracker.safeClearLine(writeFn);
    expect(injected1).toBe(true);
    expect(writeFn).toHaveBeenCalledWith('\x03');

    writeFn.mockClear();

    // 2. Process running state
    tracker.notifyCommandStarted('docker run -it ubuntu');
    const injected2 = await tracker.safeClearLine(writeFn);
    expect(injected2).toBe(false);
    // Did NOT send \x03 which would kill docker container!
    expect(writeFn).not.toHaveBeenCalledWith('\x03');
    // Sent line clear \x15 instead
    expect(writeFn).toHaveBeenCalledWith('\x15');
  });

  it('notifies subscribers on state changes', () => {
    const states: PtyState[] = [];
    const unsub = tracker.subscribe((state) => {
      states.push(state);
    });

    tracker.notifyCommandStarted('python server.py');
    tracker.notifyCommandFinished();

    expect(states).toEqual(['idle-at-prompt', 'process-running', 'idle-at-prompt']);
    unsub();
  });
});

describe('PtyStateTracker and the AI prefix', () => {
  it('does not treat the echoed ">" typed into a running program as a shell prompt', async () => {
    const { PtyStateTracker } = await import('./PtyStateTracker');
    const t = new PtyStateTracker();
    t.notifyCommandStarted('python3 -m http.server 8765');
    t.feedOutput('Serving HTTP on :: port 8765 ...\r\n');
    t.feedOutput('>');
    expect(t.isProcessRunning()).toBe(true);
    expect(t.canSafelyInjectCtrlC()).toBe(false);
    t.feedOutput('\r\nuser@mac app % ');
    expect(t.isIdleAtPrompt()).toBe(true);
  });
});
