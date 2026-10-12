/**
 * FlowFromSteps.ts: turn the steps an agent run really performed into portable .flow actions.
 *
 * One mapper for every kind of step, so "save this as a workflow" works for apps, folders and
 * commands alike, not only shell commands. Failed, declined and read-only steps are skipped.
 */
import type { FlowDraft } from './FlowAuthoring';

export interface RecordedStep {
  tool: string;
  params?: any;
  result?: { success?: boolean; data?: any; error?: string } | null;
  /** A ready-made portable action, set by routes that know exactly what they did */
  flowAction?: any;
}

/** Commands that only look at things; saving them alone would not repeat anything useful */
const READ_ONLY = /^(?:ls|ll|la|dir|pwd|cd|echo|cat|head|tail|which|where|whoami|date|uname|env|printenv|history|clear|git\s+(?:status|log|diff|branch|show|remote)|node\s+-v|npm\s+(?:-v|ls|list)|find|grep|rg|type)(?:\s|$)/i;

/** True when the command only reads information */
export function isReadOnlyCommand(command: string): boolean {
  return READ_ONLY.test(command.trim());
}

export interface StepActions {
  actions: any[];
  /** True when the only steps that ran just read information (they are kept, since they are all there is) */
  readOnlyOnly: boolean;
  /** Steps that failed or were declined */
  failed: number;
}

/** The action for one step, or null when it cannot or should not be repeated */
export function stepToFlowAction(step: RecordedStep, cwd?: string): any | null {
  if (!step.result?.success) return null;
  if (step.flowAction) return step.flowAction;
  if (step.tool.startsWith('__')) return null;
  if (step.tool === 'application.open' && step.params?.app) {
    return { type: 'app', app: String(step.params.app), ...(step.params.path ? { path: String(step.params.path) } : {}) };
  }
  if (step.tool === 'shell.execute' && typeof step.params?.command === 'string') {
    const command = step.params.command.trim();
    if (!command) return null;
    const name = String(step.params.explanation || command).slice(0, 60);
    return { type: 'command', name, command, ...(cwd ? { cwd } : {}) };
  }
  return null;
}

/** Actions for a whole run, with counts that explain why nothing was saved */
export function actionsFromSteps(steps: RecordedStep[], cwd?: string): StepActions {
  const actions: any[] = [];
  const readOnly: any[] = [];
  let failed = 0;
  for (const step of steps) {
    if (step.tool.startsWith('__')) continue;
    if (!step.result?.success) { failed++; continue; }
    const action = stepToFlowAction(step, cwd);
    if (!action) continue;
    if (action.type === 'command' && isReadOnlyCommand(String(action.command))) { readOnly.push(action); continue; }
    actions.push(action);
  }
  // Read-only steps are left out of a longer recipe, but kept when they are all the user did
  if (actions.length === 0 && readOnly.length > 0) return { actions: readOnly, readOnlyOnly: true, failed };
  return { actions, readOnlyOnly: false, failed };
}

export function draftFromActions(name: string, actions: any[]): FlowDraft {
  return { name, actions, unrecognised: [] };
}
