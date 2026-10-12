/**
 * ModelManifestManager.test.ts — Unit Tests for Adapter Version Registry & Rollback
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ModelManifestManager } from './ModelManifestManager';

describe('ModelManifestManager', () => {
  let tempDir: string;
  let manifestPath: string;
  let manager: ModelManifestManager;

  beforeEach(() => {
    tempDir = path.join('/tmp', `manifest_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    manifestPath = path.join(tempDir, 'manifest.json');
    manager = new ModelManifestManager(manifestPath);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('Version Registration', () => {
    it('registers a new intent adapter version and auto-increments patch', () => {
      const entry = manager.registerVersion('intent', '/tmp/adapter_v1.gguf', {
        evalScore: 0.92,
        trainingSamples: 150,
        source: 'grpo',
        passedRegressionGate: true,
      });

      expect(entry.version).toBe('cero-intent-v1.0.1');
      expect(entry.adapterPath).toBe('/tmp/adapter_v1.gguf');
      expect(entry.evalScore).toBe(0.92);
      expect(entry.source).toBe('grpo');
      expect(manager.getActiveVersion('intent')).toBe('cero-intent-v1.0.1');
    });

    it('registers with explicit version string', () => {
      const entry = manager.registerVersion('coder', '/tmp/coder_v2.gguf', {
        version: 'cero-coder-v2.0.0',
        source: 'mlx_dpo',
      });

      expect(entry.version).toBe('cero-coder-v2.0.0');
      expect(manager.getActiveVersion('coder')).toBe('cero-coder-v2.0.0');
    });

    it('does not promote to active if regression gate failed', () => {
      const originalActive = manager.getActiveVersion('intent');
      manager.registerVersion('intent', '/tmp/bad_adapter.gguf', {
        passedRegressionGate: false,
        evalScore: 0.30,
      });

      expect(manager.getActiveVersion('intent')).toBe(originalActive);
      // But it should still be in history
      expect(manager.getHistory('intent').length).toBe(1);
    });
  });

  describe('Rollback', () => {
    it('rolls back to previous version', () => {
      // Register v1.0.1 and v1.0.2
      manager.registerVersion('intent', '/tmp/v1.gguf', {
        source: 'grpo',
        passedRegressionGate: true,
      });
      manager.registerVersion('intent', '/tmp/v2.gguf', {
        source: 'grpo',
        passedRegressionGate: true,
      });

      expect(manager.getActiveVersion('intent')).toBe('cero-intent-v1.0.2');

      const rolledBack = manager.rollback('intent');
      expect(rolledBack).not.toBeNull();
      expect(rolledBack!.version).toBe('cero-intent-v1.0.1');
      expect(manager.getActiveVersion('intent')).toBe('cero-intent-v1.0.1');
    });

    it('skips versions that failed regression gate during rollback', () => {
      manager.registerVersion('intent', '/tmp/v1.gguf', {
        passedRegressionGate: true,
      });
      manager.registerVersion('intent', '/tmp/v2_bad.gguf', {
        passedRegressionGate: false,
      });
      // v2_bad didn't become active, so active is still v1.0.1
      // Register v1.0.2 (auto-increments from v1.0.1)
      manager.registerVersion('intent', '/tmp/v3.gguf', {
        passedRegressionGate: true,
      });

      // Now rollback from v1.0.2 should skip the failed v2 and go to v1.0.1
      const rolledBack = manager.rollback('intent');
      expect(rolledBack).not.toBeNull();
      expect(rolledBack!.version).toBe('cero-intent-v1.0.1');
    });

    it('returns null when no rollback target is available', () => {
      const result = manager.rollback('coder');
      expect(result).toBeNull();
    });

    it('rollbackToVersion selects a specific version', () => {
      manager.registerVersion('coder', '/tmp/c1.gguf', { version: 'cero-coder-v1.1.0' });
      manager.registerVersion('coder', '/tmp/c2.gguf', { version: 'cero-coder-v1.2.0' });
      manager.registerVersion('coder', '/tmp/c3.gguf', { version: 'cero-coder-v1.3.0' });

      const result = manager.rollbackToVersion('coder', 'cero-coder-v1.1.0');
      expect(result).not.toBeNull();
      expect(manager.getActiveVersion('coder')).toBe('cero-coder-v1.1.0');
    });
  });

  describe('Persistence', () => {
    it('persists manifest to disk and reloads correctly', () => {
      manager.registerVersion('intent', '/tmp/persist_test.gguf', {
        evalScore: 0.95,
        source: 'grpo',
        passedRegressionGate: true,
      });

      // Create new manager instance from same path
      const manager2 = new ModelManifestManager(manifestPath);
      expect(manager2.getActiveVersion('intent')).toBe('cero-intent-v1.0.1');
      expect(manager2.getHistory('intent').length).toBe(1);
      expect(manager2.getHistory('intent')[0].evalScore).toBe(0.95);
    });
  });

  describe('Status Summary', () => {
    it('generates human-readable status summary', () => {
      manager.registerVersion('intent', '/tmp/i1.gguf', { evalScore: 0.91 });
      manager.registerVersion('coder', '/tmp/c1.gguf', { evalScore: 0.88 });

      const summary = manager.getStatusSummary();
      expect(summary).toContain('Intent:');
      expect(summary).toContain('Coder:');
      expect(summary).toContain('91.0%');
      expect(summary).toContain('88.0%');
    });
  });

  describe('History Pruning', () => {
    it('prunes history to keep only N most recent entries', () => {
      for (let i = 0; i < 25; i++) {
        manager.registerVersion('intent', `/tmp/adapter_${i}.gguf`);
      }

      expect(manager.getHistory('intent').length).toBe(25);
      const pruned = manager.pruneHistory('intent', 10);
      expect(pruned).toBe(15);
      expect(manager.getHistory('intent').length).toBe(10);
    });
  });
});
