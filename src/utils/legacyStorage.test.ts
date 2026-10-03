import { describe, it, expect } from 'vitest';
import { migrateLegacyStorage, type KeyValueStore } from './legacyStorage';

function fakeStore(initial: Record<string, string>): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() { return data.size; },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: k => { data.delete(k); },
  };
}

describe('migrateLegacyStorage', () => {
  it('copies old keys to the new names and removes the old ones', () => {
    const s = fakeStore({ sentinel_active_ai_provider: 'ollama', 'sentinel-theme': 'dark', other: '1' });
    expect(migrateLegacyStorage(s)).toBe(2);
    expect(s.data.get('cero_active_ai_provider')).toBe('ollama');
    expect(s.data.get('cero-theme')).toBe('dark');
    expect(s.data.has('sentinel_active_ai_provider')).toBe(false);
    expect(s.data.get('other')).toBe('1');
  });
  it('never overwrites a key that already exists under the new name', () => {
    const s = fakeStore({ sentinel_ui_mode: 'old', cero_ui_mode: 'new' });
    migrateLegacyStorage(s);
    expect(s.data.get('cero_ui_mode')).toBe('new');
    expect(s.data.has('sentinel_ui_mode')).toBe(false);
  });
  it('leaves the old key when the write fails', () => {
    const s = fakeStore({ sentinel_x: '1' });
    s.setItem = () => { throw new Error('quota'); };
    expect(migrateLegacyStorage(s)).toBe(0);
    expect(s.data.get('sentinel_x')).toBe('1');
  });
  it('is harmless to run twice', () => {
    const s = fakeStore({ sentinel_a: '1' });
    expect(migrateLegacyStorage(s)).toBe(1);
    expect(migrateLegacyStorage(s)).toBe(0);
  });
});
