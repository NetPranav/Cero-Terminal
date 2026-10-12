import { describe, it, expect } from 'vitest';
import { ProjectFingerprint } from './ProjectFingerprint';
import * as path from 'path';

describe('ProjectFingerprint', () => {
  it('identifies the current sentinal project as a node project from package.json', () => {
    const cwd = path.resolve('.');
    const res = ProjectFingerprint.compute(cwd);
    expect(res.projectType).toBe('node');
    expect(res.fingerprint).toContain('node_');
    expect(res.rootPath).toBe(cwd);
  });

  it('identifies rust project when pointed at src-tauri Cargo.toml', () => {
    const tauriDir = path.resolve('./src-tauri');
    const res = ProjectFingerprint.compute(tauriDir);
    expect(res.projectType).toBe('rust');
    expect(res.fingerprint).toBe('rust_src-tauri');
  });

  it('returns global for root or empty path', () => {
    expect(ProjectFingerprint.compute('/').fingerprint).toBe('global');
    expect(ProjectFingerprint.compute('').fingerprint).toBe('global');
    expect(ProjectFingerprint.compute('~').fingerprint).toBe('global');
  });

  it('sanitizes illegal path characters in fingerprints', () => {
    expect(ProjectFingerprint.sanitize('my@org/pkg:v1')).toBe('my_org_pkg_v1');
  });
});
