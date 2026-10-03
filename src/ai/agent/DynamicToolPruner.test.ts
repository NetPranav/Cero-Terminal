import { describe, it, expect } from 'vitest';
import { DynamicToolPruner } from './DynamicToolPruner';
import { ToolSpec } from './SystemPrompt';

describe('DynamicToolPruner — Cognitive Context Pruning Engine', () => {
  const mockTools: ToolSpec[] = [
    { id: 'network.bluetooth.on', name: 'Turn On Bluetooth', description: 'Enable adapter', parameters: [] },
    { id: 'network.bluetooth.off', name: 'Turn Off Bluetooth', description: 'Disable adapter', parameters: [] },
    { id: 'network.bluetooth.connect', name: 'Connect Bluetooth Device', description: 'Connect peripheral', parameters: [{ name: 'device', type: 'string', required: true, description: '' }] },
    { id: 'network.bluetooth.scan', name: 'Scan Bluetooth Devices', description: 'Scan for devices', parameters: [] },
    { id: 'network.wifi.on', name: 'Turn On WiFi', description: 'Enable wifi', parameters: [] },
    { id: 'network.wifi.connect', name: 'Connect WiFi', description: 'Connect SSID', parameters: [{ name: 'ssid', type: 'string', required: true, description: '' }] },
    { id: 'filesystem.search', name: 'Search Files', description: 'Search directory', parameters: [{ name: 'pattern', type: 'string', required: true, description: '' }] },
    { id: 'filesystem.navigate', name: 'Navigate Directory', description: 'Change directory', parameters: [{ name: 'path', type: 'string', required: true, description: '' }] },
    { id: 'git.status', name: 'Git Status', description: 'Check repo status', parameters: [] },
    { id: 'git.pull', name: 'Git Pull', description: 'Fetch changes', parameters: [] },
    { id: 'system.service', name: 'Manage Service', description: 'Control systemctl', parameters: [{ name: 'service', type: 'string', required: true, description: '' }] },
    { id: 'system.dotfile', name: 'Manage Dotfile Rice', description: 'Configure hyprland autostart', parameters: [{ name: 'app', type: 'string', required: true, description: '' }] },
    { id: 'shell.execute', name: 'Execute Shell Command', description: 'Run bash/zsh command', parameters: [{ name: 'command', type: 'string', required: true, description: '' }] }
  ];

  it('prunes tools to top candidates matching bluetooth domain while retaining shell.execute', () => {
    const pruned = DynamicToolPruner.prune(mockTools, 'connect bluetooth headphones Soundcore Space One', { maxTools: 5 });

    expect(pruned.length).toBeLessThanOrEqual(5);
    const ids = pruned.map(t => t.id);

    // Bluetooth tools should dominate the pruned set
    expect(ids).toContain('network.bluetooth.connect');
    expect(ids).toContain('network.bluetooth.on');
    // Universal fallback shell.execute must be retained
    expect(ids).toContain('shell.execute');
    // Irrelevant tools like docker/wifi should be pruned out
    expect(ids).not.toContain('network.wifi.connect');
  });

  it('prunes tools to filesystem candidates for file-related requests', () => {
    const pruned = DynamicToolPruner.prune(mockTools, 'find all json files in tools directory', { maxTools: 5 });

    expect(pruned.length).toBeLessThanOrEqual(5);
    const ids = pruned.map(t => t.id);

    expect(ids).toContain('filesystem.search');
    expect(ids).toContain('shell.execute');
    expect(ids).not.toContain('network.bluetooth.connect');
  });

  it('prunes tools to dotfile rice tools when configuring hyprland or startup', () => {
    const pruned = DynamicToolPruner.prune(mockTools, 'turn off gazebo in hyprland rice autostart', { maxTools: 5 });

    expect(pruned.length).toBeLessThanOrEqual(5);
    const ids = pruned.map(t => t.id);

    expect(ids).toContain('system.dotfile');
    expect(ids).toContain('shell.execute');
  });
});
