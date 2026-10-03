/**
 * ActionTypes.ts — Complete Type System for the Action Registry
 *
 * Every Action is a self-describing, platform-independent capability.
 * The registry is purely declarative — zero execution logic.
 *
 * This module defines WHAT Cero can do — never HOW.
 */

import { z } from 'zod';
import { EntityType } from '../../ai/conversation/ConversationTypes';
import { GoalNode } from '../../ai/planner/PlannerTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Enums & Primitives
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedPlatform = 'macos' | 'windows' | 'linux';

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export type ActionStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';

// ─────────────────────────────────────────────────────────────────────────────
// Action Input / Output
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionInput {
  /** Parameter name */
  name: string;
  /** TypeScript-like type hint (string, number, boolean, string[], etc.) */
  type: string;
  /** Human-readable description */
  description: string;
  /** Whether this input is required */
  required: boolean;
  /** Default value if not provided */
  defaultValue?: unknown;
  /** Example values for documentation */
  examples?: string[];
}

export interface ActionOutput {
  /** Output name */
  name: string;
  /** TypeScript-like type hint */
  type: string;
  /** Human-readable description */
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Capability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Describes the feature set of an Action.
 * Helps the Planner decide which Action best satisfies a Goal.
 */
export interface ActionCapability {
  /** Short capability name (e.g., "recursive", "cross-device") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether this capability is enabled by default */
  enabledByDefault: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Constraint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Planning constraints — conditions that must hold before planning proceeds.
 * NOT validations — these are declarative system requirements.
 */
export interface ActionConstraint {
  /** Constraint ID (e.g., "requires_internet", "requires_bluetooth_enabled") */
  id: string;
  /** Human-readable description */
  description: string;
  /** Whether this constraint is mandatory or advisory */
  mandatory: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Outcome
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Describes the system state produced by an Action.
 * Enables forward chaining: one Action's outcome satisfies another's precondition.
 */
export interface ActionOutcome {
  /** Outcome ID (e.g., "bluetooth_device_connected") */
  id: string;
  /** Human-readable description */
  description: string;
  /** The state key that this outcome sets (for the future State Engine) */
  stateKey: string;
  /** The expected state value */
  stateValue: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Cost
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimated cost metadata for intelligent planner comparison.
 */
export interface ActionCost {
  /** Expected execution latency (e.g., "100ms", "5s", "30s") */
  estimatedLatency: string;
  /** Resource intensity: low | medium | high */
  resourceUsage: 'low' | 'medium' | 'high';
  /** Risk level */
  riskLevel: RiskLevel;
  /** Permission cost: how many permissions does this action need? */
  permissionCost: number;
  /** Recovery complexity: how hard is it to undo? low | medium | high */
  recoveryComplexity: 'low' | 'medium' | 'high';
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Example
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionExample {
  /** Short description of the example */
  title: string;
  /** Example input values */
  input: Record<string, unknown>;
  /** Expected output description */
  expectedOutput: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Policy
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryPolicy {
  /** Maximum number of retries */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  delayMs: number;
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION DEFINITION — The Core Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A complete, self-describing capability definition.
 * This is the single source of truth for what an Action can do.
 * Contains ZERO execution logic.
 */
export interface ActionDefinition {
  // ── Identity ──
  /** Unique action ID in domain.action format (e.g., "filesystem.copy") */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Capability version */
  version: string;

  // ── Documentation ──
  /** One-line summary */
  summary: string;
  /** Short description (1–2 sentences) */
  shortDescription: string;
  /** Detailed description with full context */
  detailedDescription: string;
  /** Safety notes for the user */
  safetyNotes: string;

  // ── Classification ──
  /** Domain (e.g., "filesystem", "bluetooth") */
  category: string;
  /** Searchable tags */
  tags: string[];
  /** Natural language aliases for search */
  aliases: string[];

  // ── Platform ──
  /** Platforms this action supports */
  supportedPlatforms: SupportedPlatform[];

  // ── Permissions ──
  /** Required OS/system permissions */
  requiredPermissions: string[];

  // ── Inputs / Outputs ──
  /** Required and optional inputs */
  inputs: ActionInput[];
  /** Expected outputs */
  outputs: ActionOutput[];

  // ── Entities ──
  /** Entity types required from the conversation */
  requiredEntities: EntityType[];
  /** Entity types that are helpful but not mandatory */
  optionalEntities: EntityType[];

  // ── Capabilities ──
  /** Feature set this action supports */
  capabilities: ActionCapability[];

  // ── Constraints ──
  /** Planning constraints (system requirements) */
  constraints: ActionConstraint[];

  // ── Preconditions / Postconditions ──
  /** What must be true before this action runs */
  preconditions: string[];
  /** What will be true after this action runs */
  postconditions: string[];
  /** Side effects produced by this action */
  sideEffects: string[];

  // ── Outcomes ──
  /** System states produced by this action */
  outcomes: ActionOutcome[];

  // ── Required / Produced State ──
  /** System state keys required to exist before execution */
  requiredSystemState: string[];
  /** System state keys produced after execution */
  producedSystemState: string[];

  // ── Cost ──
  /** Cost metadata for planner comparison */
  cost: ActionCost;

  // ── Failure & Recovery ──
  /** Known failure scenarios */
  failureScenarios: string[];
  /** Hints for recovering from failures */
  recoveryHints: string[];

  // ── Execution Metadata ──
  /** Whether rollback is supported */
  rollbackSupported: boolean;
  /** Retry policy */
  retryPolicy: RetryPolicy;
  /** Timeout in milliseconds */
  timeoutMs: number;

  // ── Examples ──
  /** Usage examples */
  examples: ActionExample[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Node — A resolved action bound to a GoalNode
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionNode {
  /** Unique node ID */
  id: string;
  /** The resolved ActionDefinition */
  action: ActionDefinition;
  /** The GoalNode this action was resolved from */
  goalNode: GoalNode;
  /** Resolved input values */
  inputs: Record<string, unknown>;
  /** Dependencies (other ActionNode IDs) */
  dependencies: string[];
  /** Whether this can run in parallel with siblings */
  parallelizable: boolean;
  /** Current status */
  status: ActionStatus;
  /** Confidence in this resolution (0.0 to 1.0) */
  confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Graph
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionGraph {
  /** All resolved action nodes */
  nodes: ActionNode[];
  /** Topologically sorted node IDs */
  executionOrder: string[];
  /** Parallel execution groups */
  parallelGroups: string[][];
  /** Any actions that could not be resolved */
  unresolvedGoals: string[];
  /** Ambiguities encountered during resolution */
  ambiguities: ActionAmbiguity[];
  /** Overall graph confidence */
  confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search & Ambiguity
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoredAction {
  /** The matched action */
  action: ActionDefinition;
  /** Match score: 0.0 to 1.0 */
  score: number;
  /** How the match was made */
  matchType: 'exact' | 'alias' | 'entity' | 'category' | 'tag' | 'capability' | 'semantic';
}

export interface ActionAmbiguity {
  /** The GoalNode that had ambiguous resolution */
  goalNodeId: string;
  /** The goal ID */
  goalId: string;
  /** Candidate actions with similar scores */
  candidates: ScoredAction[];
  /** Human-readable explanation of the ambiguity */
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Stubs (Phase 4+)
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionResult {
  /** The action node that was executed */
  actionNodeId: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Output values */
  outputs: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
  /** Execution latency in milliseconds */
  latencyMs: number;
}

export interface ActionExecutor {
  /** Execute a single action node */
  execute(node: ActionNode): Promise<ActionResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas for Validation
// ─────────────────────────────────────────────────────────────────────────────

export const ActionInputSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string(),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  examples: z.array(z.string()).optional()
});

export const ActionOutputSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string()
});

export const ActionCapabilitySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  enabledByDefault: z.boolean()
});

export const ActionConstraintSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  mandatory: z.boolean()
});

export const ActionOutcomeSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  stateKey: z.string().min(1),
  stateValue: z.unknown()
});

export const ActionCostSchema = z.object({
  estimatedLatency: z.string(),
  resourceUsage: z.enum(['low', 'medium', 'high']),
  riskLevel: z.enum(['safe', 'low', 'medium', 'high', 'critical']),
  permissionCost: z.number().int().min(0),
  recoveryComplexity: z.enum(['low', 'medium', 'high'])
});

export const ActionExampleSchema = z.object({
  title: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  expectedOutput: z.string()
});

export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0),
  delayMs: z.number().int().min(0),
  exponentialBackoff: z.boolean()
});

export const ActionDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z]+\.[a-z_]+$/),
  displayName: z.string().min(1),
  version: z.string().min(1),
  summary: z.string(),
  shortDescription: z.string(),
  detailedDescription: z.string(),
  safetyNotes: z.string(),
  category: z.string().min(1),
  tags: z.array(z.string()),
  aliases: z.array(z.string()),
  supportedPlatforms: z.array(z.enum(['macos', 'windows', 'linux'])).min(1),
  requiredPermissions: z.array(z.string()),
  inputs: z.array(ActionInputSchema),
  outputs: z.array(ActionOutputSchema),
  requiredEntities: z.array(z.string()),
  optionalEntities: z.array(z.string()),
  capabilities: z.array(ActionCapabilitySchema),
  constraints: z.array(ActionConstraintSchema),
  preconditions: z.array(z.string()),
  postconditions: z.array(z.string()),
  sideEffects: z.array(z.string()),
  outcomes: z.array(ActionOutcomeSchema),
  requiredSystemState: z.array(z.string()),
  producedSystemState: z.array(z.string()),
  cost: ActionCostSchema,
  failureScenarios: z.array(z.string()),
  recoveryHints: z.array(z.string()),
  rollbackSupported: z.boolean(),
  retryPolicy: RetryPolicySchema,
  timeoutMs: z.number().int().min(0),
  examples: z.array(ActionExampleSchema)
});
