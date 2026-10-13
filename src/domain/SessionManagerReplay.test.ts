import { describe, it, expect, vi } from 'vitest';
import { SessionManager, fallbackNotice } from './SessionManager';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('SessionManager replay', () => {
  it('marks buffered history as replay and does not grow the buffer when a pane remounts', () => {
    const sm = SessionManager.getInstance() as any;
    const id = `test-${Date.now()}`;
    sm.outputListeners.set(id, []);
    sm.recordOutput(id, 'line 1\r\n');
    sm.recordOutput(id, 'line 2\r\n');

    // A remounted pane that (like TerminalView) records what it writes, but only for live output
    const received: Array<[string, boolean | undefined]> = [];
    const callback = vi.fn((data: Uint8Array, replay?: boolean) => {
      received.push([new TextDecoder().decode(data), replay]);
      if (!replay) sm.recordOutput(id, data);
    });
    sm.onOutput(id, callback);

    expect(received).toEqual([['line 1\r\n', true], ['line 2\r\n', true]]);
    expect(sm.sessionBuffers.get(id)).toHaveLength(2);
  });
});

describe('SessionManager displays', () => {
  it('sends text to the view currently showing the session, even from an older view', () => {
    const sm = SessionManager.getInstance();
    const id = `disp-${Date.now()}`;
    const oldView = vi.fn();
    const newView = vi.fn();
    const detachOld = sm.attachDisplay(id, oldView);
    sm.attachDisplay(id, newView);
    // The old view unmounts after the new one attached: it must not detach the new view
    detachOld();
    expect(sm.display(id, 'Done.')).toBe(true);
    expect(newView).toHaveBeenCalledWith('Done.');
    expect(oldView).not.toHaveBeenCalled();
  });

  it('reports when no view is attached', () => {
    expect(SessionManager.getInstance().display('nobody', 'x')).toBe(false);
  });
});

describe('shell fallback notice', () => {
  it('names the shell that was used and why the requested one was not', () => {
    const text = fallbackNotice({
      session_id: 's1',
      requested: 'Z:\\gone\\bash.exe',
      used: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      reason: 'it was not found',
    });
    expect(text).toContain('Z:\\gone\\bash.exe');
    expect(text).toContain('powershell.exe');
    expect(text).toContain('it was not found');
    expect(text.startsWith('\r\n')).toBe(true);
    expect(text.endsWith('\r\n')).toBe(true);
  });
});

describe('SessionManager createSession', () => {
  it('keeps output that arrived before the session id was returned', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const sm = SessionManager.getInstance() as any;
    const id = `early-${Date.now()}`;
    vi.mocked(invoke).mockImplementationOnce(async () => {
      // the backend already printed something (a fallback notice, the first prompt) before invoke resolved
      sm.recordOutput(id, 'first output\r\n');
      return id;
    });
    await sm.createSession(24, 80);
    const received: string[] = [];
    sm.onOutput(id, (data: Uint8Array) => received.push(new TextDecoder().decode(data)));
    expect(received).toEqual(['first output\r\n']);
  });
});
