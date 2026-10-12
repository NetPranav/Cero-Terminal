import { describe, it, expect } from 'vitest';
import { GbnfGrammarManager } from './GbnfGrammarManager';

describe('GbnfGrammarManager (Phase 5.3 — GBNF Constrained Decoding)', () => {
  const manager = GbnfGrammarManager.getInstance();

  describe('Pre-compiled GBNF Grammars', () => {
    it('provides valid CERO_ACTION GBNF grammar definition', () => {
      const gbnf = GbnfGrammarManager.getGrammar('CERO_ACTION');

      expect(gbnf).toContain('root ::= action-execute | action-done');
      expect(gbnf).toContain('\\"action\\"');
      expect(gbnf).toContain('\\"execute\\"');
      expect(gbnf).toContain('\\"command\\"');
      expect(gbnf).toContain('\\"explanation\\"');
      expect(gbnf).toContain('\\"done\\"');
      expect(gbnf).toContain('\\"summary\\"');
      expect(gbnf).toContain('string ::=');
      expect(gbnf).toContain('ws ::=');
    });

    it('provides valid CERO_PLANNER GBNF grammar definition', () => {
      const gbnf = GbnfGrammarManager.getGrammar('CERO_PLANNER');

      expect(gbnf).toContain('root ::=');
      expect(gbnf).toContain('\\"decision\\"');
      expect(gbnf).toContain('\\"plan\\"');
      expect(gbnf).toContain('\\"clarify\\"');
      expect(gbnf).toContain('\\"summary\\"');
      expect(gbnf).toContain('\\"steps\\"');
      expect(gbnf).toContain('string-list ::=');
    });

    it('provides valid STRICT_JSON GBNF grammar definition', () => {
      const gbnf = GbnfGrammarManager.getGrammar('STRICT_JSON');

      expect(gbnf).toContain('root ::= object | array');
      expect(gbnf).toContain('pair ::= string ws ":" ws value');
      expect(gbnf).toContain('number ::=');
    });
  });

  describe('Grammar Output Validation', () => {
    it('validates strictly compliant execute action output', () => {
      const output = JSON.stringify({
        action: 'execute',
        command: 'lsof -i :3000',
        explanation: 'Inspect port 3000 listening process'
      });

      const res = manager.validateOutput(output, 'CERO_ACTION');
      expect(res.valid).toBe(true);
      expect(res.parsed.action).toBe('execute');
      expect(res.parsed.command).toBe('lsof -i :3000');
    });

    it('validates strictly compliant done action output', () => {
      const output = JSON.stringify({
        action: 'done',
        summary: 'All test suites completed successfully.'
      });

      const res = manager.validateOutput(output, 'CERO_ACTION');
      expect(res.valid).toBe(true);
      expect(res.parsed.action).toBe('done');
      expect(res.parsed.summary).toContain('successfully');
    });

    it('rejects conversational chatbot apologies prohibited by GBNF grammar', () => {
      const output = "I'm sorry, but as an AI language model, I do not have direct access to your local machine.";

      const res = manager.validateOutput(output, 'CERO_ACTION');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('prohibited by grammar');
    });

    it('rejects markdown code fences prohibited by hardware-level GBNF grammar', () => {
      const output = '```json\n{"action": "execute", "command": "ls", "explanation": "list files"}\n```';

      const res = manager.validateOutput(output, 'CERO_ACTION');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('prohibited by grammar');
    });

    it('rejects invalid action types', () => {
      const output = JSON.stringify({
        action: 'browse_web',
        url: 'https://google.com'
      });

      const res = manager.validateOutput(output, 'CERO_ACTION');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid action type');
    });

    it('rejects execute actions missing command or explanation string', () => {
      const output = JSON.stringify({
        action: 'execute',
        command: 'ls'
        // missing explanation
      });

      const res = manager.validateOutput(output, 'CERO_ACTION');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('missing valid command or explanation');
    });

    it('validates compliant planner decision output', () => {
      const output = JSON.stringify({
        decision: 'plan',
        summary: 'Scaffold project and install dependencies',
        steps: [
          'mkdir my_app',
          'cd my_app && npm init -y',
          'npm install vite'
        ]
      });

      const res = manager.validateOutput(output, 'CERO_PLANNER');
      expect(res.valid).toBe(true);
      expect(res.parsed.decision).toBe('plan');
      expect(res.parsed.steps.length).toBe(3);
    });
  });

  describe('Dynamic JSON Schema Compilation', () => {
    it('compiles custom JSON Schema into valid GBNF grammar string', () => {
      const schema = {
        type: 'object',
        properties: {
          target: { type: 'string' },
          port: { type: 'number' },
          protocol: { type: 'string', enum: ['tcp', 'udp'] }
        },
        required: ['target', 'port']
      };

      const compiled = manager.compileJsonSchema(schema);
      expect(compiled).toContain('root ::=');
      expect(compiled).toContain('\\"target\\"');
      expect(compiled).toContain('\\"port\\"');
      expect(compiled).toContain('tcp');
      expect(compiled).toContain('udp');
    });
  });

  describe('Fallback Output Sanitization', () => {
    it('sanitizes markdown fences and thinking tokens from non-GBNF providers', () => {
      const raw = '<think>Let me plan this</think>\n```json\n{"action": "done", "summary": "Finished"}\n```';
      const clean = manager.sanitizeFallbackOutput(raw);
      expect(clean).toBe('{"action": "done", "summary": "Finished"}');
    });
  });
});
