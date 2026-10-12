/**
 * WorkflowGraphCompiler.ts — WorkflowIR → Phase 3 ActionGraph Compiler
 *
 * Transforms a fully resolved, flattened WorkflowIR into a standard Phase 3 ActionGraph
 * that can be dispatched directly to the Phase 4 Execution Runtime.
 */

import { WorkflowIR, WorkflowIRNode } from '../models/WorkflowTypes';
import { ActionGraph, ActionNode, ActionDefinition } from '../../actions/models/ActionTypes';

/**
 * Create a minimal ActionDefinition stub for workflow-compiled actions.
 * In production, these would resolve against the full Action Registry.
 */
function stubActionDefinition(actionId: string, description: string): ActionDefinition {
  return {
    id: actionId,
    displayName: description,
    version: '1.0.0',
    summary: description,
    shortDescription: description,
    detailedDescription: `Workflow-compiled action: ${description}`,
    safetyNotes: '',
    category: actionId.split('.')[0] || 'workflow',
    tags: ['workflow'],
    aliases: [],
    supportedPlatforms: ['windows'],
    requiredPermissions: [],
    inputs: [],
    outputs: [],
    requiredEntities: [],
    optionalEntities: [],
    capabilities: [],
    constraints: [],
    preconditions: [],
    postconditions: [],
    sideEffects: [],
    outcomes: [],
    requiredSystemState: [],
    producedSystemState: [],
    cost: { estimatedLatency: '1s', resourceUsage: 'low', riskLevel: 'safe', permissionCost: 0, recoveryComplexity: 'low' },
    failureScenarios: [],
    recoveryHints: [],
    rollbackSupported: false,
    retryPolicy: { maxRetries: 0, delayMs: 0, exponentialBackoff: false },
    timeoutMs: 30000,
    examples: [],
  };
}

export class WorkflowGraphCompiler {
  /**
   * Compile a WorkflowIR into a standard Phase 3 ActionGraph.
   */
  public compile(ir: WorkflowIR): ActionGraph {
    const actionNodes: ActionNode[] = ir.nodes.map(irNode => this.irNodeToActionNode(irNode));

    return {
      nodes: actionNodes,
      executionOrder: ir.executionOrder,
      parallelGroups: ir.parallelGroups,
      unresolvedGoals: [],
      ambiguities: [],
      confidence: 1.0,
    };
  }

  private irNodeToActionNode(irNode: WorkflowIRNode): ActionNode {
    const actionDef = stubActionDefinition(irNode.actionId, irNode.description);

    return {
      id: irNode.id,
      action: actionDef,
      goalNode: {
        id: irNode.sourceNodeId,
        goal: irNode.actionId as any,
        description: irNode.description,
        dependencies: [],
        priority: 'medium',
        confidence: 1.0,
      } as any,
      inputs: irNode.resolvedParameters,
      dependencies: irNode.dependencies,
      parallelizable: irNode.parallelizable,
      status: 'pending',
      confidence: 1.0,
    };
  }
}

export const globalWorkflowGraphCompiler = new WorkflowGraphCompiler();
