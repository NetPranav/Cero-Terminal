/**
 * DpoDatasetEngine.ts — Direct Preference Optimization (DPO) Pair Generator
 * 
 * Part of Sentinel-SERL (Self-Evolving Reflexion Loop):
 * Automatically constructs high-quality DPO training pairs (prompt, chosen, rejected)
 * from resolved knowledge deficits (Phase 4.2 & 4.3) and human corrections.
 * Persists datasets to ~/.sentinel/training/sentinel_dpo_pairs.jsonl
 * formatted for HuggingFace TRL, Unsloth, and Apple Silicon MLX DPO fine-tuning.
 */

import { writeSentinelFile } from '../../infrastructure/storage/SentinelFiles';
import { invoke } from '@tauri-apps/api/core';
import { KnowledgeDeficitLogger, KnowledgeDeficitRecord } from './KnowledgeDeficitLogger';
import * as fs from 'fs';
import * as path from 'path';
import { safeBase64Encode } from '../../utils/encodingUtils';

export interface DpoPair {
  id: string;
  timestamp: number;
  prompt: string;
  chosen: string;
  rejected: string;
  metadata?: {
    deficitId?: string;
    targetEntity?: string;
    intent?: string;
    verifiedCommand?: string;
    category?: string;
    source?: 'reflexion' | 'human_demonstration' | 'user_demonstration' | 'self_play' | 'counterfactual_synthesis';
  };
}

export interface ConversationalDpoSample {
  system: string;
  prompt: string;
  chosen: { role: 'assistant'; content: string };
  rejected: { role: 'assistant'; content: string };
}

export interface DpoDatasetStats {
  totalPairs: number;
  categoryCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  lastUpdated: number;
}

export interface DpoDatasetEngineOptions {
  storageFilePath?: string;
  deficitLogger?: KnowledgeDeficitLogger;
}

export class DpoDatasetEngine {
  private static instance: DpoDatasetEngine;
  private pairs: Map<string, DpoPair> = new Map();
  private storageFilePath: string;
  private isLoaded: boolean = false;
  private deficitLogger?: KnowledgeDeficitLogger;

  public static getInstance(options?: DpoDatasetEngineOptions): DpoDatasetEngine {
    if (!DpoDatasetEngine.instance || options) {
      DpoDatasetEngine.instance = new DpoDatasetEngine(options);
    }
    return DpoDatasetEngine.instance;
  }

  constructor(options: DpoDatasetEngineOptions = {}) {
    if (options.storageFilePath) {
      this.storageFilePath = options.storageFilePath;
    } else {
      const home = typeof process !== 'undefined'
        ? (process.env.HOME || process.env.USERPROFILE || '/tmp')
        : '/tmp';
      this.storageFilePath = path.join(home, '.sentinel', 'training', 'sentinel_dpo_pairs.jsonl');
    }
    this.deficitLogger = options.deficitLogger;
    this.loadPairs();
  }

  /**
   * Constructs a DPO pair from a resolved KnowledgeDeficitRecord.
   */
  public createPairFromDeficit(deficit: KnowledgeDeficitRecord): DpoPair | null {
    if (deficit.status !== 'resolved' || !deficit.resolutionCounterfactual) {
      return null;
    }

    const prompt = deficit.goal.trim();
    const verifiedCmd = deficit.resolutionCounterfactual.verifiedCommand.trim();
    const explanation = deficit.resolutionCounterfactual.explanation || `Execute: ${verifiedCmd}`;

    // Format chosen response conforming to Sentinel's shell execution contract
    const chosen = JSON.stringify({
      action: 'execute',
      command: verifiedCmd,
      explanation
    });

    // Format rejected response from model's bad output or failure
    let rejected = (deficit.modelOutput || '').trim();
    if (!rejected && deficit.attemptedCommand) {
      rejected = JSON.stringify({
        action: 'execute',
        command: deficit.attemptedCommand,
        explanation: 'Failed execution'
      });
    } else if (!rejected) {
      rejected = "I cannot assist with this terminal command on your operating system.";
    }

    // Deduplication key: normalized prompt
    const dedupKey = prompt.toLowerCase();
    for (const [id, existing] of this.pairs.entries()) {
      if (existing.prompt.toLowerCase() === dedupKey) {
        existing.chosen = chosen;
        existing.rejected = rejected;
        existing.timestamp = Date.now();
        existing.metadata = {
          deficitId: deficit.id,
          targetEntity: deficit.context.targetEntity,
          intent: deficit.context.intent,
          verifiedCommand: verifiedCmd,
          category: deficit.category,
          source: deficit.resolutionCounterfactual.source || 'reflexion'
        };
        this.savePairs();
        return existing;
      }
    }

    const id = `dpo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const pair: DpoPair = {
      id,
      timestamp: Date.now(),
      prompt,
      chosen,
      rejected,
      metadata: {
        deficitId: deficit.id,
        targetEntity: deficit.context.targetEntity,
        intent: deficit.context.intent,
        verifiedCommand: verifiedCmd,
        category: deficit.category,
        source: deficit.resolutionCounterfactual.source || 'reflexion'
      }
    };

    this.pairs.set(id, pair);
    this.savePairs();
    return pair;
  }

  /**
   * Constructs a DPO pair from an explicit human demonstration or correction.
   */
  public createPairFromCorrection(params: {
    prompt: string;
    chosenCommand: string;
    rejectedCommandOrResponse: string;
    explanation?: string;
    category?: string;
  }): DpoPair {
    const cleanPrompt = params.prompt.trim();
    const chosen = JSON.stringify({
      action: 'execute',
      command: params.chosenCommand.trim(),
      explanation: params.explanation || `Execute ${params.chosenCommand.trim()}`
    });

    const rejected = params.rejectedCommandOrResponse.startsWith('{')
      ? params.rejectedCommandOrResponse.trim()
      : params.rejectedCommandOrResponse.includes(' ') && !params.rejectedCommandOrResponse.includes('\n')
        ? JSON.stringify({ action: 'execute', command: params.rejectedCommandOrResponse.trim(), explanation: 'Rejected attempt' })
        : params.rejectedCommandOrResponse.trim();

    const dedupKey = cleanPrompt.toLowerCase();
    for (const [id, existing] of this.pairs.entries()) {
      if (existing.prompt.toLowerCase() === dedupKey) {
        existing.chosen = chosen;
        existing.rejected = rejected;
        existing.timestamp = Date.now();
        existing.metadata = {
          verifiedCommand: params.chosenCommand.trim(),
          category: params.category || 'human_correction',
          source: 'human_demonstration'
        };
        this.savePairs();
        return existing;
      }
    }

    const id = `dpo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const pair: DpoPair = {
      id,
      timestamp: Date.now(),
      prompt: cleanPrompt,
      chosen,
      rejected,
      metadata: {
        verifiedCommand: params.chosenCommand.trim(),
        category: params.category || 'human_correction',
        source: 'human_demonstration'
      }
    };

    this.pairs.set(id, pair);
    this.savePairs();
    return pair;
  }

  /**
   * Adds an arbitrary or self-play generated DPO pair to the dataset.
   */
  public async addPair(pair: Partial<DpoPair> & { prompt: string; chosen: string; rejected: string }): Promise<DpoPair> {
    const id = pair.id || `dpo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newPair: DpoPair = {
      id,
      timestamp: pair.timestamp || Date.now(),
      prompt: pair.prompt.trim(),
      chosen: pair.chosen.trim(),
      rejected: pair.rejected.trim(),
      metadata: pair.metadata,
    };

    this.pairs.set(id, newPair);
    await this.savePairs();
    return newPair;
  }

  /**
   * Scans KnowledgeDeficitLogger for all resolved deficits and auto-constructs DPO pairs.
   * Returns count of newly created / updated pairs.
   */
  public syncWithDeficitLogger(logger?: KnowledgeDeficitLogger): number {
    const targetLogger = logger || this.deficitLogger || KnowledgeDeficitLogger.getInstance();
    const deficits = targetLogger.getAllDeficits();
    let count = 0;

    for (const deficit of deficits) {
      if (deficit.status === 'resolved' && deficit.resolutionCounterfactual) {
        const pair = this.createPairFromDeficit(deficit);
        if (pair) count++;
      }
    }

    return count;
  }

  /**
   * Exports all DPO pairs into conversational format with role tags for Apple Silicon MLX DPO.
   */
  public exportConversational(systemPrompt?: string): ConversationalDpoSample[] {
    const sys = systemPrompt || 'You are Sentinel, an autonomous shell copilot. Output JSON only: {"action": "execute", "command": "<cmd>", "explanation": "<reason>"}';

    return Array.from(this.pairs.values()).map(pair => ({
      system: sys,
      prompt: pair.prompt,
      chosen: {
        role: 'assistant',
        content: pair.chosen
      },
      rejected: {
        role: 'assistant',
        content: pair.rejected
      }
    }));
  }

  /**
   * Computes dataset distribution statistics.
   */
  public getStats(): DpoDatasetStats {
    const categoryCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    let latest = 0;

    for (const pair of this.pairs.values()) {
      const cat = pair.metadata?.category || 'uncategorized';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      const src = pair.metadata?.source || 'unknown';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;

      if (pair.timestamp > latest) latest = pair.timestamp;
    }

    return {
      totalPairs: this.pairs.size,
      categoryCounts,
      sourceCounts,
      lastUpdated: latest
    };
  }

  public getAllPairs(): DpoPair[] {
    return Array.from(this.pairs.values());
  }

  public getPairById(id: string): DpoPair | undefined {
    return this.pairs.get(id);
  }

  public clear(): void {
    this.pairs.clear();
    this.savePairs();
  }

  private loadPairs(): void {
    if (this.isLoaded) return;

    try {
      if (fs.existsSync(this.storageFilePath)) {
        const content = fs.readFileSync(this.storageFilePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        for (const line of lines) {
          try {
            const pair: DpoPair = JSON.parse(line);
            if (pair && pair.id) {
              this.pairs.set(pair.id, pair);
            }
          } catch {
            // Ignore malformed line
          }
        }
      }
    } catch {
      // In isolated environments
    }

    this.isLoaded = true;
  }

  private savePairs(): void {
    const records = Array.from(this.pairs.values());

    // 1. Direct Node filesystem write if available
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
      writeSentinelFile('training/sentinel_dpo_pairs.jsonl', lines + '\n');
    } catch {
      // Ignore
    }
  }
}
