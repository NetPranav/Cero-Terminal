import { describe, it, expect } from 'vitest';
import { parseSaveIntent, suggestWorkflowName, lastStepCount, cleanName } from './SaveIntent';

type Row = [string, { task: string; name?: string; position: string }];

describe('parseSaveIntent: save requests', () => {
  const rows: Row[] = [
    ['open gitbrains in vs code and save this as a workflow', { task: 'open gitbrains in vs code', name: undefined, position: 'end' }],
    ['open gitbrains in vs code, save this as a workflow', { task: 'open gitbrains in vs code', name: undefined, position: 'end' }],
    ['open gitbrains in vs code and save it as a workflow called git brains', { task: 'open gitbrains in vs code', name: 'git brains', position: 'end' }],
    ['open gitbrains in vs code then save it as a workflow named gitbrains.', { task: 'open gitbrains in vs code', name: 'gitbrains', position: 'end' }],
    ['open gmail, save it as a workflow, then open spotify', { task: 'open gmail, then open spotify', name: undefined, position: 'middle' }],
    ['open gmail and save this as a workflow called morning setup then open spotify', { task: 'open gmail then open spotify', name: 'morning setup', position: 'middle' }],
    ['save it as a workflow called x: open gmail', { task: 'open gmail', name: 'x', position: 'start' }],
    ['install node and save this as workflow', { task: 'install node', position: 'end' }],
    ['install node and save the result as a workflow named node-setup', { task: 'install node', name: 'node-setup', position: 'end' }],
    ['install node, store it as a workflow called "my node setup"', { task: 'install node', name: 'my node setup', position: 'end' }],
    ["install node, keep this as a flow called 'node setup'", { task: 'install node', name: 'node setup', position: 'end' }],
    ['install node and record all this as a reusable workflow', { task: 'install node', position: 'end' }],
    ['install node and remember that as a macro called setup', { task: 'install node', name: 'setup', position: 'end' }],
    ['open gmail and turn this into a workflow', { task: 'open gmail', position: 'end' }],
    ['open gmail and make this into a workflow called mail', { task: 'open gmail', name: 'mail', position: 'end' }],
    ['open gmail and please save it as a .flow', { task: 'open gmail', position: 'end' }],
    ['OPEN GMAIL AND SAVE THIS AS A WORKFLOW CALLED MAIL', { task: 'OPEN GMAIL', name: 'MAIL', position: 'end' }],
    ['what is the weather and save this as a workflow called weather', { task: 'what is the weather', name: 'weather', position: 'end' }],
    ['open gmail :: save workflow mail', { task: 'open gmail', name: 'mail', position: 'end' }],
    ['open gmail :: save as workflow a-very-long-name-with-many-parts', { task: 'open gmail', name: 'a-very-long-name-with-many-parts', position: 'end' }],
    ['> open gmail and save this as a workflow called mail', { task: 'open gmail', name: 'mail', position: 'end' }],
    ['After successfully completing all of these steps, save the verified execution as a workflow named workflow-basic-test.', { task: '', name: 'workflow-basic-test', position: 'end' }],
    ['open gmail and save everything as a workflow called mail workflow', { task: 'open gmail', name: 'mail', position: 'end' }],
    ['open gmail and save these steps as a workflow called a b c d e f g h', { task: 'open gmail', name: 'a b c d e f', position: 'end' }],
    ['open gmail and save the steps as a workflow called daily check; then open slack', { task: 'open gmail then open slack', name: 'daily check', position: 'middle' }],
  ];
  for (const [input, expected] of rows) {
    it(`understands: ${input}`, () => {
      const out = parseSaveIntent(input);
      expect(out.save).toBe(true);
      expect(out.task).toBe(expected.task);
      expect(out.name).toBe(expected.name);
      expect(out.position).toBe(expected.position);
    });
  }

  it('treats a bare "save this as a workflow" as the retrospective form', () => {
    for (const p of ['save this as a workflow', 'save this as a workflow called nightly', 'save the last 3 steps as a workflow called x']) {
      const out = parseSaveIntent(p);
      expect(out.save).toBe(true);
      expect(out.task).toBe('');
    }
    expect(parseSaveIntent('save this as a workflow called nightly').name).toBe('nightly');
  });
});

describe('parseSaveIntent: where to save', () => {
  it('reads a place and removes it from the task', () => {
    const a = parseSaveIntent('open gmail and save it as a workflow called mail on the desktop');
    expect(a).toMatchObject({ task: 'open gmail', name: 'mail', place: 'desktop' });
    const b = parseSaveIntent('open gmail and save this as a workflow in this folder');
    expect(b).toMatchObject({ task: 'open gmail', place: 'here' });
    expect(parseSaveIntent('open gmail and save this as a workflow').place).toBeUndefined();
  });
});

describe('parseSaveIntent: never triggers on talk about workflows', () => {
  const negatives = [
    'how do I save a workflow?',
    'what is a workflow',
    'list my workflows',
    'delete the workflow x',
    'run the workflow morning',
    'explain how to save this as a workflow',
    'can you explain workflows',
    'open the workflow manager',
    'show my flows',
    'open gmail',
    'install node and open vscode',
    'is there a way to save it as a workflow',
    'how to save this as a workflow',
    'what does save this as a workflow do',
  ];
  for (const p of negatives) {
    it(`ignores: ${p}`, () => {
      const out = parseSaveIntent(p);
      expect(out.save).toBe(false);
      expect(out.task).toBe(p);
    });
  }

  it('leaves "make me a workflow that ..." to the make-a-file route', () => {
    expect(parseSaveIntent('make me a workflow called morning that opens youtube, then opens gmail').save).toBe(false);
    expect(parseSaveIntent('create a workflow that installs node').save).toBe(false);
    expect(parseSaveIntent('save this as a workflow called x: open gmail').save).toBe(false);
  });
});

describe('helpers', () => {
  it('suggests a short slug from the task', () => {
    expect(suggestWorkflowName('open gitBrains in VS Code')).toBe('open-gitbrains-in-vs-code');
    expect(suggestWorkflowName('???')).toBe('my-workflow');
  });
  it('reads the step count', () => {
    expect(lastStepCount('save the last 3 steps as a workflow')).toBe(3);
    expect(lastStepCount('save this as a workflow')).toBe(10);
  });
  it('cleans names', () => {
    expect(cleanName('Morning Setup Workflow')).toBe('Morning Setup');
    expect(cleanName('!!!')).toBeUndefined();
  });
});
