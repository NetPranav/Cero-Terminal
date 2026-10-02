/**
 * WorkflowRecorder.ts — Interactive Workflow & Macro Recorder
 *
 * Captures executed session steps, commands, working directories, dynamic parameters,
 * and environment prerequisites, saving them as a schema-versioned workflow definition
 * (`~/.sentinel/workflows/<name>.flow`, schemaVersion: 1).
 */

import {
  SavedWorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowVariable,
  EnvironmentPrerequisites,
  CURRENT_WORKFLOW_SCHEMA_VERSION
} from '../models/WorkflowTypes';
import { DiskWorkflowStorage } from '../storage/DiskWorkflowStorage';
import { UndoLog, UndoLogEntry } from '../../domain/session/UndoLog';
import { AgentPlan } from '../../ai/agent/AdaptivePlanEngine';

export interface RecordWorkflowOptions {
  description?: string;
  tags?: string[];
  author?: string;
  parameters?: WorkflowVariable[];
  storage?: DiskWorkflowStorage;
}

export interface TrajectoryStep {
  command: string;
  name?: string;
  cwd?: string;
  output?: string;
  exitCode?: number;
  explanation?: string;
}

export class WorkflowRecorder {
  private static instance?: WorkflowRecorder;
  private storage: DiskWorkflowStorage;

  public static getInstance(): WorkflowRecorder {
    if (!WorkflowRecorder.instance) {
      WorkflowRecorder.instance = new WorkflowRecorder();
    }
    return WorkflowRecorder.instance;
  }

  constructor(customStorage?: DiskWorkflowStorage) {
    this.storage = customStorage || DiskWorkflowStorage.getInstance();
  }

  /**
   * Save a workflow directly from an ordered list of command strings or steps.
   */
  public async saveFromCommands(
    name: string,
    commands: string[] | TrajectoryStep[],
    options?: RecordWorkflowOptions
  ): Promise<SavedWorkflowDefinition> {
    const rawSteps: TrajectoryStep[] = commands.map(c =>
      typeof c === 'string' ? { command: c } : c
    );

    return this.compileAndSave(name, rawSteps, options);
  }

  /**
   * Save a workflow from an executed AgentPlan.
   */
  public async saveFromPlan(
    name: string,
    plan: AgentPlan,
    options?: RecordWorkflowOptions
  ): Promise<SavedWorkflowDefinition> {
    const steps: TrajectoryStep[] = [];

    if (plan.phases && plan.phases.length > 0) {
      for (const phase of plan.phases) {
        // Skip skipped or failed phases unless explicit
        if (phase.status === 'skipped') continue;

        const cmd = phase.params?.command || (phase.tool === 'shell.execute' ? phase.params?.command : '');
        if (cmd) {
          steps.push({
            name: phase.title,
            command: cmd,
            explanation: phase.description
          });
        }

        if (phase.subPhases) {
          for (const sub of phase.subPhases) {
            const subCmd = sub.params?.command;
            if (subCmd) {
              steps.push({
                name: sub.title,
                command: subCmd,
                explanation: sub.description
              });
            }
          }
        }
      }
    } else if (plan.steps && plan.steps.length > 0) {
      for (let i = 0; i < plan.steps.length; i++) {
        steps.push({
          name: `Step ${i + 1}`,
          command: plan.steps[i]
        });
      }
    }

    return this.compileAndSave(name, steps, {
      description: options?.description || plan.summary,
      ...options
    });
  }

  /**
   * Save a workflow by capturing recent actions from the session UndoLog.
   */
  public async saveFromUndoLog(
    name: string,
    sessionId: string,
    maxSteps = 10,
    options?: RecordWorkflowOptions
  ): Promise<SavedWorkflowDefinition> {
    const undoLog = UndoLog.getInstance();
    const actions = undoLog.getRecentActions(sessionId, maxSteps);

    // Filter to executed actions and restore chronological order
    const relevantActions = [...actions]
      .reverse()
      .filter(a => a.status === 'executed');

    const steps: TrajectoryStep[] = relevantActions.map((a: UndoLogEntry) => ({
      command: a.command,
      explanation: a.goal
    }));

    return this.compileAndSave(name, steps, options);
  }

  /**
   * Internal compiler & saver that parameterizes, adds environment prerequisites,
   * enforces schemaVersion 1, and writes to disk.
   */
  private async compileAndSave(
    name: string,
    rawSteps: TrajectoryStep[],
    options?: RecordWorkflowOptions
  ): Promise<SavedWorkflowDefinition> {
    const cleanName = this.slugify(name);
    const storageToUse = options?.storage || this.storage;

    const steps: WorkflowStepDefinition[] = [];
    const detectedParams: Map<string, WorkflowVariable> = new Map();
    const requiredBinaries: Set<string> = new Set();
    const requiredPorts: Set<number> = new Set();

    let previousId: string | null = null;

    for (let i = 0; i < rawSteps.length; i++) {
      const raw = rawSteps[i];
      const stepId = `step-${i + 1}`;

      // Extract binary
      const binaryMatch = raw.command.trim().match(/^([a-zA-Z0-9_\-.]+)/);
      if (binaryMatch) {
        const bin = binaryMatch[1];
        if (!['echo', 'mkdir', 'cd', 'true', 'false', 'test'].includes(bin)) {
          requiredBinaries.add(bin);
        }
      }

      // Extract ports (e.g. port 8080, :3000)
      const portMatch = raw.command.match(/(?::|port\s+)(\d{2,5})/i);
      if (portMatch) {
        const p = parseInt(portMatch[1], 10);
        if (p > 0 && p <= 65535) {
          requiredPorts.add(p);
          if (!detectedParams.has('PORT')) {
            detectedParams.set('PORT', {
              name: 'PORT',
              type: 'port',
              description: 'Target application port',
              required: false,
              defaultValue: p
            });
          }
        }
      }

      // Check if command is destructive
      const isDestructive = this.isDestructiveCommand(raw.command);

      const stepDef: WorkflowStepDefinition = {
        id: stepId,
        name: raw.name || `Step ${i + 1}`,
        command: raw.command,
        cwd: raw.cwd,
        dependsOn: previousId ? [previousId] : undefined,
        isDestructive
      };

      steps.push(stepDef);
      previousId = stepId;
    }

    // Merge explicitly provided parameters with detected parameters
    if (options?.parameters) {
      for (const p of options.parameters) {
        detectedParams.set(p.name, p);
      }
    }

    const workflow: SavedWorkflowDefinition = {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      name: cleanName,
      description: options?.description || `Workflow ${cleanName} recorded by Sentinel`,
      steps,
      parameters: Array.from(detectedParams.values()),
      environmentPrerequisites: {
        requiredBinaries: Array.from(requiredBinaries),
        requiredPorts: Array.from(requiredPorts)
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: options?.author || 'user',
      tags: options?.tags || ['macro', 'saved']
    };

    await storageToUse.saveWorkflow(workflow);
    return workflow;
  }

  private isDestructiveCommand(cmd: string): boolean {
    const lower = cmd.toLowerCase();
    return /\b(rm\s+-rf|clean|drop|kill|truncate|reset|prune|wipe)\b/.test(lower);
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
