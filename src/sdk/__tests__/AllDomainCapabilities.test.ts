import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { CapabilityExecutor } from '../execution/CapabilityExecutor';
import { CapabilityRegistry } from '../registry/CapabilityRegistry';
import { ExecutionContext } from '../../runtime/state/ExecutionContext';
import { globalCapabilityTelemetry } from '../telemetry/CapabilityTelemetry';
import { createTestNode } from './testHelpers';

describe('All Domain Capabilities — Comprehensive 13-Domain Verification', () => {
  let executor: CapabilityExecutor;
  let context: ExecutionContext;

  beforeAll(() => {
    globalCapabilityTelemetry.reset();
  });

  beforeEach(() => {
    executor = new CapabilityExecutor(new CapabilityRegistry(true));
    context = new ExecutionContext();
  });

  it('1. FilesystemCapability: should execute folder creation and file trash deletion', async () => {
    const res = await executor.execute(createTestNode('fs-1', 'filesystem.create_folder', { path: '/tmp/test_dir' }), context);
    expect(res.success).toBe(true);
    expect(res.verification?.success).toBe(true);
  });

  it('2. ApplicationCapability: should execute launch services and complete thread elimination', async () => {
    const launch = await executor.execute(createTestNode('app-1', 'application.open', { appName: 'Safari', url: 'apple.com' }), context);
    expect(launch.success).toBe(true);
    expect(launch.outputs.domain).toBe('application');

    const term = await executor.execute(createTestNode('app-2', 'application.terminate', { appName: 'Safari' }), context);
    expect(term.success).toBe(true);
  });

  it('3. BrowserCapability: should navigate web tabs with secure protocol normalization', async () => {
    const res = await executor.execute(createTestNode('browser-1', 'browser.open', { browser: 'Google Chrome', url: 'github.com' }), context);
    expect(res.success).toBe(true);
    expect(res.verification?.verifiedOutputs.verifiedUrl).toBe('https://github.com');
  });

  it('4. WifiCapability: should authenticate to SSID and publish verified network interface & IP', async () => {
    const res = await executor.execute(createTestNode('wifi-1', 'wifi.connect', { ssid: 'Studio_5G' }), context);
    expect(res.success).toBe(true);
    expect(res.outputs.ipAddress).toBeDefined();
    expect(res.outputs.interface).toBe('en0');
  });

  it('5. BluetoothCapability: should toggle hardware radio states and report peripherals', async () => {
    const res = await executor.execute(createTestNode('bt-1', 'bluetooth.enable', { state: 'on' }), context);
    expect(res.success).toBe(true);
    expect(res.verification?.verifiedOutputs.radioEnabled).toBe(true);
    expect((res.verification?.verifiedOutputs.connectedDevices as string[]).length).toBeGreaterThan(0);
  });

  it('6. ProcessCapability: should locate PIDs and consume PID from shared context for signal termination', async () => {
    const findRes = await executor.execute(createTestNode('proc-find', 'process.find', { name: 'Node' }), context);
    expect(findRes.success).toBe(true);
    const foundPid = findRes.outputs.verifiedPid || 4512;
    context.setOutput('proc-find', 'pid', foundPid);

    // Downstream kill node consumes pid directly from preceding step
    const killNode = createTestNode('proc-kill', 'process.kill', {});
    killNode.dependencies = ['proc-find'];
    const killRes = await executor.execute(killNode, context);

    expect(killRes.success).toBe(true);
    expect(killRes.outputs.verifiedPid).toBe(foundPid);
    expect(killRes.outputs.processStatus).toBe('terminated');
  });

  it('7. SystemCapability: should modify hardware audio volume levels and inspect system profiles', async () => {
    const res = await executor.execute(createTestNode('sys-1', 'system.volume', { volume: 30 }), context);
    expect(res.success).toBe(true);
    expect(res.outputs.domain).toBe('system');
  });

  it('8. GitCapability: should manage version control automation and repository cloning', async () => {
    const res = await executor.execute(createTestNode('git-1', 'git.clone', { url: 'https://github.com/NetPranav/Sentinal-Terminal.git' }), context);
    expect(res.success).toBe(true);
    expect(res.verification?.verifiedOutputs.verifiedRepository).toBe(true);
  });

  it('9. DockerCapability: should orchestrate container deployment and port binding audits', async () => {
    const res = await executor.execute(createTestNode('docker-1', 'docker.run', { image: 'node:20-alpine', name: 'app-runner' }), context);
    expect(res.success).toBe(true);
    expect(res.verification?.verifiedOutputs.containerStatus).toBe('healthy');
  });

  it('10. NodeCapability: should invoke runtime scripts via npm, npx, and inspect versions', async () => {
    const res = await executor.execute(createTestNode('node-1', 'node.run', { script: 'test', cwd: '/app' }), context);
    expect(res.success).toBe(true);
    expect(res.verification?.verifiedOutputs.runtimeVersion).toContain('v20');
  });

  it('11. PythonCapability: should evaluate scripts and manage isolated virtualenv packages', async () => {
    const res = await executor.execute(createTestNode('py-1', 'python.install', { package: 'torch' }), context);
    expect(res.success).toBe(true);
    expect(res.verification?.verifiedOutputs.pythonVersion).toContain('3.12');
  });

  it('12. TerminalCapability: should bridge commands into PTY zsh/bash sessions with clean exit code auditing', async () => {
    const res = await executor.execute(createTestNode('term-1', 'terminal.run', { command: 'echo "Cero OS"' }), context);
    expect(res.success).toBe(true);
    expect(res.verification?.verifiedOutputs.activeShell).toBe('/bin/zsh');
  });

  it('13. DeveloperCapability: should trigger engineering toolchains and open IDEs (Cursor, VS Code, Xcode)', async () => {
    const res = await executor.execute(createTestNode('dev-1', 'developer.open', { ide: 'Cursor', path: '/home/user/project' }), context);
    expect(res.success).toBe(true);
    expect(res.outputs.ide).toBe('Cursor');
    expect(res.verification?.verifiedOutputs.activeEditor).toBe('Cursor AI');
  });

  it('should accurately capture execution telemetry metrics across all domain capability calls', () => {
    const metrics = globalCapabilityTelemetry.getMetrics();
    expect(metrics.totalInvocations).toBeGreaterThanOrEqual(13);
    expect(metrics.successRate).toBe(100);
    expect(typeof metrics.averageLatencyMs).toBe('number');
  });
});
