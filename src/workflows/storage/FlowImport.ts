/**
 * FlowImport.ts — read ".flow" workflow files (action lists) as Cero workflows.
 *
 * A .flow file lists actions ("open these URLs in Chrome", "install nodejs", "run npm install")
 * instead of shell commands. FlowPlan turns each into a macOS, Linux and Windows command, so the
 * Workflow Manager lists these files and they replay like any saved workflow (through the same
 * confirmation). Unknown action types are skipped rather than guessed.
 */

import type { SavedWorkflowDefinition, WorkflowStepDefinition } from '../models/WorkflowTypes';
import { planFlow, withCwd, type FlowOs } from '../flow/FlowPlan';

export type { FlowOs };

export function flowToWorkflow(raw: unknown, fallbackName: string, os: FlowOs): SavedWorkflowDefinition | null {
  const doc = raw as any;
  if (!doc || !Array.isArray(doc.actions)) return null;
  const plan = planFlow(doc, fallbackName, os);
  if (!plan) return null;
  const meta = doc.metadata || {};
  const steps: WorkflowStepDefinition[] = plan.steps.map((step, i) => {
    const rawAction = doc.actions[i];
    const extra = rawAction?.x && typeof rawAction.x === 'object' ? rawAction.x : {};
    const isCommand = rawAction?.type === 'command' && typeof rawAction.command === 'string';
    const command = isCommand ? rawAction.command : withCwd(step, os);
    const cwd = rawAction?.cwd || step.cwd;
    const platformCommands = isCommand && (rawAction.macos || rawAction.linux || rawAction.windows)
      ? {
          macos: rawAction.macos || rawAction.command,
          linux: rawAction.linux || rawAction.command,
          windows: rawAction.windows || rawAction.command,
        }
      : {
          macos: withCwd({ ...step, command: step.platformCommands.macos }, 'macos'),
          linux: withCwd({ ...step, command: step.platformCommands.linux }, 'linux'),
          windows: withCwd({ ...step, command: step.platformCommands.windows }, 'windows'),
        };
    return {
      id: `step-${i + 1}`,
      name: step.name,
      command,
      cwd,
      platformCommands,
      ...extra
    };
  });
  return {
    schemaVersion: 1,
    name: typeof meta.name === 'string' && meta.name ? meta.name : (typeof meta.id === 'string' && meta.id ? meta.id : fallbackName),
    description: meta.description || meta.name,
    steps,
    parameters: Array.isArray(doc.parameters) ? doc.parameters : undefined,
    environmentPrerequisites: doc.environmentPrerequisites,
    createdAt: Number(meta.createdAt) || 0,
    updatedAt: Number(meta.updatedAt) || 0,
    author: meta.author,
    tags: Array.isArray(meta.tags) ? (meta.tags.includes('flow') ? meta.tags : [...meta.tags, 'flow']) : ['flow']
  };
}

/** A workflow from file text: Cero's step format or a .flow action list. */
export function parseWorkflowFile(text: string, fileName: string, os: FlowOs): SavedWorkflowDefinition | null {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const base = fileName.split(/[\\/]/).pop()!.replace(/\.(?:flow|json)$/i, '');
  if (Array.isArray(raw?.actions)) return flowToWorkflow(raw, base, os);
  if (Array.isArray(raw?.steps) && raw.steps.every((s: any) => typeof s?.command === 'string')) {
    return {
      schemaVersion: 1,
      name: typeof raw.name === 'string' && raw.name ? raw.name : base,
      description: raw.description,
      steps: raw.steps.map((s: any, i: number) => ({ ...s, id: s.id || `step-${i + 1}`, name: s.name || `Step ${i + 1}` })),
      parameters: raw.parameters,
      createdAt: Number(raw.createdAt) || 0,
      updatedAt: Number(raw.updatedAt) || 0,
      author: raw.author,
      tags: raw.tags
    };
  }
  return null;
}

/** Whether a path names a workflow file Cero can open. */
export function isWorkflowFilePath(p: string): boolean {
  return /\.flow$/i.test(p) || /\.(?:cero-workflow|workflow)\.json$/i.test(p) || /[\\/]\.cero[\\/]workflows[\\/][^\\/]+\.json$/.test(p);
}
