import { z } from 'zod';

export const IntentStepSchema = z.object({
  id: z.union([z.number(), z.string()]),
  goal: z.string(),
  precondition_check: z.string().optional(),
  if_precondition_true: z.enum(['skip', 'continue', 'abort']).optional(),
  if_precondition_false: z.enum(['install', 'continue', 'abort', 'skip']).optional(),
  user_override: z.string().optional()
});

export const IntentSchema = z.object({
  domain: z.string(),
  action: z.string(),
  confidence: z.number().min(0).max(1),
  isComplex: z.boolean().optional(),
  suggestedSteps: z.array(IntentStepSchema).optional(),
  executionTier: z.enum(['fast_path', 'intent_cpu', 'coder_gpu']).optional(),
  latencyMs: z.number().optional()
});

export type IntentStep = z.infer<typeof IntentStepSchema>;
export type IntentData = z.infer<typeof IntentSchema>;

