import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DiskWorkflowStorage } from './DiskWorkflowStorage';
import { SavedWorkflowDefinition, CURRENT_WORKFLOW_SCHEMA_VERSION } from '../models/WorkflowTypes';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('DiskWorkflowStorage (Schema-Versioned Persistence)', () => {
  let tempDir: string;
  let storage: DiskWorkflowStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cero-wf-test-'));
    storage = new DiskWorkflowStorage(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('saves and loads a workflow with schemaVersion 1', async () => {
    const wf: SavedWorkflowDefinition = {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      name: 'deploy-staging',
      description: 'Build and deploy staging pipeline',
      steps: [
        {
          id: 'step-1',
          name: 'Build project',
          command: 'npm run build',
          cwd: '/tmp/proj'
        },
        {
          id: 'step-2',
          name: 'Run healthcheck',
          command: 'curl http://localhost:8080/health',
          expectedExitCode: 0,
          validationCriteria: 'status 200'
        }
      ],
      parameters: [
        {
          name: 'PORT',
          type: 'port',
          description: 'Target healthcheck port',
          required: false,
          defaultValue: 8080
        }
      ],
      environmentPrerequisites: {
        requiredBinaries: ['npm', 'curl'],
        requiredPorts: [8080]
      },
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      tags: ['deployment', 'staging']
    };

    const filePath = await storage.saveWorkflow(wf);
    expect(fs.existsSync(filePath)).toBe(true);

    const loaded = await storage.loadWorkflow('deploy-staging');
    expect(loaded).toBeDefined();
    expect(loaded?.schemaVersion).toBe(1);
    expect(loaded?.name).toBe('deploy-staging');
    expect(loaded?.steps).toHaveLength(2);
    expect(loaded?.steps[0].command).toBe('npm run build');
    expect(loaded?.steps[1].command).toBe('curl http://localhost:8080/health');
    expect(loaded?.parameters?.[0].name).toBe('PORT');
    expect(loaded?.environmentPrerequisites?.requiredPorts).toEqual([8080]);
  });

  it('migrates legacy unversioned workflow JSON format into schemaVersion 1', async () => {
    const legacyJson = JSON.stringify({
      name: 'legacy-build',
      steps: ['git pull', 'cargo build --release', 'cargo test']
    });

    const filePath = path.join(tempDir, 'legacy-build.json');
    fs.writeFileSync(filePath, legacyJson, 'utf8');

    const loaded = await storage.loadWorkflow('legacy-build');
    expect(loaded).toBeDefined();
    expect(loaded?.schemaVersion).toBe(1);
    expect(loaded?.name).toBe('legacy-build');
    expect(loaded?.steps).toHaveLength(3);
    expect(loaded?.steps[0].command).toBe('git pull');
    expect(loaded?.steps[1].command).toBe('cargo build --release');
    expect(loaded?.steps[2].command).toBe('cargo test');
    expect(loaded?.tags).toContain('migrated');
  });

  it('rejects unsupported future schema versions with descriptive error', async () => {
    const futureJson = JSON.stringify({
      schemaVersion: 99,
      name: 'future-workflow',
      steps: []
    });

    const filePath = path.join(tempDir, 'future-workflow.json');
    fs.writeFileSync(filePath, futureJson, 'utf8');

    await expect(storage.loadWorkflow('future-workflow')).rejects.toThrow(
      /Unsupported workflow schema version 99/
    );
  });

  it('lists and deletes saved workflows correctly', async () => {
    await storage.saveWorkflow({
      schemaVersion: 1,
      name: 'wf-one',
      steps: [{ id: 's1', name: 'S1', command: 'echo 1' }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    await storage.saveWorkflow({
      schemaVersion: 1,
      name: 'wf-two',
      steps: [{ id: 's2', name: 'S2', command: 'echo 2' }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    const list = await storage.listWorkflows();
    expect(list.map(w => w.name).sort()).toEqual(['wf-one', 'wf-two']);

    const deleted = await storage.deleteWorkflow('wf-one');
    expect(deleted).toBe(true);

    const remaining = await storage.listWorkflows();
    expect(remaining.map(w => w.name)).toEqual(['wf-two']);
  });

  it('initializes selected starter workflows and purges test stubs', async () => {
    // Simulate test stubs
    fs.writeFileSync(path.join(tempDir, 'desktop-reset.json'), JSON.stringify({ name: 'desktop-reset' }), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'db-sync.json'), JSON.stringify({ name: 'db-sync' }), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'custom-user-wf.json'), JSON.stringify({
      schemaVersion: 1,
      name: 'custom-user-wf',
      steps: [{ id: 's1', name: 'Step 1', command: 'echo hello' }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }), 'utf8');

    const initialList = await storage.listWorkflows();
    expect(initialList.length).toBe(3);

    // Purge test stubs
    const purged = await storage.purgeTestStubs();
    expect(purged).toContain('desktop-reset');
    expect(purged).toContain('db-sync');
    expect(purged).not.toContain('custom-user-wf');

    const afterPurge = await storage.listWorkflows();
    expect(afterPurge.map(w => w.name)).toEqual(['custom-user-wf']);

    // Initialize starter workflows
    const initialized = await storage.initializeStarterWorkflows(
      ['git-quick-sync', 'system-diagnostics'],
      false
    );
    expect(initialized.length).toBe(2);

    const finalList = await storage.listWorkflows();
    const finalNames = finalList.map(w => w.name).sort();
    expect(finalNames).toEqual(['custom-user-wf', 'git-quick-sync', 'system-diagnostics']);

    // Verify git-quick-sync definition
    const gitWf = await storage.loadWorkflow('git-quick-sync');
    expect(gitWf).toBeDefined();
    expect(gitWf?.schemaVersion).toBe(1);
    expect(gitWf?.steps.length).toBe(4);
  });

  it('purges all workflows when requested', async () => {
    await storage.initializeStarterWorkflows(['git-quick-sync', 'network-open-ports'], false);
    const countBefore = (await storage.listWorkflows()).length;
    expect(countBefore).toBe(2);

    const purgedCount = await storage.purgeAllWorkflows();
    expect(purgedCount).toBe(2);

    const countAfter = (await storage.listWorkflows()).length;
    expect(countAfter).toBe(0);
  });

  it('saveWorkflow creates name.flow, never name.json', async () => {
    const filePath = await storage.saveWorkflow({
      schemaVersion: 1,
      name: 'unique-flow',
      steps: [{ id: 's1', name: 'Step 1', command: 'echo unique' }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    expect(filePath.endsWith('unique-flow.flow')).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'unique-flow.json'))).toBe(false);

    // Verify it is a valid .flow JSON document
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(content.schemaVersion).toBe('1.0');
    expect(content.actions).toBeDefined();
    expect(content.actions[0].command).toBe('echo unique');
  });

  it('listWorkflows shows a legacy .json once, and .flow wins when both exist', async () => {
    // Write legacy .json
    const legacyPath = path.join(tempDir, 'shared_flow.json');
    fs.writeFileSync(legacyPath, JSON.stringify({
      schemaVersion: 1,
      name: 'shared_flow',
      steps: [{ id: 's1', name: 'Legacy Step', command: 'echo legacy' }]
    }), 'utf8');

    // Also write a .flow for the same workflow name
    const flowPath = path.join(tempDir, 'shared_flow.flow');
    fs.writeFileSync(flowPath, JSON.stringify({
      schemaVersion: '1.0',
      metadata: { name: 'shared_flow' },
      actions: [{ type: 'command', name: 'Flow Step', command: 'echo flow' }]
    }), 'utf8');

    const list = await storage.listWorkflows();
    const matching = list.filter(w => w.name === 'shared_flow');
    expect(matching).toHaveLength(1);
    expect(matching[0].steps[0].command).toBe('echo flow');
  });

  it('migration creates the .flow and leaves .json.bak without deleting', async () => {
    const legacyPath = path.join(tempDir, 'old_script.json');
    fs.writeFileSync(legacyPath, JSON.stringify({
      schemaVersion: 1,
      name: 'old_script',
      steps: [{ id: 's1', name: 'Step', command: 'echo old' }]
    }), 'utf8');

    const converted = await storage.migrateLegacyJsonWorkflows();
    expect(converted).toBe(1);

    expect(fs.existsSync(path.join(tempDir, 'old_script.flow'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'old_script.json.bak'))).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.migrated-flow'))).toBe(true);

    // Subsequent migration run does nothing
    const secondRun = await storage.migrateLegacyJsonWorkflows();
    expect(secondRun).toBe(0);
  });

  it('no source file builds a path ending in .json under workflows/', () => {
    const srcDir = path.resolve(__dirname, '../../..');
    const walk = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          if (file !== 'node_modules' && file !== '__tests__' && file !== '.git') {
            results = results.concat(walk(full));
          }
        } else if (/\.(ts|tsx)$/.test(file) && !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')) {
          results.push(full);
        }
      }
      return results;
    };

    const sourceFiles = walk(srcDir);
    const violations: { file: string; line: number; text: string }[] = [];

    // Check for patterns building .json paths under workflows
    const forbiddenPattern = /(?:workflows[\\/].*\.json|workflows`?\$?\{.*\}\.json)/i;

    for (const file of sourceFiles) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        // Exclude comments
        const clean = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        if (forbiddenPattern.test(clean)) {
          violations.push({ file: path.relative(srcDir, file), line: idx + 1, text: line.trim() });
        }
      });
    }

    expect(violations).toEqual([]);
  });
});


describe('DiskWorkflowStorage.toShellPath', () => {
  it('single-quotes paths so a name like $(cmd) or `cmd` is never expanded', () => {
    const storage = new DiskWorkflowStorage('/tmp/wf');
    expect(storage.toShellPath('/tmp/wf/a.flow')).toBe("'/tmp/wf/a.flow'");
    expect(storage.toShellPath('/tmp/wf/$(touch x)`id`.flow')).toBe("'/tmp/wf/$(touch x)`id`.flow'");
    expect(storage.toShellPath("/tmp/it's.flow")).toBe("'/tmp/it'\\''s.flow'");
    expect(storage.toShellPath('~/.cero/w$(x).flow')).toBe(`"$HOME"/'.cero/w$(x).flow'`);
    expect(storage.toShellPath('~')).toBe('"$HOME"');
  });
});
