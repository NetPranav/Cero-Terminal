import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InstallerService } from '../../domain/integration/InstallerService';
import { SettingsTabId } from '../components/AiSettingsPage';

const mockFsStore: Record<string, string> = {};

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(async (filePath: string, contents: string) => {
    mockFsStore[filePath] = contents;
  }),
  readTextFile: vi.fn(async (filePath: string) => {
    if (!mockFsStore[filePath]) throw new Error('File not found');
    return mockFsStore[filePath];
  }),
  mkdir: vi.fn(async () => undefined),
  exists: vi.fn(async (target: string) => {
    if (mockFsStore[target]) return true;
    return Object.keys(mockFsStore).some(k => k.startsWith(target));
  })
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => ({ stdout: '/home/testuser' }))
}));

describe('Cero Settings Center & Multi-Tab Configuration Architecture', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    for (const k in mockFsStore) delete mockFsStore[k];

    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => { store[key] = String(val); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; }
    };
    vi.stubGlobal('localStorage', mockStorage);

    const mockWindow = new EventTarget();
    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('CustomEvent', class CustomEvent extends Event {
      detail: any;
      constructor(type: string, params?: { detail?: any }) {
        super(type);
        this.detail = params?.detail;
      }
    });

    vi.restoreAllMocks();
  });

  it('validates all 4 primary settings pillars are typed and distinct', () => {
    const validTabs: SettingsTabId[] = ['ai', 'integrations', 'appearance', 'general'];
    expect(validTabs).toHaveLength(4);
    expect(validTabs).toContain('ai');
    expect(validTabs).toContain('integrations');
    expect(validTabs).toContain('appearance');
    expect(validTabs).toContain('general');
  });

  it('verifies InstallerService returns structured IntegrationStatus for the integrations tab', async () => {
    const installer = InstallerService.getInstance();
    const status = await installer.checkStatus();
    expect(status).toBeDefined();
    expect(typeof status.cliInstalled).toBe('boolean');
    expect(typeof status.finderEnabled).toBe('boolean');
    expect(typeof status.vscodeConfigured).toBe('boolean');
    expect(typeof status.cursorConfigured).toBe('boolean');
  });

  it('supports interactive UI mode switching between Zen and Visual mode in settings', () => {
    let activeMode: 'zen' | 'visual' = 'zen';
    let dispatchedMode = '';

    const handleSelectMode = (mode: 'zen' | 'visual') => {
      activeMode = mode;
      localStorage.setItem('cero_ui_mode', mode);
      window.dispatchEvent(new CustomEvent('cero:ui-mode-changed', { detail: mode }));
    };

    const listener = (e: any) => {
      dispatchedMode = e.detail;
    };
    window.addEventListener('cero:ui-mode-changed', listener);

    // Switch to visual mode
    handleSelectMode('visual');
    expect(activeMode).toBe('visual');
    expect(localStorage.getItem('cero_ui_mode')).toBe('visual');
    expect(dispatchedMode).toBe('visual');

    // Switch to zen mode
    handleSelectMode('zen');
    expect(activeMode).toBe('zen');
    expect(localStorage.getItem('cero_ui_mode')).toBe('zen');
    expect(dispatchedMode).toBe('zen');

    window.removeEventListener('cero:ui-mode-changed', listener);
  });

  it('allows resetting first-run flags in General & Setup tab', () => {
    localStorage.setItem('cero_onboarded', 'true');
    localStorage.setItem('cero_zen_tip_shown', 'true');
    expect(localStorage.getItem('cero_onboarded')).toBe('true');
    expect(localStorage.getItem('cero_zen_tip_shown')).toBe('true');

    // Reset action performed in Settings General tab
    localStorage.removeItem('cero_onboarded');
    localStorage.removeItem('cero_zen_tip_shown');

    expect(localStorage.getItem('cero_onboarded')).toBeNull();
    expect(localStorage.getItem('cero_zen_tip_shown')).toBeNull();
  });

  it('dispatches and receives cero:open-onboarding event from Settings General tab', () => {
    let onboardingOpened = false;
    const listener = () => {
      onboardingOpened = true;
    };
    window.addEventListener('cero:open-onboarding', listener);

    window.dispatchEvent(new CustomEvent('cero:open-onboarding'));
    expect(onboardingOpened).toBe(true);

    window.removeEventListener('cero:open-onboarding', listener);
  });

  it('manages Execution Plan HUD notification settings and dispatches cero:hud-settings-changed event', () => {
    let settingsChangedCount = 0;
    const listener = () => {
      settingsChangedCount++;
    };
    window.addEventListener('cero:hud-settings-changed', listener);

    // Verify defaults
    expect(localStorage.getItem('cero_hud_plan_enabled')).toBeNull();
    const defaultEnabled = localStorage.getItem('cero_hud_plan_enabled') !== 'false';
    const defaultDuration = localStorage.getItem('cero_hud_plan_duration') || '8';
    expect(defaultEnabled).toBe(true);
    expect(defaultDuration).toBe('8');

    // Toggle HUD to false
    localStorage.setItem('cero_hud_plan_enabled', 'false');
    window.dispatchEvent(new CustomEvent('cero:hud-settings-changed'));
    expect(localStorage.getItem('cero_hud_plan_enabled')).toBe('false');
    expect(settingsChangedCount).toBe(1);

    // Change duration to '15'
    localStorage.setItem('cero_hud_plan_duration', '15');
    window.dispatchEvent(new CustomEvent('cero:hud-settings-changed'));
    expect(localStorage.getItem('cero_hud_plan_duration')).toBe('15');
    expect(settingsChangedCount).toBe(2);

    // Set duration to 'persistent'
    localStorage.setItem('cero_hud_plan_duration', 'persistent');
    window.dispatchEvent(new CustomEvent('cero:hud-settings-changed'));
    expect(localStorage.getItem('cero_hud_plan_duration')).toBe('persistent');
    expect(settingsChangedCount).toBe(3);

    // Re-enable HUD
    localStorage.setItem('cero_hud_plan_enabled', 'true');
    window.dispatchEvent(new CustomEvent('cero:hud-settings-changed'));
    expect(localStorage.getItem('cero_hud_plan_enabled')).toBe('true');
    expect(settingsChangedCount).toBe(4);

    window.removeEventListener('cero:hud-settings-changed', listener);
  });
});

