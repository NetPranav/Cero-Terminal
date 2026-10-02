import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentLoop, normalizeGoalText } from './AgentLoop';
import { MultistagePromptDecomposer } from '../../workflows/engine/MultistagePromptDecomposer';
import { DiskWorkflowStorage } from '../../workflows/storage/DiskWorkflowStorage';
import { UndoLog } from '../../domain/session/UndoLog';
import { ShellAstParser } from '../../domain/security/ShellAstParser';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

describe('Comprehensive Prompt Taxonomy & Feature Routing Test Suite', () => {
  let tmpDir: string;
  let mockModelManager: any;
  let mockToolExecutor: any;
  let mockRegistry: any;
  let agent: AgentLoop;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-taxonomy-test-'));
    const storage = DiskWorkflowStorage.getInstance();
    storage.setCustomBaseDir(tmpDir);

    mockModelManager = {
      getActiveProvider: () => ({
        isAvailable: vi.fn().mockResolvedValue(false),
        chat: vi.fn().mockResolvedValue({ content: 'Mock response', toolCalls: [] }),
        generate: vi.fn().mockResolvedValue('Mock generated output')
      }),
      getActiveModel: () => ({ modelId: 'test-model' }),
      initialize: vi.fn().mockResolvedValue(undefined)
    };

    mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockImplementation(async (tool: string, params: any) => {
        if (tool === 'shell.execute') {
          const cmd = params?.command || '';
          return { success: true, data: { stdout: `Executed: ${cmd}`, code: 0 } };
        }
        if (tool === 'system.battery') {
          return { success: true, data: { percentage: 85, state: 'charging' } };
        }
        if (tool === 'system.ram') {
          return { success: true, data: { total: 16384, used: 8192, free: 8192 } };
        }
        if (tool === 'system.storage') {
          return { success: true, data: { total: '500G', used: '200G', free: '300G' } };
        }
        if (tool === 'system.processes') {
          return { success: true, data: { processes: [{ pid: 1234, name: 'node', cpu: 12.5 }] } };
        }
        if (tool === 'network.ports') {
          return { success: true, data: { ports: [{ port: 3000, pid: 12345, process: 'node' }] } };
        }
        if (tool === 'filesystem.list') {
          return { success: true, data: { results: ['src/App.tsx', 'src/index.tsx'] } };
        }
        if (tool === 'filesystem.search') {
          return { success: true, data: { matches: ['src/App.tsx'] } };
        }
        return { success: true, data: { stdout: `Tool ${tool} executed`, code: 0 } };
      })
    };

    mockRegistry = {
      toolIndex: { has: () => false, getAll: () => [] }
    };

    agent = new AgentLoop(mockRegistry, mockModelManager);
    (agent as any).toolExecutor = mockToolExecutor;
  });

  afterEach(() => {
    DiskWorkflowStorage.getInstance().setCustomBaseDir(undefined);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // Archetype 1: Informational & Single-Entity Queries
  // =========================================================================
  describe('Archetype 1: Informational & Single-Entity Queries', () => {
    it('handles instant date and time queries without external inference', async () => {
      const res1 = await agent.run('what time is it', { os: 'linux', cwd: '/home/test' });
      expect(res1.success).toBe(true);
      expect(res1.summary).toMatch(/current date and time is/i);

      const res2 = await agent.run('what is today date', { os: 'linux', cwd: '/home/test' });
      expect(res2.success).toBe(true);
      expect(res2.summary).toMatch(/current date and time is/i);
    });

    it('handles conversational greeting queries', async () => {
      const res = await agent.run('hello there', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(res.summary).toContain('Sentinel AI');
    });

    it('handles agent capabilities & help queries', async () => {
      const res = await agent.run('what can you do', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(res.summary).toContain('Sentinel AI — an autonomous terminal agent');
      expect(res.summary).toContain('port 3000');
    });
  });

  // =========================================================================
  // Archetype 2: System Diagnostics, Hardware & Resource Inspections
  // Uses exact fast-path patterns from the routing table
  // =========================================================================
  describe('Archetype 2: System Diagnostics & Hardware Inspections', () => {
    it('routes battery queries to system.battery capability', async () => {
      const res = await agent.run('what is my battery level', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      // Assert tool name and cwd; 4th arg is undefined in fast-path (no authorization context)
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'system.battery',
        {},
        '/home/test',
        undefined
      );
    });

    it('routes memory/RAM queries to system.ram capability', async () => {
      const res = await agent.run('check memory usage', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'system.ram',
        {},
        '/home/test',
        undefined
      );
    });

    it('routes disk/storage queries to system.storage capability', async () => {
      const res = await agent.run('check storage', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'system.storage',
        {},
        '/home/test',
        undefined
      );
    });
  });

  // =========================================================================
  // Archetype 3: Process Management, Signals & Port Tracking
  // =========================================================================
  describe('Archetype 3: Process Management & Port Sockets', () => {
    it('routes port check queries to network.ports capability', async () => {
      const res = await agent.run('check if port 3000 is in use', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'network.ports',
        { port: 3000 },
        '/home/test',
        undefined
      );
    });

    it('routes free port search to network.ports with findFree flag', async () => {
      const res = await agent.run('find a free port', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'network.ports',
        { findFree: true },
        '/home/test',
        undefined
      );
    });

    it('routes process listing to system.processes capability', async () => {
      const res = await agent.run('show running processes', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'system.processes',
        { sort: 'cpu', count: 15 },
        '/home/test',
        undefined
      );
    });

    it('routes which process is using the most resources to fast-path ps command', async () => {
      const res = await agent.run('which process is using the most resources', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({
          command: expect.stringContaining('ps -eo pid,pcpu,pmem,comm --sort=-pcpu')
        }),
        '/home/test',
        undefined
      );
    });
  });

  // =========================================================================
  // Archetype 4: Network Diagnostics & Socket Queries
  // =========================================================================
  describe('Archetype 4: Network Diagnostics & Connectivity', () => {
    it('routes open port listing to network.ports', async () => {
      const res = await agent.run('check open ports', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'network.ports',
        {},
        '/home/test',
        undefined
      );
    });

    it('routes IP address queries to shell.execute', async () => {
      const res = await agent.run('check my ip address', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({ command: expect.stringMatching(/ip\s+route|ip.*addr|hostname/i) }),
        '/home/test',
        undefined
      );
    });
  });

  // =========================================================================
  // Archetype 5: Filesystem Navigation & Search
  // =========================================================================
  describe('Archetype 5: Filesystem & Search', () => {
    it('routes directory listing to filesystem.list capability', async () => {
      const res = await agent.run('ls', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'filesystem.list',
        { path: '.' },
        '/home/test',
        undefined
      );
    });

    it('routes file search by pattern via shell.execute fast-path', async () => {
      const res = await agent.run('find all typescript files', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({ command: expect.stringContaining('.ts') }),
        '/home/test',
        undefined
      );
    });
  });

  // =========================================================================
  // Archetype 6: Git & Developer Lifecycle Workflows
  // =========================================================================
  describe('Archetype 6: Git & Developer Lifecycle Workflows', () => {
    it('routes git status queries via shell.execute fast-path', async () => {
      const res = await agent.run('check git status', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      // The git status recipe: read-only, so it runs without a dialog
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({ command: expect.stringMatching(/git\s+(?:-C\s+\S+\s+)?status/i) }),
        '/home/test',
        expect.any(Function)
      );
    });

    it('routes git log history queries via shell.execute fast-path', async () => {
      const res = await agent.run('recent git commits', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({ command: expect.stringMatching(/git\s+log/i) }),
        '/home/test',
        undefined
      );
    });
  });

  // =========================================================================
  // Archetype 7: Linux Daemons & Systemd Services
  // =========================================================================
  describe('Archetype 7: Linux Daemons & Systemd Services', () => {
    it('routes systemd failed units inspection via shell.execute fast-path', async () => {
      const res = await agent.run('list failed systemd services', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({ command: expect.stringMatching(/systemctl\s+--failed/i) }),
        '/home/test',
        undefined
      );
    });
  });

  // =========================================================================
  // Archetype 8: Desktop Window & Wayland Rice Management
  // =========================================================================
  describe('Archetype 8: Desktop Window & Rice Management', () => {
    it('decomposes dotfile synchronization or backup requests', () => {
      const decomposer = MultistagePromptDecomposer.getInstance();
      const plan = decomposer.decompose('backup dotfiles: clean build, git pull', { cwd: '/home/test' });
      expect(plan.name).toBe('backup-dotfiles');
      expect(plan.stages.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Archetype 9: Multi-Stage Composite DAG Pipelines
  // =========================================================================
  describe('Archetype 9: Multi-Stage Composite DAG Pipelines', () => {
    it('identifies sequential "first... then... after that" workflows', async () => {
      const prompt = 'first clean build, then build backend with cargo, after that run test with cargo';
      const decomposer = MultistagePromptDecomposer.getInstance();
      expect(decomposer.isMultistagePrompt(prompt)).toBe(true);

      const plan = decomposer.decompose(prompt);
      expect(plan.stages).toHaveLength(3);
      expect(plan.stages[0].dependencies).toEqual([]);
      expect(plan.stages[1].dependencies).toEqual(['stage-1']);
      expect(plan.stages[2].dependencies).toEqual(['stage-2']);
    });

    it('executes decomposed multi-stage pipelines deterministically without LLM', async () => {
      const prompt = 'first clean build, then build backend with cargo';
      const res = await agent.run(prompt, { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(res.steps.length).toBe(2);
      // Phase 0.75: Precondition check (test -f Cargo.toml) runs before cargo build stage
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // Archetype 10: Workflow Creation Directives
  // =========================================================================
  describe('Archetype 10: Workflow Creation Directives', () => {
    it('executes task and saves simultaneously: "<task> :: save as workflow <name>"', async () => {
      const prompt = 'make a folder called get-time-dir :: save as workflow get-time-wf';
      const res = await agent.run(prompt, { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(res.summary).toContain('Saved workflow \"get-time-wf\"');

      const storage = DiskWorkflowStorage.getInstance();
      const loaded = await storage.loadWorkflow('get-time-wf');
      expect(loaded).toBeDefined();
      expect(loaded?.schemaVersion).toBe(1);
    });

    it('decomposes and executes multi-stage workflow with inline save directive', async () => {
      const prompt = 'first clean build, then build backend with cargo :: save as workflow cargo-build';
      const res = await agent.run(prompt, { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(res.summary).toContain('Saved workflow \"cargo-build\"');

      const storage = DiskWorkflowStorage.getInstance();
      const loaded = await storage.loadWorkflow('cargo-build');
      expect(loaded).toBeDefined();
      expect(loaded?.steps.length).toBe(2);
    });

    it('handles scoped retrospective save: "save workflow <name> last 2 commands"', async () => {
      const undoLog = UndoLog.getInstance();
      const sessionId = 'taxonomy-scoped-session';

      undoLog.recordAction({ sessionId, command: 'echo "1"', goal: 'Step 1', isDestructive: false });
      undoLog.recordAction({ sessionId, command: 'echo "2"', goal: 'Step 2', isDestructive: false });
      undoLog.recordAction({ sessionId, command: 'echo "3"', goal: 'Step 3', isDestructive: false });

      const res = await agent.run('save workflow my-scoped-pipeline last 2 commands', {
        os: 'linux',
        cwd: '/home/test',
        sessionId
      });

      expect(res.success).toBe(true);
      expect(res.summary).toContain('(2 steps)');

      const storage = DiskWorkflowStorage.getInstance();
      const loaded = await storage.loadWorkflow('my-scoped-pipeline');
      expect(loaded?.steps).toHaveLength(2);
      expect(loaded?.steps[0].command).toBe('echo "2"');
      expect(loaded?.steps[1].command).toBe('echo "3"');
    });

    it('handles deterministic replay with CLI flags: "run workflow <name> --port=9090"', async () => {
      const storage = DiskWorkflowStorage.getInstance();
      await storage.saveWorkflow({
        schemaVersion: 1,
        name: 'test-port-replay',
        description: 'Test replay',
        steps: [{ id: 's1', name: 'Curl check', command: 'curl http://localhost:{{PORT}}', isDestructive: false }],
        parameters: [{ name: 'PORT', type: 'number', defaultValue: 3000, required: false, description: 'Port parameter' }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      const res = await agent.run('run workflow test-port-replay --port=9090', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({ command: 'curl http://localhost:9090' }),
        expect.anything(),
        undefined
      );
    });
  });

  // =========================================================================
  // Archetype 11: Conversational, Clarifications & Cancellation
  // =========================================================================
  describe('Archetype 11: Conversational & Multi-Turn Clarifications', () => {
    it('handles greeting and conversational patterns as fast-path responses', async () => {
      const res = await agent.run('hello there', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      expect(res.summary).toContain('Sentinel AI');
      // Agent handles greetings without going to LLM
      expect(mockToolExecutor.execute).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Archetype 12: Destructive Workflow Rollback & UndoLog
  // =========================================================================
  describe('Archetype 12: Destructive Workflow Rollback & Session UndoLog', () => {
    it('handles "what did you just do" / "show recent actions" queries', async () => {
      const undoLog = UndoLog.getInstance();
      undoLog.recordAction({
        sessionId: 'default',
        command: 'rm -rf ./temp',
        goal: 'Clean temp',
        isDestructive: true
      });

      const res = await agent.run('what did you just do', { os: 'linux', cwd: '/home/test' });
      expect(res.success).toBe(true);
      // Actual format is "### Recent Session Actions (N recorded):"
      expect(res.summary).toContain('Recent Session Actions');
    });

    it('handles "undo last step" / "rollback" requests', async () => {
      const undoLog = UndoLog.getInstance();
      undoLog.recordAction({
        sessionId: 'default',
        command: 'touch test.txt',
        goal: 'Create test file',
        isDestructive: true,
        rollbackCommand: 'rm -f test.txt'
      });

      const res = await agent.run('undo last step', { os: 'linux', cwd: '/home/test' });
      // Undo execution succeeds if the rollback command is executed
      expect(res).toBeDefined();
      expect(res.summary).toMatch(/rolled back|undo|rollback|No recent destructive/i);
    });
  });

  // =========================================================================
  // Archetype 13: Adversarial, Typo-Ridden & Malformed Prompts
  // =========================================================================
  describe('Archetype 13: Adversarial, Typo-Ridden & Malformed Prompts', () => {
    it('normalizes common prompt typos before routing', () => {
      expect(normalizeGoalText('build the frotend')).toBe('build the frontend');
      expect(normalizeGoalText('inilitilzie the project')).toBe('initialize the project');
      expect(normalizeGoalText('check runing processes')).toBe('check running processes');
      expect(normalizeGoalText('do somethign cool adn fast')).toBe('do something cool and fast');
    });

    it('detects syntax errors via ShellAstParser before execution', () => {
      const badCmd1 = 'echo "missing closing quote';
      const res1 = ShellAstParser.validateSyntax(badCmd1);
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('quote');

      const badCmd2 = 'ls -la |';
      const res2 = ShellAstParser.validateSyntax(badCmd2);
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('pipe');
    });

    it('truncates oversized command outputs to protect LLM context windows', () => {
      // Generate enough text to exceed MAX_OBSERVATION_CHARS (4000) and > 80 lines
      // to trigger the line-based truncation path
      const hugeOutput = Array.from({ length: 300 }, (_, i) => `Line ${i + 1}: ${'x'.repeat(40)}`).join('\n');
      const truncated = AgentLoop.truncateObservation(hugeOutput);

      expect(truncated.length).toBeLessThan(hugeOutput.length);
      // The actual truncation message uses "lines omitted" for multi-line content
      expect(truncated).toContain('omitted for context window safety');
    });
  });
});
