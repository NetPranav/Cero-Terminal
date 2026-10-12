import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionPersistenceEngine } from './SessionPersistenceEngine';

describe('SessionPersistenceEngine (Issue 5.3)', () => {
  let engine: SessionPersistenceEngine;
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    const mockStorage = {
      getItem: (key: string) => mockStore[key] || null,
      setItem: (key: string, val: string) => { mockStore[key] = val; },
      removeItem: (key: string) => { delete mockStore[key]; }
    };
    vi.stubGlobal('localStorage', mockStorage);
    engine = new SessionPersistenceEngine();
  });

  it('sanitizes stale session IDs from nested split pane trees', () => {
    const splitTree = {
      type: 'split',
      data: {
        id: 'split_1',
        direction: 'vertical',
        pane1: { type: 'terminal', data: { id: 'p1', sessionId: 'stale_session_123' } },
        pane2: {
          type: 'split',
          data: {
            id: 'split_2',
            direction: 'horizontal',
            pane1: { type: 'terminal', data: { id: 'p2', sessionId: 'stale_session_456' } },
            pane2: { type: 'terminal', data: { id: 'p3', sessionId: 'stale_session_789' } }
          }
        }
      }
    };

    const sanitized = engine.sanitizePaneTree(splitTree);
    expect(sanitized.data.pane1.data.sessionId).toBeUndefined();
    expect(sanitized.data.pane1.data.id).toBe('p1');
    expect(sanitized.data.pane2.data.pane1.data.sessionId).toBeUndefined();
    expect(sanitized.data.pane2.data.pane2.data.sessionId).toBeUndefined();
  });

  it('serializes and restores multi-tab and split layouts', async () => {
    const tabs = [
      { id: 't1', name: 'Frontend (Vite)', rootPane: { type: 'terminal', data: { id: 'p1', sessionId: 'sess_1' } } },
      { id: 't2', name: 'Backend (FastAPI)', rootPane: { type: 'terminal', data: { id: 'p2', sessionId: 'sess_2' } } }
    ];
    const panePaths = { p1: '~/workspace/frontend', p2: '~/workspace/backend' };

    // Save synchronously for test
    engine.saveSession(tabs, 't2', panePaths, 0);

    // Wait for timer
    await new Promise(r => setTimeout(r, 10));

    const restored = engine.loadSession();
    expect(restored).not.toBeNull();
    expect(restored?.tabs.length).toBe(2);
    expect(restored?.activeTabId).toBe('t2');
    expect(restored?.tabs[0].name).toBe('Frontend (Vite)');
    expect(restored?.tabs[0].rootPane.data.sessionId).toBeUndefined();
    expect(restored?.panePaths.p1).toBe('~/workspace/frontend');
    expect(restored?.panePaths.p2).toBe('~/workspace/backend');
  });

  it('handles empty or missing storage safely', () => {
    mockStore = {};
    expect(engine.loadSession()).toBeNull();
  });

  it('preserves activePaneId across save and restore', async () => {
    const tabs = [
      { id: 't1', name: 'Dev', rootPane: { type: 'terminal', data: { id: 'pane_alpha' } } }
    ];
    engine.saveSession(tabs, 't1', { pane_alpha: '/opt/projects' }, 'pane_alpha', 0);
    await new Promise(r => setTimeout(r, 10));

    const restored = engine.loadSession();
    expect(restored).not.toBeNull();
    expect(restored?.activePaneId).toBe('pane_alpha');
    expect(restored?.panePaths['pane_alpha']).toBe('/opt/projects');
  });

  it('safely handles corrupted or invalid JSON in storage', () => {
    mockStore['cero_session_state'] = '{ "invalid_json": true, ... corrupted';
    expect(engine.loadSession()).toBeNull();
  });

  it('safely handles malformed schema (missing tabs array)', () => {
    mockStore['cero_session_state'] = JSON.stringify({ version: 1, tabs: "not_an_array" });
    expect(engine.loadSession()).toBeNull();
  });

  it('clears stored session on clearSession call', () => {
    mockStore['cero_session_state'] = JSON.stringify({ version: 1, tabs: [] });
    engine.clearSession();
    expect(mockStore['cero_session_state']).toBeUndefined();
  });

  it('saves and loads named workspace sessions', async () => {
    const tabs = [
      { id: 't1', name: 'Monitoring', rootPane: { type: 'terminal', data: { id: 'p_mon' } } }
    ];
    const saved = await engine.saveNamedSession('prod-cluster', tabs, 't1', { p_mon: '/var/log' });
    expect(saved).toBe(true);

    const loaded = await engine.loadNamedSession('prod-cluster');
    expect(loaded).not.toBeNull();
    expect(loaded?.tabs[0].name).toBe('Monitoring');
    expect(loaded?.panePaths['p_mon']).toBe('/var/log');

    const sessions = await engine.listSavedSessions();
    expect(sessions).toContain('prod-cluster');
  });

  describe('resolveInitialSessionState & CLI startup synchronization', () => {
    it('overrides restored session path for active pane when initialPath is provided', () => {
      const savedSession = {
        version: 1,
        tabs: [
          { id: 'tab_prev', name: 'Terminal 1', rootPane: { type: 'terminal', data: { id: 'pane_prev' } } }
        ],
        activeTabId: 'tab_prev',
        activePaneId: 'pane_prev',
        panePaths: { pane_prev: '/home/user/stale-old-dir' },
        timestamp: Date.now()
      };

      const resolved = engine.resolveInitialState('/home/user/new-requested-folder');
      // Set storage to savedSession first
      mockStore['cero_session_state'] = JSON.stringify(savedSession);
      const resolvedFromStorage = engine.resolveInitialState('/home/user/new-requested-folder');

      expect(resolvedFromStorage.activePaneId).toBe('pane_prev');
      expect(resolvedFromStorage.panePaths['pane_prev']).toBe('/home/user/new-requested-folder');
      expect(resolvedFromStorage.tabs.length).toBe(1);
    });

    it('preserves restored session paths when no initialPath is passed', () => {
      const savedSession = {
        version: 1,
        tabs: [
          { id: 'tab_prev', name: 'Terminal 1', rootPane: { type: 'terminal', data: { id: 'pane_prev' } } }
        ],
        activeTabId: 'tab_prev',
        activePaneId: 'pane_prev',
        panePaths: { pane_prev: '/home/user/stale-old-dir' },
        timestamp: Date.now()
      };
      mockStore['cero_session_state'] = JSON.stringify(savedSession);

      const resolved = engine.resolveInitialState();
      expect(resolved.activePaneId).toBe('pane_prev');
      expect(resolved.panePaths['pane_prev']).toBe('/home/user/stale-old-dir');
    });

    it('correctly targets active pane inside complex split pane tree', () => {
      const savedSession = {
        version: 1,
        tabs: [
          {
            id: 'tab_split',
            name: 'Split Work',
            rootPane: {
              type: 'split',
              data: {
                id: 'split_root',
                direction: 'horizontal',
                pane1: { type: 'terminal', data: { id: 'pane_left' } },
                pane2: { type: 'terminal', data: { id: 'pane_right' } }
              }
            }
          }
        ],
        activeTabId: 'tab_split',
        activePaneId: 'pane_right',
        panePaths: { pane_left: '/var/log', pane_right: '/home/user/workspace' },
        timestamp: Date.now()
      };
      mockStore['cero_session_state'] = JSON.stringify(savedSession);

      const resolved = engine.resolveInitialState('/home/user/target-split');
      expect(resolved.activePaneId).toBe('pane_right');
      expect(resolved.panePaths['pane_right']).toBe('/home/user/target-split');
      expect(resolved.panePaths['pane_left']).toBe('/var/log');
    });

    it('creates fresh tab and pane at target initialPath when no saved session exists', () => {
      mockStore = {};
      const resolved = engine.resolveInitialState('/home/user/from-file-manager');
      expect(resolved.tabs.length).toBe(1);
      expect(resolved.activeTabId).toBe('tab_initial');
      expect(resolved.panePaths[resolved.activePaneId]).toBe('/home/user/from-file-manager');
    });
  });
});

