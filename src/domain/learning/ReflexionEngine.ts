/**
 * ReflexionEngine.ts — Autonomous Background Reflexion & Counterfactual Synthesis Engine
 * 
 * Part of Cero-SERL (Self-Evolving Reflexion Loop):
 * When the terminal is idle, this autonomous background agent examines logged
 * knowledge deficits, identifies the target entity and intent, generates counterfactual
 * candidate command pipelines, evaluates them in the Shadow-PTY sandbox,
 * and records verified solutions into KnowledgeDeficitLogger.
 * 
 * Feeds directly into:
 * - Phase 4.4: Direct Preference Optimization (DPO) Pair Generator
 */

import { KnowledgeDeficitLogger, KnowledgeDeficitRecord, DeficitCounterfactual } from './KnowledgeDeficitLogger';
import { ShadowPtySimulator, CandidateHypothesis } from '../../ai/agent/ShadowPtySimulator';
import { DeterministicRuleOracle } from '../remediation/DeterministicRuleOracle';
import { TldrKnowledgeEngine } from '../knowledge/TldrKnowledgeEngine';
import { ShellAstParser } from '../security/ShellAstParser';

export interface ReflexionCandidate {
  command: string;
  explanation: string;
  strategy: string;
}

export interface ReflexionTrialResult {
  command: string;
  explanation: string;
  strategy: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  score: number;
  isVerified: boolean;
}

export interface ReflexionResult {
  deficitId: string;
  success: boolean;
  originalGoal: string;
  verifiedCommand?: string;
  explanation?: string;
  candidateAttempts: ReflexionTrialResult[];
  durationMs: number;
}

export interface ModelProvider {
  generate(prompt: string, modelId?: string, options?: any): Promise<{ content: string }>;
}

export interface ReflexionEngineOptions {
  deficitLogger?: KnowledgeDeficitLogger;
  shadowSimulator?: ShadowPtySimulator;
  modelProvider?: ModelProvider;
  modelId?: string;
  branchTimeoutMs?: number;
  executor?: (cmd: string, args: string[], cwd?: string) => Promise<{ stdout: string; stderr: string; code: number }>;
}

export class ReflexionEngine {
  private static instance: ReflexionEngine;
  private deficitLogger: KnowledgeDeficitLogger;
  private shadowSimulator: ShadowPtySimulator;
  private modelProvider?: ModelProvider;
  private modelId?: string;
  private branchTimeoutMs: number;
  private idleTimer: any = null;
  private isProcessing: boolean = false;

  public static getInstance(options?: ReflexionEngineOptions): ReflexionEngine {
    if (!ReflexionEngine.instance || options) {
      ReflexionEngine.instance = new ReflexionEngine(options);
    }
    return ReflexionEngine.instance;
  }

  constructor(options: ReflexionEngineOptions = {}) {
    this.deficitLogger = options.deficitLogger || KnowledgeDeficitLogger.getInstance();
    this.shadowSimulator = options.shadowSimulator || new ShadowPtySimulator({
      executor: options.executor,
      branchTimeoutMs: options.branchTimeoutMs ?? 2000
    });
    this.modelProvider = options.modelProvider;
    this.modelId = options.modelId;
    this.branchTimeoutMs = options.branchTimeoutMs ?? 2000;
  }

  /**
   * Main entry point: Performs background reflexion on a single knowledge deficit.
   * Generates counterfactual candidate hypotheses, evaluates them in the shadow sandbox,
   * selects the verified solution, and updates the deficit status to resolved.
   */
  public async reflectOnDeficit(deficit: KnowledgeDeficitRecord): Promise<ReflexionResult> {
    const startTime = performance.now();
    this.deficitLogger.updateStatus(deficit.id, 'analyzing');

    // 1. Synthesize candidate counterfactual pipelines
    const candidates = await this.synthesizeCounterfactualCandidates(deficit);

    // 2. Evaluate each candidate in the shadow sandbox
    const trialResults: ReflexionTrialResult[] = [];

    for (const candidate of candidates) {
      // Pre-validate syntax with ShellAstParser
      const syntax = ShellAstParser.validateSyntax(candidate.command);
      if (!syntax.valid) {
        trialResults.push({
          command: candidate.command,
          explanation: candidate.explanation,
          strategy: candidate.strategy,
          exitCode: 2,
          stdout: '',
          stderr: `Syntax error: ${syntax.error}`,
          score: -5.0,
          isVerified: false
        });
        continue;
      }

      const hyp: CandidateHypothesis = {
        id: `trial_${candidate.strategy}`,
        command: candidate.command,
        explanation: candidate.explanation,
        source: 'speculative_sample',
        estimatedRisk: this.shadowSimulator.classifyRisk(candidate.command)
      };

      const outcome = await this.shadowSimulator.evaluateCandidate(hyp, {
        os: deficit.context.os,
        cwd: deficit.context.cwd
      });

      const isVerified = outcome.exitCode === 0 && outcome.empiricalScore >= 0;

      trialResults.push({
        command: candidate.command,
        explanation: candidate.explanation,
        strategy: candidate.strategy,
        exitCode: outcome.exitCode,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        score: outcome.empiricalScore,
        isVerified
      });
    }

    // 3. Find the best verified candidate
    const verifiedTrials = trialResults.filter(t => t.isVerified);
    verifiedTrials.sort((a, b) => b.score - a.score);

    const winner = verifiedTrials.length > 0 ? verifiedTrials[0] : null;
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

    if (winner) {
      const counterfactual: DeficitCounterfactual = {
        verifiedCommand: winner.command,
        explanation: winner.explanation,
        resolvedAt: Date.now(),
        source: 'reflexion'
      };

      this.deficitLogger.markResolved(deficit.id, counterfactual);

      return {
        deficitId: deficit.id,
        success: true,
        originalGoal: deficit.goal,
        verifiedCommand: winner.command,
        explanation: winner.explanation,
        candidateAttempts: trialResults,
        durationMs
      };
    } else {
      // If no candidate succeeded, mark status back to logged (or unresolvable if attempts exhausted)
      this.deficitLogger.updateStatus(deficit.id, 'logged');

      return {
        deficitId: deficit.id,
        success: false,
        originalGoal: deficit.goal,
        candidateAttempts: trialResults,
        durationMs
      };
    }
  }

  /**
   * Synthesizes counterfactual candidate command pipelines tailored to the deficit's
   * target entity and intent.
   */
  public async synthesizeCounterfactualCandidates(deficit: KnowledgeDeficitRecord): Promise<ReflexionCandidate[]> {
    const candidates: ReflexionCandidate[] = [];
    const entity = (deficit.context.targetEntity || '').trim();
    const intent = deficit.context.intent || 'general_execution';
    const isMac = !deficit.context.os || deficit.context.os.toLowerCase().includes('mac') || deficit.context.os.toLowerCase().includes('darwin');

    // 0A. Instant Deterministic Rule Oracle Check (thefuck architecture)
    if (deficit.attemptedCommand && deficit.stderr) {
      const rem = DeterministicRuleOracle.getInstance().diagnose({
        command: deficit.attemptedCommand,
        output: deficit.stderr,
        cwd: deficit.context.cwd,
        os: isMac ? 'mac' : 'linux'
      });
      if (rem && rem.fixedCommand) {
        candidates.push({
          command: rem.fixedCommand,
          explanation: `Deterministic fix (${rem.ruleName}): ${rem.explanation}`,
          strategy: 'deterministic_rule_oracle'
        });
      }
    }

    // 0B. Canonical CLI Recipes from TLDR Knowledge Base
    const tldrEngine = TldrKnowledgeEngine.getInstance();
    const tldrMatch = tldrEngine.matchGoal(deficit.goal, deficit.context.os);
    if (tldrMatch && (tldrMatch.interpolatedCommand || tldrMatch.example?.command)) {
      const cmd = tldrMatch.interpolatedCommand || tldrMatch.example.command;
      const desc = tldrMatch.example?.description || tldrMatch.page?.description || 'Canonical recipe';
      candidates.push({
        command: cmd,
        explanation: `Canonical recipe: ${desc}`,
        strategy: 'tldr_canonical_recipe'
      });
    } else if (entity && tldrEngine.hasCommand(entity)) {
      const examples = tldrEngine.getExamplesForCommand(entity, deficit.context.os);
      for (let i = 0; i < Math.min(examples.length, 2); i++) {
        if (examples[i]?.command) {
          candidates.push({
            command: examples[i].command,
            explanation: `Canonical recipe for ${entity}: ${examples[i].description}`,
            strategy: `tldr_recipe_${i}`
          });
        }
      }
    }

    // 1. App Port Inspection (The Antigravity Ports benchmark)
    if (intent === 'port_inspection' && entity && !entity.startsWith('port ')) {
      if (isMac) {
        // Strategy A: Directly grep open listening sockets via lsof
        candidates.push({
          command: `lsof -iTCP -sTCP:LISTEN -n -P | grep -i "${entity}"`,
          explanation: `List active listening TCP sockets matching ${entity}`,
          strategy: 'lsof_listen_grep'
        });

        // Strategy B: Cross-reference PID with lsof
        candidates.push({
          command: `pgrep -if "${entity}" | xargs -I {} lsof -Pan -p {} -i 2>/dev/null || lsof -i | grep -i "${entity}"`,
          explanation: `Discover PID for ${entity} and inspect associated network sockets`,
          strategy: 'pid_socket_lookup'
        });

        // Strategy C: General lsof port filter
        candidates.push({
          command: `lsof -i | grep -i "${entity}"`,
          explanation: `Inspect all open network sockets for ${entity}`,
          strategy: 'lsof_general_grep'
        });
      } else {
        // Linux / POSIX fallback
        candidates.push({
          command: `ss -tulpn | grep -i "${entity}"`,
          explanation: `Inspect listening ports for ${entity} via ss`,
          strategy: 'ss_listen_grep'
        });
        candidates.push({
          command: `netstat -tulpn 2>/dev/null | grep -i "${entity}"`,
          explanation: `Inspect open sockets for ${entity} via netstat`,
          strategy: 'netstat_grep'
        });
      }
    }

    // 2. Specific Port Inspection (e.g. port 3000)
    else if (intent === 'port_inspection' && (entity.startsWith('port ') || /\d+/.test(entity))) {
      const portMatch = entity.match(/(\d+)/) || deficit.goal.match(/(\d+)/);
      const port = portMatch ? portMatch[1] : '3000';

      if (isMac) {
        candidates.push({
          command: `lsof -i :${port}`,
          explanation: `Inspect socket activity on port ${port} using lsof`,
          strategy: 'lsof_port_exact'
        });
        candidates.push({
          command: `lsof -iTCP:${port} -sTCP:LISTEN -P -n`,
          explanation: `Inspect listening TCP socket on port ${port}`,
          strategy: 'lsof_listen_exact'
        });
        candidates.push({
          command: `netstat -anv | grep ${port}`,
          explanation: `Grep socket table for port ${port}`,
          strategy: 'netstat_port_grep'
        });
      } else {
        candidates.push({
          command: `ss -tulpn | grep ":${port}"`,
          explanation: `Inspect socket on port ${port} via ss`,
          strategy: 'ss_port_exact'
        });
      }
    }

    // 3. Port Termination (e.g. kill port 3000)
    else if (intent === 'port_termination') {
      const portMatch = entity.match(/(\d+)/) || deficit.goal.match(/(\d+)/);
      const port = portMatch ? portMatch[1] : '3000';

      if (isMac) {
        candidates.push({
          command: `lsof -ti:${port} | xargs kill -9`,
          explanation: `Find PID for port ${port} and terminate with kill -9`,
          strategy: 'lsof_xargs_kill'
        });
        candidates.push({
          command: `fuser -k ${port}/tcp 2>/dev/null || lsof -ti:${port} | xargs kill -9`,
          explanation: `Terminate process blocking port ${port}`,
          strategy: 'port_kill_fallback'
        });
      }
    }

    // 4. Process Inspection
    else if (intent === 'process_inspection') {
      const procName = entity || 'node';
      candidates.push({
        command: `pgrep -fil "${procName}"`,
        explanation: `Inspect running process matching ${procName}`,
        strategy: 'pgrep_fil'
      });
      candidates.push({
        command: `ps -eo pid,ppid,command | grep -v grep | grep -i "${procName}"`,
        explanation: `List detailed process hierarchy for ${procName}`,
        strategy: 'ps_hierarchy_grep'
      });
    }

    // 5. Process Termination
    else if (intent === 'process_termination') {
      const procName = entity || 'node';
      candidates.push({
        command: `pkill -i -f "${procName}"`,
        explanation: `Terminate all processes matching ${procName}`,
        strategy: 'pkill_case_insensitive'
      });
      candidates.push({
        command: `killall -9 "${procName}" 2>/dev/null || pkill -9 -f "${procName}"`,
        explanation: `Force terminate ${procName}`,
        strategy: 'killall_or_pkill'
      });
    }

    // 6. File Search
    else if (intent === 'file_search') {
      const query = entity || 'config';
      if (isMac) {
        candidates.push({
          command: `mdfind -name "${query}" | head -30`,
          explanation: `Fast macOS Spotlight search for ${query}`,
          strategy: 'mdfind_spotlight'
        });
        candidates.push({
          command: `find . -iname "*${query}*" 2>/dev/null | head -30`,
          explanation: `Find files in current workspace matching ${query}`,
          strategy: 'find_workspace'
        });
      } else {
        candidates.push({
          command: `find . -iname "*${query}*" 2>/dev/null | head -30`,
          explanation: `Find files matching ${query}`,
          strategy: 'find_posix'
        });
      }
    }

    // 7. Hardware & Network Management
    else if (intent === 'hardware_management') {
      if (entity.includes('wifi') || entity.includes('network')) {
        candidates.push({
          command: 'networksetup -getairportnetwork en0',
          explanation: 'Check current Wi-Fi SSID connection',
          strategy: 'networksetup_ssid'
        });
      } else if (entity.includes('bluetooth')) {
        candidates.push({
          command: 'system_profiler SPBluetoothDataType | grep -E "Connected:|State:|Address:"',
          explanation: 'Check macOS Bluetooth adapter status',
          strategy: 'system_profiler_bt'
        });
      }
    }

    // 8. If LLM provider is available, query model for reflection candidates
    if (this.modelProvider && candidates.length < 3) {
      try {
        const prompt = `You are Cero's autonomous Reflexion Agent on ${deficit.context.os}.
A user command failed with:
Goal: "${deficit.goal}"
Model Output / Excuse: "${deficit.modelOutput || 'None'}"
Stderr: "${deficit.stderr || 'None'}"

Synthesize a single, working, one-line shell command pipeline to accomplish the goal.
Respond in JSON: {"command": "<command>", "explanation": "<explanation>"}`;

        const res = await this.modelProvider.generate(prompt, this.modelId, { format: 'json' });
        const parsed = JSON.parse(res.content.replace(/```(?:json)?/g, '').trim());
        if (parsed.command) {
          candidates.push({
            command: parsed.command,
            explanation: parsed.explanation || `LLM synthesized pipeline: ${parsed.command}`,
            strategy: 'llm_counterfactual_synthesis'
          });
        }
      } catch {
        // Fallback to deterministic heuristics
      }
    }

    return candidates;
  }

  /**
   * Processes all currently pending knowledge deficits in the queue.
   */
  public async processPendingQueue(maxCount: number = 10): Promise<ReflexionResult[]> {
    if (this.isProcessing) return [];
    this.isProcessing = true;

    const results: ReflexionResult[] = [];

    try {
      const pending = this.deficitLogger.getPendingDeficits(maxCount);
      for (const deficit of pending) {
        const res = await this.reflectOnDeficit(deficit);
        results.push(res);
      }
    } finally {
      this.isProcessing = false;
    }

    return results;
  }

  /**
   * Starts a background idle worker that checks and resolves pending deficits periodically.
   */
  public startIdleWorker(intervalMs: number = 30000): void {
    if (this.idleTimer) return;

    this.idleTimer = setInterval(() => {
      this.processPendingQueue(1).catch(() => {
        // Background tick error suppression
      });
    }, intervalMs);
  }

  /**
   * Stops the background idle worker.
   */
  public stopIdleWorker(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  public isWorkerRunning(): boolean {
    return this.idleTimer !== null;
  }
}
