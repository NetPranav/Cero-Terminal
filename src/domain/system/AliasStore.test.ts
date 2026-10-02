import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AliasStore } from './AliasStore';

describe('AliasStore', () => {
  let dir: string;
  const store = AliasStore.getInstance();
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-alias-'));
    store.setFile(path.join(dir, 'aliases.json'));
  });
  afterEach(() => {
    store.setFile(undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('remembers a choice under the compact spoken name', () => {
    store.remember('gitBrains', 'folder', '/home/me/Projects/gitBrains');
    expect(store.lookup('git-brains', 'folder')?.path).toBe('/home/me/Projects/gitBrains');
    expect(store.lookup('gitbrains', 'app')).toBeUndefined();
  });

  it('replaces an earlier answer for the same name', () => {
    store.remember('gb', 'folder', '/a');
    store.remember('gb', 'folder', '/b');
    expect(store.list()).toHaveLength(1);
    expect(store.lookup('gb', 'folder')?.path).toBe('/b');
  });

  it('forgets one name or everything', () => {
    store.remember('one', 'folder', '/1');
    store.remember('two', 'folder', '/2');
    expect(store.forget('One')).toBe(1);
    expect(store.lookup('one', 'folder')).toBeUndefined();
    expect(store.forgetAll()).toBe(1);
    expect(store.list()).toEqual([]);
  });

  it('caps the file at 200 entries, keeping the newest', () => {
    for (let i = 0; i < 210; i++) store.remember(`name${i}`, 'folder', `/p${i}`);
    const all = store.list();
    expect(all).toHaveLength(200);
    expect(all[all.length - 1].spoken).toBe('name209');
    expect(store.lookup('name0', 'folder')).toBeUndefined();
  });

  it('a damaged file reads as empty and is replaced on the next write', () => {
    fs.writeFileSync(path.join(dir, 'aliases.json'), '{not json');
    expect(store.list()).toEqual([]);
    store.remember('x', 'app', 'Visual Studio Code');
    expect(store.list()).toHaveLength(1);
  });

  it('describes what it remembers', () => {
    store.remember('gitbrains', 'folder', '/p');
    expect(store.about('GitBrains')).toHaveLength(1);
  });
});
