import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry } from '../registry/CapabilityRegistry';
import { BaseCapability } from '../common/BaseCapability';
import { CapabilityContext, CapabilityResult, VerificationResult, RollbackResult, DiagnosticsReport } from '../capabilities/CapabilityTypes';

class MockPluginCapability extends BaseCapability {
  constructor() {
    super({
      id: 'custom_plugin',
      version: '1.2.3',
      description: 'Third-party plugin extension capability',
      supportedActions: ['plugin.execute', 'custom.'],
      supportedMacOsVersion: '>=12.0',
      dependencies: ['my_custom_binary'],
      requiredPermissions: ['Automation'],
      health: 'healthy',
    }, true);
  }
  protected async executeNative(c: CapabilityContext): Promise<CapabilityResult> { return this.executeMock(c); }
  protected async verifyNative(c: CapabilityContext, r: CapabilityResult): Promise<VerificationResult> { return this.verifyMock(c, r); }
  protected async rollbackNative(c: CapabilityContext, r: CapabilityResult): Promise<RollbackResult> { return this.rollbackMock(c, r); }
  protected async diagnosticsNative(): Promise<DiagnosticsReport> { return { healthy: true, warnings: [], missingDependencies: [], permissionIssues: [], recommendations: [] }; }
}

describe('CapabilityRegistry — Automated Discovery & O(1) Lookup', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry(true);
  });

  it('should discover and load all 13 built-in domain capabilities automatically', () => {
    const all = registry.getAllCapabilities();
    expect(all.length).toBeGreaterThanOrEqual(13);
    
    const ids = registry.getAllMetadata().map(m => m.id);
    expect(ids).toContain('filesystem');
    expect(ids).toContain('application');
    expect(ids).toContain('browser');
    expect(ids).toContain('wifi');
    expect(ids).toContain('bluetooth');
    expect(ids).toContain('process');
    expect(ids).toContain('system');
    expect(ids).toContain('git');
    expect(ids).toContain('docker');
    expect(ids).toContain('node');
    expect(ids).toContain('python');
    expect(ids).toContain('terminal');
    expect(ids).toContain('developer');
  });

  it('should execute fast O(1) matching for both exact actions and domain prefixes', () => {
    const start = performance.now();
    const wifiCap = registry.lookup('wifi.connect');
    const lookupMs = performance.now() - start;

    expect(wifiCap?.metadata.id).toBe('wifi');
    expect(lookupMs).toBeLessThan(10.0); // O(1) lookup well under 10ms even under test load

    const appCap = registry.lookup('application.launch_safari');
    expect(appCap?.metadata.id).toBe('application');
  });

  it('should expose structured health summaries and immutable capability metadata', () => {
    const summary = registry.getHealthSummary();
    expect(summary['bluetooth']).toBe('healthy');
    expect(summary['filesystem']).toBe('healthy');

    const browserMeta = registry.getCapabilityById('browser')?.metadata;
    expect(browserMeta?.dependencies).toContain('osascript');
    expect(browserMeta?.requiredPermissions).toContain('Automation');
  });

  it('should allow third-party plugin capabilities to register without modifying runtime interfaces', () => {
    const plugin = new MockPluginCapability();
    registry.registerCapability(plugin);

    const match = registry.lookup('custom.my_action');
    expect(match?.metadata.id).toBe('custom_plugin');
    expect(match?.metadata.version).toBe('1.2.3');
  });
});
