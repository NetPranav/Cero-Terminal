/**
 * Test helpers for Phase 4 Execution Runtime test suite
 */

import { ActionNode, ActionGraph, ActionDefinition } from '../../actions/models/ActionTypes';
import { GoalNode } from '../../ai/planner/PlannerTypes';

export function createMockActionDefinition(id = 'test.action', overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id,
    displayName: 'Test Action',
    version: '1.0.0',
    summary: 'A test action',
    shortDescription: 'Short desc',
    detailedDescription: 'Detailed desc',
    safetyNotes: '',
    category: 'test',
    tags: ['test'],
    aliases: ['test action'],
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
    cost: {
      estimatedLatency: '10ms',
      resourceUsage: 'low',
      riskLevel: 'safe',
      permissionCost: 0,
      recoveryComplexity: 'low',
    },
    failureScenarios: [],
    recoveryHints: [],
    rollbackSupported: false,
    retryPolicy: { maxRetries: 1, delayMs: 10, exponentialBackoff: false },
    timeoutMs: 5000,
    examples: [],
    ...overrides,
  };
}

export function createMockGoalNode(id: string, goal = 'test.action'): GoalNode {
  return {
    id,
    title: `Goal ${id}`,
    description: '',
    goal: goal as any,
    dependencies: [],
    requiredEntities: [],
    boundEntities: [],
    planningState: 'unsatisfied',
    reasoning: '',
    confidence: 1.0,
    platformIndependent: true,
  };
}

export function createMockActionNode(id: string, actionId = 'test.action', deps: string[] = [], overrides: Partial<ActionNode> = {}): ActionNode {
  return {
    id,
    action: createMockActionDefinition(actionId),
    goalNode: createMockGoalNode(id, actionId),
    inputs: {},
    dependencies: deps,
    parallelizable: deps.length === 0,
    status: 'pending',
    confidence: 1.0,
    ...overrides,
  };
}

export function createMockActionGraph(nodes: ActionNode[] = []): ActionGraph {
  const ids = nodes.map(n => n.id);
  return {
    nodes,
    executionOrder: [...ids],
    parallelGroups: [nodes.filter(n => n.dependencies.length === 0).map(n => n.id)],
    unresolvedGoals: [],
    ambiguities: [],
    confidence: 1.0,
  };
}
