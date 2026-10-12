/**
 * testHelpers.ts — Mock ActionNode constructors for Capability SDK testing
 */

import { ActionNode } from '../../actions/models/ActionTypes';

export function createTestNode(id: string, actionId: string, inputs: Record<string, unknown> = {}): ActionNode {
  return {
    id,
    action: {
      id: actionId,
      displayName: actionId,
      version: '1.0.0',
      summary: 'Mock test action',
      shortDescription: 'Mock test action short',
      detailedDescription: 'Mock test action detailed',
      safetyNotes: 'Safe',
      category: actionId.split('.')[0] || 'test',
      tags: [],
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
      cost: { estimatedLatency: 'low', resourceUsage: 'low', riskLevel: 'safe', permissionCost: 0, recoveryComplexity: 'low' },
      failureScenarios: [],
      recoveryHints: [],
      rollbackSupported: true,
      retryPolicy: { maxRetries: 1, delayMs: 10, exponentialBackoff: false },
      timeoutMs: 5000,
      examples: [],
    },
    goalNode: {} as any,
    inputs,
    dependencies: [],
    parallelizable: true,
    status: 'pending',
    confidence: 1.0,
  };
}
