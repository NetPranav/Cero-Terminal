import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UrlSchemeHandler } from './UrlSchemeHandler';
import { SessionPersistenceEngine, resolveInitialSessionState } from '../session/SessionPersistenceEngine';

describe('Startup Path Override & File Manager Integration', () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    const mockStorage = {
      getItem: (key: string) => mockStore[key] || null,
      setItem: (key: string, val: string) => { mockStore[key] = val; },
      removeItem: (key: string) => { delete mockStore[key]; }
    };
    vi.stubGlobal('localStorage', mockStorage);
  });

  it('extracts folder path from Linux file manager CLI arguments (%f or direct path)', () => {
    const handler = UrlSchemeHandler.getInstance();
    
    // Nautilus / Thunar argument pattern
    const actions1 = handler.parseMany(['/home/user/code/sentinel-project']);
    expect(actions1.length).toBe(1);
    expect(actions1[0].type).toBe('open');
    expect(actions1[0].path).toBe('/home/user/code/sentinel-project');

    // FreeDesktop file:// URI pattern
    const actions2 = handler.parseMany(['file:///home/user/workspace/microservice']);
    expect(actions2.length).toBe(1);
    expect(actions2[0].type).toBe('open');
    expect(actions2[0].path).toBe('/home/user/workspace/microservice');
  });

  it('overrides stale restored session path for active pane when opening folder from file manager', () => {
    const previousSession = {
      version: 1,
      tabs: [
        {
          id: 'tab_work',
          name: 'Terminal 1',
          rootPane: {
            type: 'terminal',
            data: { id: 'pane_work_1' }
          }
        },
        {
          id: 'tab_logs',
          name: 'Logs',
          rootPane: {
            type: 'terminal',
            data: { id: 'pane_logs_1' }
          }
        }
      ],
      activeTabId: 'tab_work',
      activePaneId: 'pane_work_1',
      panePaths: {
        pane_work_1: '/home/user/old-project',
        pane_logs_1: '/var/log'
      },
      timestamp: Date.now()
    };

    mockStore['sentinel_session_state'] = JSON.stringify(previousSession);

    // Simulate startup with folder argument from file manager
    const newRequestedFolder = '/home/user/new-project-from-nautilus';
    const state = SessionPersistenceEngine.getInstance().resolveInitialState(newRequestedFolder);

    // Active pane path must be the newly requested folder
    expect(state.panePaths['pane_work_1']).toBe('/home/user/new-project-from-nautilus');

    // Secondary tab path must be preserved
    expect(state.panePaths['pane_logs_1']).toBe('/var/log');

    // Active tab and pane IDs must remain focused
    expect(state.activeTabId).toBe('tab_work');
    expect(state.activePaneId).toBe('pane_work_1');
  });

  it('preserves existing session paths on normal application startup without CLI path arguments', () => {
    const previousSession = {
      version: 1,
      tabs: [
        {
          id: 'tab_work',
          name: 'Terminal 1',
          rootPane: {
            type: 'terminal',
            data: { id: 'pane_work_1' }
          }
        }
      ],
      activeTabId: 'tab_work',
      activePaneId: 'pane_work_1',
      panePaths: {
        pane_work_1: '/home/user/my-ongoing-work'
      },
      timestamp: Date.now()
    };

    mockStore['sentinel_session_state'] = JSON.stringify(previousSession);

    // Normal launch without arguments
    const state = SessionPersistenceEngine.getInstance().resolveInitialState(undefined);

    expect(state.panePaths['pane_work_1']).toBe('/home/user/my-ongoing-work');
    expect(state.activeTabId).toBe('tab_work');
  });

  it('overrides nested split active pane path when opening folder from file manager', () => {
    const previousSession = {
      version: 1,
      tabs: [
        {
          id: 'tab_split',
          name: 'Terminal 1',
          rootPane: {
            type: 'split',
            data: {
              id: 'split_1',
              direction: 'vertical',
              ratio: 0.5,
              pane1: { type: 'terminal', data: { id: 'pane_left' } },
              pane2: {
                type: 'split',
                data: {
                  id: 'split_2',
                  direction: 'horizontal',
                  ratio: 0.5,
                  pane1: { type: 'terminal', data: { id: 'pane_right_top' } },
                  pane2: { type: 'terminal', data: { id: 'pane_right_bottom' } }
                }
              }
            }
          }
        }
      ],
      activeTabId: 'tab_split',
      activePaneId: 'pane_right_bottom',
      panePaths: {
        pane_left: '/home/user/left',
        pane_right_top: '/home/user/top',
        pane_right_bottom: '/home/user/old-bottom'
      },
      timestamp: Date.now()
    };

    mockStore['sentinel_session_state'] = JSON.stringify(previousSession);

    const state = SessionPersistenceEngine.getInstance().resolveInitialState('/home/user/new-target-dir');

    // Only the active pane in the nested split must be updated
    expect(state.panePaths['pane_right_bottom']).toBe('/home/user/new-target-dir');
    expect(state.panePaths['pane_left']).toBe('/home/user/left');
    expect(state.panePaths['pane_right_top']).toBe('/home/user/top');
    expect(state.activePaneId).toBe('pane_right_bottom');
  });

  it('initializes default pane directly with startup target path when no previous session exists', () => {
    const state = SessionPersistenceEngine.getInstance().resolveInitialState('/home/user/first-launch-dir');

    expect(state.tabs.length).toBe(1);
    expect(state.activePaneId).toBeDefined();
    expect(state.panePaths[state.activePaneId]).toBe('/home/user/first-launch-dir');
  });
});
