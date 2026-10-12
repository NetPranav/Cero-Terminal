/**
 * FlowRunner.ts — run a FlowPlan.
 *
 * Desktop steps (open a browser, an app, a folder) run directly, with no terminal. A plan made
 * only of those is run by runDesktopSteps and the app never shows its terminal.
 *
 * Terminal steps are typed into a real terminal, one at a time, after one approval that lists
 * every command: the output is visible and prompts (a sudo password, "continue? [y/N]") can be
 * answered there. The end of each step is reported by an invisible escape sequence
 * (OSC 777 "cero-step;<exit code>") printed by a small shell function defined once.
 */

import type { FlowOs, FlowPlan, FlowStep } from './FlowPlan';
import { withCwd } from './FlowPlan';
import { SecurityEngine } from '../../domain/security/SecurityEngine';
import type { ExecutionPreviewPlan } from '../../domain/security/ExecutionEngine';

export type ShellFamily = 'posix' | 'fish' | 'powershell';

/** How to run one command outside the terminal, for execute_command */
export function shellInvocation(command: string, os: FlowOs): { command: string; args: string[] } {
  if (os === 'windows') return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command] };
  return { command: '/bin/sh', args: ['-c', command] };
}

export type ExecuteFn = (command: string, args: string[]) => Promise<{ code: number; stdout?: string; stderr?: string }>;

/** Run desktop steps (no terminal). Returns the names of steps that failed. */
export async function runDesktopSteps(steps: FlowStep[], os: FlowOs, execute: ExecuteFn): Promise<{ ok: boolean; failed: string[] }> {
  const failed: string[] = [];
  for (const step of steps) {
    const inv = shellInvocation(step.command, os);
    try {
      const res = await execute(inv.command, inv.args);
      if (res.code !== 0) failed.push(`${step.name}: ${(res.stderr || res.stdout || `exit ${res.code}`).trim().split('\n')[0]}`);
    } catch (err: any) {
      failed.push(`${step.name}: ${err?.message || err}`);
    }
  }
  return { ok: failed.length === 0, failed };
}

/** The shell function that reports a step's exit code, typed once per terminal */
export function markerDefinition(shell: ShellFamily): string {
  switch (shell) {
    case 'powershell':
      return 'function __cero_step($c) { Write-Host -NoNewline "$([char]27)]777;cero-step;$c$([char]7)" }';
    case 'fish':
      return "function __cero_step; printf '\\e]777;cero-step;%s\\a' $argv[1]; end";
    default:
      return "__cero_step() { printf '\\033]777;cero-step;%s\\007' \"$1\"; }";
  }
}

/** A step as typed into the terminal, followed by the exit-code report */
export function typedStep(step: FlowStep, os: FlowOs, shell: ShellFamily): string {
  const command = withCwd(step, os);
  switch (shell) {
    case 'powershell':
      return `${command}; __cero_step $(if ($?) { 0 } elseif ($LASTEXITCODE) { $LASTEXITCODE } else { 1 })`;
    case 'fish':
      return `${command}; __cero_step $status`;
    default:
      return `${command}; __cero_step $?`;
  }
}

/** The exit code in an OSC 777 payload ("cero-step;0"), or null for other payloads */
export function parseStepMarker(payload: string): number | null {
  const m = payload.match(/^cero-step;(-?\d+)$/);
  return m ? Number(m[1]) : null;
}

export interface TerminalFlowIO {
  os: FlowOs;
  shell: ShellFamily;
  /** Type into the terminal's shell */
  type: (text: string) => void | Promise<void>;
  /** Resolves with the next step's exit code (from the OSC marker), or null if it was interrupted */
  nextStepResult: () => Promise<number | null>;
  /** One approval for the whole plan */
  approve: (plan: FlowPlan) => Promise<boolean>;
  /** Run a desktop step outside the terminal */
  execute: ExecuteFn;
  /** A status line in the terminal (not sent to the shell) */
  notice: (text: string, tone: 'info' | 'ok' | 'error') => void;
  /** Audit trail: the decision and every step's result */
  audit?: (event: { type: 'approved' | 'declined' | 'step'; step?: FlowStep; exitCode?: number | null }) => void;
  /** Abort signal to cancel running flow */
  signal?: AbortSignal;
}

export interface TerminalFlowResult {
  success: boolean;
  declined?: boolean;
  cancelled?: boolean;
  completed: number;
  summary: string;
}

/** Run a plan that needs the terminal: approve once, then step by step, stopping at the first failure. */
export async function runFlowInTerminal(plan: FlowPlan, io: TerminalFlowIO, source?: string): Promise<TerminalFlowResult> {
  const from = source ? ` from ${source.split(/[\\/]/).pop()}` : '';
  if (io.signal?.aborted) {
    return { success: false, cancelled: true, completed: 0, summary: `Flow "${plan.name}" stopped.` };
  }

  const approved = await io.approve(plan);
  io.audit?.({ type: approved ? 'approved' : 'declined' });
  if (!approved) {
    const summary = `Flow "${plan.name}"${from} not run: you declined it. Nothing was changed.`;
    io.notice(summary, 'error');
    return { success: false, declined: true, completed: 0, summary };
  }
  if (io.signal?.aborted) {
    return { success: false, cancelled: true, completed: 0, summary: `Flow "${plan.name}" stopped.` };
  }
  if (plan.skipped.length) io.notice(`Skipped (not understood): ${plan.skipped.join('; ')}`, 'info');

  let definedMarker = false;
  for (let i = 0; i < plan.steps.length; i++) {
    if (io.signal?.aborted) {
      await io.type('\x03');
      const summary = `Flow "${plan.name}" stopped at step ${i + 1}.`;
      io.notice(summary, 'info');
      return { success: false, cancelled: true, completed: i, summary };
    }

    const step = plan.steps[i];
    io.notice(`Step ${i + 1}/${plan.steps.length}: ${step.name}`, 'info');
    if (step.kind === 'desktop') {
      const res = await runDesktopSteps([step], io.os, io.execute);
      io.audit?.({ type: 'step', step, exitCode: res.ok ? 0 : 1 });
      if (!res.ok) {
        const summary = `Flow "${plan.name}" stopped at step ${i + 1} (${step.name}): ${res.failed[0]}`;
        io.notice(summary, 'error');
        return { success: false, completed: i, summary };
      }
      continue;
    }
    if (!definedMarker) {
      await io.type(`${markerDefinition(io.shell)}\r`);
      definedMarker = true;
    }

    let abortListener: (() => void) | null = null;
    const abortPromise = new Promise<number | null>((resolve) => {
      if (!io.signal) return;
      abortListener = () => {
        void io.type('\x03');
        resolve(null);
      };
      if (io.signal.aborted) abortListener();
      else io.signal.addEventListener('abort', abortListener, { once: true });
    });

    const result = io.nextStepResult();
    await io.type(`${typedStep(step, io.os, io.shell)}\r`);
    const code = await Promise.race([result, abortPromise]);
    if (io.signal && abortListener) io.signal.removeEventListener('abort', abortListener);

    if (io.signal?.aborted) {
      const summary = `Flow "${plan.name}" stopped at step ${i + 1} (${step.name}).`;
      io.notice(summary, 'info');
      return { success: false, cancelled: true, completed: i, summary };
    }

    io.audit?.({ type: 'step', step, exitCode: code });
    if (code !== 0) {
      const why = code === null ? 'it was interrupted' : `it exited with code ${code}`;
      const summary = `Flow "${plan.name}" stopped at step ${i + 1} (${step.name}): ${why}. The remaining ${plan.steps.length - i - 1} step(s) were not run.`;
      io.notice(summary, 'error');
      return { success: false, completed: i, summary };
    }
  }
  const summary = `Flow "${plan.name}"${from} finished: ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}.`;
  io.notice(summary, 'ok');
  return { success: true, completed: plan.steps.length, summary };
}

const RISK_ORDER = ['SAFE', 'LOW', 'SENSITIVE', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** The single confirmation for a flow: every command, and the highest risk among them */
export function flowApprovalPlan(plan: FlowPlan, os: FlowOs, source?: string): ExecutionPreviewPlan {
  const engine = new SecurityEngine();
  let worst = { level: 'SAFE', score: 0, explanation: '', requiresPassword: false };
  const lines = plan.steps.map((step, i) => {
    const command = withCwd(step, os);
    if (step.kind === 'terminal') {
      const risk = engine.analyzeCommand(command);
      if (RISK_ORDER.indexOf(String(risk.level)) > RISK_ORDER.indexOf(worst.level) || risk.score > worst.score) {
        worst = { level: String(risk.level), score: risk.score, explanation: risk.explanation, requiresPassword: Boolean(risk.requiresPassword) || worst.requiresPassword };
      }
    }
    return `${i + 1}. ${command}${step.kind === 'desktop' ? '   (opens on your desktop)' : ''}`;
  });
  const from = source ? ` from ${source.split(/[\\/]/).pop()}` : '';
  return {
    capabilityId: 'workflow.batch',
    parameters: {
      command: lines.join('\n'),
      explanation: `Flow "${plan.name}"${from}: ${plan.steps.length} steps, typed into this terminal one by one. Answer any prompt (a password, y/n) in the terminal.`,
    },
    riskLevel: worst.level,
    riskScore: worst.score,
    permissionsRequired: ['ShellExecution'],
    explanation: worst.explanation || `${plan.steps.length} steps from a flow file`,
    requiresPassword: false,
    requiresConsent: true,
    // A flow from a file is someone else's commands: only a click on Run starts it, never a key
    // press (a stray or synthetic Enter must not approve it)
    requiresClick: Boolean(source),
  } as ExecutionPreviewPlan;
}

