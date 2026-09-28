/**
 * SentinelSerlCoordinator.test.ts — Full End-to-End Test Suite for SERL Coordinator
 * 
 * Verifies closed-loop synchronization across all 8 Tier 4 subsystems:
 * - ShadowPtySimulator (Phase 4.1)
 * - KnowledgeDeficitLogger (Phase 4.2)
 * - ReflexionEngine (Phase 4.3)
 * - DpoDatasetEngine (Phase 4.4)
 * - Rule Reward Oracle (Phase 4.5)
 * - ActivationSteeringManager (Phase 4.6)
 * - DreamStateScheduler (Phase 4.7)
 * - EmbeddedEngineManager & MLX LoRA Hot-Reload (Phase 4.8)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelSerlCoordinator } from './SentinelSerlCoordinator';
import { KnowledgeDeficitLogger } from './KnowledgeDeficitLogger';
import { DpoDatasetEngine } from './DpoDatasetEngine';
import { ActivationSteeringManager } from '../../ai/models/ActivationSteeringManager';
import { ReflexionEngine } from './ReflexionEngine';
import { DreamStateScheduler } from './DreamStateScheduler';
import { EmbeddedEngineManager } from '../../ai/models/EmbeddedEngineManager';
import { EpisodicMemoryEngine } from './EpisodicMemoryEngine';
import { ShadowPtySimulator } from '../../ai/agent/ShadowPtySimulator';

describe('SentinelSerlCoordinator — End-to-End Orchestrator', () => {
  let tempDir: string;
  let coordinator: SentinelSerlCoordinator;
  let deficitLogger: KnowledgeDeficitLogger;
  let dpoEngine: DpoDatasetEngine;
  let steeringManager: ActivationSteeringManager;
  let shadowSimulator: ShadowPtySimulator;
  let reflexionEngine: ReflexionEngine;
  let dreamScheduler: DreamStateScheduler;
  let embeddedEngine: EmbeddedEngineManager;
  let episodicMemory: EpisodicMemoryEngine;

  beforeEach(() => {
    tempDir = path.join('/tmp', `serl_coord_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const deficitsPath = path.join(tempDir, 'deficits.json');
    const dpoPath = path.join(tempDir, 'dpo_pairs.jsonl');

    deficitLogger = new KnowledgeDeficitLogger(deficitsPath);
    dpoEngine = new DpoDatasetEngine({ storageFilePath: dpoPath });
    steeringManager = new ActivationSteeringManager();
    shadowSimulator = new ShadowPtySimulator({ branchTimeoutMs: 1000, maxCandidates: 5 });

    reflexionEngine = new ReflexionEngine({
      deficitLogger,
      shadowSimulator,
    });

    dreamScheduler = new DreamStateScheduler({
      shadowSimulator,
      dpoEngine,
      deficitLogger,
    });

    embeddedEngine = new EmbeddedEngineManager();

    episodicMemory = new EpisodicMemoryEngine();

    coordinator = new SentinelSerlCoordinator({
      shadowSimulator,
      deficitLogger,
      reflexionEngine,
      dpoEngine,
      steeringManager,
      dreamScheduler,
      embeddedEngine,
      episodicMemory,
      commandExecutor: async (cmd: string) => ({
        stdout: `Executed: ${cmd}`,
        stderr: '',
        code: 0,
      }),
    });
  });

  afterEach(() => {
    coordinator.stopCoordinator();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  });

  describe('1. Model Refusal Interception', () => {
    it('intercepts canned refusal, logs deficit, and updates steering telemetry', async () => {
      const refusalText = "I apologize, but I cannot assist with modifying system network configurations.";
      const deficit = await coordinator.onModelRefusal(
        'turn off Wi-Fi interface',
        refusalText,
        { cwd: '/tmp', os: 'macos' }
      );

      expect(deficit).not.toBeNull();
      expect(deficit?.category).toBe('conversational_refusal');
      expect(deficit?.status).toBe('logged');

      const openDeficits = deficitLogger.getUnresolvedDeficits();
      expect(openDeficits.length).toBe(1);
      expect(openDeficits[0].goal).toBe('turn off Wi-Fi interface');

      const telemetry = steeringManager.getTelemetry();
      expect(telemetry.refusalsSuppressedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Command Failure Interception', () => {
    it('intercepts failed command executions and logs execution failure deficit', async () => {
      const deficit = await coordinator.onCommandExecutionFailure(
        'check disk health',
        'smartctl -a /dev/disk0',
        127,
        'smartctl: command not found',
        { cwd: '/tmp', os: 'macos' }
      );

      expect(deficit).not.toBeNull();
      expect(deficit?.category).toBe('execution_failure');
      expect(deficit?.exitCode).toBe(127);
      expect(deficit?.status).toBe('logged');
    });
  });

  describe('3. Human Demonstration Integration', () => {
    it('creates verified DPO pair, updates episodic memory, and auto-resolves matching deficits', async () => {
      // Step 1: Pre-populate an unresolved deficit
      await coordinator.onModelRefusal('flush dns cache', "I apologize, but I cannot execute dns flush commands.");
      expect(deficitLogger.getUnresolvedDeficits().length).toBe(1);

      // Step 2: Human demonstrates working command
      const pair = await coordinator.onHumanDemonstration(
        'flush dns cache',
        'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder'
      );

      expect(pair).toBeDefined();
      expect(pair.prompt).toBe('flush dns cache');
      expect(pair.metadata?.verifiedCommand).toBe('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');
      expect(pair.chosen).toContain('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');
      expect(pair.metadata?.category).toBe('human_demonstration');

      // Step 3: Verify deficit was resolved
      const unresolvedAfter = deficitLogger.getUnresolvedDeficits();
      expect(unresolvedAfter.length).toBe(0);

      // Step 4: Verify DPO pair is stored
      const allPairs = dpoEngine.getAllPairs();
      expect(allPairs.length).toBeGreaterThanOrEqual(1);
      expect(allPairs[0]?.metadata?.verifiedCommand).toBe('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');
    });
  });

  describe('4. Idle Processing & Reflexion Loop', () => {
    it('triggers background reflexion and syncs with DPO when terminal is idle', async () => {
      // Setup deficit that can be solved
      const deficit = deficitLogger.logDeficit({
        goal: 'print working directory',
        category: 'conversational_refusal',
        modelOutput: 'I do not have access to print directory',
        context: { os: 'macos', cwd: '/tmp' },
      });

      // Mock reflexion engine to simulate solving
      vi.spyOn(reflexionEngine, 'reflectOnDeficit').mockImplementation(async (d) => {
        deficitLogger.markResolved(d.id, {
          verifiedCommand: 'pwd',
          explanation: 'Verified directory print',
          resolvedAt: Date.now(),
          source: 'reflexion',
        });
        return {
          deficitId: d.id,
          success: true,
          originalGoal: d.goal,
          verifiedCommand: 'pwd',
          explanation: 'Verified directory print',
          candidateAttempts: [],
          durationMs: 50,
        };
      });

      // A short pause between keystrokes is not idleness
      await coordinator.onTerminalIdle(25);
      expect(reflexionEngine.reflectOnDeficit).not.toHaveBeenCalled();

      // Two and a half minutes idle on AC power
      await coordinator.onTerminalIdle(150);

      expect(reflexionEngine.reflectOnDeficit).toHaveBeenCalled();
      const pairs = dpoEngine.getAllPairs();
      expect(pairs.length).toBeGreaterThanOrEqual(1);
      expect(pairs.some(p => p.metadata?.verifiedCommand === 'pwd' || p.chosen.includes('pwd'))).toBe(true);
    });

    it('triggers dream cycle when idle duration exceeds 1200 seconds and power is eligible', async () => {
      vi.spyOn(dreamScheduler, 'checkPowerAndIdleConditions').mockResolvedValue({
        eligible: true,
        onAcPower: true,
        batteryLevelPercent: 100,
        idleSeconds: 1500,
      });

      const dreamSpy = vi.spyOn(dreamScheduler, 'runDreamCycle').mockResolvedValue({
        cycleId: 'cycle_test_1',
        startTime: Date.now() - 300,
        endTime: Date.now(),
        durationMs: 300,
        puzzlesGenerated: 5,
        puzzlesAttempted: 5,
        puzzlesSolved: 4,
        successRate: 0.8,
        dpoPairsAdded: 4,
        powerStatus: {
          onAcPower: true,
          batteryLevelPercent: 100,
        },
        aborted: false,
      });

      await coordinator.onTerminalIdle(1500);
      expect(dreamSpy).toHaveBeenCalled();
    });
  });

  describe('5. Native Distillation & LoRA Hot-Reload', () => {
    it('runs MLX fine-tuning in dryRun mode and hot-reloads LoRA adapter', async () => {
      vi.spyOn(embeddedEngine, 'hotReloadLora').mockResolvedValue(true);

      const result = await coordinator.triggerDistillationAndHotReload({ dryRun: true });
      expect(result.success).toBe(true);
      expect(result.adapterPath).toContain('sentinel_mlx_lora.gguf');
      expect(embeddedEngine.hotReloadLora).toHaveBeenCalled();
    });

    it('handles MLX execution errors gracefully', async () => {
      const failingCoordinator = new SentinelSerlCoordinator({
        shadowSimulator,
        deficitLogger,
        reflexionEngine,
        dpoEngine,
        steeringManager,
        dreamScheduler,
        embeddedEngine,
        commandExecutor: async () => {
          throw new Error('Metal GPU Out of Memory');
        },
      });

      const result = await failingCoordinator.triggerDistillationAndHotReload({ dryRun: false });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Metal GPU Out of Memory');
    });
  });

  describe('6. System Telemetry & Dashboard', () => {
    it('aggregates live telemetry from all SERL and Tier 5 oracles subsystems', async () => {
      const dashboard = await coordinator.getSystemDashboard();

      expect(dashboard).toBeDefined();
      expect(dashboard.status).toBe('active'); // markActivity was called or recently instantiated
      expect(dashboard.steering).toBeDefined();
      expect(dashboard.steering.refusalPenalty).toBe(-100.0);
      expect(dashboard.steering.actionBoost).toBe(3.5);
      expect(dashboard.deficits).toBeDefined();
      expect(dashboard.dpo).toBeDefined();
      expect(dashboard.dreamState).toBeDefined();
      expect(dashboard.engine).toBeDefined();

      // Tier 5 Oracles Metrics
      expect(dashboard.oracles).toBeDefined();
      expect(dashboard.oracles.tldrCommandsCount).toBeGreaterThanOrEqual(15);
      expect(dashboard.oracles.tldrRecipesCount).toBeGreaterThanOrEqual(50);
      expect(dashboard.oracles.deterministicRulesCount).toBeGreaterThanOrEqual(50);
      expect(dashboard.oracles.gbnfGrammarsAvailable).toBe(true);
      expect(dashboard.oracles.astParserActive).toBe(true);
    });
  });

  describe('7. Unified Intelligence Resolution Oracle (Tier 4 + Tier 5)', () => {
    it('resolves canonical recipes via TLDR Knowledge Base without LLM', async () => {
      const res = await coordinator.executeUnifiedResolution('flush dns cache', { os: 'macos', cwd: '/tmp' });
      expect(res.resolved).toBe(true);
      expect(res.source).toBe('tldr_oracle');
      expect(res.command).toContain('dscacheutil');
    });

    it('resolves previous command failures via Deterministic Rule Oracle without LLM', async () => {
      const res = await coordinator.executeUnifiedResolution('push current branch', {
        os: 'macos',
        cwd: '/tmp',
        previousFailedCmd: 'git push',
        previousStderr: 'fatal: The current branch feature-1 has no upstream branch.'
      });
      expect(res.resolved).toBe(true);
      expect(res.source).toBe('deterministic_rule_oracle');
      expect(res.command).toBe('git push --set-upstream origin feature-1');
    });

    it('falls back to hardware-constrained GBNF and steering when fast paths do not match', async () => {
      const res = await coordinator.executeUnifiedResolution('build complex custom deep neural network in rust', { os: 'macos', cwd: '/tmp' });
      expect(res.resolved).toBe(false);
      expect(res.source).toBe('needs_llm_inference');
      expect(res.grammar).toBeDefined();
      expect(res.grammar).toContain('root ::=');
      expect(res.logitBias).toBeDefined();
    });
  });

  describe('4b. Background work budget', () => {
    const buildCoordinator = (onAcPower: boolean) => new SentinelSerlCoordinator({
      shadowSimulator, deficitLogger, reflexionEngine, dpoEngine, steeringManager, dreamScheduler, embeddedEngine, episodicMemory,
      powerChecker: async () => ({ onAcPower, batteryLevelPercent: onAcPower ? 100 : 40 }),
    });

    it('does not reflect on battery power', async () => {
      deficitLogger.logDeficit({ goal: 'check battery', category: 'EXECUTION_ERROR' as any, attemptedCommand: 'acpi', stderr: 'acpi: command not found', context: { os: 'linux', cwd: '/tmp' } });
      const spy = vi.spyOn(reflexionEngine, 'reflectOnDeficit');
      await buildCoordinator(false).onTerminalIdle(300);
      expect(spy).not.toHaveBeenCalled();
    });

    it('reflects at most once per window', async () => {
      deficitLogger.logDeficit({ goal: 'check battery', category: 'EXECUTION_ERROR' as any, attemptedCommand: 'acpi', stderr: 'acpi: command not found', context: { os: 'linux', cwd: '/tmp' } });
      const spy = vi.spyOn(reflexionEngine, 'reflectOnDeficit').mockResolvedValue({ deficitId: 'x', success: false, originalGoal: '', candidateAttempts: [], durationMs: 1 } as any);
      const coordinatorOnAc = buildCoordinator(true);
      await coordinatorOnAc.onTerminalIdle(300);
      await coordinatorOnAc.onTerminalIdle(330);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('8. Coordinator Lifecycle', () => {
    it('starts and stops idle monitors and workers cleanly', () => {
      coordinator.startCoordinator(100);
      expect(coordinator['isStarted']).toBe(true);

      coordinator.markActivity();
      expect(coordinator['lastActivityTimestamp']).toBeGreaterThan(0);

      coordinator.stopCoordinator();
      expect(coordinator['isStarted']).toBe(false);
    });
  });

  describe('9. Replay Buffer for Nightly Training (Phase 0.75.10)', () => {
    it('builds mixed batch with fresh pairs and historical replay', async () => {
      // Add some pairs to DPO engine
      await dpoEngine.addPair({
        prompt: 'historical prompt 1',
        chosen: 'git status',
        rejected: 'echo no',
      });
      await dpoEngine.addPair({
        prompt: 'historical prompt 2',
        chosen: 'ls -la',
        rejected: 'echo fail',
      });

      const freshPairs = [
        {
          id: 'fresh-1',
          prompt: 'fresh prompt 1',
          chosen: 'docker ps',
          rejected: 'echo cant',
          source: 'reflexion' as const,
          timestamp: Date.now(),
        },
      ];

      const batch = coordinator.buildReplayBatch(freshPairs);
      expect(batch.length).toBeGreaterThanOrEqual(2);
      expect(batch.some(p => p.prompt === 'fresh prompt 1')).toBe(true);
      expect(batch.some(p => p.prompt.startsWith('historical prompt'))).toBe(true);

      const jsonl = coordinator.exportReplayBatchAsJsonl(freshPairs);
      expect(jsonl).toContain('fresh prompt 1');
      expect(jsonl).toContain('docker ps');
    });
  });

  describe('10. Automated Regression Gate (Phase 0.75.11)', () => {
    it('passes regression gate when tool test cases are structurally valid', async () => {
      const gateResult = await coordinator.runRegressionGate('/tmp/test_adapter.gguf', 0.80);
      expect(gateResult.passed).toBe(true);
      expect(gateResult.accuracy).toBeGreaterThanOrEqual(0.80);
      expect(gateResult.totalCases).toBeGreaterThan(0);
    });

    it('blocks promotion and returns failure when gate fails', async () => {
      // Run distillation with impossible threshold (1.01 = 101%)
      const res = await coordinator.triggerDistillationAndHotReload({
        dryRun: true,
        regressionThreshold: 1.01,
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Regression gate failed');
      expect(res.regressionGate).toBeDefined();
      expect(res.regressionGate!.passed).toBe(false);
    });
  });

  describe('11. Model Manifest & Rollback Integration (Phase 0.75.12)', () => {
    it('integrates with ModelManifestManager and exposes manifest manager instance', () => {
      const manifestMgr = coordinator.getManifestManager();
      expect(manifestMgr).toBeDefined();
      expect(manifestMgr.getActiveVersion('coder')).toBeDefined();
      expect(manifestMgr.getActiveVersion('intent')).toBeDefined();
    });

    it('handles rollback gracefully when no older adapter version exists', async () => {
      const res = await coordinator.handleModelRollback('intent');
      expect(res.success).toBe(false);
      expect(res.error).toContain('No previous intent adapter version available');
    });

    it('rolls back successfully to previous version when registered', async () => {
      const manifestMgr = coordinator.getManifestManager();
      manifestMgr.registerVersion('coder', '/tmp/c1.gguf', { version: 'sentinel-coder-v2.1.0', passedRegressionGate: true });
      manifestMgr.registerVersion('coder', '/tmp/c2.gguf', { version: 'sentinel-coder-v2.2.0', passedRegressionGate: true });

      const res = await coordinator.handleModelRollback('coder');
      expect(res.success).toBe(true);
      expect(res.rolledBackTo).toBe('sentinel-coder-v2.1.0');
    });
  });
});
