import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeterministicReplayEngine } from './DeterministicReplayEngine';
import { SavedWorkflowDefinition } from '../models/WorkflowTypes';
import { UndoLog } from '../../domain/session/UndoLog';

describe('DeterministicReplayEngine', () => {
  let engine: DeterministicReplayEngine;

  beforeEach(() => {
    engine = new DeterministicReplayEngine();
    UndoLog.getInstance().clear();
    vi.restoreAllMocks();
  });

  it('parses CLI flag parameter overrides correctly', () => {
    const parsed = engine.parseCliOverrides('--port=9000 --tag=v2.0 --dry-run --env=staging');
    expect(parsed['PORT']).toBe(9000);
    expect(parsed['TAG']).toBe('v2.0');
    expect(parsed['DRY_RUN']).toBe(true);
    expect(parsed['ENV']).toBe('staging');

    // Space-separated flags
    const spaceParsed = engine.parseCliOverrides(['--port', '8081', '-t', 'beta']);
    expect(spaceParsed['PORT']).toBe(8081);
    expect(spaceParsed['T']).toBe('beta');
  });

  it('substitutes parameter variables in command strings and paths', () => {
    const templateCmd = 'curl -f http://localhost:{{PORT}}/api/{{TAG}}/health';
    const substituted = engine.substituteParameters(templateCmd, {
      PORT: 9000,
      TAG: 'v1.5'
    });
    expect(substituted).toBe('curl -f http://localhost:9000/api/v1.5/health');

    // Shell style $PORT
    const shellCmd = 'docker run -p $PORT:8080 my-app:${TAG}';
    const shellSub = engine.substituteParameters(shellCmd, {
      PORT: 8080,
      TAG: 'latest'
    });
    expect(shellSub).toBe('docker run -p 8080:8080 my-app:latest');
  });

  it('replays a saved workflow sequentially without LLM inference', async () => {
    const executedCommands: string[] = [];

    const mockWorkflow: SavedWorkflowDefinition = {
      schemaVersion: 1,
      name: 'build-and-deploy',
      steps: [
        { id: '1', name: 'Build', command: 'npm run build' },
        { id: '2', name: 'Deploy', command: 'npm run deploy -- --port={{PORT}}' }
      ],
      parameters: [
        { name: 'PORT', type: 'port', description: 'Port', required: false, defaultValue: 3000 }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const mockExecutor = async (cmd: string) => {
      executedCommands.push(cmd);
      return { code: 0, stdout: 'OK', stderr: '' };
    };

    const result = await engine.replay(mockWorkflow, {
      parameters: { PORT: 9000 },
      autoApprove: true,
      executor: mockExecutor
    });

    expect(result.success).toBe(true);
    expect(result.stepsExecuted).toBe(2);
    expect(executedCommands).toEqual([
      'npm run build',
      'npm run deploy -- --port=9000'
    ]);

    // Verify actions logged in UndoLog
    const recent = UndoLog.getInstance().getRecentActions();
    expect(recent).toHaveLength(2);
    expect(recent[0].command).toContain('npm run deploy');
  });

  it('handles dry-run mode without executing destructive commands', async () => {
    const mockWorkflow: SavedWorkflowDefinition = {
      schemaVersion: 1,
      name: 'clean-workflow',
      steps: [
        { id: '1', name: 'Clean build', command: 'rm -rf target/ dist/', isDestructive: true },
        { id: '2', name: 'Verify', command: 'ls -la' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const executorSpy = vi.fn();

    const result = await engine.replay(mockWorkflow, {
      dryRun: true,
      executor: executorSpy
    });

    expect(result.success).toBe(true);
    expect(result.stepResults[0].status).toBe('skipped_dry_run');
    expect(result.stepResults[0].stdout).toContain('[DRY-RUN] Would execute');
    expect(executorSpy).not.toHaveBeenCalled();
  });

  it('detects and flags environment drift when required ports are invalid', async () => {
    const mockWorkflow: SavedWorkflowDefinition = {
      schemaVersion: 1,
      name: 'server-workflow',
      steps: [{ id: '1', name: 'Run server', command: 'node server.js' }],
      environmentPrerequisites: {
        requiredPorts: [8080]
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Passing invalid port 999999
    const result = await engine.replay(mockWorkflow, {
      parameters: { PORT: 999999 }
    });

    expect(result.success).toBe(false);
    expect(result.environmentValidation.passed).toBe(false);
    expect(result.error).toContain('Invalid port override');
  });

  it('aborts workflow execution when a step fails', async () => {
    const mockWorkflow: SavedWorkflowDefinition = {
      schemaVersion: 1,
      name: 'failing-pipeline',
      steps: [
        { id: '1', name: 'Step 1', command: 'echo first' },
        { id: '2', name: 'Failing Step', command: 'exit 2' },
        { id: '3', name: 'Step 3', command: 'echo should not run' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const mockExecutor = async (cmd: string) => {
      if (cmd === 'exit 2') {
        return { code: 2, stdout: '', stderr: 'Command failed' };
      }
      return { code: 0, stdout: 'ok', stderr: '' };
    };

    const result = await engine.replay(mockWorkflow, {
      autoApprove: true,
      executor: mockExecutor
    });

    expect(result.success).toBe(false);
    expect(result.stepsExecuted).toBe(2); // Stopped at step 2
    expect(result.totalSteps).toBe(3);
    expect(result.stepResults[1].exitCode).toBe(2);
    expect(result.error).toContain('Step failed with exit code 2');
  });

  it('skips step when precondition passes and if_precondition_true is "skip" (Task 0.75.2)', async () => {
    const executedCommands: string[] = [];
    const mockWorkflow: SavedWorkflowDefinition = {
      schemaVersion: 1,
      name: 'precondition-skip-flow',
      steps: [
        {
          id: '1',
          name: 'Install Neovim',
          command: 'sudo pacman -S neovim',
          precondition_check: 'which nvim',
          if_precondition_true: 'skip',
          if_precondition_false: 'continue'
        },
        {
          id: '2',
          name: 'Open Neovim',
          command: 'nvim'
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const mockExecutor = async (cmd: string) => {
      executedCommands.push(cmd);
      if (cmd === 'which nvim') {
        return { code: 0, stdout: '/usr/bin/nvim', stderr: '' };
      }
      return { code: 0, stdout: 'ok', stderr: '' };
    };

    const result = await engine.replay(mockWorkflow, {
      autoApprove: true,
      executor: mockExecutor
    });

    expect(result.success).toBe(true);
    expect(result.stepResults[0].status).toBe('skipped');
    // Verify pacman install was never run, but nvim command was run
    expect(executedCommands).not.toContain('sudo pacman -S neovim');
    expect(executedCommands).toContain('nvim');
  });

  it('aborts workflow when precondition fails and if_precondition_false is "abort" (Task 0.75.2)', async () => {
    const executedCommands: string[] = [];
    const mockWorkflow: SavedWorkflowDefinition = {
      schemaVersion: 1,
      name: 'precondition-abort-flow',
      steps: [
        {
          id: '1',
          name: 'Build Frontend',
          command: 'npm run build',
          precondition_check: 'test -f package.json',
          if_precondition_true: 'continue',
          if_precondition_false: 'abort'
        },
        {
          id: '2',
          name: 'Deploy',
          command: 'npm run deploy'
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const mockExecutor = async (cmd: string) => {
      executedCommands.push(cmd);
      if (cmd === 'test -f package.json') {
        return { code: 1, stdout: '', stderr: 'No such file' };
      }
      return { code: 0, stdout: 'ok', stderr: '' };
    };

    const result = await engine.replay(mockWorkflow, {
      autoApprove: true,
      executor: mockExecutor
    });

    expect(result.success).toBe(false);
    expect(result.stepResults[0].status).toBe('failed');
    expect(result.error).toContain('package.json');
    expect(executedCommands).not.toContain('npm run build');
    expect(executedCommands).not.toContain('npm run deploy');
  });
});

describe('DeterministicReplayEngine — terminal semantics', () => {
  const wf = (steps: Array<{ command: string; cwd?: string }>) => ({
    schemaVersion: 1,
    name: 'chain',
    createdAt: 0,
    updatedAt: 0,
    steps: steps.map((s, i) => ({ id: `s${i + 1}`, name: `step ${i + 1}`, ...s }))
  });

  it('runs steps in the starting folder and carries cd forward like a terminal', async () => {
    const { DeterministicReplayEngine } = await import('./DeterministicReplayEngine');
    const executor = vi.fn(async (cmd: string, cwd?: string) => cmd.endsWith('&& pwd')
      ? { code: 0, stdout: `${cwd}/proj\n`, stderr: '' }
      : { code: 0, stdout: '', stderr: '' });
    const result = await DeterministicReplayEngine.getInstance().replay(wf([
      { command: 'mkdir -p proj' },
      { command: 'cd proj' },
      { command: 'pwd > where.txt' },
      { command: 'cd sub && make' },
      { command: 'ls' },
    ]), { executor, autoApprove: true, cwd: '/tmp/wf' });

    expect(result.success).toBe(true);
    expect(executor.mock.calls.map(c => [c[0], c[1]])).toEqual([
      ['mkdir -p proj', '/tmp/wf'],
      ["cd 'proj' && pwd", '/tmp/wf'],
      ['pwd > where.txt', '/tmp/wf/proj'],
      ['cd sub && make', '/tmp/wf/proj'],
      ['ls', '/tmp/wf/proj/sub'],
    ]);
  });

  it('hands long-running steps to a pane instead of blocking', async () => {
    const { DeterministicReplayEngine } = await import('./DeterministicReplayEngine');
    const executor = vi.fn(async (_cmd: string, _cwd?: string) => ({ code: 0, stdout: '', stderr: '' }));
    const onLongRunning = vi.fn(async () => ({ ok: true, message: 'Running in a new pane' }));
    const result = await DeterministicReplayEngine.getInstance().replay(wf([
      { command: 'npm run dev' },
      { command: 'curl -s localhost:5173' },
    ]), { executor, onLongRunning, autoApprove: true, cwd: '/app' });
    expect(result.success).toBe(true);
    expect(onLongRunning).toHaveBeenCalledWith('npm run dev', '/app', expect.anything());
    expect(executor.mock.calls.map(c => c[0])).toEqual(['curl -s localhost:5173']);
  });

  it('asks once for all commands, and runs nothing when declined', async () => {
    const { DeterministicReplayEngine } = await import('./DeterministicReplayEngine');
    const executor = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }));
    const handler = vi.fn().mockResolvedValue(false);
    const result = await DeterministicReplayEngine.getInstance().replay(wf([
      { command: 'mkdir -p out' },
      { command: 'touch out/a.txt' },
    ]), { executor, autoApprove: true, authorizationHandler: handler, cwd: '/tmp' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].parameters.command).toBe('1. mkdir -p out\n2. touch out/a.txt');
    expect(result.success).toBe(false);
    expect(executor).not.toHaveBeenCalled();
  });
});
