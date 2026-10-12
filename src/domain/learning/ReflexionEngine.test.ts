import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReflexionEngine } from './ReflexionEngine';
import { KnowledgeDeficitLogger, KnowledgeDeficitRecord } from './KnowledgeDeficitLogger';
import { ShadowPtySimulator } from '../../ai/agent/ShadowPtySimulator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

    it('should synthesize lsof TCP socket search for the Antigravity ports deficit', async () => {
      const deficit = logger.logDeficit({
        goal: 'give me the list of the ports that is being used by antigravity',
        category: 'conversational_refusal',
        modelOutput: "I can't detect how many ports are being used by antigravity.",
        context: { os: 'mac', cwd: '/Users/test' }
      });

      const candidates = await engine.synthesizeCounterfactualCandidates(deficit);
      expect(candidates.length).toBeGreaterThanOrEqual(2);

      const lsofListen = candidates.find(c => c.command.includes('lsof -iTCP -sTCP:LISTEN -n -P | grep -i "antigravity"'));
      expect(lsofListen).toBeDefined();
      expect(lsofListen?.strategy).toBe('lsof_listen_grep');
    });

    it('should synthesize exact port queries for port 3000 deficit', async () => {
      const deficit = logger.logDeficit({
        goal: 'check what is running on port 3000',
        category: 'execution_failure',
        attemptedCommand: 'fuser 3000/tcp',
        exitCode: 127,
        context: { os: 'mac', cwd: '/Users/test' }
      });

      const candidates = await engine.synthesizeCounterfactualCandidates(deficit);
      const lsofPort = candidates.find(c => c.command === 'lsof -i :3000');
      expect(lsofPort).toBeDefined();
    });

    it('should synthesize port termination pipeline for kill port deficit', async () => {
      const deficit = logger.logDeficit({
        goal: 'kill whatever is on port 8080',
        category: 'execution_failure',
        context: { os: 'mac', cwd: '/Users/test' }
      });

      const candidates = await engine.synthesizeCounterfactualCandidates(deficit);
      const killPipeline = candidates.find(c => c.command.includes('lsof -ti:8080 | xargs kill -9'));
      expect(killPipeline).toBeDefined();
    });

    it('should synthesize pgrep for process inspection deficit', async () => {
      const deficit = logger.logDeficit({
        goal: 'inspect process postgres',
        category: 'execution_failure',
        context: { os: 'mac', cwd: '/Users/test' }
      });

      const candidates = await engine.synthesizeCounterfactualCandidates(deficit);
      const pgrepCandidate = candidates.find(c => c.command === 'pgrep -fil "postgres"');
      expect(pgrepCandidate).toBeDefined();
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
        context: { os: 'mac', cwd: '/Users/test' }
      });

      // Mock executor where lsof grep succeeds with simulated Antigravity socket output
      const mockExecutor = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
        const full = args.join(' ');
        if (full.includes('lsof -iTCP -sTCP:LISTEN -n -P | grep -i "antigravity"')) {
          return {
            stdout: 'antigravity 55432 pranav 12u IPv4 0xdeadbeef 0t0 TCP *:8847 (LISTEN)',
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
      expect(reflexionResult.verifiedCommand).toBe('lsof -iTCP -sTCP:LISTEN -n -P | grep -i "antigravity"');

      // Verify KnowledgeDeficitLogger has been updated to resolved
      const updatedDeficit = logger.getDeficitById(deficit.id);
      expect(updatedDeficit?.status).toBe('resolved');
      expect(updatedDeficit?.resolutionCounterfactual?.verifiedCommand).toBe('lsof -iTCP -sTCP:LISTEN -n -P | grep -i "antigravity"');
      expect(updatedDeficit?.resolutionCounterfactual?.source).toBe('reflexion');

      // Pending queue should now be empty
      expect(logger.getPendingDeficits().length).toBe(0);
    });

    it('should process entire pending queue sequentially', async () => {
      const logger = new KnowledgeDeficitLogger(testFile);

      logger.logDeficit({
        goal: 'inspect process node',
        category: 'execution_failure',
        context: { os: 'mac', cwd: '/Users/test' }
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
