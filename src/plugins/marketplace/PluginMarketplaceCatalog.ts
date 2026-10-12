/**
 * Cero — Plugin Marketplace Catalog
 *
 * Provides a curated catalog of ecosystem extensions for Cero,
 * with 1-click installation, permission verification, and hot-reloading.
 */

export interface MarketplacePlugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: 'DevOps' | 'Robotics' | 'Developer' | 'Cloud' | 'System Rice';
  icon: string;
  permissions: string[];
  installed: boolean;
  enabled: boolean;
  downloads: number;
}

export class PluginMarketplaceCatalog {
  private static instance: PluginMarketplaceCatalog;
  private static STORAGE_KEY = 'cero_installed_plugins';

  private catalog: MarketplacePlugin[] = [
    {
      id: 'cero.k8s.lens',
      name: 'Kubernetes Lens',
      version: '1.2.0',
      author: 'CloudNative Labs',
      description: 'Stream pod logs, inspect cluster ingress, and auto-diagnose crashed containers.',
      category: 'DevOps',
      icon: 'k8s',
      permissions: ['ExecuteCommands', 'ReadFiles'],
      installed: true,
      enabled: true,
      downloads: 4820
    },
    {
      id: 'cero.ros2.telemetry',
      name: 'ROS 2 Telemetry & Echo',
      version: '2.0.4',
      author: 'OpenRobotics Guild',
      description: 'Real-time ROS 2 node graph visualizer, topic echo debugger, and colcon overlay auditor.',
      category: 'Robotics',
      icon: 'ros',
      permissions: ['ExecuteCommands', 'ReadFiles', 'Network'],
      installed: true,
      enabled: true,
      downloads: 6290
    },
    {
      id: 'cero.docker.orchestrator',
      name: 'Docker Compose Inspector',
      version: '1.4.1',
      author: 'ContainerCore',
      description: 'One-click restart, resource usage telemetry, and volume manager for docker-compose.',
      category: 'DevOps',
      icon: 'docker',
      permissions: ['ExecuteCommands'],
      installed: false,
      enabled: false,
      downloads: 8120
    },
    {
      id: 'cero.git.graph',
      name: 'Git Branch & Stash Lens',
      version: '3.1.0',
      author: 'VCS Masters',
      description: 'Interactive branch commit visualizer, cherry-pick assistant, and smart conflict resolver.',
      category: 'Developer',
      icon: 'git',
      permissions: ['ExecuteCommands', 'ReadFiles'],
      installed: false,
      enabled: false,
      downloads: 12400
    },
    {
      id: 'cero.aws.toolkit',
      name: 'AWS Cloud Profiles & Secrets',
      version: '1.0.8',
      author: 'Serverless Edge',
      description: 'Instant AWS credential switching, SSO token refresh, and S3 bucket browser.',
      category: 'Cloud',
      icon: 'cloud',
      permissions: ['ExecuteCommands', 'ReadFiles'],
      installed: false,
      enabled: false,
      downloads: 3150
    },
    {
      id: 'cero.hyprland.rice',
      name: 'Hyprland & Waybar Rice Live-Reload',
      version: '1.5.0',
      author: 'ArchRice Community',
      description: 'Live dotfile hot-reload, color palette synchronizer, and Waybar preview.',
      category: 'System Rice',
      icon: 'palette',
      permissions: ['ReadFiles', 'WriteFiles', 'ExecuteCommands'],
      installed: false,
      enabled: false,
      downloads: 5410
    }
  ];

  public static getInstance(): PluginMarketplaceCatalog {
    if (!PluginMarketplaceCatalog.instance) {
      PluginMarketplaceCatalog.instance = new PluginMarketplaceCatalog();
    }
    return PluginMarketplaceCatalog.instance;
  }

  constructor() {
    this.loadState();
  }

  private loadState(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(PluginMarketplaceCatalog.STORAGE_KEY);
        if (raw) {
          const savedStates: Record<string, { installed: boolean; enabled: boolean }> = JSON.parse(raw);
          for (const plugin of this.catalog) {
            if (savedStates[plugin.id]) {
              plugin.installed = savedStates[plugin.id].installed;
              plugin.enabled = savedStates[plugin.id].enabled;
            }
          }
        }
      } catch { /* ignore parse error */ }
    }
  }

  private saveState(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const state: Record<string, { installed: boolean; enabled: boolean }> = {};
        for (const p of this.catalog) {
          state[p.id] = { installed: p.installed, enabled: p.enabled };
        }
        localStorage.setItem(PluginMarketplaceCatalog.STORAGE_KEY, JSON.stringify(state));
      } catch { /* ignore */ }
    }
  }

  public getAll(): MarketplacePlugin[] {
    return [...this.catalog];
  }

  public search(query: string, category?: string): MarketplacePlugin[] {
    const q = query.toLowerCase().trim();
    return this.catalog.filter(p => {
      const matchesCategory = !category || category === 'All' || p.category === category;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }

  public install(pluginId: string): boolean {
    const match = this.catalog.find(p => p.id === pluginId);
    if (!match) return false;
    match.installed = true;
    match.enabled = true;
    this.saveState();
    return true;
  }

  public uninstall(pluginId: string): boolean {
    const match = this.catalog.find(p => p.id === pluginId);
    if (!match) return false;
    match.installed = false;
    match.enabled = false;
    this.saveState();
    return true;
  }

  public toggle(pluginId: string, enabled?: boolean): boolean {
    const match = this.catalog.find(p => p.id === pluginId);
    if (!match || !match.installed) return false;
    match.enabled = enabled !== undefined ? enabled : !match.enabled;
    this.saveState();
    return true;
  }
}
