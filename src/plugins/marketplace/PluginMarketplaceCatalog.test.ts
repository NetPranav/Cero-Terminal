import { describe, it, expect, beforeEach } from 'vitest';
import { PluginMarketplaceCatalog } from './PluginMarketplaceCatalog';

describe('PluginMarketplaceCatalog (Pillar 3.1)', () => {
  let catalog: PluginMarketplaceCatalog;

  beforeEach(() => {
    catalog = new PluginMarketplaceCatalog();
  });

  it('provides a default catalog of curated plugins', () => {
    const all = catalog.getAll();
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.some(p => p.category === 'Robotics')).toBe(true);
    expect(all.some(p => p.category === 'DevOps')).toBe(true);
  });

  it('filters plugins by search query and category', () => {
    const robotics = catalog.search('', 'Robotics');
    expect(robotics.every(p => p.category === 'Robotics')).toBe(true);

    const dockerMatches = catalog.search('docker');
    expect(dockerMatches.length).toBeGreaterThanOrEqual(1);
    expect(dockerMatches[0].id).toContain('docker');
  });

  it('installs, toggles, and uninstalls plugins', () => {
    const pluginId = 'cero.docker.orchestrator';
    expect(catalog.install(pluginId)).toBe(true);

    const installed = catalog.getAll().find(p => p.id === pluginId);
    expect(installed?.installed).toBe(true);
    expect(installed?.enabled).toBe(true);

    // Toggle off
    expect(catalog.toggle(pluginId, false)).toBe(true);
    expect(catalog.getAll().find(p => p.id === pluginId)?.enabled).toBe(false);

    // Uninstall
    expect(catalog.uninstall(pluginId)).toBe(true);
    expect(catalog.getAll().find(p => p.id === pluginId)?.installed).toBe(false);
  });
});
