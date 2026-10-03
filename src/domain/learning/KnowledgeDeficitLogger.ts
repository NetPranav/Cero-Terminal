/**
 * KnowledgeDeficitLogger.ts — Runtime Knowledge Deficit Logger
 * 
 * Part of Cero-SERL (Self-Evolving Reflexion Loop):
 * Intercepts when the model fails, produces an excuse, or outputs an unresolved answer
 * (e.g. "I can't detect how many ports are being used by antigravity").
 * Captures prompt, model output, environment context, and execution status,
 * and persists to ~/.cero/learning/knowledge_deficits.jsonl.
 * 
 * Feeds directly into:
 * - Phase 4.3: Autonomous Background Reflexion & Counterfactual Synthesis Engine
 * - Phase 4.4: Direct Preference Optimization (DPO) Pair Generator
 */

import { writeCeroFile } from '../../infrastructure/storage/CeroFiles';
import { invoke } from '@tauri-apps/api/core';
import * as fs from 'fs';
import * as path from 'path';
import { safeBase64Encode } from '../../utils/encodingUtils';

export type DeficitCategory =
  | 'conversational_refusal'
  | 'execution_failure'
  | 'unresolved_probe'
  | 'hallucinated_completion'
  | 'syntax_malformation';

export type DeficitStatus = 'logged' | 'analyzing' | 'resolved' | 'unresolvable';

export interface DeficitContext {
  os: string;
  cwd: string;
  targetEntity?: string;
  intent?: string;
  metadata?: Record<string, any>;
}

export interface DeficitCounterfactual {
  verifiedCommand: string;
  explanation?: string;
  resolvedAt: number;
  source?: 'reflexion' | 'user_demonstration' | 'self_play';
}

export interface KnowledgeDeficitRecord {
  id: string;
  timestamp: number;
  goal: string;
  category: DeficitCategory;
  modelOutput?: string;
  attemptedCommand?: string;
  exitCode?: number;
  stderr?: string;
  context: DeficitContext;
  status: DeficitStatus;
  resolutionCounterfactual?: DeficitCounterfactual;
  occurrenceCount: number;
}

export interface DeficitDetectionResult {
  isDeficit: boolean;
  category?: DeficitCategory;
  reason?: string;
}

export class KnowledgeDeficitLogger {
  private static instance: KnowledgeDeficitLogger;
  private deficits: Map<string, KnowledgeDeficitRecord> = new Map();
  private storageFilePath: string;
  private isLoaded: boolean = false;

  public static getInstance(customPath?: string): KnowledgeDeficitLogger {
    if (!KnowledgeDeficitLogger.instance || customPath) {
      KnowledgeDeficitLogger.instance = new KnowledgeDeficitLogger(customPath);
    }
    return KnowledgeDeficitLogger.instance;
  }

  constructor(customPath?: string) {
    if (customPath) {
      this.storageFilePath = customPath;
    } else {
      const home = typeof process !== 'undefined'
        ? (process.env.HOME || process.env.USERPROFILE || '/tmp')
        : '/tmp';
      this.storageFilePath = path.join(home, '.cero', 'learning', 'knowledge_deficits.jsonl');
    }
    this.loadDeficits();
  }

  /**
   * Evaluates an agent interaction to detect whether a knowledge deficit occurred.
   */
  public detectDeficit(params: {
    goal: string;
    modelOutput?: string;
    steps?: { tool: string; params: any; result: { success: boolean; data?: any; error?: string } }[];
    exitCode?: number;
    stderr?: string;
    attemptedCommand?: string;
  }): DeficitDetectionResult {
    const output = (params.modelOutput || '').trim();
    const goal = params.goal.trim();

    // 1. Check for conversational excuses, inability, or chatbot refusals
    if (output && this.isConversationalRefusalOrExcuse(output)) {
      return {
        isDeficit: true,
        category: 'conversational_refusal',
        reason: `Model generated conversational excuse or refusal: "${output.slice(0, 100)}..."`
      };
    }

    // 2. Check for terminal execution failure (non-zero exit code or explicit stderr)
    if (params.exitCode !== undefined && params.exitCode !== 0) {
      return {
        isDeficit: true,
        category: 'execution_failure',
        reason: `Command exited with status code ${params.exitCode}: ${params.stderr || 'unknown error'}`
      };
    }

    // 3. Check for step errors when steps were recorded
    if (params.steps && params.steps.length > 0) {
      const failedSteps = params.steps.filter(s => !s.result?.success);
      if (failedSteps.length === params.steps.length) {
        const lastErr = failedSteps[failedSteps.length - 1].result?.error || 'All execution steps failed';
        return {
          isDeficit: true,
          category: 'execution_failure',
          reason: lastErr
        };
      }
    }

    // 4. Hallucinated completion without execution on actionable goals
    if (params.steps && params.steps.length === 0 && output && this.isActionableGoal(goal)) {
      if (/\b(?:has been|have been|is|was|were)?\s*(?:found|located|completed|finished|done|executed|opened|created|deleted)\b/i.test(output)) {
        return {
          isDeficit: true,
          category: 'hallucinated_completion',
          reason: `Model claimed task completion without executing any command for goal: "${goal}"`
        };
      }
    }

    return { isDeficit: false };
  }

  /**
   * Logs a knowledge deficit record into memory and appends to persistent storage.
   */
  public logDeficit(params: {
    goal: string;
    category: DeficitCategory;
    modelOutput?: string;
    attemptedCommand?: string;
    exitCode?: number;
    stderr?: string;
    context: {
      os?: string;
      cwd?: string;
      targetEntity?: string;
      intent?: string;
      metadata?: Record<string, any>;
    };
  }): KnowledgeDeficitRecord {
    const cleanGoal = params.goal.trim();
    const { targetEntity, intent } = this.extractEntityAndIntent(cleanGoal, params.attemptedCommand);

    const osName = params.context.os || (typeof process !== 'undefined' ? process.platform : 'darwin');
    const cwdPath = params.context.cwd || (typeof process !== 'undefined' ? process.cwd() : '/');

    // Deduplication check: check if an identical goal/entity deficit is already logged
    for (const deficit of this.deficits.values()) {
      if (
        deficit.status === 'logged' &&
        (deficit.goal.toLowerCase() === cleanGoal.toLowerCase() ||
          (targetEntity && deficit.context.targetEntity === targetEntity && deficit.context.intent === intent))
      ) {
        deficit.occurrenceCount++;
        deficit.timestamp = Date.now();
        deficit.modelOutput = params.modelOutput || deficit.modelOutput;
        deficit.attemptedCommand = params.attemptedCommand || deficit.attemptedCommand;
        deficit.exitCode = params.exitCode ?? deficit.exitCode;
        deficit.stderr = params.stderr || deficit.stderr;
        this.saveDeficits();
        return deficit;
      }
    }

    const id = `deficit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: KnowledgeDeficitRecord = {
      id,
      timestamp: Date.now(),
      goal: cleanGoal,
      category: params.category,
      modelOutput: params.modelOutput,
      attemptedCommand: params.attemptedCommand,
      exitCode: params.exitCode,
      stderr: params.stderr,
      context: {
        os: osName,
        cwd: cwdPath,
        targetEntity: params.context.targetEntity || targetEntity,
        intent: params.context.intent || intent,
        metadata: params.context.metadata
      },
      status: 'logged',
      occurrenceCount: 1
    };

    this.deficits.set(id, record);
    this.saveDeficits();
    return record;
  }

  /**
   * Extracts the target entity (e.g. 'antigravity', 'port 3000') and user intent
   * from the natural language goal and command.
   */
  public extractEntityAndIntent(goal: string, command?: string): { targetEntity?: string; intent: string } {
    const text = `${goal} ${command || ''}`.trim();

    // 1. Port inspection / termination intent
    const portMatch = text.match(/(?:port\s+|:)(\d+)\b/i);
    if (portMatch) {
      const port = portMatch[1];
      const isKill = /\b(kill|terminate|stop|free|close)\b/i.test(text);
      return {
        targetEntity: `port ${port}`,
        intent: isKill ? 'port_termination' : 'port_inspection'
      };
    }

    // 2. Named Application / Process Port inspection (e.g. "ports used by antigravity", "ports that is being used by antigravity")
    const appPortMatch = text.match(/ports?\s+.*?\b(?:used\s+by|for|of|belonging\s+to)\s+([a-zA-Z0-9_-]+)/i)
      || text.match(/ports?\s+(?:used\s+by|for|of|belonging\s+to)\s+([a-zA-Z0-9_-]+)/i);
    if (appPortMatch) {
      return {
        targetEntity: appPortMatch[1].trim(),
        intent: 'port_inspection'
      };
    }

    // 3. File search / locate intent (prioritized when file/folder/named keywords exist)
    if (/\b(find|locate|search|where\s+is)\b/i.test(text) && /\b(file|folder|dir|directory|named|matching|\.[a-z0-9]+)\b/i.test(text)) {
      const fileMatch = text.match(/(?:named|matching)\s+['"]?([a-zA-Z0-9_.*-]+)['"]?/i)
        || text.match(/(?:file|folder)\s+['"]?([a-zA-Z0-9_.*-]+\.[a-zA-Z0-9]+)['"]?/i)
        || text.match(/['"]([a-zA-Z0-9_.*-]+)['"]/i);
      return {
        targetEntity: fileMatch ? fileMatch[1].trim() : undefined,
        intent: 'file_search'
      };
    }

    // 4. Process inspection / termination
    const procKillMatch = text.match(/\b(?:kill|terminate|killall|pkill)\s+(?:process\s+)?([a-zA-Z0-9_-]+)/i);
    if (procKillMatch) {
      return {
        targetEntity: procKillMatch[1].trim(),
        intent: 'process_termination'
      };
    }

    const procInspectMatch = text.match(/\b(?:check|inspect|find|status\s+of|running)\s+(?:process\s+)?([a-zA-Z0-9_-]+)/i);
    if (procInspectMatch) {
      const candidate = procInspectMatch[1].toLowerCase();
      if (!['the', 'my', 'all', 'a', 'an', 'file', 'folder', 'dir', 'directory', 'port', 'ports'].includes(candidate)) {
        return {
          targetEntity: procInspectMatch[1].trim(),
          intent: 'process_inspection'
        };
      }
    }

    // 5. Service / Hardware intent
    if (/\b(bluetooth|wifi|network|battery|audio)\b/i.test(text)) {
      const serviceMatch = text.match(/\b(bluetooth|wifi|network|battery|audio)\b/i);
      return {
        targetEntity: serviceMatch ? serviceMatch[1].toLowerCase() : undefined,
        intent: 'hardware_management'
      };
    }

    return {
      targetEntity: undefined,
      intent: 'general_execution'
    };
  }

  /**
   * Retrieves pending deficits that have not yet been resolved by the Reflexion Engine.
   */
  public getPendingDeficits(limit: number = 50): KnowledgeDeficitRecord[] {
    const pending = Array.from(this.deficits.values()).filter(
      d => d.status === 'logged' || d.status === 'analyzing'
    );
    // Sort by occurrence count descending, then timestamp descending
    pending.sort((a, b) => b.occurrenceCount - a.occurrenceCount || b.timestamp - a.timestamp);
    return pending.slice(0, limit);
  }

  /**
   * Alias for getPendingDeficits.
   */
  public getUnresolvedDeficits(limit: number = 50): KnowledgeDeficitRecord[] {
    return this.getPendingDeficits(limit);
  }

  /**
   * Returns aggregated statistics for all logged knowledge deficits.
   */
  public getStats(): {
    totalDeficits: number;
    unresolvedCount: number;
    resolvedCount: number;
    categoryCounts: Record<string, number>;
  } {
    const all = Array.from(this.deficits.values());
    const unresolved = all.filter(d => d.status === 'logged' || d.status === 'analyzing').length;
    const resolved = all.filter(d => d.status === 'resolved').length;
    const categoryCounts: Record<string, number> = {};
    for (const d of all) {
      categoryCounts[d.category] = (categoryCounts[d.category] || 0) + 1;
    }
    return {
      totalDeficits: all.length,
      unresolvedCount: unresolved,
      resolvedCount: resolved,
      categoryCounts,
    };
  }

  /**
   * Marks a deficit as successfully resolved by the Reflexion Engine with verified counterfactual.
   */
  public markResolved(id: string, counterfactual: DeficitCounterfactual): boolean {
    const record = this.deficits.get(id);
    if (!record) return false;

    record.status = 'resolved';
    record.resolutionCounterfactual = counterfactual;
    this.saveDeficits();
    return true;
  }

  /**
   * Updates deficit status (e.g. to 'analyzing' or 'unresolvable').
   */
  public updateStatus(id: string, status: DeficitStatus): boolean {
    const record = this.deficits.get(id);
    if (!record) return false;

    record.status = status;
    this.saveDeficits();
    return true;
  }

  public getDeficitById(id: string): KnowledgeDeficitRecord | undefined {
    return this.deficits.get(id);
  }

  public getAllDeficits(): KnowledgeDeficitRecord[] {
    return Array.from(this.deficits.values());
  }

  public clear(): void {
    this.deficits.clear();
    this.saveDeficits();
  }

  /**
   * Identifies conversational refusals, excuses, and admissions of inability.
   */
  public isConversationalRefusalOrExcuse(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();

    const excusePatterns = [
      /\b(?:can(?:not|'t)|unable\s+to|don't\s+have\s+access|cannot\s+access|not\s+able\s+to)\s+(?:detect|find|see|inspect|determine|know|tell|check)\b/i,
      /\b(?:don't\s+have\s+access|do\s+not\s+have\s+access|cannot\s+access|no\s+access)\b/i,
      /\b(?:can(?:not|'t)\s+tell\s+which|don't\s+know\s+how\s+many)\b/i,
      /\b(?:as\s+an\s+ai|i\s+am\s+an\s+ai|language\s+model)\b/i,
      /\b(?:i\s+apologize,\s+but\s+i\s+cannot|i'm\s+sorry,\s+but\s+i\s+can't)\b/i,
      /\b(?:i\s+do\s+not\s+have\s+the\s+ability\s+to)\b/i,
      /\b(?:i\s+cannot\s+interact\s+with\s+your\s+system)\b/i,
      /\b(?:no\s+access\s+to\s+(?:your\s+)?(?:system|terminal|shell|ports|files))\b/i,
      /\b(?:can(?:not|'t)|unable\s+to|not\s+able\s+to)\s+(?:assist|help|modify|execute|perform|run)\b/i,
      /\b(?:cannot|can\s+not|can't)\s+(?:directly\s+)?(?:access|modify|control)\b/i,
    ];

    return excusePatterns.some(pattern => pattern.test(lower));
  }

  private isActionableGoal(goal: string): boolean {
    return !/^(?:hi|hello|hey|who\s+are\s+you|help|what\s+can\s+you\s+do)\b/i.test(goal.trim());
  }

  /**
   * Loads persisted deficits from JSONL file.
   */
  private loadDeficits(): void {
    if (this.isLoaded) return;

    try {
      if (fs.existsSync(this.storageFilePath)) {
        const content = fs.readFileSync(this.storageFilePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        for (const line of lines) {
          try {
            const record: KnowledgeDeficitRecord = JSON.parse(line);
            if (record && record.id) {
              this.deficits.set(record.id, record);
            }
          } catch {
            // Ignore malformed lines
          }
        }
      }
    } catch {
      // In browser/Tauri environment without fs access, graceful fallback
    }

    this.isLoaded = true;
  }

  /**
   * Persists deficits to JSONL file.
   */
  private saveDeficits(): void {
    const records = Array.from(this.deficits.values());

    // 1. Direct Node.js filesystem write if available
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const lines = records.map(r => JSON.stringify(r)).join('\n');
      fs.writeFileSync(this.storageFilePath, lines + (lines ? '\n' : ''), 'utf-8');
      return;
    } catch {
      // Fall through to Tauri IPC if fs is unavailable
    }

    // 2. Tauri IPC fallback via base64 encoding
    try {
      const lines = records.map(r => JSON.stringify(r)).join('\n');
      writeCeroFile('learning/knowledge_deficits.jsonl', lines + '\n');
    } catch {
      // Ignore
    }
  }
}
