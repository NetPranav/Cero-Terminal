import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KnowledgeDeficitLogger } from './KnowledgeDeficitLogger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('KnowledgeDeficitLogger — Runtime Knowledge Deficit Logger', () => {
  const testDir = path.join(os.tmpdir(), `cero_test_deficit_${Date.now()}`);
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

  describe('Deficit Detection Engine', () => {
    const logger = new KnowledgeDeficitLogger(testFile);

    it('should detect conversational excuses (exact Antigravity ports example)', () => {
      const result = logger.detectDeficit({
        goal: 'give me the list of the ports that is being used by antigravity',
        modelOutput: "I can't detect how many ports are being used by antigravity."
      });

      expect(result.isDeficit).toBe(true);
      expect(result.category).toBe('conversational_refusal');
      expect(result.reason).toContain('conversational excuse');
    });

    it('should detect chatbot refusal patterns', () => {
      const result1 = logger.detectDeficit({
        goal: 'check battery health',
        modelOutput: "I don't have access to your system terminal to check hardware health."
      });
      expect(result1.isDeficit).toBe(true);
      expect(result1.category).toBe('conversational_refusal');

      const result2 = logger.detectDeficit({
        goal: 'list active processes',
        modelOutput: 'As an AI language model, I cannot interact with your operating system.'
      });
      expect(result2.isDeficit).toBe(true);
    });

    it('should detect command execution failures via non-zero exit codes', () => {
      const result = logger.detectDeficit({
        goal: 'check ports with fuser',
        attemptedCommand: 'fuser 3000/tcp',
        exitCode: 127,
        stderr: 'zsh: command not found: fuser'
      });

      expect(result.isDeficit).toBe(true);
      expect(result.category).toBe('execution_failure');
      expect(result.reason).toContain('127');
    });

    it('should detect hallucinated completion without command execution', () => {
      const result = logger.detectDeficit({
        goal: 'clean all node_modules on desktop',
        modelOutput: 'All node_modules have been deleted from your desktop.',
        steps: []
      });

      expect(result.isDeficit).toBe(true);
      expect(result.category).toBe('hallucinated_completion');
    });

    it('should not flag successful actionable commands as deficits', () => {
      const result = logger.detectDeficit({
        goal: 'check macos version',
        modelOutput: '{"action": "done", "summary": "macOS 15.0"}',
        exitCode: 0,
        steps: [{ tool: 'shell.execute', params: { command: 'sw_vers' }, result: { success: true, data: { stdout: '15.0', code: 0 } } }]
      });

      expect(result.isDeficit).toBe(false);
    });
  });

  describe('Entity & Intent Extraction', () => {
    const logger = new KnowledgeDeficitLogger(testFile);

    it('should extract application entity and port_inspection intent for Antigravity ports query', () => {
      const { targetEntity, intent } = logger.extractEntityAndIntent(
        'give me the list of the ports that is being used by antigravity'
      );
      expect(targetEntity).toBe('antigravity');
      expect(intent).toBe('port_inspection');
    });

    it('should extract port entity and port_termination intent', () => {
      const { targetEntity, intent } = logger.extractEntityAndIntent(
        'kill whatever is running on port 3000'
      );
      expect(targetEntity).toBe('port 3000');
      expect(intent).toBe('port_termination');
    });

    it('should extract process inspection intent', () => {
      const { targetEntity, intent } = logger.extractEntityAndIntent(
        'inspect process postgres'
      );
      expect(targetEntity).toBe('postgres');
      expect(intent).toBe('process_inspection');
    });

    it('should extract file search intent and filename', () => {
      const { targetEntity, intent } = logger.extractEntityAndIntent(
        'find file named config.json'
      );
      expect(targetEntity).toBe('config.json');
      expect(intent).toBe('file_search');
    });

    it('should extract hardware management intent', () => {
      const { targetEntity, intent } = logger.extractEntityAndIntent(
        'turn on bluetooth'
      );
      expect(targetEntity).toBe('bluetooth');
      expect(intent).toBe('hardware_management');
    });
  });

  describe('Logging, Deduplication & Storage Persistence', () => {
    it('should log a knowledge deficit and write to JSONL file', () => {
      const logger = new KnowledgeDeficitLogger(testFile);
      const record = logger.logDeficit({
        goal: 'give me the list of the ports that is being used by antigravity',
        category: 'conversational_refusal',
        modelOutput: "I can't detect how many ports are being used by antigravity.",
        context: { os: 'mac', cwd: '/Users/pranav' }
      });

      expect(record.id).toBeDefined();
      expect(record.status).toBe('logged');
      expect(record.context.targetEntity).toBe('antigravity');
      expect(record.context.intent).toBe('port_inspection');
      expect(record.occurrenceCount).toBe(1);

      // Verify file written to disk
      expect(fs.existsSync(testFile)).toBe(true);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toContain('antigravity');
      expect(content).toContain('port_inspection');
    });

    it('should deduplicate repeated deficits and increment occurrence count', () => {
      const logger = new KnowledgeDeficitLogger(testFile);
      const first = logger.logDeficit({
        goal: 'give me the list of the ports that is being used by antigravity',
        category: 'conversational_refusal',
        modelOutput: "I can't detect how many ports are being used by antigravity.",
        context: { os: 'mac', cwd: '/Users/pranav' }
      });

      const second = logger.logDeficit({
        goal: 'give me the list of the ports that is being used by antigravity',
        category: 'conversational_refusal',
        modelOutput: "I cannot inspect antigravity ports.",
        context: { os: 'mac', cwd: '/Users/pranav' }
      });

      expect(second.id).toBe(first.id);
      expect(second.occurrenceCount).toBe(2);
      expect(logger.getAllDeficits().length).toBe(1);
    });

    it('should load persisted deficits on initialization', () => {
      // First instance writes to disk
      const logger1 = new KnowledgeDeficitLogger(testFile);
      logger1.logDeficit({
        goal: 'kill process rogue_daemon',
        category: 'execution_failure',
        exitCode: 1,
        stderr: 'No such process',
        context: { os: 'mac', cwd: '/Users/pranav' }
      });

      // Second instance loads from disk
      const logger2 = new KnowledgeDeficitLogger(testFile);
      const all = logger2.getAllDeficits();
      expect(all.length).toBe(1);
      expect(all[0].goal).toBe('kill process rogue_daemon');
      expect(all[0].context.intent).toBe('process_termination');
    });
  });

  describe('Query & Resolution APIs', () => {
    it('should return pending deficits and allow marking as resolved with counterfactual', () => {
      const logger = new KnowledgeDeficitLogger(testFile);
      const record = logger.logDeficit({
        goal: 'give me the list of the ports that is being used by antigravity',
        category: 'conversational_refusal',
        modelOutput: "I can't detect how many ports are being used by antigravity.",
        context: { os: 'mac', cwd: '/Users/pranav' }
      });

      // Query pending deficits
      const pending = logger.getPendingDeficits();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe(record.id);

      // Mark resolved with verified counterfactual discovered by ReflexionEngine
      const resolved = logger.markResolved(record.id, {
        verifiedCommand: 'lsof -iTCP -sTCP:LISTEN -n -P | grep -i antigravity',
        explanation: 'List active listening ports for antigravity',
        resolvedAt: Date.now(),
        source: 'reflexion'
      });

      expect(resolved).toBe(true);

      // Pending deficits should now be empty
      expect(logger.getPendingDeficits().length).toBe(0);

      // Deficit record should retain resolution counterfactual
      const updated = logger.getDeficitById(record.id);
      expect(updated?.status).toBe('resolved');
      expect(updated?.resolutionCounterfactual?.verifiedCommand).toBe('lsof -iTCP -sTCP:LISTEN -n -P | grep -i antigravity');
    });
  });
});
