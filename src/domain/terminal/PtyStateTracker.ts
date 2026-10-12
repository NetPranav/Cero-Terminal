/**
 * PtyStateTracker.ts — PTY Session State Tracking & Safe Cancellation Guard
 * 
 * Part of Phase 0.5 (Roadmap item 0.5.3):
 * Tracks whether a terminal PTY session is:
 *  - 'idle-at-prompt': Ready for input at a prompt line. Safe to inject ^C to clear the line.
 *  - 'process-running': A foreground program/process is actively running.
 *  - 'alternate-screen-buffer': Fullscreen interactive TUI (vim, htop, less, tmux).
 * 
 * Prevents Cero from injecting SIGINT (\x03) into active foreground workloads.
 */

export type PtyState = 'idle-at-prompt' | 'process-running' | 'alternate-screen-buffer';

export type PtyStateListener = (state: PtyState) => void;

export class PtyStateTracker {
  private state: PtyState = 'idle-at-prompt';
  private previousStateBeforeAlt: PtyState = 'idle-at-prompt';
  private listeners: Set<PtyStateListener> = new Set();
  private lastActivityTimestamp: number = Date.now();
  private outputBuffer: string = '';
  /** Recent raw output, control sequences included (see feedOutput) */
  private rawTail: string = '';

  constructor(initialState: PtyState = 'idle-at-prompt') {
    this.state = initialState;
  }

  public getState(): PtyState {
    return this.state;
  }

  public isAlternateBuffer(): boolean {
    return this.state === 'alternate-screen-buffer';
  }

  public isProcessRunning(): boolean {
    return this.state === 'process-running';
  }

  public isIdleAtPrompt(): boolean {
    return this.state === 'idle-at-prompt';
  }

  /**
   * Only returns true if it is safe to inject ^C (SIGINT) to clear a shell line
   * without killing a legitimate active foreground process or corrupting a full-screen TUI.
   */
  public canSafelyInjectCtrlC(): boolean {
    return this.state === 'idle-at-prompt';
  }

  /**
   * Notify that the user submitted a command to the shell.
   * Transitions to 'process-running'.
   */
  public notifyCommandStarted(command: string): void {
    if (this.state === 'alternate-screen-buffer') return;
    
    // Harmless built-in navigation or empty enters don't represent long processes
    const trimmed = command.trim();
    if (!trimmed) {
      this.setState('idle-at-prompt');
      return;
    }

    this.setState('process-running');
  }

  /**
   * Explicitly notify that a process has exited and the prompt returned.
   */
  public notifyCommandFinished(): void {
    if (this.state === 'alternate-screen-buffer') return;
    this.setState('idle-at-prompt');
  }

  /**
   * Feed raw stdout/stderr output from the PTY to update state heuristics.
   */
  public feedOutput(chunk: string): void {
    if (!chunk) return;
    this.lastActivityTimestamp = Date.now();

    // 1. Detect alternate screen buffer sequences
    if (chunk.includes('\x1b[?1049h') || chunk.includes('\x1b[?47h')) {
      if (this.state !== 'alternate-screen-buffer') {
        this.previousStateBeforeAlt = this.state;
      }
      this.setState('alternate-screen-buffer');
      return;
    }

    if (chunk.includes('\x1b[?1049l') || chunk.includes('\x1b[?47l')) {
      this.setState(this.previousStateBeforeAlt === 'alternate-screen-buffer' ? 'idle-at-prompt' : this.previousStateBeforeAlt);
      return;
    }

    // If currently inside alternate buffer, do not parse prompt strings
    if (this.state === 'alternate-screen-buffer') {
      return;
    }

    // 2. Accumulate clean text for prompt detection. Control sequences are removed from the raw
    // tail, not per chunk, so one split across two reads is still removed whole. Shells print
    // long invisible ones on the prompt line (systemd's OSC 3008 command markers, the window
    // title): left in, they pushed the prompt character past the 100-column check below, and
    // the pane counted as running a program forever after its first command.
    this.rawTail = (this.rawTail + chunk).slice(-4000);
    this.outputBuffer = stripControlSequences(this.rawTail).slice(-500);

    // Heuristic: Check if output ends with a common shell prompt sequence
    // Examples: 'user@host:~$ ', '[user@host ~]# ', '➜  sentinal git:(main) ✗ ', 'user@host ~/dir ❯ '
    const promptRegex = /(?:[\r\n]|^)[^\r\n]{0,100}[$#%❯>➜✗\u2713\u2717]\s*$/;
    // A lone ">" is the echo of the AI prefix typed into a running program (or a continuation
    // prompt), not a shell prompt: treating it as one made the request ^C the program
    const lastLine = this.outputBuffer.split(/[\r\n]/).pop() || '';
    if (promptRegex.test(this.outputBuffer) && lastLine.trim() !== '>') {
      this.setState('idle-at-prompt');
    }
  }

  /**
   * Safely attempts to clear the current line without sending SIGINT if a process is running.
   * If idle, injects \x03.
   * If a process is running, injects line-clear (\x15: Ctrl+U) instead of SIGINT (\x03).
   */
  public async safeClearLine(writeFn: (data: string) => Promise<any> | void): Promise<boolean> {
    if (this.canSafelyInjectCtrlC()) {
      await writeFn('\x03');
      return true;
    }

    // Not safe to kill foreground process: clear input buffer via Ctrl+U instead of SIGINT
    await writeFn('\x15');
    return false;
  }

  public subscribe(listener: PtyStateListener): () => void {
    this.listeners.add(listener);
    try {
      listener(this.state);
    } catch {
      // ignore initial dispatch error
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setState(nextState: PtyState): void {
    if (this.state !== nextState) {
      this.state = nextState;
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[PtyStateTracker] Error in listener:', err);
      }
    }
  }
}

/**
 * Visible text only: OSC (window title, OSC 3008 / 133 / 7 markers), DCS/APC/PM strings, CSI
 * (colours, cursor moves, private modes such as \x1b[?2004h), charset selects and other
 * two-byte escapes. An OSC still being received at the end of the output is dropped too.
 */
export function stripControlSequences(text: string): string {
  return text
    .replace(/\x1b[\]PX^_][\s\S]*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[\]PX^_][^\x07\x1b]*$/, '')
    .replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '')
    .replace(/\x1b[()*+][A-Za-z0-9]/g, '')
    .replace(/\x1b[=>78DEHMNOc]/g, '');
}
