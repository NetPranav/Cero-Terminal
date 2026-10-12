import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CloudApiProvider } from './CloudApiProvider';
import { setSecretBackend, type SecretBackend } from './SecretStore';

const STORAGE_KEY = 'cero_cloud_api_keys';

function fakeKeychain(opts: { failWrites?: boolean; lie?: boolean } = {}): SecretBackend & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    async set(service, key, value) {
      if (opts.failWrites) throw new Error('keychain locked');
      items.set(`${service}:${key}`, opts.lie ? 'something else' : value);
    },
    async get(service, key) { return items.get(`${service}:${key}`) ?? null; },
    async delete(service, key) { items.delete(`${service}:${key}`); },
    async kind() { return 'keychain'; },
  };
}

const store = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

function resetProvider(): CloudApiProvider {
  (CloudApiProvider as any).instance = undefined;
  return CloudApiProvider.getInstance();
}

const stored = () => JSON.parse(store.get(STORAGE_KEY) || '{}');
const cfg = (apiKey: string) => ({ serviceId: 'openai' as const, apiKey, baseUrl: 'https://api.openai.com/v1', modelId: 'm', displayName: 'OpenAI', isActive: true });

describe('API keys and the keychain', () => {
  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = fakeLocalStorage;
  });
  afterEach(() => {
    setSecretBackend(null);
    delete (globalThis as any).localStorage;
  });

  it('moves a key out of browser storage only after the keychain holds it', async () => {
    const keychain = fakeKeychain();
    setSecretBackend(keychain);
    store.set(STORAGE_KEY, JSON.stringify({ openai: cfg('sk-old') }));
    const provider = resetProvider();
    const result = await provider.hydrateSecrets();
    expect(result).toMatchObject({ failed: 0 });
    expect(result.migrated).toBeGreaterThan(0);
    expect(keychain.items.get('cero.cloud_api:openai')).toBe('sk-old');
    expect(stored().openai.apiKey).toBe('');
    // the app still sees the key
    expect(provider.getActiveConfig()?.apiKey).toBe('sk-old');
  });

  it('after a restart the key comes back from the keychain', async () => {
    const keychain = fakeKeychain();
    setSecretBackend(keychain);
    store.set(STORAGE_KEY, JSON.stringify({ openai: cfg('sk-old') }));
    await resetProvider().hydrateSecrets();
    const second = resetProvider();
    await second.hydrateSecrets();
    expect(second.getActiveConfig()?.apiKey).toBe('sk-old');
  });

  it('a failing keychain loses nothing: the key stays where it was', async () => {
    setSecretBackend(fakeKeychain({ failWrites: true }));
    store.set(STORAGE_KEY, JSON.stringify({ openai: cfg('sk-old') }));
    const provider = resetProvider();
    const result = await provider.hydrateSecrets();
    expect(result.failed).toBeGreaterThan(0);
    expect(stored().openai.apiKey).toBe('sk-old');
    expect(provider.getActiveConfig()?.apiKey).toBe('sk-old');
  });

  it('a keychain that does not return what was written does not cost the key either', async () => {
    setSecretBackend(fakeKeychain({ lie: true }));
    store.set(STORAGE_KEY, JSON.stringify({ openai: cfg('sk-old') }));
    const provider = resetProvider();
    await provider.hydrateSecrets();
    expect(stored().openai.apiKey).toBe('sk-old');
  });

  it('saving a new key keeps it in browser storage until the keychain confirms, then removes it', async () => {
    const keychain = fakeKeychain();
    setSecretBackend(keychain);
    const provider = resetProvider();
    provider.saveConfig(cfg('sk-new'));
    expect(stored().openai.apiKey).toBe('sk-new');
    await new Promise(r => setTimeout(r, 20));
    expect(keychain.items.get('cero.cloud_api:openai')).toBe('sk-new');
    expect(stored().openai.apiKey).toBe('');
  });

  it('a key stored under the old app name is moved to the new name', async () => {
    const keychain = fakeKeychain();
    keychain.items.set('sentinel.cloud_api:openai', 'sk-legacy');
    setSecretBackend(keychain);
    store.set(STORAGE_KEY, JSON.stringify({ openai: cfg('') }));
    const provider = resetProvider();
    await provider.hydrateSecrets();
    expect(provider.getActiveConfig()?.apiKey).toBe('sk-legacy');
    expect(keychain.items.get('cero.cloud_api:openai')).toBe('sk-legacy');
    expect(keychain.items.has('sentinel.cloud_api:openai')).toBe(false);
  });

  it('clearing a key removes it from the keychain', async () => {
    const keychain = fakeKeychain();
    setSecretBackend(keychain);
    const provider = resetProvider();
    provider.saveConfig(cfg('sk-new'));
    await new Promise(r => setTimeout(r, 20));
    provider.saveConfig(cfg(''));
    await new Promise(r => setTimeout(r, 20));
    expect(keychain.items.size).toBe(0);
  });
});
