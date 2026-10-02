import { describe, it, expect } from 'vitest';
import { workflowToFlow, slug } from './FlowExport';
import { flowToWorkflow } from '../storage/FlowImport';
import { SavedWorkflowDefinition } from '../models/WorkflowTypes';

describe('FlowExport', () => {
  it('slug generates clean lower-case names with dashes and underscores', () => {
    expect(slug('My Flow')).toBe('my_flow');
    expect(slug('Release-Gate v1.0!')).toBe('release-gate_v1.0');
    expect(slug('  spaces and tabs  ')).toBe('spaces_and_tabs');
    expect(slug('___already_clean___')).toBe('already_clean');
  });

  it('performs lossless roundtrip def -> workflowToFlow -> flowToWorkflow', () => {
    const original: SavedWorkflowDefinition = {
      schemaVersion: 1,
      name: 'Deploy Service',
      description: 'Deploy service with healthcheck',
      steps: [
        {
          id: 'step-1',
          name: 'Lint & Build',
          command: 'npm run build',
          cwd: '~/app',
          platformCommands: {
            macos: 'npm run build:mac',
            linux: 'npm run build:linux',
            windows: 'npm.cmd run build:win'
          },
          timeoutMs: 60000,
          expectedExitCode: 0,
          precondition_check: 'test -f package.json',
          if_precondition_true: 'continue',
          if_precondition_false: 'abort',
          isDestructive: false
        },
        {
          id: 'step-2',
          name: 'Deploy image',
          command: 'docker compose up -d',
          cwd: '~/app',
          dependsOn: ['step-1'],
          isDestructive: true
        }
      ],
      parameters: [
        { name: 'env', type: 'string', required: false, description: 'Target environment', defaultValue: 'production' }
      ],
      createdAt: 1700000000000,
      updatedAt: 1700000010000,
      author: 'Sentinel Developer',
      tags: ['deployment', 'ci', 'flow']
    };

    const flowDoc = workflowToFlow(original);
    expect(flowDoc.schemaVersion).toBe('1.0');
    expect(flowDoc.metadata.name).toBe('Deploy Service');
    expect(flowDoc.actions).toHaveLength(2);
    expect(flowDoc.actions[0].command).toBe('npm run build');
    expect(flowDoc.actions[0].macos).toBe('npm run build:mac');
    expect(flowDoc.actions[0].x?.precondition_check).toBe('test -f package.json');
    expect(flowDoc.actions[1].x?.dependsOn).toEqual(['step-1']);
    expect(flowDoc.actions[1].x?.isDestructive).toBe(true);

    const reconstructed = flowToWorkflow(flowDoc, 'deploy-service', 'linux');
    expect(reconstructed).not.toBeNull();
    expect(reconstructed!.name).toBe(original.name);
    expect(reconstructed!.description).toBe(original.description);
    expect(reconstructed!.parameters).toEqual(original.parameters);
    expect(reconstructed!.author).toBe(original.author);
    expect(reconstructed!.tags).toEqual(original.tags);

    // Verify step fields survived
    const s1 = reconstructed!.steps[0];
    expect(s1.name).toBe('Lint & Build');
    expect(s1.precondition_check).toBe('test -f package.json');
    expect(s1.if_precondition_true).toBe('continue');
    expect(s1.if_precondition_false).toBe('abort');
    expect(s1.timeoutMs).toBe(60000);
    expect(s1.expectedExitCode).toBe(0);

    const s2 = reconstructed!.steps[1];
    expect(s2.name).toBe('Deploy image');
    expect(s2.dependsOn).toEqual(['step-1']);
    expect(s2.isDestructive).toBe(true);
  });
});
