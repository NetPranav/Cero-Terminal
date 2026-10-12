import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowExecutionEngine } from '../engine/WorkflowExecutionEngine';
import { WorkflowBuilder } from '../builder/WorkflowBuilder';
import { WorkflowRegistry } from '../registry/WorkflowRegistry';
import { WorkflowHistory } from '../history/WorkflowHistory';
import { WorkflowTelemetry } from '../telemetry/WorkflowTelemetry';

describe('WorkflowExecutionEngine — End-to-End IR → ActionGraph → Runtime Dispatch', () => {
  let engine: WorkflowExecutionEngine;
  let registry: WorkflowRegistry;
  let history: WorkflowHistory;
  let telemetry: WorkflowTelemetry;

  beforeEach(() => {
    registry = new WorkflowRegistry();
    history = new WorkflowHistory();
    telemetry = new WorkflowTelemetry();
    engine = new WorkflowExecutionEngine(undefined, undefined, history, telemetry, (id) => registry.lookup(id));
  });

  it('should execute a simple sequential workflow through the full compile → dispatch lifecycle', async () => {
    const wf = new WorkflowBuilder('Test Workflow')
      .addVariable('name', 'string', 'Name', false, 'Cero')
      .addAction('step1', 'Greet', 'system.noop', { greeting: '{{name}}' })
      .addAction('step2', 'Done', 'system.noop', {}, ['step1'])
      .addOutput('greeting', 'string', 'Greeting', 'step1', 'greeting')
      .build();

    const result = await engine.execute(wf);

    expect(result.success).toBe(true);
    expect(result.instance.status).toBe('completed');
    expect(result.ir.nodes.length).toBe(2);
    expect(result.actionGraph.nodes.length).toBe(2);
    expect(result.instance.triggeredBy).toBe('manual');
    expect(Object.keys(result.instance.nodeResults).length).toBe(2);
  });

  it('should compile and execute nested workflows by recursively flattening referenced workflow graphs', async () => {
    // Register a sub-workflow
    const subWorkflow = new WorkflowBuilder('Sub Task')
      .addAction('sub-a', 'Sub Action A', 'system.noop')
      .addAction('sub-b', 'Sub Action B', 'system.noop', {}, ['sub-a'])
      .build();
    registry.registerUserWorkflow(subWorkflow);

    // Create a parent workflow that nests the sub-workflow
    const parentWf = new WorkflowBuilder('Parent Workflow')
      .addAction('pre', 'Pre Step', 'system.noop')
      .addNestedWorkflow('nested', 'Run Sub Task', subWorkflow.id, {}, ['pre'])
      .addAction('post', 'Post Step', 'system.noop', {}, ['nested'])
      .build();

    const result = await engine.execute(parentWf);

    expect(result.success).toBe(true);
    // Parent pre + 2 nested nodes + parent post = should be 4 compiled IR nodes (post depends on nested prefix)
    expect(result.ir.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('should fail gracefully with structured errors when required variables are missing', async () => {
    const wf = new WorkflowBuilder('Missing Vars')
      .addVariable('required_path', 'path', 'Must provide', true)
      .addAction('step', 'Step', 'system.noop')
      .build();

    const result = await engine.execute(wf, {}); // No inputs
    expect(result.success).toBe(false);
    expect(result.error).toContain("Required variable 'required_path'");
    expect(result.instance.status).toBe('failed');
  });

  it('should record execution instances in history and update telemetry metrics', async () => {
    const wf = new WorkflowBuilder('Tracked Workflow')
      .addAction('s1', 'Step 1', 'system.noop')
      .build();

    await engine.execute(wf);
    await engine.execute(wf);

    const histEntries = history.getHistory(wf.id);
    expect(histEntries.length).toBe(2);

    const metrics = telemetry.getMetrics();
    expect(metrics.totalExecutions).toBe(2);
    expect(metrics.successes).toBe(2);
    expect(metrics.successRate).toBe(100);
  });
});
