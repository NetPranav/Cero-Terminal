import { describe, it, expect, vi } from 'vitest';
import { ActionGate } from './ActionGate';
import { ToolSpec } from './SystemPrompt';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'check_path_exists') {
      if (args?.path?.includes('non_existent')) return false;
      return true;
    }
    return null;
  })
}));

describe('ActionGate', () => {
  const context = { cwd: '/workspace', os: 'linux' };

  describe('Dangerous command detection', () => {
    it('rejects rm -rf / and root deletion variations', async () => {
      const candidates = [
        { action: 'execute' as const, command: 'rm -rf /' },
        { action: 'execute' as const, command: 'rm -rf /*' },
        { action: 'execute' as const, command: 'rm -rf ~' },
        { action: 'execute' as const, command: 'rm -rf $HOME' },
        { action: 'execute' as const, command: 'rm -rf --no-preserve-root /' }
      ];

      for (const candidate of candidates) {
        const result = await ActionGate.validate(candidate, context);
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('Wiping root filesystem');
        expect(result.hint).toBeDefined();
      }
    });

    it('rejects disk formatting with mkfs', async () => {
      const result = await ActionGate.validate(
        { action: 'execute', command: 'mkfs.ext4 /dev/sda' },
        context
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Formatting disk filesystem');
    });

    it('rejects raw block device overwrite with dd', async () => {
      const result = await ActionGate.validate(
        { action: 'execute', command: 'dd if=/dev/zero of=/dev/sda bs=1M' },
        context
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Overwriting raw disk block device');
    });

    it('rejects bare kill -9 and broadcast kill -9 -1', async () => {
      const candidates = [
        { action: 'execute' as const, command: 'kill -9 -1' },
        { action: 'execute' as const, command: 'kill -9' },
        { action: 'execute' as const, command: 'kill -9 0' }
      ];

      for (const candidate of candidates) {
        const result = await ActionGate.validate(candidate, context);
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('kill -9');
      }
    });

    it('allows targeted kill -9 on a specific positive PID', async () => {
      const result = await ActionGate.validate(
        { action: 'execute', command: 'kill -9 12345' },
        context
      );
      expect(result.ok).toBe(true);
    });

    it('rejects chmod -R 777 /', async () => {
      const result = await ActionGate.validate(
        { action: 'execute', command: 'chmod -R 777 /' },
        context
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('root directory');
    });

    it('rejects shell fork bombs', async () => {
      const result = await ActionGate.validate(
        { action: 'execute', command: ':(){ :|:& };:' },
        context
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('fork bomb');
    });

    it('rejects invented credential placeholders', async () => {
      const result = await ActionGate.validate(
        { action: 'execute', command: 'curl -H "Authorization: Bearer <token>" https://api.example.com' },
        context
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('secret');
    });

    it('allows safe shell commands', async () => {
      const safe = [
        'ls -la',
        'git status',
        'echo "hello world"',
        'npm test',
        'find . -name "*.ts"',
        'cat package.json'
      ];

      for (const command of safe) {
        const result = await ActionGate.validate({ action: 'execute', command }, context);
        expect(result.ok).toBe(true);
      }
    });
  });

  describe('Tool schema & parameter validation', () => {
    const customSpecs: ToolSpec[] = [
      {
        id: 'test.tool',
        name: 'Test Tool',
        description: 'A test tool',
        parameters: [
          { name: 'target', type: 'string', required: true, description: 'Target string' },
          { name: 'count', type: 'number', required: false, description: 'Count number' }
        ]
      }
    ];

    it('validates required parameters and coercible types', async () => {
      const valid = await ActionGate.validate(
        { action: 'tool', tool: 'test.tool', params: { target: 'alpha', count: '42' } },
        context,
        customSpecs
      );
      expect(valid.ok).toBe(true);
      expect(valid.repairedAction?.params?.count).toBe(42);
    });

    it('rejects missing required parameters', async () => {
      const invalid = await ActionGate.validate(
        { action: 'tool', tool: 'test.tool', params: { count: 10 } },
        context,
        customSpecs
      );
      expect(invalid.ok).toBe(false);
      expect(invalid.reason).toContain('target');
    });

    it('rejects unrecognized tool IDs', async () => {
      const invalid = await ActionGate.validate(
        { action: 'tool', tool: 'nonexistent.tool', params: {} },
        context,
        customSpecs
      );
      expect(invalid.ok).toBe(false);
      expect(invalid.reason).toContain('not recognized');
    });
  });

  describe('Path existence and legality', () => {
    it('rejects non-existent path on filesystem.read', async () => {
      const result = await ActionGate.validate(
        { action: 'tool', tool: 'filesystem.read', params: { path: '/tmp/non_existent_file.txt' } },
        context
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('does not exist');
    });

    it('rejects null byte in path', async () => {
      const result = await ActionGate.validate(
        { action: 'tool', tool: 'filesystem.list', params: { path: '/tmp/\0malicious' } },
        context
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('null byte');
    });
  });

  describe('Application name validation', () => {
    it('accepts clean application names', async () => {
      const result = await ActionGate.validate(
        { action: 'tool', tool: 'application.open', params: { app: 'Visual Studio Code' } },
        context
      );
      expect(result.ok).toBe(true);
    });

    it('rejects app names with shell metacharacters', async () => {
      const result = await ActionGate.validate(
        { action: 'tool', tool: 'application.open', params: { app: 'code; rm -rf /' } },
        context
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('metacharacters');
    });
  });

  describe('Done and Error actions', () => {
    it('allows done actions without executing tools', async () => {
      const result = await ActionGate.validate(
        { action: 'done', summary: 'All steps completed successfully.' },
        context
      );
      expect(result.ok).toBe(true);
    });

    it('allows error actions directly', async () => {
      const result = await ActionGate.validate(
        { action: 'error', message: 'Could not complete task.' },
        context
      );
      expect(result.ok).toBe(true);
    });
  });
});
