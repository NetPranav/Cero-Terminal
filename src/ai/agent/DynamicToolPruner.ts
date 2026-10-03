/**
 * Cero — Dynamic Domain Tool Pruner
 *
 * Reduces large tool libraries (103+ tools) down to the 4–6 most relevant tools
 * for any given user instruction in <1ms. Keeps local small language models (SLMs)
 * fast, token-efficient, and hallucination-free.
 */

import { ToolSpec } from './SystemPrompt';

export interface PruningOptions {
  maxTools?: number;
  alwaysInclude?: string[];
}

export class DynamicToolPruner {
  private static readonly DOMAIN_KEYWORDS: Record<string, string[]> = {
    'network.bluetooth': ['bluetooth', 'headphone', 'headphones', 'earbuds', 'buds', 'pair', 'space one', 'airpods', 'peripheral', 'bt'],
    'network.wifi': ['wifi', 'wi-fi', 'wireless', 'ssid', 'network', 'wlan', 'hotspot', 'router', 'internet'],
    'network': ['ping', 'port', 'ports', 'dns', 'ip', 'latency', 'gateway'],
    'filesystem': ['file', 'folder', 'directory', 'dir', 'path', 'mkdir', 'read', 'delete', 'copy', 'move', 'search', 'navigate', 'cd', 'ls'],
    'git': ['git', 'commit', 'branch', 'checkout', 'pull', 'push', 'merge', 'repo', 'repository', 'status', 'diff', 'clone'],
    'docker': ['docker', 'container', 'image', 'compose', 'volume', 'daemon', 'k8s', 'podman'],
    'system.service': ['service', 'systemctl', 'daemon', 'launchctl', 'unit', 'systemd'],
    'system.dotfile': ['rice', 'hyprland', 'i3', 'sway', 'waybar', 'autostart', 'dotfile', 'bashrc', 'zshrc', 'startup', 'wallpaper'],
    'system': ['process', 'kill', 'cpu', 'ram', 'memory', 'battery', 'storage', 'disk', 'uptime', 'lock', 'temperature', 'specs', 'hardware'],
    'application': ['open', 'launch', 'app', 'application', 'quit', 'force quit', 'close', 'running'],
    'browser': ['browser', 'url', 'web', 'navigate', 'search', 'google', 'youtube', 'github', 'http', 'https', 'chrome', 'safari', 'firefox'],
    'developer': ['scaffold', 'nextjs', 'django', 'fastapi', 'react', 'vite', 'rust', 'cargo', 'python', 'npm', 'pnpm', 'pip']
  };

  /**
   * Prune full tool listing down to top relevant tools for user prompt.
   */
  public static prune(
    allTools: ToolSpec[],
    goal: string,
    options: PruningOptions = {}
  ): ToolSpec[] {
    const max = options.maxTools || 6;
    const alwaysInclude = options.alwaysInclude || ['shell.execute'];

    if (allTools.length <= max) {
      return allTools;
    }

    const normalizedGoal = goal.toLowerCase();
    const goalTokens = normalizedGoal
      .split(/[^a-z0-9_.-]+/)
      .filter(t => t.length > 1);

    // Score all tools
    const scored = allTools.map(tool => ({
      tool,
      score: this.scoreTool(tool, goalTokens, normalizedGoal)
    }));

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    // Reserve slots for alwaysInclude tools
    const targetCount = max - alwaysInclude.length;
    const selected: ToolSpec[] = [];
    const selectedIds = new Set<string>();

    for (const item of scored) {
      if (selected.length >= targetCount) break;
      if (!selectedIds.has(item.tool.id) && !alwaysInclude.includes(item.tool.id)) {
        selected.push(item.tool);
        selectedIds.add(item.tool.id);
      }
    }

    // Append alwaysInclude tools
    for (const id of alwaysInclude) {
      if (!selectedIds.has(id)) {
        const found = allTools.find(t => t.id === id);
        if (found) {
          selected.push(found);
          selectedIds.add(id);
        }
      }
    }

    // If still room, fill with next best scored tools
    for (const item of scored) {
      if (selected.length >= max) break;
      if (!selectedIds.has(item.tool.id)) {
        selected.push(item.tool);
        selectedIds.add(item.tool.id);
      }
    }

    return selected;
  }

  /**
   * Score tool relevance against goal tokens and domain affinity keywords.
   */
  public static scoreTool(tool: ToolSpec, tokens: string[], rawGoal: string): number {
    let score = 0;
    const toolId = tool.id.toLowerCase();
    const toolName = tool.name.toLowerCase();
    const toolDesc = tool.description.toLowerCase();

    // 1. Domain Affinity Boost
    for (const [prefix, keywords] of Object.entries(this.DOMAIN_KEYWORDS)) {
      if (toolId.startsWith(prefix)) {
        for (const kw of keywords) {
          if (rawGoal.includes(kw)) {
            score += 100;
            break;
          }
        }
      }
    }

    // 2. Direct Token Matching
    for (const token of tokens) {
      // Direct tool ID match
      if (toolId.includes(token)) {
        score += 40;
      }
      // Display Name match
      if (toolName.includes(token)) {
        score += 25;
      }
      // Description match
      if (toolDesc.includes(token)) {
        score += 15;
      }
      // Parameter match
      for (const param of tool.parameters) {
        if (param.name.toLowerCase() === token) {
          score += 20;
        }
      }
    }

    return score;
  }
}
