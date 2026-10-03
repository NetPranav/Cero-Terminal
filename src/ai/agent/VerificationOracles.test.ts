import { describe, it, expect } from 'vitest';
import { VerificationOracles, BenchmarkPrompt } from '../../../scripts/benchmark_prompts';
import { AgentResult } from './AgentLoop';
import { CommandExecutionRecord } from '../../infrastructure/execution/NodeTauriBridge';

describe('VerificationOracles.verifyCriteria — Discriminative Oracle Verification', () => {
  const basePrompt: BenchmarkPrompt = {
    id: '1.48',
    domain: 1,
    domainName: 'System Diagnostics & Hardware Monitoring',
    prompt: '>check edid monitor display info',
    cleanPrompt: 'check edid monitor display info',
    targetTool: 'shell.execute',
    expectedOutput: 'Connected monitor physical display parameters',
    verificationCriteria: 'DRM connector output exists'
  };

  it('DELIBERATE FAILURE: correctly rejects garbled binary / control character output (Issue 3 & 1.48 test)', () => {
    const brokenBinaryOutput = '\x00\xff\xff\xff\xff\xff\xff\x00\x0dae+\x14\x00\x00\x00\x00\x33\x1e\x01\x04';
    const fakeResult: AgentResult = {
      success: true,
      summary: brokenBinaryOutput,
      steps: []
    };
    const fakeCmd: CommandExecutionRecord = {
      command: 'sh',
      args: ['-c', 'cat /sys/class/drm/*/edid'],
      fullCommand: 'cat /sys/class/drm/*/edid',
      stdout: brokenBinaryOutput,
      stderr: '',
      code: 0,
      durationMs: 5,
      timestamp: Date.now()
    };

    const oracle = VerificationOracles.verifyCriteria(basePrompt, fakeResult, [fakeCmd], fakeCmd);
    expect(oracle.passed).toBe(false);
    expect(oracle.message).toContain('garbled binary control characters');
  });

  it('DELIBERATE FAILURE: correctly rejects generic title template masking empty stdout', () => {
    const maskedPrompt: BenchmarkPrompt = {
      id: '1.47',
      domain: 1,
      domainName: 'System Diagnostics & Hardware Monitoring',
      prompt: '>check pci express link speed',
      cleanPrompt: 'check pci express link speed',
      targetTool: 'shell.execute',
      expectedOutput: 'PCIe link speed',
      verificationCriteria: 'PCIe link width and transfer speed'
    };

    const maskedResult: AgentResult = {
      success: true,
      summary: '✓ Check PCI Express link speed',
      steps: []
    };
    const emptyCmd: CommandExecutionRecord = {
      command: 'sh',
      args: ['-c', 'lspci -vv | grep -i LnkSta:'],
      fullCommand: 'lspci -vv | grep -i LnkSta:',
      stdout: '', // empty stdout!
      stderr: '',
      code: 0,
      durationMs: 10,
      timestamp: Date.now()
    };

    const oracle = VerificationOracles.verifyCriteria(maskedPrompt, maskedResult, [emptyCmd], emptyCmd);
    expect(oracle.passed).toBe(false);
    expect(oracle.message).toContain('command produced empty stdout and was masked by generic title template');
  });

  it('DELIBERATE FAILURE: correctly rejects missing Signal 15 in SIGTERM verification', () => {
    const sigtermPrompt: BenchmarkPrompt = {
      id: '2.46',
      domain: 2,
      domainName: 'Process Management & Resource Optimization',
      prompt: '>kill process gently with sigterm',
      cleanPrompt: 'kill process gently with sigterm',
      targetTool: 'shell.execute',
      expectedOutput: 'SIGTERM graceful termination sent',
      verificationCriteria: 'Signal 15 dispatched'
    };

    const wrongResult: AgentResult = {
      success: true,
      summary: 'Something unrelated happened',
      steps: []
    };
    const wrongCmd: CommandExecutionRecord = {
      command: 'sh',
      args: ['-c', 'echo "Hello world"'],
      fullCommand: 'echo "Hello world"',
      stdout: 'Hello world',
      stderr: '',
      code: 0,
      durationMs: 5,
      timestamp: Date.now()
    };

    const oracle = VerificationOracles.verifyCriteria(sigtermPrompt, wrongResult, [wrongCmd], wrongCmd);
    expect(oracle.passed).toBe(false);
    expect(oracle.message).toContain('Signal 15');
  });

  it('PASSES on genuine verified output matching criteria', () => {
    const validHexEdid = '00000000  00 ff ff ff ff ff ff 00  0d ae 2b 14 00 00 00 00';
    const validResult: AgentResult = {
      success: true,
      summary: validHexEdid,
      steps: []
    };
    const validCmd: CommandExecutionRecord = {
      command: 'sh',
      args: ['-c', 'hexdump -C /sys/class/drm/*/edid'],
      fullCommand: 'hexdump -C /sys/class/drm/*/edid',
      stdout: validHexEdid,
      stderr: '',
      code: 0,
      durationMs: 5,
      timestamp: Date.now()
    };

    const oracle = VerificationOracles.verifyCriteria(basePrompt, validResult, [validCmd], validCmd);
    expect(oracle.passed).toBe(true);
  });
});

describe('VerificationOracles.verifyNoOsError — Strict Gate on Exit Codes & IPC Errors', () => {
  it('DELIBERATE FAILURE: correctly rejects non-zero exit code (code 1 / 2)', () => {
    const successResult: AgentResult = {
      success: true,
      summary: 'Command executed successfully',
      steps: []
    };
    const failedCmd: CommandExecutionRecord = {
      command: 'sh',
      args: ['-c', 'ls /nonexistent'],
      fullCommand: 'ls /nonexistent',
      stdout: '',
      stderr: 'ls: cannot access',
      code: 2,
      durationMs: 5,
      timestamp: Date.now()
    };

    const oracle = VerificationOracles.verifyNoOsError(successResult, [failedCmd], failedCmd, 2);
    expect(oracle.passed).toBe(false);
    expect(oracle.message).toMatch(/exit code 2|cannot access/);
  });

  it('DELIBERATE FAILURE: correctly rejects Hyprland Lua dispatch parse error in stdout', () => {
    const hyprError = 'error: [string "return hl.dispatch(focuswindow firefox)"]:1: \')\' expected near \'firefox\'';
    const fakeResult: AgentResult = {
      success: true,
      summary: hyprError,
      steps: []
    };
    const fakeCmd: CommandExecutionRecord = {
      command: 'sh',
      args: ['-c', 'hyprctl dispatch focuswindow firefox'],
      fullCommand: 'hyprctl dispatch focuswindow firefox',
      stdout: hyprError,
      stderr: '',
      code: 0,
      durationMs: 5,
      timestamp: Date.now()
    };

    const oracle = VerificationOracles.verifyNoOsError(fakeResult, [fakeCmd], fakeCmd, 0);
    expect(oracle.passed).toBe(false);
    expect(oracle.message).toContain('IPC Failure');
  });

  it('PASSES on clean exit code 0 and zero OS error text', () => {
    const cleanResult: AgentResult = {
      success: true,
      summary: 'ok (Dispatches focus event for window firefox)',
      steps: []
    };
    const cleanCmd: CommandExecutionRecord = {
      command: 'sh',
      args: ['-c', 'hyprctl dispatch ...'],
      fullCommand: 'hyprctl dispatch ...',
      stdout: 'ok (Dispatches focus event for window firefox)',
      stderr: '',
      code: 0,
      durationMs: 5,
      timestamp: Date.now()
    };

    const oracle = VerificationOracles.verifyNoOsError(cleanResult, [cleanCmd], cleanCmd, 0);
    expect(oracle.passed).toBe(true);
  });
});

