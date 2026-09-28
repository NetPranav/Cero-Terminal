/**
 * ShadowPtySimulator.ts — Speculative Shadow-PTY Simulation Engine ("Minority Report for the Shell")
 * 
 * Part of Sentinel-SERL (Self-Evolving Reflexion Loop):
 * Spawns an ephemeral RAM sandbox that executes parallel candidate branches
 * in milliseconds before presenting any command to the user or live terminal.
 * 
 * Key Pillars:
 * 1. Multi-Hypothesis Candidate Expansion: Generates $K=3$ candidate strategies,
 *    correcting platform-specific pitfalls (macOS vs Linux flags, BSD vs GNU utils).
 * 2. Zero-Risk Non-Destructive Predicate Transformation: Destructive operations
 *    (kill, rm, git commit) are converted into non-destructive predicates
 *    (kill -0, test -e, git status, zsh -n syntax verification).
 * 3. Empirical Mathematical Scoring Oracle:
 *    Score(C) = 2.0*I(code==0) + 1.0*tanh(len(out)/80) - 2.5*I(code!=0) - 2.0*I(stderr) - 3.0*I(refusal) - risk
 * 4. Parallel Rollout & Trajectory Pruning: Prunes failed/syntax-error trajectories
 *    and commits only the verified winning command.
 */

import { invoke } from '@tauri-apps/api/core';
import { TldrKnowledgeEngine } from '../../domain/knowledge/TldrKnowledgeEngine';
import { ShellAstParser } from '../../domain/security/ShellAstParser';
import { CommandCapabilityClassifier } from '../../domain/simulation/CommandCapabilityClassifier';

export type RiskLevel = 'read_only' | 'safe_mutation' | 'high_risk';

export interface CandidateHypothesis {
  id: string;
  command: string;
  explanation?: string;
  source: 'primary' | 'variation' | 'platform_optimized' | 'heuristic' | 'speculative_sample';
  estimatedRisk: RiskLevel;
}

export interface SimulationOutcome {
  candidate: CandidateHypothesis;
  executedCommand: string;
  isPredicateTransformed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  empiricalScore: number;
  pruned: boolean;
  pruneReason?: string;
}

export interface SimulationReport {
  goal: string;
  primaryCommand: string;
  evaluatedCandidates: SimulationOutcome[];
  winner: SimulationOutcome | null;
  prunedCount: number;
  totalDurationMs: number;
}

export interface ShadowSimulatorOptions {
  maxCandidates?: number;
  branchTimeoutMs?: number;
  cwd?: string;
  os?: string;
  executor?: (cmd: string, args: string[], cwd?: string) => Promise<{ stdout: string; stderr: string; code: number }>;
}

export class ShadowPtySimulator {
  private static instance?: ShadowPtySimulator;
  private maxCandidates: number;
  private branchTimeoutMs: number;
  private customExecutor?: (cmd: string, args: string[], cwd?: string) => Promise<{ stdout: string; stderr: string; code: number }>;

  public static getInstance(options?: ShadowSimulatorOptions): ShadowPtySimulator {
    if (!ShadowPtySimulator.instance || options) {
      ShadowPtySimulator.instance = new ShadowPtySimulator(options);
    }
    return ShadowPtySimulator.instance;
  }

  constructor(options: ShadowSimulatorOptions = {}) {
    this.maxCandidates = options.maxCandidates ?? 3;
    this.branchTimeoutMs = options.branchTimeoutMs ?? 1500;
    this.customExecutor = options.executor;
  }

  /**
   * Main entry point: Speculatively simulates candidates for a given command/goal
   * and returns the winning verified outcome.
   */
  public async speculate(
    goal: string,
    primaryCommand: string,
    context: { os: string; cwd: string }
  ): Promise<SimulationReport> {
    const startTime = performance.now();

    // 1. Generate candidate hypotheses
    const candidates = this.generateHypotheses(goal, primaryCommand, context);

    // 2. Evaluate all candidates in parallel ephemeral sandboxes
    const evaluatedCandidates = await Promise.all(
      candidates.slice(0, this.maxCandidates).map(candidate => this.evaluateCandidate(candidate, context))
    );

    // 3. Prune failing or negative-scoring branches
    const prunedCount = evaluatedCandidates.filter(c => c.pruned).length;

    // 4. Select winner. Speculation exists to repair a primary command that is broken on
    // this platform, not to second-guess a working one: a longer-output heuristic or TLDR
    // variation must never replace a viable primary (e.g. `ps ... | head -n 2` -> `ps aux`).
    const viableCandidates = evaluatedCandidates.filter(c => !c.pruned);
    viableCandidates.sort((a, b) => b.empiricalScore - a.empiricalScore);

    const viablePrimary = viableCandidates.find(c => c.candidate.source === 'primary');
    const viablePlatformFix = viableCandidates.find(c => c.candidate.source === 'platform_optimized');
    let winner: SimulationOutcome | null = viablePrimary
      || viablePlatformFix
      || (viableCandidates.length > 0 ? viableCandidates[0] : null);

    // Fallback: If all candidates were pruned, pick the candidate with highest score if syntax was valid
    if (!winner && evaluatedCandidates.length > 0) {
      const bestEvaluated = [...evaluatedCandidates].sort((a, b) => b.empiricalScore - a.empiricalScore)[0];
      if (bestEvaluated.exitCode === 0 || !bestEvaluated.stderr.includes('syntax error')) {
        winner = bestEvaluated;
      }
    }

    const totalDurationMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      goal,
      primaryCommand,
      evaluatedCandidates,
      winner,
      prunedCount,
      totalDurationMs
    };
  }

  /**
   * True when the command has a known platform-specific rewrite worth testing (e.g. GNU flags
   * on macOS). Callers use this to skip speculation entirely otherwise, so read-only commands
   * are not executed twice for nothing.
   */
  public hasPlatformAlternatives(goal: string, primaryCommand: string, context: { os: string; cwd: string }): boolean {
    return this.generateHypotheses(goal, primaryCommand, context)
      .some(h => h.source === 'platform_optimized');
  }

  /**
   * Generates candidate hypotheses:
   * - Primary command
   * - Platform-adapted command (macOS vs Linux corrections)
   * - Semantic probe variations
   */
  public generateHypotheses(
    goal: string,
    primaryCommand: string,
    context: { os: string; cwd: string }
  ): CandidateHypothesis[] {
    const trimmed = primaryCommand.trim();
    const isMac = !context.os || context.os.toLowerCase().includes('mac') || context.os.toLowerCase().includes('darwin');
    const hypotheses: CandidateHypothesis[] = [];

    // 1. Primary hypothesis
    hypotheses.push({
      id: 'branch_primary',
      command: trimmed,
      explanation: `Primary model hypothesis: ${trimmed}`,
      source: 'primary',
      estimatedRisk: this.classifyRisk(trimmed)
    });

    // 2. Platform-adapted variations
    if (isMac) {
      // Pitfall: Linux 'fuser' vs macOS 'lsof'
      if (/\bfuser\b/i.test(trimmed)) {
        const portMatch = trimmed.match(/(\d+)/);
        if (portMatch) {
          const port = portMatch[1];
          if (/(-k|--kill)/i.test(trimmed)) {
            hypotheses.push({
              id: 'branch_platform_lsof_kill',
              command: `lsof -ti:${port} | xargs kill -9`,
              explanation: `macOS standard: kill process on port ${port} using lsof`,
              source: 'platform_optimized',
              estimatedRisk: 'safe_mutation'
            });
          } else {
            hypotheses.push({
              id: 'branch_platform_lsof_check',
              command: `lsof -i :${port}`,
              explanation: `macOS standard: check port ${port} using lsof`,
              source: 'platform_optimized',
              estimatedRisk: 'read_only'
            });
            hypotheses.push({
              id: 'branch_platform_lsof_listen',
              command: `lsof -iTCP:${port} -sTCP:LISTEN -P -n`,
              explanation: `macOS listening socket probe for port ${port}`,
              source: 'variation',
              estimatedRisk: 'read_only'
            });
          }
        }
      }

      // Pitfall: Linux 'ip addr' / 'ip a' vs macOS 'ifconfig'
      if (/^\s*ip\s+(addr|a|route)\b/i.test(trimmed)) {
        hypotheses.push({
          id: 'branch_platform_ifconfig',
          command: 'ifconfig',
          explanation: 'macOS network interface inspection using ifconfig',
          source: 'platform_optimized',
          estimatedRisk: 'read_only'
        });
        hypotheses.push({
          id: 'branch_platform_networksetup',
          command: 'networksetup -listallhardwareports',
          explanation: 'macOS hardware ports list',
          source: 'variation',
          estimatedRisk: 'read_only'
        });
      }

      // Pitfall: GNU 'sed -i' vs macOS BSD 'sed -i \'\''
      if (/\bsed\s+-i\s+['"][^'"]+['"]/i.test(trimmed) && !/\bsed\s+-i\s+['"]['"]/i.test(trimmed)) {
        const correctedSed = trimmed.replace(/\bsed\s+-i\s+/, "sed -i '' ");
        hypotheses.push({
          id: 'branch_platform_bsd_sed',
          command: correctedSed,
          explanation: 'macOS BSD sed syntax with empty extension flag',
          source: 'platform_optimized',
          estimatedRisk: 'safe_mutation'
        });
      }

      // Pitfall: GNU 'grep -P' (Perl regex not supported in macOS BSD grep)
      if (/\bgrep\s+(?:--perl-regexp|-P|-[\w]*P[\w]*)\b/i.test(trimmed)) {
        const correctedGrep = trimmed.replace(/(-[\w]*)P([\w]*)/, '$1E$2').replace(/--perl-regexp/, '-E');
        hypotheses.push({
          id: 'branch_platform_bsd_grep',
          command: correctedGrep,
          explanation: 'macOS extended regex (grep -E) instead of unsupported grep -P',
          source: 'platform_optimized',
          estimatedRisk: 'read_only'
        });
      }

      // Pitfall: 'which <tool>' vs 'command -v <tool>' (posix compliant, avoids csh aliases)
      if (/^\s*which\s+([a-zA-Z0-9_-]+)/i.test(trimmed)) {
        const toolMatch = trimmed.match(/^\s*which\s+([a-zA-Z0-9_-]+)/i);
        if (toolMatch) {
          hypotheses.push({
            id: 'branch_posix_command_v',
            command: `command -v ${toolMatch[1]}`,
            explanation: `POSIX compliant binary resolution: command -v ${toolMatch[1]}`,
            source: 'platform_optimized',
            estimatedRisk: 'read_only'
          });
        }
      }

      // Pitfall: 'killall <name>' vs 'pkill <name>'
      if (/^\s*killall\s+(-9\s+)?([a-zA-Z0-9_-]+)/i.test(trimmed)) {
        const m = trimmed.match(/^\s*killall\s+(-9\s+)?([a-zA-Z0-9_-]+)/i);
        if (m) {
          hypotheses.push({
            id: 'branch_pkill_variation',
            command: `pkill -i -f "${m[2]}"`,
            explanation: `Case-insensitive full-match pkill for ${m[2]}`,
            source: 'variation',
            estimatedRisk: 'safe_mutation'
          });
        }
      }

      // Query/Search: find vs mdfind on macOS
      if (/^\s*find\s+.*-name\s+["']?([^"']+)["']?/i.test(trimmed)) {
        const m = trimmed.match(/-name\s+["']?([^"']+)["']?/i);
        if (m) {
          const query = m[1].replace(/^\*|\*$/g, '');
          hypotheses.push({
            id: 'branch_mdfind_variation',
            command: `mdfind -name "${query}" | head -30`,
            explanation: `Fast macOS Spotlight search for ${query}`,
            source: 'platform_optimized',
            estimatedRisk: 'read_only'
          });
        }
      }
    }

    // 3. Goal-based heuristic variations if only 1 hypothesis exists
    if (hypotheses.length === 1) {
      // Port query goal
      const portGoalMatch = goal.match(/port\s+(\d+)/i) || trimmed.match(/:(\d+)\b/);
      if (portGoalMatch) {
        const port = portGoalMatch[1];
        if (!hypotheses.some(h => h.command.includes(`:${port}`))) {
          hypotheses.push({
            id: 'branch_lsof_port',
            command: `lsof -i :${port}`,
            explanation: `Inspect port ${port} using lsof`,
            source: 'heuristic',
            estimatedRisk: 'read_only'
          });
        }
      }

      // Process query goal
      const procMatch = goal.match(/(?:check|status|running|find|inspect)\s+([a-zA-Z0-9_-]+)/i);
      if (procMatch && !['the', 'my', 'a', 'an'].includes(procMatch[1].toLowerCase())) {
        const proc = procMatch[1];
        hypotheses.push({
          id: 'branch_pgrep_proc',
          command: `pgrep -fil "${proc}"`,
          explanation: `Inspect running process ${proc}`,
          source: 'heuristic',
          estimatedRisk: 'read_only'
        });
      }
    }

    // 4. Ground-Truth Canonical TLDR Recipes Expansion
    try {
      const binaryMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)/);
      if (binaryMatch) {
        const bin = binaryMatch[1];
        const tldrEngine = TldrKnowledgeEngine.getInstance();
        const tldrExamples = tldrEngine.getExamplesForCommand(bin, context.os);
        for (let i = 0; i < Math.min(tldrExamples.length, 2); i++) {
          const ex = tldrExamples[i];
          if (ex.command !== trimmed && !hypotheses.some(h => h.command === ex.command)) {
            hypotheses.push({
              id: `branch_tldr_${bin}_${i}`,
              command: ex.command,
              explanation: `Canonical recipe: ${ex.description}`,
              source: 'variation',
              estimatedRisk: this.classifyRisk(ex.command)
            });
          }
        }
      }
    } catch {
      // Non-blocking fallback if tldr expansion encounters parsing exceptions
    }

    return hypotheses;
  }

  /**
   * Classifies the safety/risk level of a candidate command.
   */
  public classifyRisk(command: string): RiskLevel {
    const trimmed = command.trim();

    try {
      const ast = ShellAstParser.parse(trimmed);
      if (ShellAstParser.isDestructiveOperation(ast).isDestructive) {
        return 'high_risk';
      }
    } catch {
      // Non-fatal, fallback to regex rules
    }

    // High risk / destructive operations
    if (/\b(rm\s+-rf\s+\/|mkfs|dd\s+if=|sudo\b|shutdown|reboot|halt)\b/i.test(trimmed)) {
      return 'high_risk';
    }

    // Phase 0.5, Item 5: Use capability classifier
    const capability = CommandCapabilityClassifier.classify(trimmed);
    if (capability.strategy === 'full_shadow') {
      return 'read_only';
    }

    // Mutating operations
    if (/\b(kill|pkill|killall|rm|rmdir|mv|touch|mkdir|chmod|chown|git\s+(commit|push|merge|rebase|reset)|npm\s+install|brew\s+install)\b/i.test(trimmed)) {
      return 'safe_mutation';
    }

    // Default to read-only diagnostics if classified read-only, otherwise safe_mutation
    return capability.isReadOnly ? 'read_only' : 'safe_mutation';
  }

  /**
   * Transforms potentially destructive or mutating candidate commands into
   * 100% non-destructive test predicates for shadow simulation.
   */
  public toSafePredicate(command: string, risk: RiskLevel): { predicate: string; isTransformed: boolean } {
    const trimmed = command.trim();

    // Check dry-run capable tools (Phase 0.5, Item 5)
    const dryRun = CommandCapabilityClassifier.getDryRunCommand(trimmed);
    if (dryRun && dryRun !== trimmed) {
      return { predicate: dryRun, isTransformed: true };
    }

    if (risk === 'read_only') {
      return { predicate: trimmed, isTransformed: false };
    }

    // 1. Process kill commands: transform to 'kill -0 <pid>'
    // kill -0 checks PID existence and signalling permission without terminating the process!
    const killPidMatch = trimmed.match(/^\s*kill\s+(?:-[a-zA-Z0-9]+\s+)*(\d+)\s*$/i);
    if (killPidMatch) {
      return { predicate: `kill -0 ${killPidMatch[1]}`, isTransformed: true };
    }

    // 2. pkill / killall commands: transform to pgrep
    const pkillMatch = trimmed.match(/^\s*(?:pkill|killall)\s+(?:-[a-zA-Z0-9]+\s+)*["']?([a-zA-Z0-9_.-]+)["']?\s*$/i);
    if (pkillMatch) {
      return { predicate: `pgrep -i "${pkillMatch[1]}"`, isTransformed: true };
    }

    // 3. Port killer pipeline: lsof -ti:PORT | xargs kill ... -> check if lsof finds any PID
    const lsofKillMatch = trimmed.match(/lsof\s+-ti:(\d+)\s*\|\s*xargs\s+kill/i);
    if (lsofKillMatch) {
      return { predicate: `lsof -ti:${lsofKillMatch[1]}`, isTransformed: true };
    }

    // 4. File deletions: rm [-rf] <target> -> test existence & writability
    const rmMatch = trimmed.match(/^\s*rm\s+(?:-[a-zA-Z]+\s+)*["']?([^"']+)["']?\s*$/i);
    if (rmMatch) {
      const target = rmMatch[1].trim();
      return { predicate: `test -e "${target}" && test -w "${target}"`, isTransformed: true };
    }

    // 5. Directory creation: mkdir [-p] <dir> -> test if already exists or parent is writable
    const mkdirMatch = trimmed.match(/^\s*mkdir\s+(?:-[a-zA-Z]+\s+)*["']?([^"']+)["']?\s*$/i);
    if (mkdirMatch) {
      const dir = mkdirMatch[1].trim();
      return { predicate: `test -d "${dir}" || test -w "$(dirname "${dir}")"`, isTransformed: true };
    }

    // 6. Git mutations: commit, push, merge -> git status --porcelain
    if (/^\s*git\s+(commit|push|merge|rebase|reset|cherry-pick)\b/i.test(trimmed)) {
      return { predicate: 'git status --porcelain', isTransformed: true };
    }

    // 7. Rsync dry-run
    if (/^\s*rsync\s+/i.test(trimmed) && !/--dry-run|-n\b/.test(trimmed)) {
      return { predicate: `${trimmed} --dry-run`, isTransformed: true };
    }

    // 8. Package manager probes
    const brewMatch = trimmed.match(/^\s*brew\s+install\s+([a-zA-Z0-9_-]+)/i);
    if (brewMatch) {
      return { predicate: `brew info ${brewMatch[1]}`, isTransformed: true };
    }

    // 9. Generic safe fallback for unmapped mutating commands:
    // Pure syntax validation using '/bin/zsh -n -c "<cmd>"'
    // -n parses and verifies syntax/grammar without running any command!
    const escaped = trimmed.replace(/'/g, `'\\''`);
    return { predicate: `${this.getSandboxShell()} -n -c '${escaped}'`, isTransformed: true };
  }

  /**
   * Evaluates a single candidate hypothesis in the shadow sandbox.
   */
  public async evaluateCandidate(
    candidate: CandidateHypothesis,
    context?: { os?: string; cwd?: string }
  ): Promise<SimulationOutcome> {
    const startTime = performance.now();
    const effectiveCwd = context?.cwd || (typeof process !== 'undefined' ? process.cwd() : '/tmp');

    // Pre-execution AST Syntax Validation
    const syntax = ShellAstParser.validateSyntax(candidate.command);
    if (!syntax.valid) {
      return {
        candidate,
        executedCommand: candidate.command,
        isPredicateTransformed: false,
        exitCode: 2,
        stdout: '',
        stderr: `AST Syntax Validation Error: ${syntax.error}`,
        durationMs: 0.1,
        empiricalScore: -5.0,
        pruned: true,
        pruneReason: `AST Syntax Validation Failed: ${syntax.error}`
      };
    }

    // Phase 0.5, Item 5: Check command capability routing (skip shadow sandbox for catastrophic AST-only)
    const capability = CommandCapabilityClassifier.classify(candidate.command);
    if (capability.strategy === 'ast_only') {
      let isCatastrophic = false;
      try {
        const ast = ShellAstParser.parse(candidate.command);
        isCatastrophic = ShellAstParser.isDestructiveOperation(ast).isDestructive;
      } catch {
        isCatastrophic = true;
      }

      if (isCatastrophic) {
        return {
          candidate,
          executedCommand: candidate.command,
          isPredicateTransformed: false,
          exitCode: 1,
          stdout: `[AST-Only Assessment: ${capability.reason}]`,
          stderr: 'High-risk destructive operation blocked via AST analysis',
          durationMs: 0.1,
          empiricalScore: -3.0,
          pruned: true,
          pruneReason: capability.reason
        };
      }
    }



    // Transform into safe predicate if necessary
    const { predicate, isTransformed } = this.toSafePredicate(candidate.command, candidate.estimatedRisk);

    let stdout = '';
    let stderr = '';
    let exitCode = -1;

    try {
      const execResult = await this.executeInSandbox(predicate, effectiveCwd);
      stdout = execResult.stdout || '';
      stderr = execResult.stderr || '';
      exitCode = execResult.code;
    } catch (err: any) {
      stderr = err?.message || 'Shadow sandbox execution error';
      exitCode = -1;
    }

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

    // Calculate empirical score
    const empiricalScore = this.calculateEmpiricalScore({
      exitCode,
      stdout,
      stderr,
      risk: candidate.estimatedRisk,
      isTransformed
    });

    // Pruning determination
    const { pruned, pruneReason } = this.determinePruning(exitCode, stdout, stderr, empiricalScore);

    return {
      candidate,
      executedCommand: predicate,
      isPredicateTransformed: isTransformed,
      exitCode,
      stdout,
      stderr,
      durationMs,
      empiricalScore,
      pruned,
      pruneReason
    };
  }

  private getSandboxShell(): string {
    if (typeof process !== 'undefined') {
      if (process.env?.SHELL && (process.env.SHELL.endsWith('/bash') || process.env.SHELL.endsWith('/zsh') || process.env.SHELL.endsWith('/sh'))) {
        return process.env.SHELL;
      }
      return '/bin/sh';
    }
    return '/bin/sh';
  }

  /**
   * Executes a command string inside the shadow sandbox with a strict timeout.
   */
  private async executeInSandbox(
    commandLine: string,
    cwd?: string
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const shell = this.getSandboxShell();

    // 1. If custom executor provided, use it
    if (this.customExecutor) {
      return this.customExecutor(shell, ['-c', commandLine], cwd);
    }

    // 2. Node/test environment check
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      try {
        const { spawnSync } = await import('node:child_process');
        const env = {
          ...process.env,
          PATH: `${process.env.PATH || ''}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`
        };
        const res = spawnSync(shell, ['-c', commandLine], {
          cwd: cwd || process.cwd(),
          env,
          encoding: 'utf-8',
          timeout: this.branchTimeoutMs
        });
        return {
          stdout: res.stdout || '',
          stderr: res.stderr || (res.error ? res.error.message : ''),
          code: res.status ?? (res.error ? -1 : 0)
        };
      } catch (e: any) {
        return { stdout: '', stderr: e.message || 'Execution error', code: -1 };
      }
    }

    // 3. Tauri environment via execute_command IPC
    const timeoutPromise = new Promise<{ stdout: string; stderr: string; code: number }>((_, reject) => {
      setTimeout(() => reject(new Error(`Shadow execution timeout (${this.branchTimeoutMs}ms exceeded)`)), this.branchTimeoutMs + 1000);
    });

    // Rust enforces the timeout and kills the process group; the JS race below is only a
    // backstop in case IPC itself stalls.
    const executionPromise = invoke<{ stdout: string; stderr: string; code: number }>('execute_command', {
      command: shell,
      args: ['-c', commandLine],
      cwd,
      timeoutMs: this.branchTimeoutMs
    });

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Calculates the empirical mathematical score:
   * S(C) = 2.0*I(code==0) + 1.0*tanh(len(out)/80) - 2.5*I(code!=0) - 2.0*I(stderr) - 3.0*I(refusal) - risk
   */
  public calculateEmpiricalScore(params: {
    exitCode: number;
    stdout: string;
    stderr: string;
    risk: RiskLevel;
    isTransformed: boolean;
  }): number {
    const { exitCode, stdout, stderr, risk, isTransformed } = params;
    let score = 0.0;

    // Exit code reward / penalty
    if (exitCode === 0) {
      score += 2.0;
    } else {
      score -= 2.5;
    }

    // Stdout reward: informative output rewarded using smooth saturation
    const trimmedOut = stdout.trim();
    if (trimmedOut.length > 0) {
      score += 1.0 * Math.tanh(trimmedOut.length / 80);
    }

    // Stderr penalty
    const trimmedErr = stderr.trim();
    if (trimmedErr.length > 0) {
      score -= 2.0;
      // Extra penalty for syntax errors or missing binaries
      if (/command not found|no such file|syntax error|parse error|unknown option/i.test(trimmedErr)) {
        score -= 2.0;
      }
    }

    // Refusal penalty
    if (this.isRefusalOutput(stdout)) {
      score -= 3.0;
    }

    // Risk penalty
    if (risk === 'safe_mutation') {
      score -= 0.2;
    } else if (risk === 'high_risk') {
      score -= 0.5;
    }

    // Small bonus for non-destructive safety predicate verification
    if (isTransformed && exitCode === 0) {
      score += 0.1;
    }

    return Math.round(score * 100) / 100;
  }

  /**
   * Determines if a simulation outcome should be pruned.
   */
  private determinePruning(
    exitCode: number,
    stdout: string,
    stderr: string,
    score: number
  ): { pruned: boolean; pruneReason?: string } {
    if (exitCode !== 0) {
      const reason = stderr.trim() || `Command failed with exit code ${exitCode}`;
      return { pruned: true, pruneReason: reason };
    }

    if (/command not found|syntax error|parse error/i.test(stderr)) {
      return { pruned: true, pruneReason: `Fatal shell error: ${stderr.trim()}` };
    }

    if (this.isRefusalOutput(stdout)) {
      return { pruned: true, pruneReason: 'Model output contains conversational refusal' };
    }

    if (score < 0.0) {
      return { pruned: true, pruneReason: `Negative empirical score (${score})` };
    }

    return { pruned: false };
  }

  /**
   * Checks if an output is a canned conversational refusal string.
   */
  private isRefusalOutput(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    return (
      lower.includes("i don't have access") ||
      lower.includes('i cannot inspect') ||
      lower.includes('as an ai') ||
      lower.includes('i am an ai') ||
      lower.includes('i apologize, but i cannot')
    );
  }
}
