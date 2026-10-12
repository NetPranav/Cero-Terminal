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

/** Text safe inside a PowerShell single-quoted string */
function psLiteral(text: string): string {
  return text.replace(/'/g, "''");
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
   * TODO(4.6): the templates below are PowerShell, but the Shadow-PTY sandbox that checks them
   * still runs POSIX sh; it needs a PowerShell sandbox before this helps on Windows.
   *
   * Synthesizes counterfactual candidate command pipelines tailored to the deficit's
   * target entity and intent.
   */
  public async synthesizeCounterfactualCandidates(deficit: KnowledgeDeficitRecord): Promise<ReflexionCandidate[]> {
    const candidates: ReflexionCandidate[] = [];
    const entity = (deficit.context.targetEntity || '').trim();
    const intent = deficit.context.intent || 'general_execution';

    // 0A. Instant Deterministic Rule Oracle Check (thefuck architecture)
    if (deficit.attemptedCommand && deficit.stderr) {
      const rem = DeterministicRuleOracle.getInstance().diagnose({
        command: deficit.attemptedCommand,
        output: deficit.stderr,
        cwd: deficit.context.cwd,
        os: 'windows'
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
      const e = psLiteral(entity);
      candidates.push({
        command: `Get-NetTCPConnection -State Listen | Where-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -like '*${e}*' } | Select-Object LocalAddress,LocalPort,OwningProcess`,
        explanation: `List listening TCP ports owned by ${entity}`,
        strategy: 'tcp_listen_by_process'
      });
      candidates.push({
        command: `Get-Process -Name '*${e}*' -ErrorAction SilentlyContinue | ForEach-Object { Get-NetTCPConnection -OwningProcess $_.Id -ErrorAction SilentlyContinue }`,
        explanation: `Find the ${entity} processes and list their TCP connections`,
        strategy: 'process_tcp_lookup'
      });
    }

    // 2. Specific Port Inspection (e.g. port 3000)
    else if (intent === 'port_inspection' && (entity.startsWith('port ') || /\d+/.test(entity))) {
      const portMatch = entity.match(/(\d+)/) || deficit.goal.match(/(\d+)/);
      const port = portMatch ? portMatch[1] : '3000';

      candidates.push({
        command: `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,State,OwningProcess`,
        explanation: `Inspect TCP connections on port ${port}`,
        strategy: 'tcp_port_exact'
      });
      candidates.push({
        command: `netstat -ano | Select-String -Pattern ':${port}\s'`,
        explanation: `Search the socket table for port ${port}`,
        strategy: 'netstat_port_grep'
      });
    }

    // 3. Port Termination (e.g. kill port 3000)
    else if (intent === 'port_termination') {
      const portMatch = entity.match(/(\d+)/) || deficit.goal.match(/(\d+)/);
      const port = portMatch ? portMatch[1] : '3000';
      candidates.push({
        command: `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`,
        explanation: `Stop the process listening on port ${port}`,
        strategy: 'tcp_port_stop_process'
      });
    }

    // 4. Process Inspection
    else if (intent === 'process_inspection') {
      const procName = psLiteral(entity || 'node');
      candidates.push({
        command: `Get-Process -Name '*${procName}*' -ErrorAction SilentlyContinue`,
        explanation: `Inspect running processes matching ${entity || 'node'}`,
        strategy: 'get_process_name'
      });
      candidates.push({
        command: `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${procName}*' } | Select-Object ProcessId,ParentProcessId,CommandLine`,
        explanation: `List process ids, parents and command lines for ${entity || 'node'}`,
        strategy: 'cim_process_commandline'
      });
    }

    // 5. Process Termination
    else if (intent === 'process_termination') {
      const procName = psLiteral(entity || 'node');
      candidates.push({
        command: `Stop-Process -Name '${procName}' -ErrorAction SilentlyContinue`,
        explanation: `Stop all processes named ${entity || 'node'}`,
        strategy: 'stop_process_name'
      });
      candidates.push({
        command: `Get-Process -Name '*${procName}*' -ErrorAction SilentlyContinue | Stop-Process -Force`,
        explanation: `Force stop processes matching ${entity || 'node'}`,
        strategy: 'stop_process_force'
      });
    }

    // 6. File Search
    else if (intent === 'file_search') {
      const query = psLiteral(entity || 'config');
      candidates.push({
        command: `Get-ChildItem -Recurse -Force -Filter '*${query}*' -ErrorAction SilentlyContinue | Select-Object -First 30 -ExpandProperty FullName`,
        explanation: `Find files matching ${entity || 'config'}`,
        strategy: 'get_childitem_search'
      });
    }

    // 7. If LLM provider is available, query model for reflection candidates
    if (this.modelProvider && candidates.length < 3) {
      try {
        const prompt = `You are Cero's autonomous Reflexion Agent on ${deficit.context.os}.
A user command failed with:
Goal: "${deficit.goal}"
Model Output / Excuse: "${deficit.modelOutput || 'None'}"
Stderr: "${deficit.stderr || 'None'}"

Synthesize a single, working, one-line PowerShell command to accomplish the goal.
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
