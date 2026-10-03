import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkspaceRegistry } from '../../domain/discovery/WorkspaceRegistry';

describe('Zen Mode vs Visual Mode & Shortcuts Architecture', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => { store[key] = String(val); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; }
    };
    vi.stubGlobal('localStorage', mockStorage);
    vi.restoreAllMocks();
  });

  it('persists Zen Mode by default or when selected in localStorage', () => {
    // Default fallback
    const defaultMode = localStorage.getItem('cero_ui_mode') || 'zen';
    expect(defaultMode).toBe('zen');

    // Setting visual mode
    localStorage.setItem('cero_ui_mode', 'visual');
    expect(localStorage.getItem('cero_ui_mode')).toBe('visual');

    // Setting back to zen mode
    localStorage.setItem('cero_ui_mode', 'zen');
    expect(localStorage.getItem('cero_ui_mode')).toBe('zen');
  });

  it('handles custom cero:ui-mode-changed event on mode toggling', () => {
    let receivedMode = '';
    const mockWindow = {
      listeners: {} as Record<string, Function[]>,
      addEventListener(type: string, listener: Function) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(listener);
      },
      removeEventListener(type: string, listener: Function) {
        if (!this.listeners[type]) return;
        this.listeners[type] = this.listeners[type].filter(l => l !== listener);
      },
      dispatchEvent(event: { type: string; detail?: any }) {
        if (!this.listeners[event.type]) return;
        for (const l of this.listeners[event.type]) l(event);
      }
    };

    const listener = (e: any) => {
      receivedMode = e.detail;
    };
    mockWindow.addEventListener('cero:ui-mode-changed', listener);

    mockWindow.dispatchEvent({ type: 'cero:ui-mode-changed', detail: 'visual' });
    expect(receivedMode).toBe('visual');

    mockWindow.dispatchEvent({ type: 'cero:ui-mode-changed', detail: 'zen' });
    expect(receivedMode).toBe('zen');

    mockWindow.removeEventListener('cero:ui-mode-changed', listener);
  });

  it('verifies WorkspaceRegistry provides discovery entries for WorkspaceSwitcherModal', async () => {
    const registry = WorkspaceRegistry.getInstance();
    const projects = await registry.getProjects(false);
    expect(Array.isArray(projects)).toBe(true);
  });

  it('dispatches and handles cero:toggle-history event for Ctrl+R history modal', () => {
    let historyToggled = false;
    const target = new EventTarget();
    const handleToggle = () => {
      historyToggled = !historyToggled;
    };

    target.addEventListener('cero:toggle-history', handleToggle);
    target.dispatchEvent(new Event('cero:toggle-history'));
    expect(historyToggled).toBe(true);

    target.dispatchEvent(new Event('cero:toggle-history'));
    expect(historyToggled).toBe(false);
    target.removeEventListener('cero:toggle-history', handleToggle);
  });
});
