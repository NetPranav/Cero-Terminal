import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface PtyOutputEvent {
  session_id: string;
  data: number[]; // Sent as array of u8 from Rust
}

/** `replay` is true for buffered history re-sent to a remounted pane (not new output) */
export type TerminalOutputCallback = (data: Uint8Array, replay?: boolean) => void;

export class SessionManager {
  private static instance: SessionManager;
  private outputListeners: Map<string, TerminalOutputCallback[]> = new Map();
  private sessionBuffers: Map<string, Uint8Array[]> = new Map();

  private constructor() {
    // Outside the desktop app (CLI, tests) there is no Tauri event bus; nothing to listen to
    this.initListeners().catch(() => {});
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  private async initListeners() {
    await listen<PtyOutputEvent>('pty-output', (event) => {
      const { session_id, data } = event.payload;
      const u8Data = new Uint8Array(data);

      // Buffer incoming output so it persists across pane splitting and React component remounts
      this.recordOutput(session_id, u8Data, false);

      const callbacks = this.outputListeners.get(session_id);
      if (callbacks) {
        callbacks.forEach(cb => cb(u8Data));
      }
    });

    await listen<string>('pty-exit', (event) => {
      const session_id = event.payload;
      this.outputListeners.delete(session_id);
      this.sessionBuffers.delete(session_id);
    });
  }

  public recordOutput(sessionId: string, data: string | Uint8Array, notifyListeners = false): void {
    if (!this.sessionBuffers.has(sessionId)) {
      this.sessionBuffers.set(sessionId, []);
    }
    const buffer = this.sessionBuffers.get(sessionId)!;
    const u8Data = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    buffer.push(u8Data);
    // Limit buffer to last 3000 chunks to prevent RAM overflow while retaining deep session history
    if (buffer.length > 3000) {
      buffer.shift();
    }
    if (notifyListeners) {
      const callbacks = this.outputListeners.get(sessionId);
      if (callbacks) {
        callbacks.forEach(cb => cb(u8Data));
      }
    }
  }

  public async createSession(
    rows: number, 
    cols: number,
    shell?: string,
    cwd?: string,
    loginShell = true,
    args?: string[],
    env?: Record<string, string>
  ): Promise<string> {
    const sessionId = await invoke<string>('spawn_pty', { 
      rows, 
      cols, 
      shell: shell || null, 
      cwd: cwd || null, 
      loginShell: loginShell, 
      args: args || null, 
      env: env || null 
    });
    this.outputListeners.set(sessionId, []);
    this.sessionBuffers.set(sessionId, []);
    return sessionId;
  }

  public onOutput(sessionId: string, callback: TerminalOutputCallback): void {
    const callbacks = this.outputListeners.get(sessionId);
    if (callbacks && !callbacks.includes(callback)) {
      callbacks.push(callback);
    }
    // Replay existing buffered output immediately so screen contents restore on component mount/split.
    // Marked as replay: the pane draws it but must not record it again (history would double on
    // every layout change) or diagnose it as new output.
    const existingBuffer = this.sessionBuffers.get(sessionId);
    if (existingBuffer && existingBuffer.length > 0) {
      [...existingBuffer].forEach(chunk => callback(chunk, true));
    }
  }

  /**
   * The terminal view currently showing each session. A pane is rebuilt when the layout changes
   * (a split, a closed neighbour); an agent request started in the old view keeps running and its
   * output must reach the new view, not the discarded one.
   */
  private displays = new Map<string, (text: string) => void>();

  /** Register the view showing a session; returns a detach that only removes this view. */
  public attachDisplay(sessionId: string, write: (text: string) => void): () => void {
    this.displays.set(sessionId, write);
    return () => {
      if (this.displays.get(sessionId) === write) this.displays.delete(sessionId);
    };
  }

  /** Draw Sentinel's own text in the session's current view. False when no view is attached. */
  public display(sessionId: string, text: string): boolean {
    const write = this.displays.get(sessionId);
    if (!write) return false;
    write(text);
    return true;
  }

  public offOutput(sessionId: string, callback: TerminalOutputCallback): void {
    const callbacks = this.outputListeners.get(sessionId);
    if (callbacks) {
      this.outputListeners.set(sessionId, callbacks.filter(cb => cb !== callback));
    }
  }

  public async write(sessionId: string, data: string): Promise<void> {
    await invoke('write_pty', { sessionId, data });
  }

  public async resize(sessionId: string, rows: number, cols: number): Promise<void> {
    await invoke('resize_pty', { sessionId, rows, cols });
  }

  public async kill(sessionId: string): Promise<void> {
    await invoke('kill_pty', { sessionId });
    this.outputListeners.delete(sessionId);
  }
}
