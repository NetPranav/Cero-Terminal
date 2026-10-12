import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DpoDatasetEngine } from './DpoDatasetEngine';
import { KnowledgeDeficitLogger } from './KnowledgeDeficitLogger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('DpoDatasetEngine — Direct Preference Optimization (DPO) Pair Generator', () => {
  const testDir = path.join(os.tmpdir(), `cero_test_dpo_${Date.now()}`);
  const testFile = path.join(testDir, 'cero_dpo_pairs.jsonl');
  const deficitFile = path.join(testDir, 'knowledge_deficits.jsonl');

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

  describe('DPO Pair Construction from Resolved Deficits', () => {
    it('should construct high-quality DPO pair from the Antigravity ports resolved deficit', () => {
      const logger = new KnowledgeDeficitLogger(deficitFile);
      const dpoEngine = new DpoDatasetEngine({ storageFilePath: testFile, deficitLogger: logger });

      // 1. Log deficit
      const deficit = logger.logDeficit({
        goal: 'give me the list of the ports that is being used by antigravity',
        category: 'conversational_refusal',
        modelOutput: "I can't detect how many ports are being used by antigravity.",
        context: { os: 'mac', cwd: '/Users/test' }
      });

      // 2. Mark resolved by Reflexion Engine
      logger.markResolved(deficit.id, {
        verifiedCommand: 'lsof -iTCP -sTCP:LISTEN -n -P | grep -i antigravity',
        explanation: 'List active listening ports for antigravity',
        resolvedAt: Date.now(),
        source: 'reflexion'
      });

      const resolvedDeficit = logger.getDeficitById(deficit.id)!;
      const pair = dpoEngine.createPairFromDeficit(resolvedDeficit);

      expect(pair).not.toBeNull();
      expect(pair?.prompt).toBe('give me the list of the ports that is being used by antigravity');
      expect(pair?.rejected).toBe("I can't detect how many ports are being used by antigravity.");
      expect(pair?.chosen).toContain('lsof -iTCP -sTCP:LISTEN -n -P | grep -i antigravity');
      expect(pair?.metadata?.targetEntity).toBe('antigravity');
      expect(pair?.metadata?.intent).toBe('port_inspection');

      // Verify file written to disk
      expect(fs.existsSync(testFile)).toBe(true);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toContain('antigravity');
      expect(content).toContain('lsof');
    });

    it('should return null when trying to create pair from an unresolved deficit', () => {
      const logger = new KnowledgeDeficitLogger(deficitFile);
      const dpoEngine = new DpoDatasetEngine({ storageFilePath: testFile });

      const deficit = logger.logDeficit({
        goal: 'check port 3000',
        category: 'execution_failure',
        context: { os: 'mac', cwd: '/Users/test' }
      });

      const pair = dpoEngine.createPairFromDeficit(deficit);
      expect(pair).toBeNull();
    });
  });

  describe('DPO Pair Construction from Human Correction', () => {
    it('should construct DPO pair from user correction or demonstration', () => {
      const dpoEngine = new DpoDatasetEngine({ storageFilePath: testFile });

      const pair = dpoEngine.createPairFromCorrection({
        prompt: 'find all tsx files',
        chosenCommand: 'mdfind -name ".tsx"',
        rejectedCommandOrResponse: 'find . -name "*.tsx"',
        explanation: 'Fast Spotlight search for tsx files'
      });

      expect(pair).toBeDefined();
      expect(pair.prompt).toBe('find all tsx files');
      expect(JSON.parse(pair.chosen).command).toBe('mdfind -name ".tsx"');
      expect(JSON.parse(pair.rejected).command).toBe('find . -name "*.tsx"');
      expect(pair.metadata?.source).toBe('human_demonstration');
    });
  });

  describe('Auto-Sync & Deduplication', () => {
    it('should auto-sync all resolved deficits from KnowledgeDeficitLogger and avoid duplicate entries', () => {
      const logger = new KnowledgeDeficitLogger(deficitFile);
      const dpoEngine = new DpoDatasetEngine({ storageFilePath: testFile, deficitLogger: logger });

      // Log and resolve two deficits
      const d1 = logger.logDeficit({
        goal: 'check port 3000',
        category: 'execution_failure',
        context: { os: 'mac', cwd: '/Users/test' }
      });
      logger.markResolved(d1.id, {
        verifiedCommand: 'lsof -i :3000',
        explanation: 'Inspect port 3000',
        resolvedAt: Date.now()
      });

      const d2 = logger.logDeficit({
        goal: 'inspect process postgres',
        category: 'execution_failure',
        context: { os: 'mac', cwd: '/Users/test' }
      });
      logger.markResolved(d2.id, {
        verifiedCommand: 'pgrep -fil "postgres"',
        explanation: 'Inspect postgres process',
        resolvedAt: Date.now()
      });

      // First sync
      const syncedCount = dpoEngine.syncWithDeficitLogger(logger);
      expect(syncedCount).toBe(2);
      expect(dpoEngine.getAllPairs().length).toBe(2);

      // Second sync should update/deduplicate without creating duplicate entries
      const secondSyncCount = dpoEngine.syncWithDeficitLogger(logger);
      expect(secondSyncCount).toBe(2);
      expect(dpoEngine.getAllPairs().length).toBe(2);
    });
  });

  describe('Conversational Export & Dataset Statistics', () => {
    it('should export pairs into Apple Silicon MLX / ChatML conversational format', () => {
      const dpoEngine = new DpoDatasetEngine({ storageFilePath: testFile });

      dpoEngine.createPairFromCorrection({
        prompt: 'kill port 3000',
        chosenCommand: 'lsof -ti:3000 | xargs kill -9',
        rejectedCommandOrResponse: 'killall node'
      });

      const conversational = dpoEngine.exportConversational();
      expect(conversational.length).toBe(1);
      expect(conversational[0].system).toContain('Cero');
      expect(conversational[0].prompt).toBe('kill port 3000');
      expect(conversational[0].chosen.role).toBe('assistant');
      expect(conversational[0].chosen.content).toContain('lsof -ti:3000 | xargs kill -9');
      expect(conversational[0].rejected.role).toBe('assistant');
      expect(conversational[0].rejected.content).toContain('killall node');
    });

    it('should provide dataset statistics', () => {
      const dpoEngine = new DpoDatasetEngine({ storageFilePath: testFile });

      dpoEngine.createPairFromCorrection({
        prompt: 'task a',
        chosenCommand: 'cmd_a',
        rejectedCommandOrResponse: 'bad_a',
        category: 'conversational_refusal'
      });

      dpoEngine.createPairFromCorrection({
        prompt: 'task b',
        chosenCommand: 'cmd_b',
        rejectedCommandOrResponse: 'bad_b',
        category: 'execution_failure'
      });

      const stats = dpoEngine.getStats();
      expect(stats.totalPairs).toBe(2);
      expect(stats.categoryCounts['conversational_refusal']).toBe(1);
      expect(stats.categoryCounts['execution_failure']).toBe(1);
    });
  });
});
