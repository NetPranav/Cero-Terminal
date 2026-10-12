/**
 * DreamStateScheduler.ts — The "Dream-State" Nightly Autonomous Self-Play Engine
 * 
 * Part of Cero-SERL (Self-Evolving Reflexion Loop):
 * Breakthrough 4: Nightly Autonomous Self-Play on Apple Silicon.
 * 
 * When the Mac is connected to power and idle (e.g. at 2:00 AM or idle >20 minutes),
 * Cero probes the local system environment, synthesizes personalized system puzzles,
 * solves them in the Shadow-PTY sandbox, and creates high-reward DPO training pairs
 * for on-device fine-tuning before morning.
 */

import * as fs from 'fs';
import * as path from 'path';
import { invoke } from '@tauri-apps/api/core';
import { ShadowPtySimulator, CandidateHypothesis } from '../../ai/agent/ShadowPtySimulator';
import { DpoDatasetEngine, DpoPair } from './DpoDatasetEngine';
import { KnowledgeDeficitLogger } from './KnowledgeDeficitLogger';
import { TldrKnowledgeEngine } from '../knowledge/TldrKnowledgeEngine';
import { ShellAstParser } from '../security/ShellAstParser';

export interface ActivePortEntry {
  port: number;
  process: string;
  pid?: number;
}

export interface EnvironmentProfile {
  installedTools: string[];
  runningServices: string[];
  activePorts: ActivePortEntry[];
  devToolchains: string[];
  repositories: string[];
  osVersion: string;
  scannedAt: number;
}

export type PuzzleCategory =
  | 'process_port'
  | 'package_service'
  | 'git_workspace'
  | 'filesystem_cleanup'
  | 'network_diagnostics';

export interface SystemPuzzle {
  id: string;
  category: PuzzleCategory;
  prompt: string;
  targetEntity: string;
  difficulty: 'basic' | 'intermediate' | 'expert';
  candidateTemplates: string[];
  expectedVerificationCriteria: {
    exitCode: number;
    minOutputLength?: number;
    pattern?: string;
  };
}

export interface SelfPlayTrialResult {
  puzzleId: string;
  category: PuzzleCategory;
  prompt: string;
  attemptedCommand: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  score: number;
  isVerified: boolean;
  counterfactualCorrection?: string;
  durationMs: number;
}

export interface PowerAndIdleStatus {
  eligible: boolean;
  onAcPower: boolean;
  batteryLevelPercent: number;
  idleSeconds: number;
  reason?: string;
}

export interface DreamCycleReport {
  cycleId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  puzzlesGenerated: number;
  puzzlesAttempted: number;
  puzzlesSolved: number;
  successRate: number;
  dpoPairsAdded: number;
  powerStatus: {
    onAcPower: boolean;
    batteryLevelPercent: number;
  };
  aborted: boolean;
  abortReason?: string;
}

export interface DreamStateSchedulerOptions {
  storageDir?: string;
  shadowSimulator?: ShadowPtySimulator;
  dpoEngine?: DpoDatasetEngine;
  deficitLogger?: KnowledgeDeficitLogger;
  commandExecutor?: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>;
  powerChecker?: () => Promise<{ onAcPower: boolean; batteryLevelPercent: number }>;
  idleChecker?: () => Promise<number>;
  batchSize?: number;
  minIdleSeconds?: number;
  scheduledHour?: number;
}

export class DreamStateScheduler {
  private static instance: DreamStateScheduler;
  private storageDir: string;
  private shadowSimulator: ShadowPtySimulator;
  private dpoEngine: DpoDatasetEngine;
  private deficitLogger: KnowledgeDeficitLogger;
  private commandExecutor: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>;
  private powerChecker: () => Promise<{ onAcPower: boolean; batteryLevelPercent: number }>;
  private idleChecker: () => Promise<number>;

  private batchSize: number;
  private minIdleSeconds: number;
  private scheduledHour: number;

  private isDreaming: boolean = false;
  private abortRequested: boolean = false;
  private schedulerTimer?: NodeJS.Timeout;
  private reportHistory: DreamCycleReport[] = [];

  constructor(options?: DreamStateSchedulerOptions) {
    const homeDir = typeof process !== 'undefined' && process.env ? (process.env.HOME || process.env.USERPROFILE || '/tmp') : '/tmp';
    this.storageDir = options?.storageDir || path.join(homeDir, '.cero', 'training');

    this.shadowSimulator = options?.shadowSimulator || ShadowPtySimulator.getInstance();
    this.dpoEngine = options?.dpoEngine || DpoDatasetEngine.getInstance();
    this.deficitLogger = options?.deficitLogger || KnowledgeDeficitLogger.getInstance();

    this.batchSize = options?.batchSize ?? 25; // Default batch size per cycle
    this.minIdleSeconds = options?.minIdleSeconds ?? 1200; // 20 minutes idle
    this.scheduledHour = options?.scheduledHour ?? 2; // 2:00 AM

    // Pluggable shell executor with Tauri invoke fallback
    this.commandExecutor = options?.commandExecutor || (async (cmd: string) => {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        return { stdout: '', stderr: '', code: 0 };
      }
      try {
        const res = await invoke<{ stdout: string; stderr: string; code: number }>('execute_command', {
          command: 'zsh',
          args: ['-lc', cmd],
        });
        return { stdout: res.stdout || '', stderr: res.stderr || '', code: res.code ?? 0 };
      } catch (err: any) {
        return { stdout: '', stderr: err?.message || String(err), code: 1 };
      }
    });

    // Pluggable power checker with macOS pmset fallback
    this.powerChecker = options?.powerChecker || (async () => {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        return { onAcPower: true, batteryLevelPercent: 100 };
      }
      try {
        const res = await this.commandExecutor('pmset -g batt');
        const onAcPower = res.stdout.includes('AC Power') || !res.stdout.includes('Battery Power');
        const match = res.stdout.match(/(\d+)%/);
        const batteryLevelPercent = match ? parseInt(match[1], 10) : 100;
        return { onAcPower, batteryLevelPercent };
      } catch {
        return { onAcPower: true, batteryLevelPercent: 100 };
      }
    });

    // Pluggable idle checker with macOS IOHIDSystem fallback
    this.idleChecker = options?.idleChecker || (async () => {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        return 1800; // 30 minutes idle
      }
      try {
        const res = await this.commandExecutor(
          `ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'`
        );
        const idle = parseInt(res.stdout.trim(), 10);
        return isNaN(idle) ? 0 : idle;
      } catch {
        return 0;
      }
    });
  }

  public static getInstance(options?: DreamStateSchedulerOptions): DreamStateScheduler {
    if (!DreamStateScheduler.instance || options) {
      DreamStateScheduler.instance = new DreamStateScheduler(options);
    }
    return DreamStateScheduler.instance;
  }

  // =========================================================================
  // 1. SYSTEM ENVIRONMENT PROBE
  // =========================================================================

  /**
   * Scans local installed tools, active services, listening ports, and repositories
   * using safe, read-only system commands.
   */
  public async scanEnvironment(): Promise<EnvironmentProfile> {
    const profile: EnvironmentProfile = {
      installedTools: [],
      runningServices: [],
      activePorts: [],
      devToolchains: [],
      repositories: [],
      osVersion: process.platform === 'darwin' ? 'macOS Darwin' : process.platform,
      scannedAt: Date.now(),
    };

    try {
      // 1. Check common dev toolchains
      const toolchainCandidates = ['git', 'docker', 'node', 'npm', 'python3', 'cargo', 'rustc', 'go', 'brew', 'launchctl'];
      for (const tool of toolchainCandidates) {
        const res = await this.commandExecutor(`command -v ${tool}`);
        if (res.code === 0 && res.stdout.trim()) {
          profile.devToolchains.push(tool);
          profile.installedTools.push(tool);
        }
      }

      // 2. Scan Homebrew formula & services if brew is present
      if (profile.installedTools.includes('brew')) {
        const brewListRes = await this.commandExecutor('brew list --formula -1 2>/dev/null | head -n 30');
        if (brewListRes.code === 0 && brewListRes.stdout.trim()) {
          const formulas = brewListRes.stdout.split('\n').map(s => s.trim()).filter(Boolean);
          profile.installedTools.push(...formulas);
        }

        const brewServicesRes = await this.commandExecutor('brew services list 2>/dev/null | awk \'$2=="started"{print $1}\'');
        if (brewServicesRes.code === 0 && brewServicesRes.stdout.trim()) {
          const services = brewServicesRes.stdout.split('\n').map(s => s.trim()).filter(Boolean);
          profile.runningServices.push(...services);
        }
      }

      // 3. Scan listening TCP ports using lsof
      const lsofRes = await this.commandExecutor('lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | awk \'NR>1 {print $1, $2, $9}\' | head -n 20');
      if (lsofRes.code === 0 && lsofRes.stdout.trim()) {
        const lines = lsofRes.stdout.split('\n').filter(Boolean);
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const proc = parts[0];
            const pid = parseInt(parts[1], 10);
            const portMatch = parts[2].match(/:(\d+)$/);
            if (portMatch) {
              const port = parseInt(portMatch[1], 10);
              if (!profile.activePorts.some(p => p.port === port)) {
                profile.activePorts.push({ port, process: proc, pid: isNaN(pid) ? undefined : pid });
              }
            }
          }
        }
      }

      // 4. Discover local Git repositories in user directory
      const home = process.env.HOME || '/Users/user';
      const gitReposRes = await this.commandExecutor(
        `find "${home}" -maxdepth 3 -type d -name ".git" 2>/dev/null | head -n 10`
      );
      if (gitReposRes.code === 0 && gitReposRes.stdout.trim()) {
        const repos = gitReposRes.stdout
          .split('\n')
          .map(r => path.dirname(r.trim()))
          .filter(Boolean);
        profile.repositories.push(...repos);
      }
    } catch (err) {
      console.warn('[DreamStateScheduler] Environment probe encountered partial warning:', err);
    }

    return profile;
  }

  // =========================================================================
  // 2. SYNTHETIC CURRICULUM GENERATOR
  // =========================================================================

  /**
   * Synthesizes personalized system puzzles tailored to the user's specific Mac environment.
   */
  public generateCurriculum(profile: EnvironmentProfile, count: number = this.batchSize): SystemPuzzle[] {
    const puzzles: SystemPuzzle[] = [];
    let idCounter = 1;

    const makeId = () => `puzzle_${Date.now()}_${idCounter++}`;

    // Category 1: Process & Port Inspection / Management
    for (const portEntry of profile.activePorts) {
      puzzles.push({
        id: makeId(),
        category: 'process_port',
        prompt: `Find which process is listening on port ${portEntry.port} and display its PID and name.`,
        targetEntity: `port ${portEntry.port}`,
        difficulty: 'basic',
        candidateTemplates: [
          `lsof -iTCP:${portEntry.port} -sTCP:LISTEN -P -n`,
          `lsof -i :${portEntry.port} | grep LISTEN`,
          `pgrep -fl ${portEntry.process}`,
        ],
        expectedVerificationCriteria: {
          exitCode: 0,
          minOutputLength: 5,
        },
      });

      puzzles.push({
        id: makeId(),
        category: 'process_port',
        prompt: `Safely verify if process '${portEntry.process}' is actively running on this Mac.`,
        targetEntity: portEntry.process,
        difficulty: 'intermediate',
        candidateTemplates: [
          `pgrep -if "${portEntry.process}"`,
          `ps aux | grep -i "${portEntry.process}" | grep -v grep`,
        ],
        expectedVerificationCriteria: {
          exitCode: 0,
          minOutputLength: 1,
        },
      });
    }

    // Category 2: Package & Service Management
    for (const service of profile.runningServices) {
      puzzles.push({
        id: makeId(),
        category: 'package_service',
        prompt: `Check the runtime service status of Homebrew service '${service}'.`,
        targetEntity: service,
        difficulty: 'basic',
        candidateTemplates: [
          `brew services info ${service} --json 2>/dev/null || brew services list | grep ${service}`,
          `brew services list | grep "${service}"`,
        ],
        expectedVerificationCriteria: {
          exitCode: 0,
          minOutputLength: 5,
        },
      });
    }

    // Category 3: Git & Workspace Intelligence
    for (const repo of profile.repositories) {
      const repoName = path.basename(repo);
      puzzles.push({
        id: makeId(),
        category: 'git_workspace',
        prompt: `Check if there are any uncommitted changes or untracked files in the Git repository at ${repo}.`,
        targetEntity: repoName,
        difficulty: 'intermediate',
        candidateTemplates: [
          `git -C "${repo}" status --porcelain`,
          `git -C "${repo}" diff --stat`,
        ],
        expectedVerificationCriteria: {
          exitCode: 0,
        },
      });

      puzzles.push({
        id: makeId(),
        category: 'git_workspace',
        prompt: `Display the last 3 commit summaries and authors for the project at ${repo}.`,
        targetEntity: repoName,
        difficulty: 'basic',
        candidateTemplates: [
          `git -C "${repo}" log -n 3 --oneline`,
          `git -C "${repo}" log -3 --format="%h - %an: %s"`,
        ],
        expectedVerificationCriteria: {
          exitCode: 0,
          minOutputLength: 10,
        },
      });
    }

    // Category 4: Filesystem & Disk Cleanup
    puzzles.push({
      id: makeId(),
      category: 'filesystem_cleanup',
      prompt: 'Find all directories larger than 500MB on the local drive or in home caches.',
      targetEntity: 'large_caches',
      difficulty: 'expert',
      candidateTemplates: [
        'du -sh "$HOME"/Library/Caches/* 2>/dev/null | sort -hr | head -n 5',
        'find "$HOME/Library/Caches" -type d -depth 1 -exec du -sh {} + 2>/dev/null | sort -hr | head -n 5',
      ],
      expectedVerificationCriteria: {
        exitCode: 0,
      },
    });

    puzzles.push({
      id: makeId(),
      category: 'filesystem_cleanup',
      prompt: 'Check free disk space and volume utilization for the macOS root APFS container.',
      targetEntity: 'apfs_root',
      difficulty: 'basic',
      candidateTemplates: [
        'df -h /',
        'diskutil info / | grep -E "Container Total Space|Volume Free Space"',
      ],
      expectedVerificationCriteria: {
        exitCode: 0,
        minOutputLength: 15,
      },
    });

    // Category 5: Network Diagnostics & Connectivity
    puzzles.push({
      id: makeId(),
      category: 'network_diagnostics',
      prompt: 'List the active network interface and local IPv4 address on this Mac.',
      targetEntity: 'network_ipv4',
      difficulty: 'basic',
      candidateTemplates: [
        'ipconfig getifaddr $(route -n get default 2>/dev/null | awk \'/interface:/{print $2}\') || ifconfig en0 | awk \'/inet / {print $2}\'',
        'ifconfig | grep "inet " | grep -v 127.0.0.1 | awk \'{print $2}\'',
      ],
      expectedVerificationCriteria: {
        exitCode: 0,
        minOutputLength: 5,
      },
    });

    puzzles.push({
      id: makeId(),
      category: 'network_diagnostics',
      prompt: 'Test DNS resolution latency and IP reachability for github.com.',
      targetEntity: 'dns_github',
      difficulty: 'intermediate',
      candidateTemplates: [
        'dscacheutil -q host -a name github.com 2>/dev/null || host github.com',
        'nslookup github.com | grep "Address:" | tail -n +2',
      ],
      expectedVerificationCriteria: {
        exitCode: 0,
        minOutputLength: 5,
      },
    });

    // Category 6: Ground-Truth CLI Mastery (TldrKnowledgeEngine)
    const tldrEngine = TldrKnowledgeEngine.getInstance();
    for (const tool of profile.installedTools) {
      if (tldrEngine.hasCommand(tool)) {
        const examples = tldrEngine.getExamplesForCommand(tool, 'macos');
        for (let i = 0; i < Math.min(examples.length, 2); i++) {
          const ex = examples[i];
          if (ShellAstParser.validateSyntax(ex.command).valid) {
            puzzles.push({
              id: makeId(),
              category: 'network_diagnostics',
              prompt: `Run canonical recipe: ${ex.description}`,
              targetEntity: tool,
              difficulty: 'intermediate',
              candidateTemplates: [ex.command],
              expectedVerificationCriteria: {
                exitCode: 0,
              },
            });
          }
        }
      }
    }

    // Fallback standard puzzles if environment is minimal
    if (puzzles.length < count) {
      puzzles.push({
        id: makeId(),
        category: 'process_port',
        prompt: 'Display top 5 processes consuming the highest CPU on macOS.',
        targetEntity: 'top_cpu',
        difficulty: 'basic',
        candidateTemplates: [
          'ps -A -o %cpu,%mem,comm | sort -nr | head -n 6',
          'top -l 1 -n 5 -o cpu -stats pid,command,cpu',
        ],
        expectedVerificationCriteria: { exitCode: 0, minOutputLength: 20 },
      });

      puzzles.push({
        id: makeId(),
        category: 'package_service',
        prompt: 'Check if Homebrew has any outdated packages ready to be upgraded.',
        targetEntity: 'brew_outdated',
        difficulty: 'intermediate',
        candidateTemplates: [
          'brew outdated --formula 2>/dev/null || true',
        ],
        expectedVerificationCriteria: { exitCode: 0 },
      });
    }

    return puzzles.slice(0, count);
  }

  // =========================================================================
  // 3. SANDBOXED SELF-PLAY & TRIAL ROLLOUTS
  // =========================================================================

  /**
   * Attempts solutions for a synthetic system puzzle in the non-destructive Shadow-PTY sandbox.
   * If verified, synthesizes a DPO training pair for on-device fine-tuning.
   */
  public async solvePuzzle(puzzle: SystemPuzzle): Promise<SelfPlayTrialResult> {
    const startTime = Date.now();
    let bestResult: SelfPlayTrialResult = {
      puzzleId: puzzle.id,
      category: puzzle.category,
      prompt: puzzle.prompt,
      attemptedCommand: puzzle.candidateTemplates[0] || 'true',
      exitCode: 1,
      stdout: '',
      stderr: 'No candidates evaluated',
      score: -10,
      isVerified: false,
      durationMs: 0,
    };

    // Evaluate candidate solutions using the ShadowPtySimulator
    for (const cmd of puzzle.candidateTemplates) {
      try {
        // Pre-validate syntax with ShellAstParser
        if (!ShellAstParser.validateSyntax(cmd).valid) {
          continue;
        }

        const hypothesis: CandidateHypothesis = {
          id: `hyp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          command: cmd,
          explanation: `Self-play hypothesis for ${puzzle.targetEntity}`,
          source: 'heuristic',
          estimatedRisk: 'safe_mutation',
        };

        const trial = await this.shadowSimulator.evaluateCandidate(hypothesis);
        const criteria = puzzle.expectedVerificationCriteria;
        const matchesExit = trial.exitCode === criteria.exitCode;
        const matchesLength = criteria.minOutputLength ? trial.stdout.length >= criteria.minOutputLength : true;
        const isSuccess = matchesExit && matchesLength;

        if (trial.empiricalScore > bestResult.score || isSuccess) {
          bestResult = {
            puzzleId: puzzle.id,
            category: puzzle.category,
            prompt: puzzle.prompt,
            attemptedCommand: cmd,
            exitCode: trial.exitCode,
            stdout: trial.stdout,
            stderr: trial.stderr,
            score: trial.empiricalScore,
            isVerified: isSuccess,
            durationMs: Date.now() - startTime,
          };
        }

        if (isSuccess) {
          break; // Found verified solution!
        }
      } catch (err: any) {
        // Continue to next candidate
      }
    }

    // If verified, automatically generate DPO pair:
    // chosen = verified command pipeline
    // rejected = conversational excuse or hesitation
    if (bestResult.isVerified) {
      const rejectedExcuse = `I apologize, but as an AI assistant I don't have access to run terminal commands to check ${puzzle.targetEntity}.`;
      await this.dpoEngine.addPair({
        prompt: puzzle.prompt,
        chosen: bestResult.attemptedCommand,
        rejected: rejectedExcuse,
        metadata: {
          category: puzzle.category,
          targetEntity: puzzle.targetEntity,
          source: 'self_play',
          verifiedCommand: bestResult.attemptedCommand,
        },
      });
    }

    bestResult.durationMs = Date.now() - startTime;
    return bestResult;
  }

  // =========================================================================
  // 4. POWER & IDLE CONDITIONS
  // =========================================================================

  /**
   * Verifies that the Mac is plugged into AC power and has been idle long enough
   * to avoid battery drain or interfering with active user work.
   */
  public async checkPowerAndIdleConditions(): Promise<PowerAndIdleStatus> {
    const power = await this.powerChecker();
    const idleSeconds = await this.idleChecker();

    if (!power.onAcPower && power.batteryLevelPercent < 80) {
      return {
        eligible: false,
        onAcPower: power.onAcPower,
        batteryLevelPercent: power.batteryLevelPercent,
        idleSeconds,
        reason: `On battery power (${power.batteryLevelPercent}% < 80%). Dreaming paused to conserve battery.`,
      };
    }

    if (idleSeconds < this.minIdleSeconds) {
      return {
        eligible: false,
        onAcPower: power.onAcPower,
        batteryLevelPercent: power.batteryLevelPercent,
        idleSeconds,
        reason: `System active (idle ${idleSeconds}s < ${this.minIdleSeconds}s threshold).`,
      };
    }

    return {
      eligible: true,
      onAcPower: power.onAcPower,
      batteryLevelPercent: power.batteryLevelPercent,
      idleSeconds,
    };
  }

  // =========================================================================
  // 5. DREAM-STATE NIGHTLY RUNNER
  // =========================================================================

  /**
   * Executes a full Dream-State self-play cycle.
   */
  public async runDreamCycle(options?: {
    force?: boolean;
    maxPuzzles?: number;
  }): Promise<DreamCycleReport> {
    const startTime = Date.now();
    const cycleId = `dream_cycle_${startTime}`;
    this.isDreaming = true;
    this.abortRequested = false;

    // Check power & idle unless forced
    const condition = await this.checkPowerAndIdleConditions();
    if (!options?.force && !condition.eligible) {
      this.isDreaming = false;
      const report: DreamCycleReport = {
        cycleId,
        startTime,
        endTime: Date.now(),
        durationMs: Date.now() - startTime,
        puzzlesGenerated: 0,
        puzzlesAttempted: 0,
        puzzlesSolved: 0,
        successRate: 0,
        dpoPairsAdded: 0,
        powerStatus: {
          onAcPower: condition.onAcPower,
          batteryLevelPercent: condition.batteryLevelPercent,
        },
        aborted: true,
        abortReason: condition.reason || 'Power or idle conditions not met',
      };
      this.reportHistory.push(report);
      return report;
    }

    // Step 1: System Environment Probe
    const profile = await this.scanEnvironment();

    // Step 2: Synthetic Curriculum Generation
    const puzzleCount = options?.maxPuzzles ?? this.batchSize;
    const curriculum = this.generateCurriculum(profile, puzzleCount);

    let puzzlesSolved = 0;
    let puzzlesAttempted = 0;
    const initialPairsCount = this.dpoEngine.getAllPairs().length;

    // Step 3: Sandboxed Self-Play Rollouts
    for (const puzzle of curriculum) {
      if (this.abortRequested) {
        break;
      }

      puzzlesAttempted++;
      const result = await this.solvePuzzle(puzzle);
      if (result.isVerified) {
        puzzlesSolved++;
      }
    }

    const currentPairsCount = this.dpoEngine.getAllPairs().length;
    const dpoPairsAdded = Math.max(0, currentPairsCount - initialPairsCount);

    const endTime = Date.now();
    const successRate = puzzlesAttempted > 0 ? (puzzlesSolved / puzzlesAttempted) * 100 : 0;

    const report: DreamCycleReport = {
      cycleId,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      puzzlesGenerated: curriculum.length,
      puzzlesAttempted,
      puzzlesSolved,
      successRate,
      dpoPairsAdded,
      powerStatus: {
        onAcPower: condition.onAcPower,
        batteryLevelPercent: condition.batteryLevelPercent,
      },
      aborted: this.abortRequested,
      abortReason: this.abortRequested ? 'User or process requested abort' : undefined,
    };

    // Step 4: Persist Dream Cycle Dataset to disk
    await this.persistDreamDataset(report);

    this.reportHistory.push(report);
    this.isDreaming = false;
    return report;
  }

  /**
   * Persists summary of the dream cycle to ~/.cero/training/dream_state_dataset.jsonl
   */
  private async persistDreamDataset(report: DreamCycleReport): Promise<void> {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const recordPath = path.join(this.storageDir, 'dream_state_cycles.jsonl');
      fs.appendFileSync(recordPath, JSON.stringify(report) + '\n', 'utf-8');
    } catch (err) {
      console.warn('[DreamStateScheduler] Failed to append dream cycle report:', err);
    }
  }

  // =========================================================================
  // 6. SCHEDULER LIFECYCLE & TELEMETRY
  // =========================================================================

  /**
   * Starts periodic polling scheduler (e.g. checking every 10 minutes if conditions are met).
   */
  public startScheduler(checkIntervalMs: number = 600000): void {
    if (this.schedulerTimer) return;

    this.schedulerTimer = setInterval(async () => {
      const condition = await this.checkPowerAndIdleConditions();
      const currentHour = new Date().getHours();

      // Trigger if overnight scheduled hour (e.g. 2:00 AM) or deeply idle (>30 mins)
      if (condition.eligible && (currentHour === this.scheduledHour || condition.idleSeconds > 1800)) {
        if (!this.isDreaming) {
          await this.runDreamCycle();
        }
      }
    }, checkIntervalMs);
  }

  public stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = undefined;
    }
  }

  public abortCurrentDreamCycle(): void {
    if (this.isDreaming) {
      this.abortRequested = true;
    }
  }

  public getIsDreaming(): boolean {
    return this.isDreaming;
  }

  public getReportHistory(): DreamCycleReport[] {
    return [...this.reportHistory];
  }

  public getLatestReport(): DreamCycleReport | undefined {
    return this.reportHistory[this.reportHistory.length - 1];
  }
}
