/**
 * MultistagePromptDecomposer.ts — Composite Request Parser & DAG Generator
 *
 * Decomposes multi-stage requests (e.g. "deploy staging: build frontend, package container,
 * push to registry, run migration, and verify health check on port 8080" or
 * "first clean cache, then compile with cargo, after that run tests") into an ordered,
 * dependency-linked DAG with extracted parameters and environment prerequisites.
 */

import {
  WorkflowVariable,
  WorkflowStepDefinition,
  EnvironmentPrerequisites,
  SavedWorkflowDefinition,
  CURRENT_WORKFLOW_SCHEMA_VERSION
} from '../models/WorkflowTypes';
import { CrossPlatformCommandAdapter } from './CrossPlatformCommandAdapter';

import { parseSaveIntent, lastStepCount } from './SaveIntent';

export interface DecomposedStage {
  id: string;
  name: string;
  rawPrompt: string;
  inferredCommand: string;
  cwd?: string;
  dependencies: string[];
  isDestructive: boolean;
  parameters?: Record<string, string | number>;
  expectedOutputValidator?: string;
  // Phase 0.75 Task 0.75.2: Precondition-aware step schema
  precondition_check?: string;
  if_precondition_true?: 'skip' | 'continue' | 'abort';
  if_precondition_false?: 'install' | 'continue' | 'abort' | 'skip';
  platformCommands?: {
    linux?: string;
    macos?: string;
    windows?: string;
  };
}

export interface DecomposedWorkflowPlan {
  name: string;
  description: string;
  stages: DecomposedStage[];
  detectedParameters: WorkflowVariable[];
  prerequisites: EnvironmentPrerequisites;
}

export interface WorkflowSaveDirective {
  taskPrompt: string;
  workflowName?: string;
  isSaveAsWorkflow: boolean;
}

export interface ScopedWorkflowSaveRequest {
  isSaveWorkflow: boolean;
  workflowName: string;
  maxSteps: number;
}

export class MultistagePromptDecomposer {
  private static instance?: MultistagePromptDecomposer;

  public static getInstance(): MultistagePromptDecomposer {
    if (!MultistagePromptDecomposer.instance) {
      MultistagePromptDecomposer.instance = new MultistagePromptDecomposer();
    }
    return MultistagePromptDecomposer.instance;
  }

  /**
   * Extract workflow save directives, supporting both delimited (":: save as workflow <name>")
   * and natural language suffixes (e.g. "After successfully completing all of these steps, save the verified execution as a workflow named <name>").
   */
  public extractSaveAsDirective(prompt: string): WorkflowSaveDirective {
    const intent = parseSaveIntent(prompt);
    if (intent.save && intent.task) {
      return { taskPrompt: intent.task, workflowName: intent.name, isSaveAsWorkflow: true };
    }
    return { taskPrompt: prompt.replace(/^>\s*/, '').trim(), isSaveAsWorkflow: false };
  }

  /**
   * Parse retrospective scoped workflow save requests:
   * "save [as] workflow <name> [last N [commands|steps]]"
   */
  public parseScopedWorkflowSave(prompt: string): ScopedWorkflowSaveRequest | null {
    const trimmed = prompt.replace(/^>\s*/, '').trim();
    const match = trimmed.match(/^save\s+(?:as\s+)?workflow\s+["']?([a-zA-Z0-9_\-]+)["']?(?:\s+(.+))?$/i);
    if (match) {
      const workflowName = match[1].trim();
      const extra = (match[2] || '').trim();
      let maxSteps = 10;
      if (extra) {
        const countMatch = extra.match(/(?:^|\b)(?:(?:with\s+)?(?:the\s+)?last\s+|-n\s+|--last[=\s])?(\d+)(?:\s*(?:steps?|commands?))?(?:\b|$)/i);
        if (countMatch) maxSteps = parseInt(countMatch[1], 10);
      }
      return { isSaveWorkflow: true, workflowName, maxSteps };
    }

    // "save this as a workflow [called x]", "save the last 3 steps as a workflow": nothing else to run
    const intent = parseSaveIntent(trimmed);
    if (intent.save && !intent.task) {
      return {
        isSaveWorkflow: true,
        workflowName: intent.name ? intent.name.replace(/\s+/g, '-') : '',
        maxSteps: lastStepCount(trimmed),
      };
    }
    return null;
  }

  /**
   * Check if a prompt contains multi-stage composite intent.
   */
  public isMultistagePrompt(prompt: string): boolean {
    const directive = this.extractSaveAsDirective(prompt);
    const trimmed = directive.taskPrompt;
    if (!trimmed) return false;

    // Colon-delimited workflow declaration: "deploy staging: build ..., test ..."
    if (/^[a-zA-Z0-9_\-\s]+:\s+(?:.+[,;]|.+then\b)/i.test(trimmed)) {
      return true;
    }

    // Numbered or bulleted sequence: "1. build 2. test", "step 1: ... step 2: ..."
    if (/(?:(?:step\s*\d+|\b\d+\.)\s*[:.-]?\s*[\w\s]+){2,}/i.test(trimmed)) {
      return true;
    }

    // Explicit sequential connectives
    const connectivePattern = /\b(?:first\b.*?\bthen\b|and\s+then\b|after\s+that\b|followed\s+by\b|next\b.*?\bfinally\b)/i;
    if (connectivePattern.test(trimmed)) {
      return true;
    }

    // Semicolon or comma-chained compound clauses (at least 3 clauses or 2 compound verbs)
    const clauses = this.splitIntoRawClauses(trimmed);
    return clauses.length >= 2 && this.containsMultipleActionVerbs(trimmed);
  }

  /**
   * Decompose a composite prompt into a formal workflow DAG.
   */
  public decompose(
    prompt: string,
    context?: { cwd?: string; os?: string }
  ): DecomposedWorkflowPlan {
    const directive = this.extractSaveAsDirective(prompt);
    const trimmed = directive.taskPrompt;

    // 1. Extract workflow label if declared via suffix directive or prefix (e.g. "deploy staging: ...")
    let workflowName = directive.workflowName || 'composite-workflow';
    let workflowBody = trimmed;

    const prefixMatch = trimmed.match(/^([a-zA-Z0-9_\-\s]{3,30}):\s+(.+)$/s);
    if (prefixMatch && (prefixMatch[2].includes(',') || prefixMatch[2].includes('then') || prefixMatch[2].includes('and'))) {
      if (!directive.workflowName) {
        workflowName = this.slugify(prefixMatch[1]);
      }
      workflowBody = prefixMatch[2].trim();
    } else if (!directive.workflowName) {
      // Slugify first meaningful words
      const words = trimmed.replace(/^(first|please|start)\s+/i, '').split(/\s+/).slice(0, 3).join('-');
      workflowName = this.slugify(words) || 'composite-workflow';
    }

    // 2. Split into raw stage clauses
    const rawClauses = this.splitIntoRawClauses(workflowBody);

    // 3. Process each clause into a structured DAG node
    const stages: DecomposedStage[] = [];
    const detectedParams: Map<string, WorkflowVariable> = new Map();
    const requiredBinaries: Set<string> = new Set();
    const requiredPorts: Set<number> = new Set();

    let previousStageId: string | null = null;

    for (let i = 0; i < rawClauses.length; i++) {
      const clause = this.cleanClause(rawClauses[i]);
      if (!clause) continue;

      const stageId = `stage-${i + 1}`;
      const {
        command,
        name,
        isDestructive,
        binaries,
        ports,
        params,
        precondition_check,
        if_precondition_true,
        if_precondition_false
      } = this.synthesizeStageCommand(
        clause,
        context
      );

      binaries.forEach(b => requiredBinaries.add(b));
      ports.forEach(p => requiredPorts.add(p));

      // Extract parameter variables from command / clause
      for (const [key, val] of Object.entries(params)) {
        if (!detectedParams.has(key)) {
          detectedParams.set(key, {
            name: key,
            type: typeof val === 'number' ? 'number' : 'string',
            description: `Extracted ${key} parameter`,
            required: false,
            defaultValue: val
          });
        }
      }

      const stage: DecomposedStage = {
        id: stageId,
        name: name || `Stage ${i + 1}: ${clause.slice(0, 30)}`,
        rawPrompt: clause,
        inferredCommand: command,
        cwd: context?.cwd,
        dependencies: previousStageId ? [previousStageId] : [],
        isDestructive,
        parameters: Object.keys(params).length > 0 ? params : undefined,
        precondition_check,
        if_precondition_true,
        if_precondition_false
      };

      stages.push(stage);
      previousStageId = stageId;
    }

    // If only 1 or 0 stages parsed, fallback to single prompt execution
    if (stages.length === 0) {
      stages.push({
        id: 'stage-1',
        name: 'Execute Request',
        rawPrompt: trimmed,
        inferredCommand: trimmed,
        cwd: context?.cwd,
        dependencies: [],
        isDestructive: false
      });
    }

    return {
      name: workflowName,
      description: `Automated DAG generated from prompt: "${prompt.slice(0, 80)}"`,
      stages,
      detectedParameters: Array.from(detectedParams.values()),
      prerequisites: {
        requiredBinaries: Array.from(requiredBinaries),
        requiredPorts: Array.from(requiredPorts)
      }
    };
  }

  /**
   * Convert decomposed plan directly into SavedWorkflowDefinition for persistence.
   */
  public toSavedWorkflow(plan: DecomposedWorkflowPlan): SavedWorkflowDefinition {
    const steps: WorkflowStepDefinition[] = plan.stages.map(s => ({
      id: s.id,
      name: s.name,
      command: s.inferredCommand,
      cwd: s.cwd,
      dependsOn: s.dependencies.length > 0 ? s.dependencies : undefined,
      isDestructive: s.isDestructive,
      validationCriteria: s.expectedOutputValidator,
      precondition_check: s.precondition_check,
      if_precondition_true: s.if_precondition_true,
      if_precondition_false: s.if_precondition_false,
      platformCommands: s.platformCommands || {
        linux: CrossPlatformCommandAdapter.getInstance().translateCommand(s.inferredCommand, 'linux'),
        macos: CrossPlatformCommandAdapter.getInstance().translateCommand(s.inferredCommand, 'macos'),
        windows: CrossPlatformCommandAdapter.getInstance().translateCommand(s.inferredCommand, 'windows')
      }
    }));

    return {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      name: plan.name,
      description: plan.description,
      steps,
      parameters: plan.detectedParameters,
      environmentPrerequisites: plan.prerequisites,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: ['decomposed', 'macro']
    };
  }

  // =========================================================================
  // Private Parsing Helpers
  // =========================================================================

  private splitIntoRawClauses(text: string): string[] {
    // Check numbered patterns: "1. ... 2. ..." or "step 1: ... step 2: ..."
    if (/(?:step\s*\d+|\b\d+\.)\s*[:.-]?/i.test(text)) {
      const parts = text.split(/(?:step\s*\d+|\b\d+\.)\s*[:.-]?/i).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) return parts;
    }

    // Split on sequential connectives or semicolons
    const normalized = text
      .replace(/\b(?:and\s+then|after\s+that|followed\s+by)\b/gi, '&&THEN&&')
      .replace(/\b(?:then|next|finally)\b/gi, '&&THEN&&')
      .replace(/;/g, '&&THEN&&');

    const splitByThen = normalized.split('&&THEN&&').map(s => s.trim()).filter(Boolean);
    if (splitByThen.length >= 2) {
      return splitByThen;
    }

    // Split on comma if clauses contain actionable verbs
    const commaParts = text.split(',').map(s => s.trim()).filter(Boolean);
    if (commaParts.length >= 2 && commaParts.every(p => this.containsActionVerb(p))) {
      return commaParts;
    }

    return [text];
  }

  private cleanClause(clause: string): string {
    return clause
      .replace(/^(?:first|then|next|finally|after that|step \d+:?|and)\s+/i, '')
      .replace(/[.;]+$/, '')
      .trim();
  }

  private containsActionVerb(text: string): boolean {
    const verbs = /\b(build|test|lint|clean|compile|deploy|package|push|pull|run|start|stop|restart|kill|check|verify|install|create|delete|remove|sync|backup|update|git)\b/i;
    return verbs.test(text);
  }

  private containsMultipleActionVerbs(text: string): boolean {
    const verbs = text.match(/\b(build|test|lint|clean|compile|deploy|package|push|pull|run|start|stop|restart|kill|check|verify|install|create|delete|remove|sync|backup|update|git)\b/gi);
    return !!verbs && verbs.length >= 2;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private synthesizeStageCommand(
    clause: string,
    context?: { cwd?: string }
  ): {
    command: string;
    name: string;
    isDestructive: boolean;
    binaries: string[];
    ports: number[];
    params: Record<string, string | number>;
    precondition_check?: string;
    if_precondition_true?: 'skip' | 'continue' | 'abort';
    if_precondition_false?: 'install' | 'continue' | 'abort' | 'skip';
  } {
    const lower = clause.toLowerCase();
    const binaries: string[] = [];
    const ports: number[] = [];
    const params: Record<string, string | number> = {};

    let isDestructive = false;
    let command = clause;
    let name = clause;
    let precondition_check: string | undefined;
    let if_precondition_true: 'skip' | 'continue' | 'abort' | undefined;
    let if_precondition_false: 'install' | 'continue' | 'abort' | 'skip' | undefined;

    // Detect ports
    const portMatch = clause.match(/(?:port\s+|:)(\d{2,5})/i);
    if (portMatch) {
      const portNum = parseInt(portMatch[1], 10);
      if (portNum > 0 && portNum <= 65535) {
        ports.push(portNum);
        params['PORT'] = portNum;
      }
    }

    // Detect tags/versions
    const tagMatch = clause.match(/\b(v\d+\.\d+(?:\.\d+)?)\b/i);
    if (tagMatch) {
      params['TAG'] = tagMatch[1];
    }

    // 1. Build steps
    if (/build\s+(?:frontend|ui|web)/i.test(lower)) {
      command = 'npm run build';
      name = 'Build Frontend';
      binaries.push('npm');
      precondition_check = 'test -f package.json';
      if_precondition_true = 'continue';
      if_precondition_false = 'abort';
    } else if (/build\s+(?:backend|server|rust|cargo)/i.test(lower)) {
      command = 'cargo build --release';
      name = 'Build Backend (Cargo)';
      binaries.push('cargo');
      precondition_check = 'test -f Cargo.toml';
      if_precondition_true = 'continue';
      if_precondition_false = 'abort';
    } else if (/package\s+container|docker\s+build/i.test(lower)) {
      command = 'docker build -t app:latest .';
      name = 'Package Container';
      binaries.push('docker');
      precondition_check = 'which docker >/dev/null 2>&1 && docker info >/dev/null 2>&1';
      if_precondition_true = 'continue';
      if_precondition_false = 'abort';
    } else if (/push\s+to\s+registry|docker\s+push/i.test(lower)) {
      command = 'docker push app:latest';
      name = 'Push Container Image';
      binaries.push('docker');
      precondition_check = 'which docker >/dev/null 2>&1';
      if_precondition_true = 'continue';
      if_precondition_false = 'abort';
    } else if (/run\s+migration|db\s+migrate/i.test(lower)) {
      command = 'npx prisma migrate deploy || npm run db:migrate';
      name = 'Run Database Migrations';
      binaries.push('npm');
      isDestructive = true;
      precondition_check = 'test -f prisma/schema.prisma || test -f package.json';
      if_precondition_true = 'continue';
      if_precondition_false = 'abort';
    } else if (/health\s*check|verify\s+health/i.test(lower)) {
      const p = params['PORT'] || 8080;
      command = `curl -f -s http://localhost:${p}/health || curl -f -s http://localhost:${p}/`;
      name = `Health Check (Port ${p})`;
      binaries.push('curl');
      precondition_check = 'which curl >/dev/null 2>&1';
      if_precondition_true = 'continue';
      if_precondition_false = 'abort';
    } else if (/git\s+pull|pull\s+latest/i.test(lower)) {
      command = 'git pull --ff-only';
      name = 'Git Pull Latest';
      binaries.push('git');
      precondition_check = 'git rev-parse --is-inside-work-tree >/dev/null 2>&1';
      if_precondition_true = 'continue';
      if_precondition_false = 'abort';
    } else if (/run\s+test|npm\s+test|cargo\s+test/i.test(lower)) {
      const isCargo = lower.includes('cargo');
      command = isCargo ? 'cargo test' : 'npm test';
      name = 'Run Test Suite';
      binaries.push(isCargo ? 'cargo' : 'npm');
      precondition_check = isCargo ? 'test -f Cargo.toml' : 'test -f package.json';
      if_precondition_true = 'continue';
      if_precondition_false = 'abort';
    } else if (/clean\s+(?:target|cache|build)/i.test(lower)) {
      command = lower.includes('cargo') || lower.includes('rust') ? 'cargo clean' : 'npm run clean 2>/dev/null || rm -rf dist target';
      name = 'Clean Build Artifacts';
      isDestructive = true;
    } else if (/kill\s+process\s+on\s+port|free\s+port/i.test(lower)) {
      const p = params['PORT'] || 3000;
      command = `fuser -k ${p}/tcp 2>/dev/null || true`;
      name = `Free Port ${p}`;
      isDestructive = true;
      precondition_check = `lsof -i :${p} >/dev/null 2>&1 || fuser ${p}/tcp >/dev/null 2>&1`;
      if_precondition_true = 'continue';
      if_precondition_false = 'skip';
    } else if (/^(?:install|setup|add\s+package)\s+([a-zA-Z0-9_\-\.]+)/i.test(clause.trim())) {
      const pkgMatch = clause.trim().match(/^(?:install|setup|add\s+package)\s+([a-zA-Z0-9_\-\.]+)/i);
      const pkgName = pkgMatch ? pkgMatch[1].trim() : 'app';
      command = `which pacman >/dev/null 2>&1 && sudo pacman -S --noconfirm "${pkgName}" || which apt-get >/dev/null 2>&1 && sudo apt-get install -y "${pkgName}" || brew install "${pkgName}"`;
      name = `Install ${pkgName}`;
      binaries.push(pkgName);
      precondition_check = `which "${pkgName.toLowerCase()}" >/dev/null 2>&1`;
      if_precondition_true = 'skip';
      if_precondition_false = 'continue';
    } else {
      // Direct shell or natural action
      name = clause.charAt(0).toUpperCase() + clause.slice(1);
    }

    return {
      command,
      name,
      isDestructive,
      binaries,
      ports,
      params,
      precondition_check,
      if_precondition_true,
      if_precondition_false
    };
  }
}
