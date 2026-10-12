/**
 * Test helpers — shared mock factories for the Action Registry test suite.
 */

import { ActionDefinition } from '../models/ActionTypes';
import { EntityType } from '../../ai/conversation/ConversationTypes';

/**
 * Creates a minimal valid ActionDefinition for testing.
 * Override any fields via the partial parameter.
 */
export function createMockAction(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id: 'test.action',
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
      estimatedLatency: '1s',
      resourceUsage: 'low',
      riskLevel: 'safe',
      permissionCost: 0,
      recoveryComplexity: 'low',
    },
    failureScenarios: [],
    recoveryHints: [],
    rollbackSupported: false,
    retryPolicy: { maxRetries: 1, delayMs: 500, exponentialBackoff: false },
    timeoutMs: 30000,
    examples: [],
    ...overrides,
  };
}
