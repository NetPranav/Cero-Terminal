import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelManager } from './ModelManager';
import type { ModelProvider } from '../provider/Provider';

function fakeProvider(providerId: string, available: boolean | (() => boolean)): ModelProvider {
  return {
    providerId,
    providerName: providerId,
    isAvailable: async () => (typeof available === 'function' ? available() : available),
    listModels: async () => [],
    hasModel: async () => true,
    pullModel: async () => true,
    generate: async () => ({ text: '' }) as any,
  };
}

function installBrowserGlobals() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
  const bus = new EventTarget();
  vi.stubGlobal('window', {
    addEventListener: bus.addEventListener.bind(bus),
    removeEventListener: bus.removeEventListener.bind(bus),
    dispatchEvent: bus.dispatchEvent.bind(bus),
  });
  return { store, bus };
}

describe('AI provider and model survive a restart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('restores the selected provider and model into a fresh manager', async () => {
    installBrowserGlobals();
    const first = new ModelManager([fakeProvider('embedded', true), fakeProvider('ollama', true)]);
    await first.setActiveProviderId('ollama', 'llama3.2:3b');

    // "Restart": a brand new manager over the same storage
    const second = new ModelManager([fakeProvider('embedded', true), fakeProvider('ollama', true)]);
    await second.initialize();

    expect(second.getActiveProviderId()).toBe('ollama');
    expect(second.getActiveModel().modelId).toBe('llama3.2:3b');
  });

  it('announces the restored choice immediately, so the status bar never keeps showing the default', async () => {
    const { bus } = installBrowserGlobals();
    const first = new ModelManager([fakeProvider('embedded', true), fakeProvider('ollama', true)]);
    await first.setActiveProviderId('ollama', 'llama3.2:3b');

    // Provider is down at startup: the event must not depend on the background check succeeding
    const second = new ModelManager([fakeProvider('embedded', true), fakeProvider('ollama', false)]);
    const seen: string[] = [];
    bus.addEventListener('cero:ai-status-changed', () => seen.push(second.getActiveModel().providerId));
    await second.initialize();

    // Fired during initialize(), before the background availability check finishes
    expect(seen).toEqual(['ollama']);
  });

  it('hands out a fresh snapshot after verification so subscribers re-render', async () => {
    installBrowserGlobals();
    let up = false;
    const first = new ModelManager([fakeProvider('embedded', true), fakeProvider('ollama', true)]);
    await first.setActiveProviderId('ollama', 'llama3.2:3b');

    const second = new ModelManager([fakeProvider('embedded', true), fakeProvider('ollama', () => up)]);
    await second.initialize();
    const before = second.getActiveModel();
    expect(before.isReady).toBe(false);

    up = true;
    await vi.advanceTimersByTimeAsync(2100);
    const after = second.getActiveModel();
    expect(after.isReady).toBe(true);
    expect(after).not.toBe(before);
  });

  it('announces the auto-detected model too (nothing saved yet)', async () => {
    const { bus } = installBrowserGlobals();
    const mgr = new ModelManager([fakeProvider('embedded', false), fakeProvider('ollama', true)]);
    let announced = 0;
    bus.addEventListener('cero:ai-status-changed', () => announced++);
    await mgr.initialize();
    expect(announced).toBeGreaterThan(0);
  });

  it('keeps the saved choice (not the default) when the provider is down at startup', async () => {
    installBrowserGlobals();
    const first = new ModelManager([fakeProvider('embedded', true), fakeProvider('ollama', true)]);
    await first.setActiveProviderId('ollama', 'llama3.2:3b');

    const second = new ModelManager([fakeProvider('embedded', true), fakeProvider('ollama', false)]);
    await second.initialize();
    await vi.advanceTimersByTimeAsync(12_000);

    expect(second.getActiveProviderId()).toBe('ollama');
    expect(second.getActiveModel().isReady).toBe(false);
    expect(second.getActiveModel().unavailableReason).toMatch(/Ollama/);
    expect(localStorage.getItem(ModelManager.PREF_PROVIDER_KEY)).toBe('ollama');
  });
});
