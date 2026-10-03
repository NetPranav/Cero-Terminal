import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseArgs, formatData, runPrompt, CliOptions } from '../../../scripts/agent-cli';
import { NodeTauriBridge, CommandExecutionRecord } from '../../infrastructure/execution/NodeTauriBridge';
import { AgentLoop } from './AgentLoop';

describe('Cero CLI Runner & Inspection Harness Suite', () => {
  beforeEach(() => {
    NodeTauriBridge.install();
  });

  // =========================================================================
  // 1. CLI Argument Parsing & Option Flags
  // =========================================================================
  describe('1. CLI Argument Parsing', () => {
    it('parses natural language prompts correctly without flags', () => {
      const opts = parseArgs(['what', 'is', 'my', 'battery', 'level']);
      expect(opts.prompt).toBe('what is my battery level');
      expect(opts.verbose).toBe(false);
      expect(opts.json).toBe(false);
      expect(opts.dryRun).toBe(false);
      expect(opts.autoApprove).toBe(false);
    });

    it('parses --verbose and -v flags', () => {
      const opts1 = parseArgs(['--verbose', 'check', 'ports']);
      expect(opts1.verbose).toBe(true);
      expect(opts1.prompt).toBe('check ports');

      const opts2 = parseArgs(['-v', 'check', 'ports']);
      expect(opts2.verbose).toBe(true);
      expect(opts2.prompt).toBe('check ports');
    });

    it('parses --json flag for automated headless output', () => {
      const opts = parseArgs(['--json', 'system', 'summary']);
      expect(opts.json).toBe(true);
      expect(opts.prompt).toBe('system summary');
    });

    it('parses --dry-run flag for safe execution simulation', () => {
      const opts = parseArgs(['--dry-run', 'delete', 'old', 'logs']);
      expect(opts.dryRun).toBe(true);
      expect(opts.prompt).toBe('delete old logs');
    });

    it('parses --auto-approve and --ci flags for non-interactive execution', () => {
      const opts1 = parseArgs(['--auto-approve', 'run', 'pipeline']);
      expect(opts1.autoApprove).toBe(true);

      const opts2 = parseArgs(['--ci', 'run', 'pipeline']);
      expect(opts2.autoApprove).toBe(true);
    });

    it('parses custom --cwd working directory flag', () => {
      const opts = parseArgs(['--cwd', '/var/log', 'tail', 'syslog']);
      expect(opts.cwd).toBe('/var/log');
      expect(opts.prompt).toBe('tail syslog');
    });

    it('handles combined complex CLI flags', () => {
      const opts = parseArgs(['-v', '--json', '--dry-run', '--ci', '--cwd', '/home/user/project', 'build', 'frontend']);
      expect(opts.verbose).toBe(true);
      expect(opts.json).toBe(true);
      expect(opts.dryRun).toBe(true);
      expect(opts.autoApprove).toBe(true);
      expect(opts.cwd).toBe('/home/user/project');
      expect(opts.prompt).toBe('build frontend');
    });
  });

  // =========================================================================
  // 2. Data Formatter Helpers
  // =========================================================================
  describe('2. Data Formatter Helpers', () => {
    it('formats string arrays into bulleted lists', () => {
      const items = ['item1', 'item2', 'item3'];
      const formatted = formatData(items);
      expect(formatted).toContain('• item1');
      expect(formatted).toContain('• item2');
      expect(formatted).toContain('• item3');
    });

    it('truncates oversized array lists with omission count notice', () => {
      const items = Array.from({ length: 30 }, (_, i) => `file_${i + 1}.ts`);
      const formatted = formatData(items);
      expect(formatted).toContain('• file_1.ts');
      expect(formatted).toContain('... and 10 more items');
    });

    it('formats key-value objects neatly', () => {
      const data = { cpu: '4 cores', ram: '16GB', status: 'online' };
      const formatted = formatData(data);
      expect(formatted).toContain('cpu');
      expect(formatted).toContain('4 cores');
      expect(formatted).toContain('ram');
      expect(formatted).toContain('16GB');
    });

    it('handles empty, null, or undefined data gracefully', () => {
      expect(formatData(null)).toBe('');
      expect(formatData(undefined)).toBe('');
      expect(formatData([])).toContain('empty list');
    });
  });

  // =========================================================================
  // 3. NodeTauriBridge Execution & Command Recording
  // =========================================================================
  describe('3. NodeTauriBridge Execution & Command Recording', () => {
    it('captures command execution records through listener', async () => {
      const recorded: CommandExecutionRecord[] = [];
      const unlisten = NodeTauriBridge.onCommand((rec) => {
        recorded.push(rec);
      });

      // Execute a real, safe command via the bridge
      const res = await NodeTauriBridge.execute('echo "bridge test"');
      unlisten();

      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe('bridge test');
      expect(recorded.length).toBeGreaterThanOrEqual(1);
      // Bridge routes bare commands through sh -c, so fullCommand reflects that
      expect(recorded[0].fullCommand).toContain('echo "bridge test"');
      expect(recorded[0].code).toBe(0);
      expect(recorded[0].durationMs).toBeGreaterThan(0);
    });

    it('handles non-zero exit codes accurately', async () => {
      const res = await NodeTauriBridge.execute('false');
      expect(res.code).toBe(1);
    });
  });

  // =========================================================================
  // 4. CLI runPrompt Orchestration
  // =========================================================================
  describe('4. CLI runPrompt Orchestration', () => {
    it('executes prompt through agent loop and returns structured result', async () => {
      const mockAgentLoop = {
        run: vi.fn().mockResolvedValue({
          success: true,
          summary: 'Processed successfully',
          steps: [{ tool: 'shell.execute', params: { command: 'echo "hi"' }, result: { success: true } }],
          cdPath: undefined
        }),
        onEvent: vi.fn(),
        setAuthorizationHandler: vi.fn()
      } as unknown as AgentLoop;

      const options: CliOptions = {
        prompt: 'test prompt',
        verbose: false,
        json: true,
        cwd: '/test',
        dryRun: false,
        autoApprove: true
      };

      const result = await runPrompt(mockAgentLoop, 'test prompt', options);
      expect(result.success).toBe(true);
      expect(result.summary).toBe('Processed successfully');
      expect(mockAgentLoop.run).toHaveBeenCalledWith('test prompt', expect.objectContaining({ cwd: '/test' }));
    });

    it('handles runtime exceptions in agent loop gracefully', async () => {
      const mockAgentLoop = {
        run: vi.fn().mockRejectedValue(new Error('Simulated agent failure')),
        onEvent: vi.fn(),
        setAuthorizationHandler: vi.fn()
      } as unknown as AgentLoop;

      const options: CliOptions = {
        prompt: 'failing prompt',
        verbose: false,
        json: true,
        cwd: '/test',
        dryRun: false,
        autoApprove: true
      };

      const result = await runPrompt(mockAgentLoop, 'failing prompt', options);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('Simulated agent failure');
    });
  });
});
