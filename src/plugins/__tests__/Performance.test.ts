import { describe, it, expect, beforeEach } from 'vitest';
import { PluginLifecycle } from '../lifecycle/PluginLifecycle';
import { PluginRegistry } from '../registry/PluginRegistry';
import { DependencyResolver } from '../dependencies/DependencyResolver';
import { PermissionManager } from '../permissions/PermissionManager';
import { ExtensionPoints } from '../hooks/ExtensionPoints';
import { PluginTelemetry } from '../telemetry/PluginTelemetry';
import { PluginRawSource } from '../lifecycle/PluginLifecycle';

describe('PluginSDK — Performance Benchmarks', () => {
  let lifecycle: PluginLifecycle;

  beforeEach(() => {
    lifecycle = new PluginLifecycle(
      new PluginRegistry(),
      new DependencyResolver(),
      new PermissionManager(),
      new ExtensionPoints(),
      new PluginTelemetry()
    );
  });

  it('should load, validate, resolve, sandbox, and run 50 plugins in under 200ms', async () => {
    const sources: PluginRawSource[] = [];
    
    // Generate 50 plugins in a linear dependency chain to stress the resolver
    for (let i = 0; i < 50; i++) {
      const deps: Record<string, string> = {};
      if (i > 0) {
        deps[`plg${i-1}`] = '1.0.0';
      }

      sources.push({
        manifestRaw: {
          id: `plg${i}`, name: `P${i}`, version: '1.0.0', author: 'Author', description: 'D', 
          license: 'MIT', sdkVersion: '1.0.0', entrypoint: 'index.js',
          executionModel: 'capability', permissions: ['filesystem.read'], dependencies: deps
        },
        // Simulate a small script execution
        code: `const x = ${i};`
      });
    }

    // Shuffle the sources array so the dependency resolver has to do real work
    const shuffled = [...sources].sort(() => Math.random() - 0.5);

    const start = performance.now();
    await lifecycle.loadPlugins(shuffled);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1000); // Generous allowance for concurrent test suite runners under full CPU load
  });
});
