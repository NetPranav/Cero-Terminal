import { describe, it, expect, vi } from 'vitest';
import { AdaptivePlanEngine } from './AdaptivePlanEngine';
import { MultistagePromptDecomposer } from '../../workflows/engine/MultistagePromptDecomposer';
import { LocalIntentClassifier } from '../models/IntentModel';

describe('Issue 2: Complex Multi-Step Workflow Planning & Execution', () => {
  const complexPrompt = `Create a temporary testing workspace at /tmp/sentinel-workflow-test.

Inside it:
1. Create a directory called project.
2. Inside project create three files: frontend.txt, backend.txt, and README.md.
3. Put "Frontend module" inside frontend.txt.
4. Put "Backend module" inside backend.txt.
5. Put "Sentinel Workflow Test" inside README.md.
6. Finally list the project directory and display the contents of all three files.

After successfully completing all of these steps, save the verified execution as a workflow named workflow-basic-test.`;

  it('correctly extracts natural language workflow save directive and inner task prompt', () => {
    const decomposer = MultistagePromptDecomposer.getInstance();
    const directive = decomposer.extractSaveAsDirective(complexPrompt);

    expect(directive.isSaveAsWorkflow).toBe(true);
    expect(directive.workflowName).toBe('workflow-basic-test');
    expect(directive.taskPrompt).toContain('Create a temporary testing workspace at /tmp/sentinel-workflow-test.');
    expect(directive.taskPrompt).toContain('Finally list the project directory');
    expect(directive.taskPrompt).not.toContain('save the verified execution');
  });

  it('routes compound procedural multi-step instructions away from pure workflow commands', async () => {
    const intentModel = new LocalIntentClassifier();
    const intent = await intentModel.classify(complexPrompt);

    // Should not route to workflow domain when the prompt is a complex procedural task
    expect(intent.domain).not.toBe('workflow');
  });

  it('decomposes numbered procedural prompt into executable phases with non-empty shell commands', async () => {
    const engine = new AdaptivePlanEngine();
    const plan = await engine.createPlan(complexPrompt, { os: 'linux', cwd: '/home/user' });

    expect(plan.phases.length).toBeGreaterThanOrEqual(6);

    for (const phase of plan.phases) {
      expect(phase.tool).toBe('shell.execute');
      expect(phase.params?.command).toBeDefined();
      expect(typeof phase.params?.command).toBe('string');
      expect((phase.params!.command as string).trim().length).toBeGreaterThan(0);
    }

    // Verify key synthesized commands
    const commands = plan.phases.map(p => p.params?.command as string);
    expect(commands.some(cmd => cmd.includes('mkdir -p') && cmd.includes('/tmp/sentinel-workflow-test'))).toBe(true);
    expect(commands.some(cmd => cmd.includes('touch') || cmd.includes('frontend.txt'))).toBe(true);
    expect(commands.some(cmd => cmd.includes('echo') && cmd.includes('Frontend module'))).toBe(true);
    expect(commands.some(cmd => cmd.includes('echo') && cmd.includes('Backend module'))).toBe(true);
    expect(commands.some(cmd => cmd.includes('echo') && cmd.includes('Sentinel Workflow Test'))).toBe(true);
    expect(commands.some(cmd => cmd.includes('ls') && cmd.includes('cat'))).toBe(true);
  });

  it('executes the full multi-phase plan without throwing missing shell command errors', async () => {
    const engine = new AdaptivePlanEngine();
    const plan = await engine.createPlan(complexPrompt, { os: 'linux', cwd: '/home/user' });

    const executedCommands: string[] = [];
    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockImplementation(async (tool: string, params: any) => {
        if (tool === 'shell.execute') {
          if (!params?.command || typeof params.command !== 'string') {
            return {
              success: false,
              error: { code: 'MISSING_SHELL_CMD', message: 'Command string required for shell.execute' }
            };
          }
          executedCommands.push(params.command);
          return { success: true, data: { stdout: `Executed: ${params.command}`, code: 0 } };
        }
        return { success: true, data: {} };
      })
    };

    const phaseStarted: string[] = [];
    const result = await engine.executePlan(complexPrompt, plan, {
      cwd: '/home/user',
      os: 'linux',
      toolExecutor: mockToolExecutor,
      onPhaseStart: (p) => phaseStarted.push(p.id)
    });

    expect(result.success).toBe(true);
    expect(result.summary).not.toContain('Command string required for shell.execute');
    expect(executedCommands.length).toBe(plan.phases.length);

    // All phases marked completed
    for (const phase of plan.phases) {
      expect(phase.status).toBe('completed');
    }
  });

  it('correctly maps LLM JSON response that provides phases with explicit commands and params', async () => {
    const mockModelProvider = {
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          summary: 'Setup testing workspace and files',
          phases: [
            {
              id: '1',
              title: 'Create workspace directory',
              tool: 'shell.execute',
              params: { command: 'mkdir -p /tmp/sentinel-workflow-test/project', explanation: 'Create workspace' }
            },
            {
              id: '2',
              title: 'Create files',
              tool: 'shell.execute',
              params: { command: 'touch /tmp/sentinel-workflow-test/project/frontend.txt', explanation: 'Touch file' }
            }
          ]
        })
      })
    };

    const engine = new AdaptivePlanEngine(mockModelProvider, 'mock-model');
    const plan = await engine.createPlan('create workspace', { os: 'linux', cwd: '/home/user' });

    expect(plan.phases.length).toBe(2);
    expect(plan.phases[0].params?.command).toBe('mkdir -p /tmp/sentinel-workflow-test/project');
    expect(plan.phases[1].params?.command).toBe('touch /tmp/sentinel-workflow-test/project/frontend.txt');
  });

  it('records and persists verified workflow execution when save directive is present', async () => {
    const decomposer = MultistagePromptDecomposer.getInstance();
    const directive = decomposer.extractSaveAsDirective(complexPrompt);
    expect(directive.isSaveAsWorkflow).toBe(true);

    const engine = new AdaptivePlanEngine();
    const plan = await engine.createPlan(directive.taskPrompt, { os: 'linux', cwd: '/home/user' });

    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockImplementation(async (_tool: string, params: any) => ({
        success: true,
        data: { stdout: `Executed: ${params.command}`, code: 0 }
      }))
    };

    const executionResult = await engine.executePlan(directive.taskPrompt, plan, {
      cwd: '/home/user',
      os: 'linux',
      toolExecutor: mockToolExecutor
    });

    expect(executionResult.success).toBe(true);

    // Verify shell steps can be serialized into a SavedWorkflowDefinition with schemaVersion 1
    const { WorkflowRecorder } = await import('../../workflows/engine/WorkflowRecorder');
    const { DiskWorkflowStorage } = await import('../../workflows/storage/DiskWorkflowStorage');
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-wf-test-'));
    DiskWorkflowStorage.getInstance().setCustomBaseDir(tmpDir);

    try {
      const shellSteps = executionResult.steps
        .filter(s => s.tool === 'shell.execute' && s.params?.command)
        .map(s => ({
          command: s.params.command as string,
          name: (s.params.explanation as string) || (s.params.command as string).slice(0, 40),
          cwd: '/home/user',
          output: s.result?.data?.stdout || '',
          exitCode: 0
        }));

      expect(shellSteps.length).toBeGreaterThanOrEqual(6);

      const recorder = WorkflowRecorder.getInstance();
      const savedWf = await recorder.saveFromCommands(directive.workflowName!, shellSteps, {
        description: `Verified execution for: ${directive.taskPrompt}`
      });

      expect(savedWf).toBeDefined();
      expect(savedWf.schemaVersion).toBe(1);
      expect(savedWf.name).toBe('workflow-basic-test');
      expect(savedWf.steps.length).toBe(shellSteps.length);

      // Verify file written to custom disk storage
      const loaded = await DiskWorkflowStorage.getInstance().loadWorkflow('workflow-basic-test');
      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe('workflow-basic-test');
      expect(loaded?.schemaVersion).toBe(1);
      expect(loaded?.steps.length).toBe(shellSteps.length);
    } finally {
      DiskWorkflowStorage.getInstance().setCustomBaseDir(undefined);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
