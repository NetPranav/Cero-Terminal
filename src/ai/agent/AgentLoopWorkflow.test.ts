import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentLoop } from './AgentLoop';
import { DiskWorkflowStorage } from '../../workflows/storage/DiskWorkflowStorage';
import { UndoLog } from '../../domain/session/UndoLog';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

describe('AgentLoop Workflow Generic Fast-Path', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentloop-wf-test-'));
    DiskWorkflowStorage.getInstance().setCustomBaseDir(tmpDir);
  });

  afterEach(() => {
    DiskWorkflowStorage.getInstance().setCustomBaseDir(undefined);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('handles "save workflow <name>" fast-path from UndoLog', async () => {
    const undoLog = UndoLog.getInstance();
    const sessionId = 'test-session-agentloop';

    undoLog.recordAction({
      sessionId,
      command: 'echo "hello agentloop"',
      goal: 'Print greeting',
      isDestructive: false
    });

    const mockRegistry = { toolIndex: { has: () => false, getAll: () => [] } } as any;
    const agent = new AgentLoop(mockRegistry);
    const events: any[] = [];
    agent.onEvent(e => events.push(e));

    const result = await agent.run('save workflow my-ci-pipeline', {
      os: 'linux',
      cwd: '/home/test',
      sessionId
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('my-ci-pipeline.flow');

    // Verify it was actually written to disk
    const storage = DiskWorkflowStorage.getInstance();
    const loaded = await storage.loadWorkflow('my-ci-pipeline');
    expect(loaded).toBeDefined();
    expect(loaded?.schemaVersion).toBe(1);
    expect(loaded?.steps[0].command).toBe('echo "hello agentloop"');
  });

  it('handles "run workflow <name> [flags]" fast-path with parameter overrides', async () => {
    // First save a workflow
    const storage = DiskWorkflowStorage.getInstance();
    await storage.saveWorkflow({
      schemaVersion: 1,
      name: 'deploy-service',
      description: 'Deploy service with port parameter',
      steps: [
        {
          id: 'step_1',
          name: 'Echo port',
          command: 'echo "Serving on port {{PORT}}"',
          isDestructive: false
        }
      ],
      parameters: [
        { name: 'PORT', type: 'string', required: false, defaultValue: '8080', description: 'Port' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: ['deployment']
    });

    const mockRegistry = { toolIndex: { has: () => false, getAll: () => [] } } as any;
    const agent = new AgentLoop(mockRegistry);
    const events: any[] = [];
    agent.onEvent(e => events.push(e));

    const result = await agent.run('run workflow deploy-service --port=9090', {
      os: 'linux',
      cwd: '/home/test'
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('Workflow "deploy-service": 1 step done');
    expect(result.steps.length).toBe(1);

    // Verify events received thinking and tool events
    const thinking = events.find(e => e.type === 'thinking');
    expect(thinking?.message).toContain('Replaying workflow "deploy-service" deterministically');
  });

  it('handles scoped retrospective save: "save workflow <name> last 2"', async () => {
    const undoLog = UndoLog.getInstance();
    const sessionId = 'test-session-scoped';

    // Record 4 actions
    undoLog.recordAction({ sessionId, command: 'echo "cmd 1"', goal: 'Step 1', isDestructive: false });
    undoLog.recordAction({ sessionId, command: 'echo "cmd 2"', goal: 'Step 2', isDestructive: false });
    undoLog.recordAction({ sessionId, command: 'echo "cmd 3"', goal: 'Step 3', isDestructive: false });
    undoLog.recordAction({ sessionId, command: 'echo "cmd 4"', goal: 'Step 4', isDestructive: false });

    const mockRegistry = { toolIndex: { has: () => false, getAll: () => [] } } as any;
    const agent = new AgentLoop(mockRegistry);

    const result = await agent.run('save workflow scoped-pipeline last 2 commands', {
      os: 'linux',
      cwd: '/home/test',
      sessionId
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('(2 steps)');

    const storage = DiskWorkflowStorage.getInstance();
    const loaded = await storage.loadWorkflow('scoped-pipeline');
    expect(loaded).toBeDefined();
    expect(loaded?.steps).toHaveLength(2);
    // Should be cmd 3 and cmd 4 (the last 2)
    expect(loaded?.steps[0].command).toBe('echo "cmd 3"');
    expect(loaded?.steps[1].command).toBe('echo "cmd 4"');
  });

  it('handles simultaneous task execution and save: "<task> :: save as workflow <name>"', async () => {
    const mockRegistry = { toolIndex: { has: () => false, getAll: () => [] } } as any;
    const agent = new AgentLoop(mockRegistry);
    const sessionId = 'test-session-simultaneous';

    // We use a prompt that fast-paths or runs a command: e.g. "date :: save as workflow get-date"
    const result = await agent.run('date :: save as workflow get-date', {
      os: 'linux',
      cwd: '/home/test',
      sessionId
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('Saved workflow \"get-date\"');

    const storage = DiskWorkflowStorage.getInstance();
    const loaded = await storage.loadWorkflow('get-date');
    expect(loaded).toBeDefined();
    expect(loaded?.schemaVersion).toBe(1);
    expect(loaded?.name).toBe('get-date');
  });

  it('handles "save as workflow <name> last 3 steps" syntax', async () => {
    const undoLog = UndoLog.getInstance();
    const sessionId = 'test-session-save-as';

    undoLog.recordAction({ sessionId, command: 'echo "a"', goal: 'Step A', isDestructive: false });
    undoLog.recordAction({ sessionId, command: 'echo "b"', goal: 'Step B', isDestructive: false });
    undoLog.recordAction({ sessionId, command: 'echo "c"', goal: 'Step C', isDestructive: false });
    undoLog.recordAction({ sessionId, command: 'echo "d"', goal: 'Step D', isDestructive: false });

    const mockRegistry = { toolIndex: { has: () => false, getAll: () => [] } } as any;
    const agent = new AgentLoop(mockRegistry);

    const result = await agent.run('save as workflow my-scoped-pipeline last 3 steps', {
      os: 'linux',
      cwd: '/home/test',
      sessionId
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('(3 steps)');

    const storage = DiskWorkflowStorage.getInstance();
    const loaded = await storage.loadWorkflow('my-scoped-pipeline');
    expect(loaded).toBeDefined();
    expect(loaded?.steps).toHaveLength(3);
    expect(loaded?.steps[0].command).toBe('echo "b"');
    expect(loaded?.steps[1].command).toBe('echo "c"');
    expect(loaded?.steps[2].command).toBe('echo "d"');
  });

  it('handles multistage prompt inline save: "first clean build, then build backend with cargo :: save as workflow cargo-build-flow"', async () => {
    const mockModelManager = {
      getActiveProvider: () => ({
        isAvailable: vi.fn().mockResolvedValue(false),
        chat: vi.fn()
      }),
      getActiveModel: () => ({ modelId: 'test-model' }),
      initialize: vi.fn().mockResolvedValue(undefined)
    } as any;

    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { stdout: 'done', code: 0 }
      })
    };

    const mockRegistry = { toolIndex: { has: () => false, getAll: () => [] } } as any;
    const agent = new AgentLoop(mockRegistry, mockModelManager);
    (agent as any).toolExecutor = mockToolExecutor;
    const sessionId = 'test-session-multistage-save';

    const result = await agent.run('first clean build, then build backend with cargo :: save as workflow cargo-build-flow', {
      os: 'linux',
      cwd: '/home/test',
      sessionId
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('Saved workflow \"cargo-build-flow\"');

    const storage = DiskWorkflowStorage.getInstance();
    const loaded = await storage.loadWorkflow('cargo-build-flow');
    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe('cargo-build-flow');
    expect(loaded?.schemaVersion).toBe(1);
    expect(loaded?.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('evaluates stage preconditions during multi-stage execution and skips satisfied steps (Tasks 0.75.2 & 0.75.3)', async () => {
    const executedCommands: string[] = [];

    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockImplementation((tool: string, params: any) => {
        const cmdStr = params?.command || params?.app || '';
        executedCommands.push(cmdStr);
        // If checking which neovim, return 0 (installed)
        if (typeof cmdStr === 'string' && cmdStr.includes('neovim')) {
          return Promise.resolve({ success: true, data: { stdout: '/usr/bin/nvim', code: 0 } });
        }
        return Promise.resolve({ success: true, data: { stdout: 'done', code: 0 } });
      })
    };

    const mockRegistry = {
      toolIndex: {
        has: () => true,
        getAll: () => [
          { definition: { id: 'shell.execute', displayName: 'Shell', description: 'Execute shell commands', parameters: [] } },
          { definition: { id: 'filesystem.search', displayName: 'Search', description: 'Search files and folders', parameters: [] } },
          { definition: { id: 'network.wifi.scan', displayName: 'Wifi', description: 'Scan wifi', parameters: [] } }
        ]
      }
    } as any;

    const agent = new AgentLoop(mockRegistry);
    (agent as any).toolExecutor = mockToolExecutor;

    const result = await agent.run('first install neovim, then build frontend, after that free port 3000', {
      os: 'linux',
      cwd: '/home/test'
    });

    expect(result.success).toBe(true);
    // Precondition check was executed
    expect(executedCommands.some(cmd => typeof cmd === 'string' && cmd.includes('neovim'))).toBe(true);
    // Because which nvim succeeded and if_precondition_true === 'skip', pacman/brew install was skipped
    expect(executedCommands.some(cmd => typeof cmd === 'string' && (cmd.includes('pacman -S') || cmd.includes('brew install')))).toBe(false);
    // Subsequent stages were executed
    expect(executedCommands.some(cmd => typeof cmd === 'string' && cmd.includes('npm run build'))).toBe(true);
    expect(executedCommands.some(cmd => typeof cmd === 'string' && cmd.includes('3000'))).toBe(true);
  });
});

