/**
 * legacyStorage.ts: carry settings across the rename from Sentinel Terminal to Cero.
 *
 * Browser-storage keys that began with "sentinel_" or "sentinel-" are copied to "cero_" / "cero-" once, and the old
 * ones are removed only after the copy is read back. Never overwrites a key that already exists under the new name.
 */
export interface KeyValueStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function migrateLegacyStorage(store: KeyValueStore): number {
  let moved = 0;
  const legacy: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && /^sentinel[_-]/.test(key)) legacy.push(key);
  }
  for (const key of legacy) {
    const next = key.replace(/^sentinel/, 'cero');
    try {
      const value = store.getItem(key);
      if (value === null) continue;
      if (store.getItem(next) === null) store.setItem(next, value);
      if (store.getItem(next) !== null) {
        store.removeItem(key);
        moved++;
      }
    } catch {
      // storage full or blocked: leave the old key where it is
    }
  }
  return moved;
}
