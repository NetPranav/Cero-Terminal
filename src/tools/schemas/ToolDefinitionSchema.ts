/**
 * ToolDefinitionSchema.ts
 * 
 * Zod schemas for every JSON file in a tool folder.
 * These schemas are the single source of truth for what constitutes a valid tool.
 * The ToolLoader validates all files against these schemas at load time.
 */

import { z } from 'zod';

// ──────────────────────────────────────────────
// Shared enums and primitives
// ──────────────────────────────────────────────

export const PlatformSchema = z.enum(['windows']);
export type Platform = z.infer<typeof PlatformSchema>;

export const RiskLevelSchema = z.enum(['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ParameterTypeSchema = z.enum([
  'string', 'number', 'boolean', 'array', 'object', 'enum', 'file_path', 'url'
]);

// ──────────────────────────────────────────────
// tool.json — WHAT the tool is (read by AI)
// ──────────────────────────────────────────────

export const ToolParameterSchema = z.object({
  name: z.string(),
  type: ParameterTypeSchema,
  description: z.string(),
  required: z.boolean().default(true),
  default: z.any().optional(),
  enum: z.array(z.string()).optional(),
  pattern: z.string().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  entityType: z.string().optional(), // Links to entity system (e.g., 'ssid', 'device_name')
});

export const ToolDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z]+\.[a-z_.]+$/, 'Tool ID must be dot-separated lowercase (e.g., network.wifi.scan)'),
  version: z.string().default('1.0.0'),
  displayName: z.string().min(1),
  description: z.string().min(1),
  domain: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  supportedPlatforms: z.array(PlatformSchema).min(1),
  requiredPermissions: z.array(z.string()).default([]),
  securityRisk: RiskLevelSchema.default('LOW'),
  parameters: z.array(ToolParameterSchema).default([]),
  optionalParameters: z.array(ToolParameterSchema).default([]),
  estimatedExecutionTime: z.string().default('1s'),
  confirmationRequired: z.boolean().default(false),
  rollbackAvailable: z.boolean().default(false),
  verificationSupported: z.boolean().default(true),
  deprecationStatus: z.enum(['stable', 'deprecated', 'experimental']).default('stable'),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

// ──────────────────────────────────────────────
// workflow.json — HOW the tool executes
// (consumed only by Workflow Engine, never by AI)
// ──────────────────────────────────────────────

export const WorkflowStepActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum([
    'ExecuteCapability',
    'ConditionalBranch',
    'ParallelExecution',
    'Delay',
    'UserConfirmation',
    'VariableAssignment',
    'Loop',
    'End',
  ]),
  capabilityId: z.string().optional(),
  parameters: z.record(z.string(), z.any()).optional(),
  condition: z.object({
    variable: z.string(),
    operator: z.enum(['==', '!=', '>', '<', 'exists', 'not_exists', 'contains']),
    value: z.any().optional(),
  }).optional(),
  trueBranch: z.string().optional(),
  falseBranch: z.string().optional(),
  assignments: z.record(z.string(), z.any()).optional(),
  delayMs: z.number().optional(),
  timeoutMs: z.number().optional(),
  retryPolicy: z.object({
    type: z.enum(['none', 'fixed', 'exponential']),
    maxAttempts: z.number().default(0),
    delayMs: z.number().default(0),
  }).optional(),
  dependencies: z.array(z.string()).default([]),
  onError: z.enum(['fail', 'skip', 'retry', 'rollback']).default('fail'),
});

export const ToolWorkflowSchema = z.object({
  toolId: z.string(),
  version: z.string().default('1.0.0'),
  description: z.string().optional(),
  
  // Platform-specific workflow variants
  platforms: z.record(z.string(), z.object({
    steps: z.array(WorkflowStepActionSchema),
    verification: z.object({
      command: z.string().optional(),
      successPattern: z.string().optional(),
      description: z.string().optional(),
    }).optional(),
    rollback: z.object({
      steps: z.array(WorkflowStepActionSchema),
      description: z.string().optional(),
    }).optional(),
  })).optional(),

  // Default steps if no platform-specific variant matches
  steps: z.array(WorkflowStepActionSchema).default([]),
  
  verification: z.object({
    command: z.string().optional(),
    successPattern: z.string().optional(),
    description: z.string().optional(),
  }).optional(),

  rollback: z.object({
    steps: z.array(WorkflowStepActionSchema),
    description: z.string().optional(),
  }).optional(),

  successCondition: z.string().optional(),
  errorHandling: z.object({
    strategy: z.enum(['fail_fast', 'continue', 'retry']).default('fail_fast'),
    maxRetries: z.number().default(0),
  }).optional(),
});

export type ToolWorkflow = z.infer<typeof ToolWorkflowSchema>;

// ──────────────────────────────────────────────
// knowledge.json — Semantic knowledge for retrieval
// ──────────────────────────────────────────────

export const ToolKnowledgeSchema = z.object({
  toolId: z.string(),
  aliases: z.array(z.string()).default([]),
  synonyms: z.array(z.string()).default([]),
  commonUserWording: z.array(z.string()).default([]),
  commonMistakes: z.array(z.string()).default([]),
  entityHints: z.record(z.string(), z.array(z.string())).default({}),
  deviceNamingPatterns: z.array(z.string()).default([]),
  commonAbbreviations: z.record(z.string(), z.string()).default({}),
  languageVariations: z.array(z.string()).default([]),
  relatedTools: z.array(z.string()).default([]),
});

export type ToolKnowledge = z.infer<typeof ToolKnowledgeSchema>;

// ──────────────────────────────────────────────
// examples.json — Natural language examples
// ──────────────────────────────────────────────

export const ToolExampleSchema = z.object({
  input: z.string(),
  expectedIntent: z.object({
    domain: z.string(),
    action: z.string(),
  }).optional(),
  expectedEntities: z.record(z.string(), z.any()).optional(),
  description: z.string().optional(),
});

export const ToolExamplesSchema = z.object({
  toolId: z.string(),
  examples: z.array(ToolExampleSchema).min(1),
});

export type ToolExamples = z.infer<typeof ToolExamplesSchema>;

// ──────────────────────────────────────────────
// tests.json — Regression tests
// ──────────────────────────────────────────────

export const ToolTestCaseSchema = z.object({
  id: z.string(),
  userRequest: z.string(),
  expectedIntent: z.object({
    domain: z.string(),
    action: z.string(),
  }),
  expectedEntities: z.record(z.string(), z.any()).optional(),
  expectedToolId: z.string(),
  description: z.string().optional(),
});

export const ToolTestsSchema = z.object({
  toolId: z.string(),
  tests: z.array(ToolTestCaseSchema).min(1),
});

export type ToolTests = z.infer<typeof ToolTestsSchema>;

// ──────────────────────────────────────────────
// Loaded tool manifest (everything combined)
// ──────────────────────────────────────────────

export interface LoadedTool {
  definition: ToolDefinition;
  workflow: ToolWorkflow;
  knowledge: ToolKnowledge;
  examples: ToolExamples;
  tests: ToolTests;
  folderPath: string;
}
