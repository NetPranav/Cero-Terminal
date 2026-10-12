/**
 * FlowExport.ts — Convert SavedWorkflowDefinition into the canonical .flow format.
 *
 * Reverses FlowImport.flowToWorkflow so any recorded, imported, or legacy workflow
 * can be saved as a standardized, platform-portable .flow action document.
 */

import { SavedWorkflowDefinition } from '../models/WorkflowTypes';

export interface FlowActionDocument {
  schemaVersion: '1.0';
  metadata: {
    id: string;
    name: string;
    description?: string;
    createdAt?: number;
    updatedAt?: number;
    author?: string;
    tags?: string[];
  };
  actions: Array<{
    type: 'command';
    name?: string;
    command: string;
    cwd?: string;
    macos?: string;
    linux?: string;
    windows?: string;
    x?: Record<string, any>;
  }>;
  parameters?: any[];
  environmentPrerequisites?: any;
}

/** Generate a clean URL/file-safe slug for a workflow name */
export function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'workflow';
}

/**
 * Remove undefined keys from an object to keep exported JSON clean.
 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const result = {} as Record<string, any>;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Convert a SavedWorkflowDefinition into a canonical FlowActionDocument (.flow).
 */
export function workflowToFlow(def: SavedWorkflowDefinition): FlowActionDocument {
  const id = slug(def.name);
  const metadata = stripUndefined({
    id,
    name: def.name,
    description: def.description,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
    author: def.author,
    tags: def.tags && def.tags.length > 0 ? def.tags : undefined
  });

  const actions = (def.steps || []).map(step => {
    // Extract everything not in the basic command action into x for lossless roundtrips
    const extraRaw = {
      dependsOn: step.dependsOn,
      precondition_check: step.precondition_check,
      if_precondition_true: step.if_precondition_true,
      if_precondition_false: step.if_precondition_false,
      isDestructive: step.isDestructive,
      timeoutMs: step.timeoutMs,
      expectedExitCode: step.expectedExitCode,
      validationCriteria: step.validationCriteria
    };
    const x = stripUndefined(extraRaw);

    const action = stripUndefined({
      type: 'command' as const,
      name: step.name,
      command: step.command,
      cwd: step.cwd,
      macos: step.platformCommands?.macos,
      linux: step.platformCommands?.linux,
      windows: step.platformCommands?.windows,
      x: Object.keys(x).length > 0 ? x : undefined
    });

    return action;
  });

  const doc: FlowActionDocument = {
    schemaVersion: '1.0',
    metadata,
    actions
  };

  if (def.parameters && def.parameters.length > 0) {
    doc.parameters = def.parameters;
  }

  if (def.environmentPrerequisites) {
    doc.environmentPrerequisites = def.environmentPrerequisites;
  }

  return doc;
}
