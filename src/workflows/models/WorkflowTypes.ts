/**
 * WorkflowTypes.ts — Complete Type System for the Workflow Engine
 *
 * Implements the three-tier Workflow Library architecture:
 *   WorkflowTemplate → UserWorkflow → WorkflowInstance
 *
 * Templates are immutable blueprints. UserWorkflows are editable clones.
 * WorkflowInstances are individual executions with their own context, history, and outputs.
 *
 * Designed for future compatibility with AI-generated workflows, marketplace downloads,
 * cloud synchronization, team workflows, remote execution, and visual editors.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Variable Types — 11 strongly typed domains
// ─────────────────────────────────────────────────────────────────────────────

export type VariableType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'secret'
  | 'path'
  | 'application'
  | 'port'
  | 'device'
  | 'repository';

export interface WorkflowVariable {
  readonly name: string;
  readonly type: VariableType;
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly examples?: string[];
  readonly sensitive?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed Workflow Outputs
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowOutput {
  readonly name: string;
  readonly type: VariableType;
  readonly description: string;
  /** Node ID that produces this output */
  readonly sourceNodeId: string;
  /** Key within that node's outputs */
  readonly sourceKey: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Flow Node Types
// ─────────────────────────────────────────────────────────────────────────────

export type ControlFlowType =
  | 'action'
  | 'sequential'
  | 'parallel'
  | 'conditional'
  | 'switch'
  | 'loop'
  | 'retry'
  | 'wait'
  | 'timeout'
  | 'early_exit'
  | 'nested_workflow';

export interface ConditionExpression {
  readonly variable: string;
  readonly operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'exists' | 'not_exists' | 'contains' | 'matches';
  readonly value?: unknown;
}

export interface WorkflowNode {
  readonly id: string;
  readonly type: ControlFlowType;
  readonly name: string;
  readonly description?: string;

  /** For 'action' nodes: Phase 3 Action Registry ID */
  readonly actionId?: string;
  /** Input parameters for the action */
  readonly parameters?: Record<string, unknown>;
  /** Node dependency IDs */
  readonly dependencies: string[];

  /** For 'conditional' and 'switch' nodes */
  readonly condition?: ConditionExpression;
  readonly trueBranch?: string[];
  readonly falseBranch?: string[];
  readonly cases?: Array<{ value: unknown; nodeIds: string[] }>;

  /** For 'loop' nodes */
  readonly loopCount?: number;
  readonly loopOverVariable?: string;
  readonly loopBodyNodeIds?: string[];

  /** For 'retry' nodes */
  readonly retryMaxAttempts?: number;
  readonly retryDelayMs?: number;
  readonly retryExponentialBackoff?: boolean;

  /** For 'wait' nodes */
  readonly waitMs?: number;

  /** For 'timeout' nodes */
  readonly timeoutMs?: number;
  readonly timeoutNodeIds?: string[];

  /** For 'parallel' nodes */
  readonly parallelNodeIds?: string[];

  /** For 'nested_workflow' nodes — reference another workflow by ID */
  readonly nestedWorkflowId?: string;
  readonly nestedInputBindings?: Record<string, string>;

  /** For 'early_exit' nodes */
  readonly exitCondition?: ConditionExpression;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Metadata — Stable across future capabilities
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowMetadata {
  readonly author: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly version: string;
  readonly tags: string[];
  readonly description: string;
  readonly category?: string;
  /** Future: marketplace ID */
  readonly marketplaceId?: string;
  /** Future: team/org owner */
  readonly teamId?: string;
  /** Future: cloud sync reference */
  readonly cloudSyncId?: string;
  /** Whether this was AI-generated */
  readonly aiGenerated?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger Configuration
// ─────────────────────────────────────────────────────────────────────────────

export type TriggerType =
  | 'manual'
  | 'on_login'
  | 'on_startup'
  | 'daily'
  | 'weekly'
  | 'cron'
  | 'filesystem_event'
  | 'application_event';

export interface WorkflowTrigger {
  readonly type: TriggerType;
  /** Cron expression for 'cron' triggers */
  readonly cronExpression?: string;
  /** Time of day for 'daily' triggers (HH:MM) */
  readonly timeOfDay?: string;
  /** Day of week for 'weekly' triggers */
  readonly dayOfWeek?: number;
  /** Watched path for 'filesystem_event' triggers */
  readonly watchPath?: string;
  /** Application bundle ID for 'application_event' triggers */
  readonly applicationId?: string;
  /** Event type for application triggers */
  readonly eventType?: string;
  /** Whether trigger is currently active */
  readonly enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Three-Tier Workflow Library
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WorkflowTemplate — Immutable blueprint. Never mutated during execution.
 * Ships built-in or imported from marketplace/sharing.
 */
export interface WorkflowTemplate {
  readonly id: string;
  readonly metadata: WorkflowMetadata;
  readonly variables: WorkflowVariable[];
  readonly nodes: WorkflowNode[];
  readonly outputs: WorkflowOutput[];
  readonly triggers: WorkflowTrigger[];
  readonly immutable: true;
  readonly source: 'builtin' | 'marketplace' | 'shared' | 'ai_generated' | 'plugin';
}

/**
 * UserWorkflow — Editable clone of a template (or built from scratch).
 * The user's personalized automation.
 */
export interface UserWorkflow {
  readonly id: string;
  readonly templateId?: string;
  readonly metadata: WorkflowMetadata;
  readonly variables: WorkflowVariable[];
  readonly nodes: WorkflowNode[];
  readonly outputs: WorkflowOutput[];
  readonly triggers: WorkflowTrigger[];
  readonly enabled: boolean;
  readonly lastExecutedAt?: number;
  readonly executionCount: number;
}

/**
 * WorkflowInstance — A single execution run with its own context, results, and history.
 * Never mutates the parent UserWorkflow.
 */
export interface WorkflowInstance {
  readonly instanceId: string;
  readonly workflowId: string;
  readonly status: WorkflowInstanceStatus;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly durationMs?: number;
  readonly resolvedVariables: Record<string, unknown>;
  readonly nodeResults: Record<string, WorkflowNodeResult>;
  readonly outputs: Record<string, unknown>;
  readonly triggeredBy: TriggerType | 'api';
  readonly repairsInvoked: number;
  readonly error?: string;
}

export type WorkflowInstanceStatus =
  | 'pending'
  | 'compiling'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'partially_completed';

export interface WorkflowNodeResult {
  readonly nodeId: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly durationMs?: number;
  readonly outputs?: Record<string, unknown>;
  readonly error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Intermediate Representation (IR)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowIRNode {
  readonly id: string;
  /** Resolved Phase 3 Action ID — control flow has been eliminated */
  readonly actionId: string;
  readonly resolvedParameters: Record<string, unknown>;
  readonly dependencies: string[];
  readonly parallelizable: boolean;
  readonly retryPolicy?: { maxAttempts: number; delayMs: number; backoff: boolean };
  readonly timeoutMs?: number;
  /** Origin tracking for debugging */
  readonly sourceNodeId: string;
  readonly sourceWorkflowId: string;
  readonly description: string;
}

/**
 * WorkflowIR — Variables resolved, conditions expanded, loops unrolled,
 * retries injected, nested workflows flattened, topology finalized.
 * Directly convertible to ActionGraph.
 */
export interface WorkflowIR {
  readonly id: string;
  readonly workflowId: string;
  readonly nodes: WorkflowIRNode[];
  readonly executionOrder: string[];
  readonly parallelGroups: string[][];
  readonly resolvedVariables: Record<string, unknown>;
  readonly declaredOutputs: WorkflowOutput[];
  readonly compiledAt: number;
  readonly debugTrace: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage & Export
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowVersion {
  readonly version: string;
  readonly snapshot: UserWorkflow;
  readonly savedAt: number;
  readonly changeDescription: string;
}

export interface WorkflowExportPayload {
  readonly format: 'cero-workflow-v1';
  readonly exportedAt: number;
  readonly workflow: UserWorkflow;
  readonly templateId?: string;
  readonly checksum: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Saved Workflow JSON File Schema (Version 1)
// ─────────────────────────────────────────────────────────────────────────────

export const CURRENT_WORKFLOW_SCHEMA_VERSION = 1;

export interface EnvironmentPrerequisites {
  readonly requiredBinaries?: string[];
  readonly requiredEnvVars?: string[];
  readonly requiredPorts?: number[];
  readonly requiredPaths?: string[];
}

export interface WorkflowStepDefinition {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly expectedExitCode?: number;
  readonly validationCriteria?: string;
  readonly dependsOn?: string[];
  readonly isDestructive?: boolean;
  // Phase 0.75 Task 0.75.2: Precondition-aware execution fields
  readonly precondition_check?: string;
  readonly if_precondition_true?: 'skip' | 'continue' | 'abort';
  readonly if_precondition_false?: 'install' | 'continue' | 'abort' | 'skip';
  // Cross-Platform workflow support: optional platform-specific command variants
  readonly platformCommands?: {
    readonly linux?: string;
    readonly macos?: string;
    readonly windows?: string;
    readonly distroOverrides?: Record<string, string>;
  };
}

export interface SavedWorkflowDefinition {
  readonly schemaVersion: number;
  readonly name: string;
  readonly description?: string;
  readonly steps: WorkflowStepDefinition[];
  readonly parameters?: WorkflowVariable[];
  readonly environmentPrerequisites?: EnvironmentPrerequisites;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly author?: string;
  readonly tags?: string[];
}

