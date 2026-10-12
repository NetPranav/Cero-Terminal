import { describe, it, expect, beforeEach } from 'vitest';
import { ActionRegistry } from '../registry/ActionRegistry';
import { createMockAction } from './helpers';

describe('ActionRegistry', () => {
  let registry: ActionRegistry;

  beforeEach(() => {
    registry = new ActionRegistry();
  });

  describe('register / getById', () => {
    it('should register and retrieve an action by ID', () => {
      const action = createMockAction({ id: 'filesystem.copy' });
      registry.register(action);
      expect(registry.getById('filesystem.copy')).toBe(action);
    });

    it('should throw on duplicate registration', () => {
      const action = createMockAction({ id: 'filesystem.copy' });
      registry.register(action);
      expect(() => registry.register(action)).toThrow('already registered');
    });

    it('should return undefined for unknown IDs', () => {
      expect(registry.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('unregister', () => {
    it('should unregister an action', () => {
      const action = createMockAction({ id: 'filesystem.copy' });
      registry.register(action);
      expect(registry.unregister('filesystem.copy')).toBe(true);
      expect(registry.getById('filesystem.copy')).toBeUndefined();
    });

    it('should return false for non-existent action', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  describe('index lookups', () => {
    beforeEach(() => {
      registry.register(createMockAction({
        id: 'filesystem.copy',
        category: 'Filesystem',
        tags: ['filesystem', 'copy', 'file'],
        aliases: ['copy file', 'duplicate file'],
        supportedPlatforms: ['windows'],
        requiredEntities: ['file'],
        constraints: [{ id: 'requires_existing_file', description: 'Source must exist', mandatory: true }],
      }));
      registry.register(createMockAction({
        id: 'filesystem.move',
        category: 'Filesystem',
        tags: ['filesystem', 'move', 'file'],
        aliases: ['move file', 'rename file'],
        supportedPlatforms: ['windows'],
        requiredEntities: ['file'],
      }));
      registry.register(createMockAction({
        id: 'bluetooth.connect',
        category: 'Network',
        tags: ['bluetooth', 'connect', 'device'],
        aliases: ['connect device', 'pair device'],
        supportedPlatforms: ['windows'],
        requiredEntities: ['bluetooth_device'],
      }));
    });

    it('should lookup by alias (case insensitive)', () => {
      const results = registry.getByAlias('copy file');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('filesystem.copy');
    });

    it('should lookup by tag', () => {
      const results = registry.getByTag('filesystem');
      expect(results).toHaveLength(2);
      expect(results.map(a => a.id)).toContain('filesystem.copy');
      expect(results.map(a => a.id)).toContain('filesystem.move');
    });

    it('should lookup by category', () => {
      const results = registry.getByCategory('filesystem');
      expect(results).toHaveLength(2);
    });

    it('should lookup by entity', () => {
      const results = registry.getByEntity('file');
      expect(results).toHaveLength(2);

      const btResults = registry.getByEntity('bluetooth_device');
      expect(btResults).toHaveLength(1);
      expect(btResults[0].id).toBe('bluetooth.connect');
    });

    it('should lookup by platform', () => {
      const windowsResults = registry.getByPlatform('windows');
      expect(windowsResults.map(r => r.id).sort()).toEqual(['bluetooth.connect', 'filesystem.copy', 'filesystem.move']);
    });

    it('should lookup by constraint', () => {
      const results = registry.getByConstraint('requires_existing_file');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('filesystem.copy');
    });
  });

  describe('size / has / clear', () => {
    it('should report correct size', () => {
      expect(registry.size()).toBe(0);
      registry.register(createMockAction({ id: 'test.one' }));
      expect(registry.size()).toBe(1);
      registry.register(createMockAction({ id: 'test.two' }));
      expect(registry.size()).toBe(2);
    });

    it('should check existence with has', () => {
      registry.register(createMockAction({ id: 'test.one' }));
      expect(registry.has('test.one')).toBe(true);
      expect(registry.has('test.two')).toBe(false);
    });

    it('should clear all actions and indexes', () => {
      registry.register(createMockAction({ id: 'test.one', tags: ['foo'] }));
      registry.clear();
      expect(registry.size()).toBe(0);
      expect(registry.getByTag('foo')).toHaveLength(0);
    });
  });
});
