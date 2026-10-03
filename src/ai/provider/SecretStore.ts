/**
 * SecretStore.ts: API keys in the operating system keychain, not in browser storage.
 *
 * The Tauri commands do the real work (Keychain on macOS, Credential Manager on Windows, a private
 * file on Linux). Every method reports failure instead of guessing, so a caller never deletes the old
 * copy of a key before the new one has been read back.
 */

export interface SecretBackend {
  set(service: string, key: string, value: string): Promise<void>;
  get(service: string, key: string): Promise<string | null>;
  delete(service: string, key: string): Promise<void>;
  /** "keychain" or "file" */
  kind(): Promise<string>;
}

export const tauriSecretBackend: SecretBackend = {
  async set(service, key, value) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secret_set', { service, key, value });
  },
  async get(service, key) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<string | null>('secret_get', { service, key })) ?? null;
  },
  async delete(service, key) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secret_delete', { service, key });
  },
  async kind() {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string>('secret_backend');
  },
};

let backend: SecretBackend = tauriSecretBackend;

/** Tests pass a fake keychain */
export function setSecretBackend(next: SecretBackend | null): void {
  backend = next ?? tauriSecretBackend;
}

export function getSecretBackend(): SecretBackend {
  return backend;
}

/** Write a secret and read it back; true only when the keychain really holds it */
export async function storeSecretVerified(service: string, key: string, value: string): Promise<boolean> {
  try {
    await backend.set(service, key, value);
    return (await backend.get(service, key)) === value;
  } catch {
    return false;
  }
}
