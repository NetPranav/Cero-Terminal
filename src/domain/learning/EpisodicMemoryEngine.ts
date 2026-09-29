/**
 * Sentinel Terminal — Tier 3: Episodic Memory Engine
 *
 * Implements Continuous On-Device Learning via:
 * 1. 0ms Dynamic In-Context Retrieval: Stores verified terminal executions & human demonstrations,
 *    indexes them, and injects the top matching workflows directly into the LLM system prompt.
 * 2. Continuous LoRA Fine-Tuning Pipeline: Automatically formats and appends verified
 *    interactions to ~/.sentinel/training/sentinel_shell_dataset.jsonl in ShareGPT format.
 */

import { readSentinelFile, writeSentinelFile, appendSentinelFile } from '../../infrastructure/storage/SentinelFiles';
import { invoke } from '@tauri-apps/api/core';
import { safeBase64Encode } from '../../utils/encodingUtils';
import { SecretRedactor } from '../security/SecretRedactor';
import { ProjectFingerprint } from './ProjectFingerprint';

export interface EpisodicMemory {
  id: string;
  goal: string;
  command: string;
  explanation?: string;
  cwd?: string;
  os?: string;
  timestamp: number;
  source: 'demonstration' | 'verified_execution' | 'explicit_teach';
  confidence: number;
  timesRetrieved: number;
  projectFingerprint?: string; // Phase 0.5, Item 4
  successCount?: number;       // Phase 0.5, Item 12
  failCount?: number;          // Phase 0.5, Item 12
  rollingSuccessRate?: number; // Phase 0.5, Item 12 (0.0 to 1.0)
  retired?: boolean;           // Phase 0.5, Item 12 (<0.2 success rate)
}

export class EpisodicMemoryEngine {
  private static instance: EpisodicMemoryEngine;
  private memories: Map<string, EpisodicMemory> = new Map();
  private isLoaded: boolean = false;

  public static getInstance(): EpisodicMemoryEngine {
    if (!EpisodicMemoryEngine.instance) {
      EpisodicMemoryEngine.instance = new EpisodicMemoryEngine();
    }
    return EpisodicMemoryEngine.instance;
  }

  constructor() {
    this.loadMemories();
  }

  /**
   * Records a user demonstration or successful command execution into episodic memory.
   */
  public recordMemory(
    goal: string,
    command: string,
    options?: {
      explanation?: string;
      cwd?: string;
      os?: string;
      source?: 'demonstration' | 'verified_execution' | 'explicit_teach';
      projectFingerprint?: string;
    }
  ): EpisodicMemory {
    const cleanGoal = SecretRedactor.redact(goal.trim());
    const cleanCmd = SecretRedactor.redact(command.trim());
    const cleanExplanation = options?.explanation ? SecretRedactor.redact(options.explanation) : undefined;
    const projectFp = options?.projectFingerprint || ProjectFingerprint.compute(options?.cwd).fingerprint;

    // Check if an existing memory for this goal already exists in this project
    for (const mem of this.memories.values()) {
      if (
        mem.goal.toLowerCase() === cleanGoal.toLowerCase() &&
        (mem.projectFingerprint === projectFp || mem.projectFingerprint === 'global' || projectFp === 'global')
      ) {
        mem.command = cleanCmd;
        mem.explanation = cleanExplanation || mem.explanation;
        mem.timestamp = Date.now();
        mem.successCount = (mem.successCount || 0) + 1;
        const total = (mem.successCount || 0) + (mem.failCount || 0);
        mem.rollingSuccessRate = total > 0 ? (mem.successCount || 0) / total : 1.0;
        mem.retired = false;
        mem.confidence = Math.min(1.0, mem.rollingSuccessRate);
        this.saveMemories();
        this.appendTrainingSampleFromMemory(mem);
        return mem;
      }
    }

    const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newMemory: EpisodicMemory = {
      id,
      goal: cleanGoal,
      command: cleanCmd,
      explanation: cleanExplanation || `Execute command: ${cleanCmd}`,
      cwd: options?.cwd,
      os: options?.os || (typeof process !== 'undefined' ? process.platform : 'darwin'),
      timestamp: Date.now(),
      source: options?.source || 'demonstration',
      confidence: 1.0,
      timesRetrieved: 0,
      projectFingerprint: projectFp,
      successCount: 1,
      failCount: 0,
      rollingSuccessRate: 1.0,
      retired: false
    };

    this.memories.set(id, newMemory);
    this.saveMemories();
    this.appendTrainingSampleFromMemory(newMemory);
    return newMemory;
  }

  /**
   * Records execution outcome (success/failure) for decay and rolling confidence tracking.
   */
  public recordOutcome(memoryIdOrGoal: string, success: boolean): boolean {
    let target: EpisodicMemory | undefined;
    if (this.memories.has(memoryIdOrGoal)) {
      target = this.memories.get(memoryIdOrGoal);
    } else {
      const lower = memoryIdOrGoal.toLowerCase().trim();
      for (const m of this.memories.values()) {
        if (m.goal.toLowerCase() === lower || m.id === memoryIdOrGoal) {
          target = m;
          break;
        }
      }
    }

    if (!target) return false;

    if (success) {
      target.successCount = (target.successCount || 0) + 1;
    } else {
      target.failCount = (target.failCount || 0) + 1;
    }

    const total = (target.successCount || 0) + (target.failCount || 0);
    target.rollingSuccessRate = total > 0 ? (target.successCount || 0) / total : 1.0;

    // Retire flaky or stale patterns whose success rate drops below 0.2 (Phase 0.5, Item 12)
    if (target.rollingSuccessRate < 0.2 && total >= 3) {
      target.retired = true;
      target.confidence = 0.05;
    } else {
      target.confidence = Math.max(0.1, target.rollingSuccessRate);
    }

    this.saveMemories();
    return true;
  }

  /**
   * Retrieves top-K most semantically similar episodic memories for a given user goal.
   */
  public retrieveSimilar(
    query: string, 
    topK: number = 3, 
    minScore: number = 0.1,
    cwd?: string
  ): EpisodicMemory[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.size === 0) return [];

    const activeProjectFp = ProjectFingerprint.compute(cwd).fingerprint;

    const scored: { memory: EpisodicMemory; score: number }[] = [];

    for (const memory of this.memories.values()) {
      // Skip retired patterns (success rate < 0.2)
      if (memory.retired) {
        continue;
      }

      const memTokens = this.tokenize(memory.goal);
      let score = this.calculateSimilarity(queryTokens, memTokens, query, memory.goal);

      // Phase 0.5, Item 4: Project relevance adjustment
      if (memory.projectFingerprint) {
        if (memory.projectFingerprint === activeProjectFp) {
          score += 0.25; // boost same-project matches
        } else if (memory.projectFingerprint !== 'global' && activeProjectFp !== 'global') {
          score *= 0.55; // penalize patterns from foreign/unrelated projects
        }
      }

      // Phase 0.5, Item 12: Down-weight patterns with rollingSuccessRate < 0.5
      if (typeof memory.rollingSuccessRate === 'number' && memory.rollingSuccessRate < 0.5) {
        score *= memory.rollingSuccessRate;
      }

      if (score >= minScore) {
        scored.push({ memory, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, topK).map(s => {
      s.memory.timesRetrieved++;
      return s.memory;
    });

    if (results.length > 0) {
      this.saveMemories();
    }

    return results;
  }

  /**
   * Formats retrieved episodic memories into few-shot guidance for SystemPrompt.ts.
   */
  public formatPromptFewShots(memories: EpisodicMemory[]): string {
    if (!memories || memories.length === 0) return '';

    const lines: string[] = [
      '# User Demonstrated Workflows & Learned Patterns:',
      'Condition your command generation on these verified patterns previously demonstrated on this system:'
    ];

    for (const mem of memories) {
      lines.push(
        `User: "${mem.goal}"`,
        `Response: {"action": "execute", "command": "${mem.command.replace(/"/g, '\\"')}", "explanation": "${(mem.explanation || '').replace(/"/g, '\\"')}"}`,
        ''
      );
    }

    return lines.join('\n');
  }

  /**
   * Appends an interaction sample directly into the LoRA training dataset file.
   */
  public async appendTrainingSample(messages: { role: string; content: string }[]): Promise<void> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      const sanitizedMessages = messages.map(m => ({
        role: m.role,
        content: SecretRedactor.redact(m.content)
      }));
      const sample = JSON.stringify({ messages: sanitizedMessages });
      appendSentinelFile('training/sentinel_shell_dataset.jsonl', sample + '\n');
    } catch {
      // Ignore file persistence errors in headless environments
    }
  }

  private appendTrainingSampleFromMemory(memory: EpisodicMemory): void {
    // "darwin" contains "win": match whole platform names
    const os = (memory.os || '').toLowerCase();
    const osName = /^(?:win32|windows)$/.test(os) ? 'Windows' : /^(?:darwin|mac|macos)$/.test(os) ? 'macOS' : 'Linux';
    const messages = [
      {
        role: 'system',
        content: `You are Sentinel's autonomous shell execution copilot on ${osName}. Output JSON only: {"action": "execute", "command": "<cmd>", "explanation": "<reason>"}`
      },
      {
        role: 'user',
        content: memory.goal
      },
      {
        role: 'assistant',
        content: JSON.stringify({
          action: 'execute',
          command: memory.command,
          explanation: memory.explanation || `Execute ${memory.command}`
        })
      }
    ];

    this.appendTrainingSample(messages);
  }

  public getAllMemories(): EpisodicMemory[] {
    return Array.from(this.memories.values());
  }

  public removeMemory(id: string): boolean {
    const removed = this.memories.delete(id);
    if (removed) this.saveMemories();
    return removed;
  }

  public clear(): void {
    this.memories.clear();
    this.saveMemories();
  }

  private tokenize(text: string): Set<string> {
    const stopWords = new Set([
      'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'can', 'you', 'please', 'me', 'my', 'i', 'want', 'need', 'would', 'could', 'all', 'some'
    ]);

    const synonyms: Record<string, string> = {
      'folder': 'dir',
      'folders': 'dir',
      'directory': 'dir',
      'directories': 'dir',
      'dirs': 'dir',
      'locate': 'find',
      'search': 'find',
      'show': 'find',
      'list': 'find',
      'display': 'find',
      'get': 'find',
      'kill': 'terminate',
      'stop': 'terminate',
      'quit': 'terminate'
    };

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 1 && !stopWords.has(w))
      .map(w => synonyms[w] || w);

    return new Set(words);
  }

  private calculateSimilarity(
    queryTokens: Set<string>,
    memTokens: Set<string>,
    rawQuery: string,
    rawMem: string
  ): number {
    let intersection = 0;
    for (const token of queryTokens) {
      if (memTokens.has(token)) {
        intersection++;
      }
    }
    const union = new Set([...queryTokens, ...memTokens]).size;
    const jaccard = union > 0 ? intersection / union : 0;

    // Boost if raw query contains the memory goal or vice versa
    const lowerQ = rawQuery.toLowerCase();
    const lowerM = rawMem.toLowerCase();
    const substringBoost = (lowerQ.includes(lowerM) || lowerM.includes(lowerQ)) ? 0.35 : 0;

    return Math.min(1.0, jaccard + substringBoost);
  }

  public async loadMemories(): Promise<void> {
    if (this.isLoaded) return;
    this.isLoaded = true;

    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      const output = { stdout: readSentinelFile('memory/episodic_memory.json') ?? '' };

      if (output.stdout && output.stdout.trim()) {
        const parsed: EpisodicMemory[] = JSON.parse(output.stdout.trim());
        if (Array.isArray(parsed)) {
          for (const m of parsed) {
            this.memories.set(m.id, m);
          }
        }
      }
    } catch {
      // In-memory fallback
    }
  }

  public async saveMemories(): Promise<void> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      const all = Array.from(this.memories.values());
      const jsonStr = JSON.stringify(all, null, 2);
      writeSentinelFile('memory/episodic_memory.json', jsonStr);
    } catch {
      // Ignore
    }
  }
}
