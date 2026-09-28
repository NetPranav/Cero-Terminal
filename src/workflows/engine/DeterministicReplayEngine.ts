/**
 * DeterministicReplayEngine.ts — Zero-Token Replay with Safety & Parameter Injection
 *
 * Executes saved workflows deterministically without LLM re-inference:
 * 1. Validates environment prerequisites & detects environment drift
 * 2. Parses CLI flag parameter overrides (--port=9000, --tag=v2.0)
 * 3. Injects parameters into commands ({{VAR}}, $VAR)
 * 4. Passes all commands through SecurityEngine (categorical policy & consent)
 * 5. Records executed steps into UndoLog for reversibility
 */

import {
  SavedWorkflowDefinition,
  WorkflowStepDefinition,
  EnvironmentPrerequisites
} from '../models/WorkflowTypes';
import { DiskWorkflowStorage } from '../storage/DiskWorkflowStorage';
import { SecurityEngine, RiskAnalysisResult } from '../../domain/security/SecurityEngine';
import { UndoLog } from '../../domain/session/UndoLog';
import { CrossPlatformCommandAdapter } from './CrossPlatformCommandAdapter';

export interface ReplayOptions {
  sessionId?: string;
  parameters?: Record<string, string | number | boolean>;
  dryRun?: boolean;
  autoApprove?: boolean;
  onStepStart?: (step: WorkflowStepDefinition, index: number, total: number) => void;
  onStepDone?: (step: WorkflowStepDefinition, result: ReplayStepResult) => void;
  onLog?: (message: string) => void;
  executor?: (cmd: string, cwd?: string) => Promise<{ code: number; stdout: string; stderr: string }>;
  storage?: DiskWorkflowStorage;
}

export interface ReplayStepResult {
  stepId: string;
  name: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  riskAnalysis: RiskAnalysisResult;
  status: 'completed' | 'failed' | 'skipped_dry_run' | 'skipped';
  error?: string;
}

export interface ReplayExecutionResult {
  workflowName: string;
  success: boolean;
  durationMs: number;
  stepsExecuted: number;
  totalSteps: number;
  stepResults: ReplayStepResult[];
  environmentValidation: {
    passed: boolean;
    errors: string[];
  };
  error?: string;
}

export class DeterministicReplayEngine {
  private static instance?: DeterministicReplayEngine;
  private storage: DiskWorkflowStorage;

  public static getInstance(): DeterministicReplayEngine {
    if (!DeterministicReplayEngine.instance) {
      DeterministicReplayEngine.instance = new DeterministicReplayEngine();
    }
    return DeterministicReplayEngine.instance;
  }

  constructor(customStorage?: DiskWorkflowStorage) {
    this.storage = customStorage || DiskWorkflowStorage.getInstance();
  }

  /**
   * Parse command-line override arguments into a parameters dictionary.
   * e.g. "--port=9000 --tag=v2.0 --dry-run" or ["--port", "9000", "--tag=v2.0"]
   */
  public parseCliOverrides(args: string | string[]): Record<string, string | number | boolean> {
    const rawArgs = typeof args === 'string'
      ? args.trim().split(/\s+/).filter(Boolean)
      : args;

    const result: Record<string, string | number | boolean> = {};

    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i];
      if (!arg.startsWith('-')) continue;

      if (arg.includes('=')) {
        const [rawKey, val] = arg.split('=', 2);
        const key = rawKey.replace(/^--?/, '').replace(/-/g, '_').toUpperCase();
        result[key] = this.parseValue(val);
      } else {
        const key = arg.replace(/^--?/, '').replace(/-/g, '_').toUpperCase();
        // Check if next arg is value or another flag
        if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
          result[key] = this.parseValue(rawArgs[i + 1]);
          i++;
        } else {
          result[key] = true; // Boolean flag like --dry-run
        }
      }
    }

    return result;
  }

  /**
   * Validate that environment preconditions are met.
   * Surfaces environment drift (e.g. required port changed, required binary missing).
   */
  public async validateEnvironment(
    workflow: SavedWorkflowDefinition,
    resolvedParams: Record<string, any>,
    executor?: (cmd: string) => Promise<{ code: number }>
  ): Promise<{ passed: boolean; errors: string[] }> {
    const errors: string[] = [];
    const prereqs = workflow.environmentPrerequisites;
    if (!prereqs) return { passed: true, errors: [] };

    // 1. Check required binaries
    if (prereqs.requiredBinaries) {
      for (const bin of prereqs.requiredBinaries) {
        const exists = await this.checkBinaryExists(bin, executor);
        if (!exists) {
          errors.push(`Missing prerequisite binary: "${bin}" not found in PATH.`);
        }
      }
    }

    // 2. Check port drift
    if (prereqs.requiredPorts && prereqs.requiredPorts.length > 0) {
      const targetPort = resolvedParams['PORT'] ? Number(resolvedParams['PORT']) : prereqs.requiredPorts[0];
      if (resolvedParams['PORT'] && !prereqs.requiredPorts.includes(targetPort)) {
        // Environment override differs from workflow recorded port
        // If the workflow originally recorded 8080 and user specified 9000, we check that override is sensible
        if (targetPort < 1 || targetPort > 65535) {
          errors.push(`Invalid port override: ${targetPort}. Port must be between 1 and 65535.`);
        }
      }
    }

    // 3. Check required directories / paths
    if (prereqs.requiredPaths) {
      for (const p of prereqs.requiredPaths) {
        const exists = await this.checkPathExists(p, executor);
        if (!exists) {
          errors.push(`Environment drift: required path "${p}" does not exist.`);
        }
      }
    }

    return {
      passed: errors.length === 0,
      errors
    };
  }

  /**
   * Replay a saved workflow by name with optional parameter overrides and safety enforcement.
   */
  public async replay(
    workflowNameOrDef: string | SavedWorkflowDefinition,
    options: ReplayOptions = {}
  ): Promise<ReplayExecutionResult> {
    const startTime = performance.now();

    // 1. Resolve workflow definition
    const storageToUse = options.storage || this.storage;
    let workflow: SavedWorkflowDefinition | null;

    if (typeof workflowNameOrDef === 'string') {
      workflow = await storageToUse.loadWorkflow(workflowNameOrDef);
      if (!workflow) {
        return {
          workflowName: workflowNameOrDef,
          success: false,
          durationMs: performance.now() - startTime,
          stepsExecuted: 0,
          totalSteps: 0,
          stepResults: [],
          environmentValidation: { passed: false, errors: [`Workflow "${workflowNameOrDef}" not found in storage.`] },
          error: `Workflow "${workflowNameOrDef}" does not exist.`
        };
      }
    } else {
      workflow = workflowNameOrDef;
    }

    // 2. Resolve parameters (defaults merged with user overrides)
    const resolvedParams: Record<string, any> = {};
    if (workflow.parameters) {
      for (const p of workflow.parameters) {
        if (p.defaultValue !== undefined) {
          resolvedParams[p.name.toUpperCase()] = p.defaultValue;
        }
      }
    }
    if (options.parameters) {
      for (const [k, v] of Object.entries(options.parameters)) {
        resolvedParams[k.toUpperCase()] = v;
      }
    }

    // 3. Validate environment prerequisites & detect drift
    const envValidation = await this.validateEnvironment(workflow, resolvedParams);
    if (!envValidation.passed) {
      options.onLog?.(`[ReplayEngine] Environment validation failed:\n- ${envValidation.errors.join('\n- ')}`);
      return {
        workflowName: workflow.name,
        success: false,
        durationMs: performance.now() - startTime,
        stepsExecuted: 0,
        totalSteps: workflow.steps.length,
        stepResults: [],
        environmentValidation: envValidation,
        error: `Environment validation failed: ${envValidation.errors.join('; ')}`
      };
    }

    // 4. Execute steps sequentially with safety enforcement
    const stepResults: ReplayStepResult[] = [];
    const totalSteps = workflow.steps.length;
    const isDryRun = options.dryRun || resolvedParams['DRY_RUN'] === true || resolvedParams['DRYRUN'] === true;

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepStart = performance.now();

      // Cross-platform command resolution and parameter substitution
      const resolvedCommand = CrossPlatformCommandAdapter.getInstance().resolveStepCommand(step);
      const expandedCommand = this.substituteParameters(resolvedCommand, resolvedParams);
      const expandedCwd = step.cwd ? this.substituteParameters(step.cwd, resolvedParams) : undefined;

      // Categorical Security Analysis
      const securityEngine = new SecurityEngine();
      const riskAnalysis = securityEngine.analyzeCommand(expandedCommand);

      options.onStepStart?.(step, i, totalSteps);

      // Handle Dry-Run Mode
      if (isDryRun) {
        const stepRes: ReplayStepResult = {
          stepId: step.id,
          name: step.name,
          command: expandedCommand,
          exitCode: 0,
          stdout: `[DRY-RUN] Would execute: "${expandedCommand}" (Risk score: ${riskAnalysis.score})`,
          stderr: '',
          durationMs: performance.now() - stepStart,
          riskAnalysis,
          status: 'skipped_dry_run'
        };
        stepResults.push(stepRes);
        options.onStepDone?.(step, stepRes);
        continue;
      }

      // Precondition Check (Phase 0.75 Task 0.75.2)
      if (step.precondition_check) {
        const resolvedPre = CrossPlatformCommandAdapter.getInstance().translateCommand(step.precondition_check);
        const expandedPre = this.substituteParameters(resolvedPre, resolvedParams);
        options.onLog?.(`[ReplayEngine] Evaluating precondition for step "${step.name}": ${expandedPre}`);
        let preOutput: { code: number; stdout: string; stderr: string };
        try {
          if (options.executor) {
            preOutput = await options.executor(expandedPre, expandedCwd);
          } else {
            preOutput = await this.defaultExecute(expandedPre, expandedCwd);
          }
        } catch {
          preOutput = { code: 1, stdout: '', stderr: 'Precondition evaluation failed' };
        }

        const prePassed = preOutput.code === 0;
        if (prePassed) {
          if (step.if_precondition_true === 'skip') {
            options.onLog?.(`[ReplayEngine] Precondition satisfied for "${step.name}". Skipping step.`);
            const skipRes: ReplayStepResult = {
              stepId: step.id,
              name: step.name,
              command: expandedCommand,
              exitCode: 0,
              stdout: `[SKIPPED] Precondition satisfied (${step.precondition_check})`,
              stderr: '',
              durationMs: performance.now() - stepStart,
              riskAnalysis,
              status: 'skipped'
            };
            stepResults.push(skipRes);
            options.onStepDone?.(step, skipRes);
            continue;
          } else if (step.if_precondition_true === 'abort') {
            const err = `Step "${step.name}" aborted because precondition (${step.precondition_check}) evaluated to true.`;
            options.onLog?.(`[ReplayEngine] ${err}`);
            const failRes: ReplayStepResult = {
              stepId: step.id,
              name: step.name,
              command: expandedCommand,
              exitCode: 1,
              stdout: '',
              stderr: err,
              durationMs: performance.now() - stepStart,
              riskAnalysis,
              status: 'failed',
              error: err
            };
            stepResults.push(failRes);
            options.onStepDone?.(step, failRes);
            return {
              workflowName: workflow.name,
              success: false,
              durationMs: performance.now() - startTime,
              stepsExecuted: stepResults.length,
              totalSteps,
              stepResults,
              environmentValidation: envValidation,
              error: err
            };
          }
        } else {
          if (step.if_precondition_false === 'abort') {
            const err = `Step "${step.name}" aborted because precondition (${step.precondition_check}) failed with code ${preOutput.code}.`;
            options.onLog?.(`[ReplayEngine] ${err}`);
            const failRes: ReplayStepResult = {
              stepId: step.id,
              name: step.name,
              command: expandedCommand,
              exitCode: preOutput.code || 1,
              stdout: preOutput.stdout,
              stderr: preOutput.stderr || err,
              durationMs: performance.now() - stepStart,
              riskAnalysis,
              status: 'failed',
              error: err
            };
            stepResults.push(failRes);
            options.onStepDone?.(step, failRes);
            return {
              workflowName: workflow.name,
              success: false,
              durationMs: performance.now() - startTime,
              stepsExecuted: stepResults.length,
              totalSteps,
              stepResults,
              environmentValidation: envValidation,
              error: err
            };
          } else if (step.if_precondition_false === 'skip') {
            options.onLog?.(`[ReplayEngine] Precondition not satisfied for "${step.name}". Skipping step.`);
            const skipRes: ReplayStepResult = {
              stepId: step.id,
              name: step.name,
              command: expandedCommand,
              exitCode: 0,
              stdout: `[SKIPPED] Precondition not satisfied (${step.precondition_check})`,
              stderr: '',
              durationMs: performance.now() - stepStart,
              riskAnalysis,
              status: 'skipped'
            };
            stepResults.push(skipRes);
            options.onStepDone?.(step, skipRes);
            continue;
          }
        }
      }

      // Check Consent if SENSITIVE and not auto-approved
      if (riskAnalysis.level !== 'SAFE' && !options.autoApprove && riskAnalysis.requiresConsent) {
        const errorMsg = `Execution halted on step "${step.name}": SENSITIVE action requires consent (${riskAnalysis.categories?.join(', ') || 'unknown'}).`;
        options.onLog?.(`[ReplayEngine] ${errorMsg}`);
        const failedStep: ReplayStepResult = {
          stepId: step.id,
          name: step.name,
          command: expandedCommand,
          exitCode: 126,
          stdout: '',
          stderr: errorMsg,
          durationMs: performance.now() - stepStart,
          riskAnalysis,
          status: 'failed',
          error: errorMsg
        };
        stepResults.push(failedStep);
        options.onStepDone?.(step, failedStep);

        return {
          workflowName: workflow.name,
          success: false,
          durationMs: performance.now() - startTime,
          stepsExecuted: stepResults.length,
          totalSteps,
          stepResults,
          environmentValidation: envValidation,
          error: errorMsg
        };
      }

      // Execute Step
      let execOutput: { code: number; stdout: string; stderr: string };
      try {
        if (options.executor) {
          execOutput = await options.executor(expandedCommand, expandedCwd);
        } else {
          execOutput = await this.defaultExecute(expandedCommand, expandedCwd);
        }
      } catch (err: any) {
        execOutput = {
          code: 1,
          stdout: '',
          stderr: err?.message || String(err)
        };
      }

      const stepDuration = performance.now() - stepStart;
      const expectedCode = step.expectedExitCode !== undefined ? step.expectedExitCode : 0;
      const stepPassed = execOutput.code === expectedCode;

      // Log executed action to session UndoLog
      UndoLog.getInstance().recordAction({
        sessionId: options.sessionId || 'default',
        goal: `Replay workflow: ${workflow.name} -> ${step.name}`,
        command: expandedCommand,
        isDestructive: step.isDestructive
      });

      const stepResult: ReplayStepResult = {
        stepId: step.id,
        name: step.name,
        command: expandedCommand,
        exitCode: execOutput.code,
        stdout: execOutput.stdout,
        stderr: execOutput.stderr,
        durationMs: stepDuration,
        riskAnalysis,
        status: stepPassed ? 'completed' : 'failed',
        error: stepPassed ? undefined : `Step failed with exit code ${execOutput.code}: ${execOutput.stderr || execOutput.stdout}`
      };

      stepResults.push(stepResult);
      options.onStepDone?.(step, stepResult);

      if (!stepPassed) {
        options.onLog?.(`[ReplayEngine] Workflow "${workflow.name}" aborted on step ${i + 1} (${step.name}).`);
        return {
          workflowName: workflow.name,
          success: false,
          durationMs: performance.now() - startTime,
          stepsExecuted: stepResults.length,
          totalSteps,
          stepResults,
          environmentValidation: envValidation,
          error: stepResult.error
        };
      }
    }

    return {
      workflowName: workflow.name,
      success: true,
      durationMs: performance.now() - startTime,
      stepsExecuted: stepResults.length,
      totalSteps,
      stepResults,
      environmentValidation: envValidation
    };
  }

  /**
   * Replace {{PARAM}} and $PARAM variables in text with resolved values.
   */
  public substituteParameters(text: string, params: Record<string, any>): string {
    let result = text;

    for (const [key, val] of Object.entries(params)) {
      const strVal = String(val);
      // Replace {{key}}, {{KEY}}, {{ key }}
      const doubleBraceRegex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      result = result.replace(doubleBraceRegex, strVal);

      // Replace $KEY or ${KEY}
      const shellVarRegex = new RegExp(`\\$(?:\\{${key}\\}|\\b${key}\\b)`, 'gi');
      result = result.replace(shellVarRegex, strVal);
    }

    return result;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private parseValue(val: string): string | number | boolean {
    if (/^(?:true|yes|on)$/i.test(val)) return true;
    if (/^(?:false|no|off)$/i.test(val)) return false;
    if (/^-?\d+$/.test(val)) return parseInt(val, 10);
    if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
    return val;
  }

  private async checkBinaryExists(
    binary: string,
    executor?: (cmd: string) => Promise<{ code: number }>
  ): Promise<boolean> {
    return CrossPlatformCommandAdapter.getInstance().checkBinaryExists(binary, executor);
  }

  private async checkPathExists(
    pathToCheck: string,
    executor?: (cmd: string) => Promise<{ code: number }>
  ): Promise<boolean> {
    return CrossPlatformCommandAdapter.getInstance().checkPathExists(pathToCheck, executor);
  }

  private async defaultExecute(
    command: string,
    cwd?: string
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return { code: 0, stdout: `Executed: ${command}`, stderr: '' };
    }

    // Same path as a fresh agent command: SecurityEngine risk analysis, ConsentQueue prompt for
    // anything not read-only, execution timeout. Replays (including imported/shared workflows)
    // previously ran through raw execute_command without asking.
    try {
      const [{ ToolExecutor }, { ConsentQueue }] = await Promise.all([
        import('../../ai/agent/ToolExecutor'),
        import('../../domain/security/ConsentQueue')
      ]);
      const res = await new ToolExecutor().execute(
        'shell.execute',
        { command, cwd, explanation: `Workflow step: ${command}` },
        cwd,
        plan => ConsentQueue.getInstance().enqueue(plan)
      );
      return {
        code: res.success ? (res.data?.code ?? 0) : (res.data?.code ?? 1),
        stdout: res.data?.stdout || '',
        stderr: res.data?.stderr || (res.success ? '' : (res.error || 'Execution failed'))
      };
    } catch (err: any) {
      return {
        code: 1,
        stdout: '',
        stderr: err?.message || String(err)
      };
    }
  }
}
