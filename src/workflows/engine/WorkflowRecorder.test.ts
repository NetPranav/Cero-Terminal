import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowRecorder } from './WorkflowRecorder';
import { DiskWorkflowStorage } from '../storage/DiskWorkflowStorage';
import { UndoLog } from '../../domain/session/UndoLog';
import { AgentPlan } from '../../ai/agent/AdaptivePlanEngine';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('WorkflowRecorder', () => {
  let tempDir: string;
  let storage: DiskWorkflowStorage;
  let recorder: WorkflowRecorder;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cero-rec-test-'));
    storage = new DiskWorkflowStorage(tempDir);
    recorder = new WorkflowRecorder(storage);
    UndoLog.getInstance().clear();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('records a workflow from direct command list with schemaVersion 1', async () => {
    const commands = [
      'git checkout -b release/1.0',
      'npm run build',
      'npm test',
      'curl http://localhost:8080/health'
    ];

    const wf = await recorder.saveFromCommands('release-gate', commands, {
      description: 'Pre-release validation gate'
    });

    expect(wf.schemaVersion).toBe(1);
    expect(wf.name).toBe('release-gate');
    expect(wf.steps).toHaveLength(4);
    expect(wf.steps[0].command).toBe('git checkout -b release/1.0');
    expect(wf.steps[3].command).toBe('curl http://localhost:8080/health');
    expect(wf.environmentPrerequisites?.requiredPorts).toContain(8080);
    expect(wf.environmentPrerequisites?.requiredBinaries).toContain('npm');

    // Verify it exists in storage
    const loaded = await storage.loadWorkflow('release-gate');
    expect(loaded).toBeDefined();
    expect(loaded?.steps).toHaveLength(4);
  });

  it('records a workflow from an executed AgentPlan', async () => {
    const mockPlan: AgentPlan = {
      summary: 'Staging deployment pipeline',
      steps: ['Build frontend', 'Package container'],
      phases: [
        {
          id: '1',
          title: 'Build UI',
          status: 'completed',
          params: { command: 'npm run build' }
        },
        {
          id: '2',
          title: 'Run Container',
          status: 'completed',
          params: { command: 'docker run -p 3000:3000 my-app' }
        },
        {
          id: '3',
          title: 'Skipped Phase',
          status: 'skipped'
        }
      ]
    };

    const wf = await recorder.saveFromPlan('staging-deploy', mockPlan);
    expect(wf.name).toBe('staging-deploy');
    expect(wf.steps).toHaveLength(2); // Skipped phase is omitted
    expect(wf.steps[0].command).toBe('npm run build');
    expect(wf.steps[1].command).toContain('docker run');
    expect(wf.environmentPrerequisites?.requiredPorts).toContain(3000);
  });

  it('records a workflow from session UndoLog actions', async () => {
    const undoLog = UndoLog.getInstance();
    const sessionId = 'test-session-recorder';

    undoLog.recordAction({
      sessionId,
      command: 'git pull origin main',
      goal: 'Pull latest code',
      isDestructive: false
    });

    undoLog.recordAction({
      sessionId,
      command: 'cargo build --release',
      goal: 'Build release binary',
      isDestructive: false
    });

    undoLog.recordAction({
      sessionId,
      command: 'cargo test',
      goal: 'Run unit test suite',
      isDestructive: false
    });

    const wf = await recorder.saveFromUndoLog('build-and-test', sessionId);
    expect(wf.name).toBe('build-and-test');
    expect(wf.steps).toHaveLength(3);
    expect(wf.steps[0].command).toBe('git pull origin main');
    expect(wf.steps[1].command).toBe('cargo build --release');
    expect(wf.steps[2].command).toBe('cargo test');
  });
});
