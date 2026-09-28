/**
 * BatchApproval.ts — one confirmation for a whole plan instead of one per command.
 *
 * A workflow, a multi-step request or a ROS pipeline lists every command that needs consent in
 * a single dialog. Once approved, exactly those command strings run without asking again for
 * this run; anything else (a command the model adds later) still gets its own dialog.
 */

import { SecurityEngine, RiskLevel } from './SecurityEngine';
import type { ExecutionPreviewPlan } from './ExecutionEngine';

export type AuthorizationHandler = (plan: ExecutionPreviewPlan) => Promise<boolean>;

const RANK: Record<string, number> = { SAFE: 0, UNKNOWN: 1, SENSITIVE: 2, ADMIN: 3, CRITICAL: 4 };

export interface BatchApprovalResult {
  approved: boolean;
  /** Commands the user saw and approved (only those needing consent) */
  approvedCommands: Set<string>;
  /** Handler that passes approved commands through and asks for anything else */
  handler?: AuthorizationHandler;
}

export async function approveBatch(
  commands: string[],
  title: string,
  handler: AuthorizationHandler | undefined
): Promise<BatchApprovalResult> {
  const engine = new SecurityEngine();
  const needing = [...new Set(commands)]
    .map(command => ({ command, risk: engine.analyzeCommand(command) }))
    .filter(({ risk }) => risk.level !== 'SAFE' || risk.requiresConsent);

  if (needing.length === 0) {
    return { approved: true, approvedCommands: new Set(), handler };
  }

  const highest = needing.reduce((a, b) => (RANK[b.risk.level] > RANK[a.risk.level] ? b : a));
  const plan = {
    capabilityId: 'workflow.batch',
    parameters: {
      command: needing.map(({ command }, i) => `${i + 1}. ${command}`).join('\n'),
      explanation: title
    },
    riskLevel: highest.risk.level as RiskLevel,
    riskScore: highest.risk.score,
    permissionsRequired: ['ShellExecution'],
    explanation: `${needing.length} command${needing.length === 1 ? '' : 's'} in this plan change your system. Approving runs exactly these, in order.`,
    requiresPassword: needing.some(({ risk }) => risk.requiresPassword),
    requiresConsent: true
  } as unknown as ExecutionPreviewPlan;

  const approved = handler ? await handler(plan) : false;
  const approvedCommands = new Set(approved ? needing.map(n => n.command) : []);
  return { approved, approvedCommands, handler: approved ? preApproved(approvedCommands, handler) : handler };
}

/** Handler that approves exactly the listed commands and defers everything else. */
export function preApproved(commands: Set<string>, fallback?: AuthorizationHandler): AuthorizationHandler {
  return async (plan) => {
    const command = String((plan as any)?.parameters?.command ?? '');
    if (commands.has(command)) return true;
    return fallback ? fallback(plan) : false;
  };
}
