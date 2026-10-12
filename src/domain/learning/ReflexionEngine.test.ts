import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReflexionEngine } from './ReflexionEngine';
import { KnowledgeDeficitLogger, KnowledgeDeficitRecord } from './KnowledgeDeficitLogger';
import { ShadowPtySimulator } from '../../ai/agent/ShadowPtySimulator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LISTEN_BY_PROCESS = "Get-NetTCPConnection -State Listen | Where-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -like '*antigravity*' } | Select-Object LocalAddress,LocalPort,OwningProcess";

describe('ReflexionEngine — Autonomous Background Reflexion & Counterfactual Synthesis', () => {
  const testDir = path.join(os.tmpdir(), `cero_test_reflexion_${Date.now()}`);
  const testFile = path.join(testDir, 'knowledge_deficits.jsonl');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Counterfactual Candidate Synthesis', () => {
    const logger = new KnowledgeDeficitLogger(testFile);
    const engine = new ReflexionEngine({ deficitLogger: logger });

    it('should synthesize a listening-port search by process for the Antigravity ports deficit', async () => {
      const deficit = logger.logDeficit({
        goal: 'give me the list of the ports that is being used by antigravity',
        category: 'conversational_refusal',
        modelOutput: "I can't detect how many ports are being used by antigravity.",
        context: { os: 'windows', cwd: 'C:\\Users\\test' }
      });

      const candidates = await engine.synthesizeCounterfactualCandidates(deficit);
      expect(candidates.length).toBeGreaterThanOrEqual(2);

      const listen = candidates.find(c => c.command === LISTEN_BY_PROCESS);
      expect(listen).toBeDefined();
      expect(listen?.strategy).toBe('tcp_listen_by_process');
    });

    it('should synthesize exact port queries for port 3000 deficit', async () => {
      const deficit = logger.logDeficit({
        goal: 'check what is running on port 3000',
        category: 'execution_failure',
        attemptedCommand: 'fuser 3000/tcp',
        exitCode: 127,
        context: { os: 'windows', cwd: 'C:\\Users\\test' }
      });

      const candidates = await engine.synthesizeCounterfactualCandidates(deficit);
      const byPort = candidates.find(c => c.command.startsWith('Get-NetTCPConnection -LocalPort 3000 '));
      expect(byPort).toBeDefined();
    });

    it('should synthesize port termination pipeline for kill port deficit', async () => {
      const deficit = logger.logDeficit({
        goal: 'kill whatever is on port 8080',
        category: 'execution_failure',
        context: { os: 'windows', cwd: 'C:\\Users\\test' }
      });

      const candidates = await engine.synthesizeCounterfactualCandidates(deficit);
      const stop = candidates.find(c => c.command.includes('-LocalPort 8080 -State Listen') && c.command.includes('Stop-Process -Id $_.OwningProcess -Force'));
      expect(stop).toBeDefined();
    });

    it('should synthesize Get-Process for process inspection deficit', async () => {
      const deficit = logger.logDeficit({
        goal: 'inspect process postgres',
        category: 'execution_failure',
        context: { os: 'windows', cwd: 'C:\\Users\\test' }
      });

      const candidates = await engine.synthesizeCounterfactualCandidates(deficit);
      const getProcess = candidates.find(c => c.command === "Get-Process -Name '*postgres*' -ErrorAction SilentlyContinue");
      expect(getProcess).toBeDefined();
    });
  });

  describe('Sandboxed Reflexion & Deficit Resolution', () => {
    it('should evaluate candidates in sandbox, select winner, and mark deficit resolved', async () => {
      const logger = new KnowledgeDeficitLogger(testFile);

      // Log the Antigravity ports deficit
      const deficit = logger.logDeficit({
        goal: 'give me the list of the ports that is being used by antigravity',
        category: 'conversational_refusal',
        modelOutput: "I can't detect how many ports are being used by antigravity.",
        context: { os: 'windows', cwd: 'C:\\Users\\test' }
      });

      // Mock executor where the listening-port search finds the Antigravity socket
      const mockExecutor = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
        const full = args.join(' ');
        // The command arrives wrapped in the sandbox's syntax check, so match its parts
        if (full.includes('Get-NetTCPConnection -State Listen') && full.includes('antigravity')) {
          return {
            stdout: '127.0.0.1    8847    55432',
            stderr: '',
            code: 0
          };
        }
        return { stdout: '', stderr: 'no process found', code: 1 };
      });

      const shadowSimulator = new ShadowPtySimulator({ executor: mockExecutor });
      const engine = new ReflexionEngine({
        deficitLogger: logger,
        shadowSimulator
      });

      const reflexionResult = await engine.reflectOnDeficit(deficit);

      expect(reflexionResult.success).toBe(true);
      expect(reflexionResult.verifiedCommand).toBe(LISTEN_BY_PROCESS);

      // Verify KnowledgeDeficitLogger has been updated to resolved
      const updatedDeficit = logger.getDeficitById(deficit.id);
      expect(updatedDeficit?.status).toBe('resolved');
      expect(updatedDeficit?.resolutionCounterfactual?.verifiedCommand).toBe(LISTEN_BY_PROCESS);
      expect(updatedDeficit?.resolutionCounterfactual?.source).toBe('reflexion');

      // Pending queue should now be empty
      expect(logger.getPendingDeficits().length).toBe(0);
    });

    it('should process entire pending queue sequentially', async () => {
      const logger = new KnowledgeDeficitLogger(testFile);

      logger.logDeficit({
        goal: 'inspect process node',
        category: 'execution_failure',
        context: { os: 'windows', cwd: 'C:\\Users\\test' }
      });

      const mockExecutor = vi.fn().mockResolvedValue({
        stdout: '4190 node',
        stderr: '',
        code: 0
      });

      const shadowSimulator = new ShadowPtySimulator({ executor: mockExecutor });
      const engine = new ReflexionEngine({ deficitLogger: logger, shadowSimulator });

      const results = await engine.processPendingQueue(5);
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(logger.getPendingDeficits().length).toBe(0);
    });
  });

  describe('Idle Worker Lifecycle', () => {
    it('should start and stop idle worker cleanly', () => {
      const logger = new KnowledgeDeficitLogger(testFile);
      const engine = new ReflexionEngine({ deficitLogger: logger });

      expect(engine.isWorkerRunning()).toBe(false);

      engine.startIdleWorker(1000);
      expect(engine.isWorkerRunning()).toBe(true);

      engine.stopIdleWorker();
      expect(engine.isWorkerRunning()).toBe(false);
    });
  });
});
