/**
 * WorkflowExecutionEngine.ts — Workflow Lifecycle Orchestrator
 *
 * Strictly follows the Runtime Reuse principle:
 *   Resolve Variables → Compile IR → Compile ActionGraph → Call Runtime.execute()
 *
 * NEVER executes Actions directly. Exactly one execution pipeline exists in Cero.
 */

import {
  UserWorkflow,
  WorkflowInstance,
  WorkflowInstanceStatus,
  WorkflowIR,
} from '../models/WorkflowTypes';
import { ActionGraph } from '../../actions/models/ActionTypes';
import { WorkflowIRCompiler, WorkflowLookup } from './WorkflowIRCompiler';
import { WorkflowGraphCompiler } from './WorkflowGraphCompiler';
import { WorkflowHistory, globalWorkflowHistory } from '../history/WorkflowHistory';
import { WorkflowTelemetry, globalWorkflowTelemetry } from '../telemetry/WorkflowTelemetry';

export interface WorkflowExecutionResult {
  readonly instance: WorkflowInstance;
  readonly ir: WorkflowIR;
  readonly actionGraph: ActionGraph;
  readonly success: boolean;
  readonly error?: string;
}

export class WorkflowExecutionEngine {
  private irCompiler: WorkflowIRCompiler;
  private graphCompiler: WorkflowGraphCompiler;
  private history: WorkflowHistory;
  private telemetry: WorkflowTelemetry;
  private workflowLookup?: WorkflowLookup;

  constructor(
    irCompiler?: WorkflowIRCompiler,
    graphCompiler?: WorkflowGraphCompiler,
    history?: WorkflowHistory,
    telemetry?: WorkflowTelemetry,
    workflowLookup?: WorkflowLookup
  ) {
    this.irCompiler = irCompiler || new WorkflowIRCompiler();
    this.graphCompiler = graphCompiler || new WorkflowGraphCompiler();
    this.history = history || globalWorkflowHistory;
    this.telemetry = telemetry || globalWorkflowTelemetry;
    this.workflowLookup = workflowLookup;
  }

  /**
   * Execute a workflow: resolve → compile IR → compile ActionGraph → dispatch.
   * The actual ActionGraph execution would be delegated to the Phase 4 Runtime.
   */
  public async execute(
    workflow: UserWorkflow,
    userInputs: Record<string, unknown> = {},
    triggeredBy: 'manual' | 'on_login' | 'on_startup' | 'daily' | 'weekly' | 'cron' | 'filesystem_event' | 'application_event' | 'api' = 'manual'
  ): Promise<WorkflowExecutionResult> {
    const start = performance.now();
    const instanceId = `inst-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // 1. Compile Workflow → IR
    const { ir, errors: irErrors } = this.irCompiler.compile(
      workflow,
      userInputs,
      this.workflowLookup
    );

    if (irErrors.length > 0) {
      const failedInstance = this.createInstance(instanceId, workflow.id, 'failed', start, triggeredBy, ir.resolvedVariables, irErrors.join('; '));
      this.history.recordExecution(failedInstance);
      this.telemetry.recordExecution(false, performance.now() - start, workflow.id);

      return {
        instance: failedInstance,
        ir,
        actionGraph: { nodes: [], executionOrder: [], parallelGroups: [], unresolvedGoals: [], ambiguities: [], confidence: 0 },
        success: false,
        error: irErrors.join('; '),
      };
    }

    // 2. Compile IR → ActionGraph
    const actionGraph = this.graphCompiler.compile(ir);

    // 3. Dispatch ActionGraph to Phase 4 Runtime (mocked in this phase)
    // In production: await executionEngine.executeGraph(actionGraph, session);
    const durationMs = performance.now() - start;
    const success = actionGraph.nodes.length > 0;

    const nodeResults: Record<string, any> = {};
    for (const node of actionGraph.nodes) {
      nodeResults[node.id] = {
        nodeId: node.id,
        status: 'completed',
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 1,
        outputs: node.inputs,
      };
    }

    // 4. Collect declared outputs
    const collectedOutputs: Record<string, unknown> = {};
    for (const decl of ir.declaredOutputs) {
      const nodeResult = nodeResults[decl.sourceNodeId];
      if (nodeResult?.outputs) {
        collectedOutputs[decl.name] = nodeResult.outputs[decl.sourceKey];
      }
    }

    const instance = this.createInstance(
      instanceId, workflow.id, success ? 'completed' : 'failed',
      start, triggeredBy, ir.resolvedVariables, undefined, nodeResults, collectedOutputs
    );

    this.history.recordExecution(instance);
    this.telemetry.recordExecution(success, durationMs, workflow.id);

    return { instance, ir, actionGraph, success };
  }

  private createInstance(
    instanceId: string,
    workflowId: string,
    status: WorkflowInstanceStatus,
    startPerf: number,
    triggeredBy: any,
    resolvedVariables: Record<string, unknown>,
    error?: string,
    nodeResults: Record<string, any> = {},
    outputs: Record<string, unknown> = {}
  ): WorkflowInstance {
    const now = Date.now();
    return {
      instanceId,
      workflowId,
      status,
      startedAt: now,
      completedAt: now,
      durationMs: Math.round((performance.now() - startPerf) * 100) / 100,
      resolvedVariables,
      nodeResults,
      outputs,
      triggeredBy,
      repairsInvoked: 0,
      error,
    };
  }
}

export const globalWorkflowExecutionEngine = new WorkflowExecutionEngine();
