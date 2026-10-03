import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DreamStateScheduler,
  EnvironmentProfile,
  SystemPuzzle,
} from './DreamStateScheduler';
import { ShadowPtySimulator } from '../../ai/agent/ShadowPtySimulator';
import { DpoDatasetEngine } from './DpoDatasetEngine';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 4.7 — The "Dream-State" Nightly Autonomous Self-Play Engine', () => {
  let scheduler: DreamStateScheduler;
  let mockShadowSimulator: ShadowPtySimulator;
  let dpoEngine: DpoDatasetEngine;

  const testTrainingDir = path.join(
    process.env.HOME || '/tmp',
    '.cero',
    'training',
    'test_dream_state'
  );
  const testDpoFile = path.join(testTrainingDir, 'test_dpo_pairs.jsonl');

  beforeEach(() => {
    // Clean test directory
    try {
      if (fs.existsSync(testTrainingDir)) {
        fs.rmSync(testTrainingDir, { recursive: true, force: true });
      }
      fs.mkdirSync(testTrainingDir, { recursive: true });
    } catch {
      // ignore
    }

    // Set up DPO Engine
    dpoEngine = new DpoDatasetEngine({
      storageFilePath: testDpoFile,
    });

    // Mock ShadowPtySimulator
    mockShadowSimulator = {
      evaluateCandidate: vi.fn().mockImplementation(async (hyp) => ({
        command: hyp.command,
        sandboxedCommand: `/bin/zsh -lc '${hyp.command}'`,
        exitCode: 0,
        stdout: 'antigravity 8847 TCP LISTEN\nPID: 55432',
        stderr: '',
        durationMs: 12,
        empiricalScore: 2.5,
        riskLevel: 'safe',
      })),
    } as any;
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testTrainingDir)) {
        fs.rmSync(testTrainingDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  describe('1. System Environment Probe', () => {
    it('scans and parses installed tools, services, ports, and repositories', async () => {
      const mockExecutor = vi.fn().mockImplementation(async (cmd: string) => {
        if (cmd.includes('command -v')) {
          const tool = cmd.split(' ').pop();
          if (['git', 'docker', 'node', 'brew'].includes(tool || '')) {
            return { stdout: `/opt/homebrew/bin/${tool}`, stderr: '', code: 0 };
          }
          return { stdout: '', stderr: '', code: 1 };
        }
        if (cmd.includes('brew list --formula')) {
          return { stdout: 'postgresql@14\nredis\nnginx\nhtop\n', stderr: '', code: 0 };
        }
        if (cmd.includes('brew services list')) {
          return { stdout: 'postgresql@14\nredis\n', stderr: '', code: 0 };
        }
        if (cmd.includes('lsof -iTCP -sTCP:LISTEN')) {
          return {
            stdout: 'antigravity 55432 *:8847\nnode 12345 *:3000\npostgres 8899 *:5432\n',
            stderr: '',
            code: 0,
          };
        }
        if (cmd.includes('find') && cmd.includes('.git')) {
          return {
            stdout: '/Users/test/Projects/Cero/.git\n/Users/test/Projects/AI-Terminal/.git\n',
            stderr: '',
            code: 0,
          };
        }
        return { stdout: '', stderr: '', code: 0 };
      });

      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
        commandExecutor: mockExecutor,
        shadowSimulator: mockShadowSimulator,
        dpoEngine,
      });

      const profile = await scheduler.scanEnvironment();

      expect(profile.devToolchains).toContain('git');
      expect(profile.devToolchains).toContain('docker');
      expect(profile.devToolchains).toContain('node');
      expect(profile.devToolchains).toContain('brew');

      expect(profile.installedTools).toContain('postgresql@14');
      expect(profile.installedTools).toContain('redis');

      expect(profile.runningServices).toContain('postgresql@14');
      expect(profile.runningServices).toContain('redis');

      expect(profile.activePorts.some(p => p.port === 8847 && p.process === 'antigravity')).toBe(true);
      expect(profile.activePorts.some(p => p.port === 3000 && p.process === 'node')).toBe(true);
      expect(profile.activePorts.some(p => p.port === 5432 && p.process === 'postgres')).toBe(true);

      expect(profile.repositories).toContain('/Users/test/Projects/Cero');
      expect(profile.repositories).toContain('/Users/test/Projects/AI-Terminal');
    });
  });

  describe('2. Synthetic Curriculum Generation', () => {
    it('generates personalized system puzzles across 5 categories', () => {
      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
        shadowSimulator: mockShadowSimulator,
        dpoEngine,
      });

      const mockProfile: EnvironmentProfile = {
        installedTools: ['brew', 'git', 'docker'],
        runningServices: ['postgresql@14'],
        activePorts: [{ port: 8847, process: 'antigravity', pid: 55432 }],
        devToolchains: ['git', 'docker', 'node'],
        repositories: ['/home/user/project'],
        osVersion: 'macOS Darwin',
        scannedAt: Date.now(),
      };

      const puzzles = scheduler.generateCurriculum(mockProfile, 20);

      expect(puzzles.length).toBeGreaterThanOrEqual(6);

      const categories = puzzles.map(p => p.category);
      expect(categories).toContain('process_port');
      expect(categories).toContain('package_service');
      expect(categories).toContain('git_workspace');
      expect(categories).toContain('filesystem_cleanup');
      expect(categories).toContain('network_diagnostics');

      // Check port puzzle
      const portPuzzle = puzzles.find(p => p.category === 'process_port' && p.targetEntity.includes('8847'));
      expect(portPuzzle).toBeDefined();
      expect(portPuzzle?.prompt).toContain('8847');
      expect(portPuzzle?.candidateTemplates.some(t => t.includes('8847'))).toBe(true);

      // Check service puzzle
      const servicePuzzle = puzzles.find(p => p.targetEntity === 'postgresql@14');
      expect(servicePuzzle).toBeDefined();
      expect(servicePuzzle?.candidateTemplates[0]).toContain('postgresql@14');
    });
  });

  describe('3. Sandboxed Self-Play & DPO Pair Synthesis', () => {
    it('attempts solutions in ShadowPtySimulator and records verified DPO pairs', async () => {
      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
        shadowSimulator: mockShadowSimulator,
        dpoEngine,
      });

      const puzzle: SystemPuzzle = {
        id: 'test_puzzle_1',
        category: 'process_port',
        prompt: 'Check which process is listening on port 8847',
        targetEntity: 'port 8847',
        difficulty: 'basic',
        candidateTemplates: ['lsof -iTCP:8847 -sTCP:LISTEN -P -n'],
        expectedVerificationCriteria: {
          exitCode: 0,
          minOutputLength: 5,
        },
      };

      const result = await scheduler.solvePuzzle(puzzle);

      expect(result.isVerified).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.score).toBe(2.5);
      expect(result.attemptedCommand).toBe('lsof -iTCP:8847 -sTCP:LISTEN -P -n');

      // Verify DPO pair was added to DpoDatasetEngine
      const pairs = dpoEngine.getAllPairs();
      expect(pairs.length).toBe(1);
      expect(pairs[0].prompt).toBe(puzzle.prompt);
      expect(pairs[0].chosen).toBe('lsof -iTCP:8847 -sTCP:LISTEN -P -n');
      expect(pairs[0].rejected).toContain('I apologize, but as an AI assistant');
      expect(pairs[0].metadata?.category).toBe('process_port');
      expect(pairs[0].metadata?.source).toBe('self_play');
    });
  });

  describe('4. Power & Idle Conditions Gating', () => {
    it('blocks dreaming when on low battery power to prevent mobile battery drain', async () => {
      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
        powerChecker: async () => ({ onAcPower: false, batteryLevelPercent: 45 }),
        idleChecker: async () => 2400, // 40 minutes idle
      });

      const status = await scheduler.checkPowerAndIdleConditions();
      expect(status.eligible).toBe(false);
      expect(status.reason).toContain('On battery power');
    });

    it('blocks dreaming when user is actively interacting with the Mac (short idle time)', async () => {
      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
        powerChecker: async () => ({ onAcPower: true, batteryLevelPercent: 100 }),
        idleChecker: async () => 300, // Only 5 minutes idle (< 20 mins)
        minIdleSeconds: 1200,
      });

      const status = await scheduler.checkPowerAndIdleConditions();
      expect(status.eligible).toBe(false);
      expect(status.reason).toContain('System active');
    });

    it('permits dreaming when plugged into AC power and idle exceeds threshold', async () => {
      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
        powerChecker: async () => ({ onAcPower: true, batteryLevelPercent: 100 }),
        idleChecker: async () => 1800, // 30 minutes idle (> 20 mins)
        minIdleSeconds: 1200,
      });

      const status = await scheduler.checkPowerAndIdleConditions();
      expect(status.eligible).toBe(true);
    });
  });

  describe('5. Dream-State Cycle Execution & Lifecycle', () => {
    it('runs an autonomous dream cycle and produces report', async () => {
      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
        shadowSimulator: mockShadowSimulator,
        dpoEngine,
        powerChecker: async () => ({ onAcPower: true, batteryLevelPercent: 100 }),
        idleChecker: async () => 1800,
      });

      const report = await scheduler.runDreamCycle({ force: true, maxPuzzles: 4 });

      expect(report.puzzlesGenerated).toBe(4);
      expect(report.puzzlesAttempted).toBe(4);
      expect(report.puzzlesSolved).toBe(4);
      expect(report.successRate).toBe(100);
      expect(report.dpoPairsAdded).toBe(4);
      expect(report.aborted).toBe(false);
      expect(report.durationMs).toBeGreaterThanOrEqual(0);

      // Verify report was persisted to disk
      const cyclesFile = path.join(testTrainingDir, 'dream_state_cycles.jsonl');
      expect(fs.existsSync(cyclesFile)).toBe(true);
      const lines = fs.readFileSync(cyclesFile, 'utf-8').trim().split('\n');
      expect(lines.length).toBe(1);
      const savedReport = JSON.parse(lines[0]);
      expect(savedReport.cycleId).toBe(report.cycleId);

      expect(scheduler.getLatestReport()?.cycleId).toBe(report.cycleId);
    });

    it('honors abort signal during dream cycle', async () => {
      let callCount = 0;
      const slowShadowSimulator = {
        evaluateCandidate: vi.fn().mockImplementation(async (hyp) => {
          callCount++;
          if (callCount === 1) {
            scheduler.abortCurrentDreamCycle(); // Abort after first puzzle
          }
          return {
            command: hyp.command,
            sandboxedCommand: `/bin/zsh -lc '${hyp.command}'`,
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
            durationMs: 5,
            empiricalScore: 2.0,
            riskLevel: 'safe',
          };
        }),
      } as any;

      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
        shadowSimulator: slowShadowSimulator,
        dpoEngine,
      });

      const report = await scheduler.runDreamCycle({ force: true, maxPuzzles: 10 });
      expect(report.aborted).toBe(true);
      expect(report.puzzlesAttempted).toBeLessThan(10);
    });

    it('manages scheduler timer intervals correctly', () => {
      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
      });

      scheduler.startScheduler(5000);
      // Double call should be idempotent
      scheduler.startScheduler(5000);
      expect(scheduler.getIsDreaming()).toBe(false);

      scheduler.stopScheduler();
    });

    it('supplements fallback puzzles when scanned environment is minimal', () => {
      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
      });

      const emptyProfile: EnvironmentProfile = {
        installedTools: [],
        runningServices: [],
        activePorts: [],
        devToolchains: [],
        repositories: [],
        osVersion: 'macOS Darwin',
        scannedAt: Date.now(),
      };

      const puzzles = scheduler.generateCurriculum(emptyProfile, 10);
      expect(puzzles.length).toBe(6); // 4 default categories + 2 fallback puzzles
      expect(puzzles.some(p => p.targetEntity === 'top_cpu')).toBe(true);
      expect(puzzles.some(p => p.targetEntity === 'brew_outdated')).toBe(true);
    });

    it('falls back to second candidate if first candidate fails verification', async () => {
      let candidateAttempt = 0;
      const multiCandidateSimulator = {
        evaluateCandidate: vi.fn().mockImplementation(async (hyp) => {
          candidateAttempt++;
          if (candidateAttempt === 1) {
            return {
              command: hyp.command,
              sandboxedCommand: `/bin/zsh -lc '${hyp.command}'`,
              exitCode: 1, // First candidate fails
              stdout: '',
              stderr: 'syntax error',
              durationMs: 5,
              empiricalScore: -2.5,
              riskLevel: 'safe',
            };
          }
          return {
            command: hyp.command,
            sandboxedCommand: `/bin/zsh -lc '${hyp.command}'`,
            exitCode: 0, // Second candidate succeeds
            stdout: 'Listening on port 8847',
            stderr: '',
            durationMs: 5,
            empiricalScore: 2.0,
            riskLevel: 'safe',
          };
        }),
      } as any;

      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
        shadowSimulator: multiCandidateSimulator,
        dpoEngine,
      });

      const puzzle: SystemPuzzle = {
        id: 'fallback_puzzle',
        category: 'process_port',
        prompt: 'Inspect port 8847',
        targetEntity: 'port 8847',
        difficulty: 'basic',
        candidateTemplates: ['bad_cmd_syntax', 'lsof -i:8847'],
        expectedVerificationCriteria: { exitCode: 0, minOutputLength: 5 },
      };

      const res = await scheduler.solvePuzzle(puzzle);
      expect(res.isVerified).toBe(true);
      expect(res.attemptedCommand).toBe('lsof -i:8847');
      expect(candidateAttempt).toBe(2);
    });

    it('aborts unforced dream cycle when conditions are not met', async () => {
      scheduler = new DreamStateScheduler({
        storageDir: testTrainingDir,
        powerChecker: async () => ({ onAcPower: false, batteryLevelPercent: 30 }),
        idleChecker: async () => 100,
      });

      const report = await scheduler.runDreamCycle(); // No force
      expect(report.aborted).toBe(true);
      expect(report.abortReason).toContain('On battery power');
      expect(report.puzzlesAttempted).toBe(0);
    });

    it('provides singleton instance via getInstance', () => {
      const instance1 = DreamStateScheduler.getInstance();
      const instance2 = DreamStateScheduler.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
});
