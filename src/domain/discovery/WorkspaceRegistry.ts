/**
 * Cero — Workspace Registry
 *
 * Scans, indexes, and caches developer workspaces (ROS 1/2, Node, Python, Rust, Docker)
 * across local filesystem roots to provide sub-millisecond workspace navigation.
 */

import { DiscoveredProject, ProjectDiscoveryEngine } from './ProjectDiscoveryEngine';

function joinPath(...parts: string[]): string {
  return parts.map((p, i) => i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
}

export class WorkspaceRegistry {
  private static instance: WorkspaceRegistry;
  private projects: DiscoveredProject[] = [];
  private isScanning = false;
  private lastScanTime = 0;

  private lastScannedCwd?: string;

  public static getInstance(): WorkspaceRegistry {
    if (!WorkspaceRegistry.instance) {
      WorkspaceRegistry.instance = new WorkspaceRegistry();
    }
    return WorkspaceRegistry.instance;
  }

  /**
   * Returns list of cached projects for the current directory, triggering a scan if empty, directory changed, or stale.
   */
  public async getProjects(forceRefresh = false, currentCwd?: string): Promise<DiscoveredProject[]> {
    if (!forceRefresh && this.projects.length > 0 && this.lastScannedCwd === currentCwd && Date.now() - this.lastScanTime < 60000) {
      return this.projects;
    }
    await this.scan(currentCwd);
    return this.projects;
  }

  public getCachedProjects(): DiscoveredProject[] {
    return this.projects;
  }

  /**
   * Scan the active working directory for projects and subfolders
   */
  public async scan(currentCwd?: string): Promise<DiscoveredProject[]> {
    if (this.isScanning) return this.projects;
    this.isScanning = true;

    try {
      // 1. Check if running inside Tauri runtime
      if (typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const tauriProjects = await this.scanTauriNative(invoke, currentCwd);
          this.projects = tauriProjects;
          this.lastScanTime = Date.now();
          this.lastScannedCwd = currentCwd;
          return this.projects;
        } catch (tauriErr) {
          console.warn('[WorkspaceRegistry] Tauri native scan failed, falling back:', tauriErr);
        }
      }

      // 2. Node / Vitest fallback strictly for the target directory
      const target = (currentCwd && currentCwd !== '~')
        ? currentCwd
        : (typeof process !== 'undefined' && process.cwd ? process.cwd() : '.');

      const found: DiscoveredProject[] = [];

      try {
        const probeResult = await ProjectDiscoveryEngine.probe('', [target]);
        if (probeResult && probeResult.matches) {
          found.push(...probeResult.matches);
        }
      } catch { /* skip inaccessible root */ }

      // Deduplicate by path
      const unique = new Map<string, DiscoveredProject>();
      for (const p of found) {
        if (!unique.has(p.path)) {
          unique.set(p.path, p);
        }
      }

      this.projects = Array.from(unique.values());
      this.lastScanTime = Date.now();
      this.lastScannedCwd = currentCwd;
    } catch (err) {
      console.warn('[WorkspaceRegistry] Scan failed:', err);
    } finally {
      this.isScanning = false;
    }

    return this.projects;
  }

  /**
   * Fast native Tauri discovery scanning the actual current directory
   */
  private async scanTauriNative(invoke: any, currentCwd?: string): Promise<DiscoveredProject[]> {
    let home = '';
    try {
      const out = await invoke('execute_command', {
        command: 'sh',
        args: ['-c', 'echo $HOME']
      });
      home = (out?.stdout || '').trim();
    } catch { /* ignore */ }

    // Resolve target directory: prioritize current open directory
    let target = currentCwd || '.';
    if (target === '~' || target.startsWith('~/')) {
      target = home ? (target === '~' ? home : target.replace(/^~/, home)) : '.';
    }

    // High performance Python scanner targeting actual current directory
    const pyScanner = `python3 -c "
import os, sys, json

target = sys.argv[1] if len(sys.argv) > 1 else '.'
items = []
try:
    if os.path.isdir(target):
        for name in sorted(os.listdir(target)):
            if name.startswith('.'): continue
            p = os.path.join(target, name)
            if not os.path.isdir(p): continue
            if name in ['node_modules', 'dist', 'build', 'target', '.cache']: continue
            ptype, conf, desc, script = 'generic', 60, 'Directory', None
            try:
                sub = set(os.listdir(p))
                if 'package.xml' in sub: ptype, conf, desc, script = 'ros2', 95, 'ROS 2 Workspace Package', 'source install/setup.bash'
                elif 'Cargo.toml' in sub: ptype, conf, desc, script = 'rust', 92, 'Rust Project (Cargo)', 'cargo build'
                elif 'package.json' in sub: ptype, conf, desc, script = 'node', 90, 'Node.js / Web Project', 'npm start'
                elif 'pyproject.toml' in sub or 'requirements.txt' in sub: ptype, conf, desc, script = 'python', 85, 'Python Environment', 'python3 -m venv .venv && source .venv/bin/activate'
                elif 'docker-compose.yml' in sub or 'Dockerfile' in sub: ptype, conf, desc, script = 'docker', 80, 'Docker Container', 'docker compose up -d'
                elif '.git' in sub: ptype, conf, desc, script = 'generic', 75, 'Git Repository', 'git status'
            except Exception: pass
            items.append({'name': name, 'path': p, 'type': ptype, 'confidence': conf, 'description': desc, 'setupScript': script})
except Exception: pass
print(json.dumps(items))
" "${target.replace(/"/g, '\\"')}" 2>/dev/null`;

    try {
      const res = await invoke('execute_command', {
        command: 'sh',
        args: ['-c', pyScanner]
      });
      const stdout = (res?.stdout || '').trim();
      if (stdout.startsWith('[')) {
        const parsed = JSON.parse(stdout) as DiscoveredProject[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((p, idx) => {
            p.id = `${idx + 1}`;
          });
          return parsed;
        }
      }
    } catch {
      // Fallback below
    }

    // POSIX shell fallback: list immediate subdirectories in current directory
    const fallbackCmd = `for d in "${target.replace(/"/g, '\\"')}"/*/; do [ -d "$d" ] && echo "\${d%/}"; done 2>/dev/null`;
    const res = await invoke('execute_command', {
      command: 'sh',
      args: ['-c', fallbackCmd]
    });

    const lines = (res?.stdout || '').split('\n').map((l: string) => l.trim()).filter(Boolean);
    const projects: DiscoveredProject[] = [];

    for (const dirPath of lines) {
      const dirName = dirPath.substring(dirPath.lastIndexOf('/') + 1);
      if (['node_modules', 'target', 'dist', 'build', '.cache'].includes(dirName)) continue;
      projects.push({
        id: `${projects.length + 1}`,
        name: dirName,
        path: dirPath,
        type: 'generic',
        confidence: 60,
        description: 'Directory'
      });
    }

    return projects;
  }
}
