import { describe, it, expect, beforeEach } from 'vitest';
import { ActionLoader } from '../loader/ActionLoader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ActionLoader', () => {
  const loader = new ActionLoader();

  describe('loadFromObject', () => {
    it('should load a valid legacy tool.json object', () => {
      const raw = {
        id: 'filesystem.create',
        version: '1.0.0',
        displayName: 'Create New File',
        description: 'Creates a new empty file.',
        domain: 'filesystem',
        category: 'Filesystem',
        tags: ['filesystem', 'create', 'file'],
        aliases: ['create file', 'new file'],
        supportedPlatforms: ['windows'],
        requiredPermissions: ['WriteFiles'],
        securityRisk: 'SAFE',
        parameters: [
          { name: 'path', type: 'string', description: 'File path', required: true }
        ],
        optionalParameters: [
          { name: 'content', type: 'string', description: 'Initial content', required: false }
        ],
        estimatedExecutionTime: '1s',
        confirmationRequired: false,
        rollbackAvailable: false,
        verificationSupported: true,
      };

      const action = loader.loadFromObject(raw);

      expect(action.id).toBe('filesystem.create');
      expect(action.displayName).toBe('Create New File');
      expect(action.inputs).toHaveLength(2);
      expect(action.inputs[0].name).toBe('path');
      expect(action.inputs[0].required).toBe(true);
      expect(action.inputs[1].name).toBe('content');
      expect(action.inputs[1].required).toBe(false);
      expect(action.cost.riskLevel).toBe('safe');
      expect(action.rollbackSupported).toBe(false);
    });

    it('should reject an object with invalid ID', () => {
      expect(() => loader.loadFromObject({ id: 'BadId' })).toThrow('Invalid ActionDefinition');
    });
  });

  describe('loadFromDirectory', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'action-loader-test-'));
    });

    it('should load tool.json files from nested directories', async () => {
      const toolDir = path.join(tmpDir, 'filesystem', 'copy');
      fs.mkdirSync(toolDir, { recursive: true });
      fs.writeFileSync(path.join(toolDir, 'tool.json'), JSON.stringify({
        id: 'filesystem.copy',
        version: '1.0.0',
        displayName: 'Copy File',
        description: 'Copies a file.',
        domain: 'filesystem',
        category: 'Filesystem',
        tags: ['copy'],
        aliases: ['copy file'],
        supportedPlatforms: ['windows'],
        requiredPermissions: [],
        securityRisk: 'SAFE',
        parameters: [],
        estimatedExecutionTime: '1s',
      }));

      const result = await loader.loadFromDirectory(tmpDir);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].id).toBe('filesystem.copy');
      expect(result.errors).toHaveLength(0);
    });

    it('should reject duplicate IDs', async () => {
      const dir1 = path.join(tmpDir, 'a');
      const dir2 = path.join(tmpDir, 'b');
      fs.mkdirSync(dir1, { recursive: true });
      fs.mkdirSync(dir2, { recursive: true });

      const tool = JSON.stringify({
        id: 'test.dup',
        version: '1.0.0',
        displayName: 'Dup',
        description: 'Dup',
        category: 'test',
        tags: [],
        aliases: [],
        supportedPlatforms: ['windows'],
        requiredPermissions: [],
        parameters: [],
      });

      fs.writeFileSync(path.join(dir1, 'tool.json'), tool);
      fs.writeFileSync(path.join(dir2, 'tool.json'), tool);

      const result = await loader.loadFromDirectory(tmpDir);
      expect(result.actions).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Duplicate');
    });

    it('should report errors for malformed JSON', async () => {
      const dir = path.join(tmpDir, 'bad');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'tool.json'), 'NOT JSON');

      const result = await loader.loadFromDirectory(tmpDir);
      expect(result.actions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should return empty for non-existent directory', async () => {
      const result = await loader.loadFromDirectory('/nonexistent/path');
      expect(result.actions).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
