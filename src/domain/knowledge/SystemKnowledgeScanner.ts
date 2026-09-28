/**
 * SystemKnowledgeScanner.ts — what Sentinel knows about this machine.
 *
 * One batched shell script collects the profile (distro, kernel, desktop session, CPU/RAM, GPU
 * vendor, installed apps, toolchains, package managers, ROS 2 installs, shells, services). It
 * replaced ~25 sequential probes that spawned roughly 2,000 processes (grep/cut/awk per
 * .desktop file). A cheap fingerprint of the package databases and app directories decides
 * whether a rescan is needed at all, so a normal startup costs one `stat` call.
 *
 * Unknown values are left out. The old scanner filled gaps with invented values (8 GB RAM,
 * 4 cores, a 256 GB ext4 root, a fake app list) that were then injected into the model prompt
 * as facts about the user's machine.
 */

import { invoke } from '@tauri-apps/api/core';
import { detectCompositor } from '../desktop/DesktopCommands';

export interface InstalledAppInfo {
  name: string;
  binary: string;
  category?: string;
  execCmd?: string;
  isDefault?: boolean;
}

export interface FilesystemMountInfo {
  mountPoint: string;
  fsType: string;
  totalGb: number;
  freeGb: number;
  freePercent: number;
  hasSnapshots?: boolean;
}

export interface DeveloperRuntimesInfo {
  python?: string;
  node?: string;
  rust?: string;
  gcc?: string;
  go?: string;
  dockerRunning?: boolean;
  packageManagers: string[];
  /** The system package manager for this distro (pacman, dnf, apt, zypper, ...) */
  preferredPackageManager?: string;
  /** Developer tools found on PATH (git, cmake, code, nvim, ...) */
  tools?: string[];
}

export interface HardwareProfileInfo {
  cpuModel?: string;
  cpuCores?: number;
  cpuArch?: string;
  ramTotalGb?: number;
  ramAvailableGb?: number;
  swapTotalGb?: number;
  gpuName?: string;
  gpuVramGb?: number;
  /** nvidia | amd | intel, from /sys/class/drm vendor ids */
  gpuVendors?: string[];
  hasVulkan?: boolean;
  isGpuAvailable: boolean;
  batteryPercent?: number;
}

export interface RosInstallInfo {
  /** Installed distros under /opt/ros (e.g. humble, jazzy) */
  distros: string[];
  /** ROS_DISTRO from the environment Sentinel was started in */
  activeDistro?: string;
}

export interface SystemProfile {
  scannedAt: number;
  /** Fingerprint of package databases and app directories at scan time */
  fingerprint?: string;
  os: {
    name: string;
    id: string;
    idLike?: string;
    version: string;
    kernel: string;
    initSystem: string;
    sessionType: 'wayland' | 'x11' | 'tty' | 'unknown';
    desktopEnvironment: string;
  };
  hardware: HardwareProfileInfo;
  apps: {
    totalCount: number;
    items: InstalledAppInfo[];
    defaultBrowser?: string;
    defaultEditor?: string;
    defaultFileManager?: string;
  };
  developer: DeveloperRuntimesInfo;
  ros?: RosInstallInfo;
  filesystems: FilesystemMountInfo[];
  shells: {
    available: string[];
    defaultShell: string;
    detectedDotfiles: string[];
  };
  network: {
    connectedSsid?: string;
    localIp?: string;
    activeVpn?: string;
    hasInternet: boolean;
  };
  services: {
    runningServices: string[];
    listeningPorts: number[];
  };
}

/**
 * Changes when packages are installed/removed, apps are added, or the OS/kernel is updated.
 * Directory mtimes change on add/remove, which is exactly when the profile goes stale.
 */
export const FINGERPRINT_SCRIPT = `for p in /etc/os-release /var/lib/pacman/local /var/lib/dpkg/status /var/lib/rpm /var/lib/flatpak/app /usr/share/applications "$HOME/.local/share/applications" /opt/ros; do stat -c '%Y' "$p" 2>/dev/null || stat -f '%m' "$p" 2>/dev/null || echo 0; done; uname -r`;

/** The whole scan in one shell invocation. Sections start with "@@name". POSIX sh + mawk safe. */
export const SCAN_SCRIPT = `
emit() { printf '@@%s\\n' "$1"; }
emit os
cat /etc/os-release 2>/dev/null || printf 'NAME="%s"\\nPRETTY_NAME="%s %s"\\nID=macos\\n' "$(sw_vers -productName 2>/dev/null)" "$(sw_vers -productName 2>/dev/null)" "$(sw_vers -productVersion 2>/dev/null)"
printf 'KERNEL=%s\\nARCH=%s\\n' "$(uname -r)" "$(uname -m)"
printf 'SESSION=%s\\nDESKTOP=%s\\n' "\${XDG_SESSION_TYPE:-}" "\${XDG_CURRENT_DESKTOP:-\${DESKTOP_SESSION:-}}"
printf 'INIT=%s\\n' "$(cat /proc/1/comm 2>/dev/null)"
emit cpu
grep -m1 '^model name' /proc/cpuinfo 2>/dev/null || printf 'model name\\t: %s\\n' "$(sysctl -n machdep.cpu.brand_string 2>/dev/null)"
printf 'CORES=%s\\n' "$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null)"
emit mem
grep -E '^(MemTotal|MemAvailable|SwapTotal):' /proc/meminfo 2>/dev/null || printf 'MemTotal: %s kB\\n' "$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1024 ))"
emit gpu
for v in /sys/class/drm/card[0-9]*/device/vendor; do [ -r "$v" ] && printf 'VENDOR=%s\\n' "$(cat "$v")"; done
command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null | sed 's/^/NVIDIA=/'
( (ldconfig -p 2>/dev/null | grep -q 'libvulkan\\.so\\.1') || ls /usr/lib*/libvulkan.so.1 /usr/lib/*/libvulkan.so.1 >/dev/null 2>&1 ) && echo VULKAN=1
emit apps
set --
for d in /usr/share/applications "$HOME/.local/share/applications" /var/lib/flatpak/exports/share/applications "$HOME/.local/share/flatpak/exports/share/applications"; do
  for f in "$d"/*.desktop; do [ -f "$f" ] && set -- "$@" "$f"; done
done
[ "$#" -gt 0 ] && awk 'FNR==1 { if (n != "" && e != "" && hide != "1") print n "||" e "||" c; n=""; e=""; c=""; hide=""; sec="" }
  /^\\[/ { sec=$0; next }
  sec == "[Desktop Entry]" && /^Name=/ && n == "" { n=substr($0, 6) }
  sec == "[Desktop Entry]" && /^Exec=/ && e == "" { e=substr($0, 6) }
  sec == "[Desktop Entry]" && /^Categories=/ && c == "" { c=substr($0, 12) }
  sec == "[Desktop Entry]" && (/^NoDisplay=true/ || /^Hidden=true/) { hide="1" }
  END { if (n != "" && e != "" && hide != "1") print n "||" e "||" c }' "$@" 2>/dev/null | sort -u | head -300
emit dev
for t in python3 node rustc gcc go; do command -v "$t" >/dev/null 2>&1 && printf '%s=%s\\n' "$t" "$("$t" --version 2>/dev/null | head -n1)"; done
[ -S /var/run/docker.sock ] && echo 'DOCKER_SOCKET=1'
for t in git cmake make ninja docker podman cargo npm pnpm yarn bun pip3 uv conda code codium nvim vim emacs tmux kubectl colcon rosdep; do command -v "$t" >/dev/null 2>&1 && echo "TOOL=$t"; done
emit pkg
for t in pacman yay paru apt-get dnf zypper flatpak snap nix-env brew; do command -v "$t" >/dev/null 2>&1 && echo "$t"; done
emit ros
for d in /opt/ros/*; do [ -f "$d/setup.bash" ] && echo "DISTRO=\${d##*/}"; done
printf 'ENV=%s\\n' "\${ROS_DISTRO:-}"
emit fs
df -PT -x tmpfs -x devtmpfs -x squashfs -x overlay -x efivarfs 2>/dev/null | tail -n +2
emit shells
grep '^/' /etc/shells 2>/dev/null
printf 'DEFAULT=%s\\n' "\${SHELL:-}"
for f in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.config/fish/config.fish" "$HOME/.config/hypr/hyprland.conf" "$HOME/.tmux.conf" "$HOME/.config/nvim/init.lua"; do [ -f "$f" ] && echo "DOT=$f"; done
emit net
command -v iwgetid >/dev/null 2>&1 && iwgetid -r 2>/dev/null | sed 's/^/SSID=/'
ip -o -4 addr show scope global 2>/dev/null | awk '{ print "IP=" $4 }'
ip -o link show 2>/dev/null | awk -F': ' '{ print "LINK=" $2 }'
emit services
systemctl list-units --type=service --state=running --no-pager --no-legend --plain 2>/dev/null | awk '{ print $1 }' | head -40
emit ports
ss -H -ltn 2>/dev/null | awk '{ print $4 }' | sed 's/.*://' | sort -nu | head -30
emit browser
xdg-settings get default-web-browser 2>/dev/null
emit end
`;

const GPU_VENDOR_IDS: Record<string, string> = { '0x10de': 'nvidia', '0x1002': 'amd', '0x8086': 'intel' };

function sections(raw: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  let current = '';
  for (const line of raw.split('\n')) {
    const header = line.match(/^@@([a-z]+)$/);
    if (header) {
      current = header[1];
      map.set(current, []);
    } else if (current && line.trim()) {
      map.get(current)!.push(line);
    }
  }
  return map;
}

function keyValues(lines: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of lines) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    map.set(key, [...(map.get(key) || []), value]);
  }
  return map;
}

const first = (kv: Map<string, string[]>, key: string) => kv.get(key)?.[0] || undefined;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Pick the distro's own package manager, preferring AUR helpers on Arch. */
export function preferredPackageManager(osId: string, idLike: string | undefined, available: string[]): string | undefined {
  const ids = `${osId} ${idLike || ''}`.toLowerCase();
  const has = (pm: string) => available.includes(pm);
  if (/\b(arch|manjaro|endeavouros|garuda|cachyos)\b/.test(ids)) {
    return ['paru', 'yay', 'pacman'].find(has);
  }
  if (/\b(fedora|rhel|centos|rocky|almalinux|nobara)\b/.test(ids)) return has('dnf') ? 'dnf' : undefined;
  if (/\b(debian|ubuntu|linuxmint|pop|elementary|zorin|kali)\b/.test(ids)) return has('apt-get') ? 'apt' : undefined;
  if (/\b(opensuse|suse)\b/.test(ids)) return has('zypper') ? 'zypper' : undefined;
  if (/\bnixos\b/.test(ids)) return has('nix-env') ? 'nix' : undefined;
  return ['pacman', 'dnf', 'apt-get', 'zypper'].find(has)?.replace('apt-get', 'apt');
}

/** Parse SCAN_SCRIPT output into a profile. Pure; unknown values stay undefined. */
export function parseScanOutput(raw: string, now = Date.now()): SystemProfile {
  const s = sections(raw);
  const os = keyValues(s.get('os') || []);
  const session = (first(os, 'SESSION') || '').toLowerCase();

  const cpuLines = s.get('cpu') || [];
  const cpuModel = cpuLines.find(l => l.startsWith('model name'))?.split(':').slice(1).join(':').trim();
  const cores = parseInt(first(keyValues(cpuLines), 'CORES') || '', 10);

  const mem: Record<string, number> = {};
  for (const line of s.get('mem') || []) {
    const m = line.match(/^(\w+):\s+(\d+)/);
    if (m) mem[m[1]] = parseInt(m[2], 10) / (1024 * 1024);
  }

  const gpu = keyValues(s.get('gpu') || []);
  const gpuVendors = Array.from(new Set((gpu.get('VENDOR') || []).map(v => GPU_VENDOR_IDS[v.toLowerCase()]).filter(Boolean)));
  const nvidia = first(gpu, 'NVIDIA')?.split(',').map(p => p.trim());

  const items: InstalledAppInfo[] = [];
  const seen = new Set<string>();
  for (const line of s.get('apps') || []) {
    const [name, execLine, category] = line.split('||');
    if (!name || !execLine) continue;
    // Exec=env FOO=1 /usr/bin/app %U -> app
    const tokens = execLine.split(/\s+/).filter(t => t && !/^%[a-zA-Z]$/.test(t));
    let i = 0;
    if (tokens[i] === 'env') {
      i++;
      while (tokens[i] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
    }
    const binary = (tokens[i] || '').replace(/["']/g, '').split('/').pop() || '';
    if (!binary || seen.has(`${name}|${binary}`)) continue;
    seen.add(`${name}|${binary}`);
    items.push({ name: name.trim(), binary, execCmd: execLine.trim(), category: category?.trim() || undefined });
  }

  const dev = keyValues(s.get('dev') || []);
  const version = (key: string, strip: RegExp) => first(dev, key)?.replace(strip, '').trim().split(/\s+/)[0] || undefined;
  const packageManagers = (s.get('pkg') || []).map(l => l.trim()).filter(Boolean);

  const ros = keyValues(s.get('ros') || []);
  const rosDistros = ros.get('DISTRO') || [];
  const rosEnv = first(ros, 'ENV');

  const filesystems: FilesystemMountInfo[] = [];
  for (const line of s.get('fs') || []) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 7) continue;
    const [, fsType, blocks, , avail, , mountPoint] = parts;
    const totalGb = round1(parseInt(blocks, 10) / (1024 * 1024));
    const freeGb = round1(parseInt(avail, 10) / (1024 * 1024));
    if (!Number.isFinite(totalGb) || totalGb <= 0) continue;
    filesystems.push({
      mountPoint,
      fsType,
      totalGb,
      freeGb,
      freePercent: Math.round((freeGb / totalGb) * 100),
      hasSnapshots: fsType === 'btrfs' || fsType === 'zfs'
    });
  }

  const shellLines = s.get('shells') || [];
  const shellKv = keyValues(shellLines);
  const net = keyValues(s.get('net') || []);
  const links = net.get('LINK') || [];
  const localIp = first(net, 'IP')?.split('/')[0];

  return {
    scannedAt: now,
    os: {
      name: first(os, 'PRETTY_NAME') || first(os, 'NAME') || 'Linux',
      id: first(os, 'ID') || 'linux',
      idLike: first(os, 'ID_LIKE'),
      version: first(os, 'VERSION_ID') || 'rolling',
      kernel: first(os, 'KERNEL') || 'unknown',
      initSystem: first(os, 'INIT') || 'unknown',
      sessionType: session === 'wayland' ? 'wayland' : session === 'x11' ? 'x11' : session === 'tty' ? 'tty' : 'unknown',
      desktopEnvironment: first(os, 'DESKTOP') || 'unknown'
    },
    hardware: {
      cpuModel,
      cpuCores: Number.isFinite(cores) && cores > 0 ? cores : undefined,
      cpuArch: first(os, 'ARCH'),
      ramTotalGb: mem.MemTotal !== undefined ? round1(mem.MemTotal) : undefined,
      ramAvailableGb: mem.MemAvailable !== undefined ? round1(mem.MemAvailable) : undefined,
      swapTotalGb: mem.SwapTotal !== undefined ? round1(mem.SwapTotal) : undefined,
      gpuName: nvidia?.[0],
      gpuVramGb: nvidia?.[1] ? Math.round(parseInt(nvidia[1], 10) / 1024) : undefined,
      gpuVendors,
      hasVulkan: first(gpu, 'VULKAN') === '1',
      isGpuAvailable: gpuVendors.some(v => v === 'nvidia' || v === 'amd')
    },
    apps: {
      totalCount: items.length,
      items,
      defaultBrowser: (s.get('browser') || [])[0]?.trim() || undefined
    },
    developer: {
      python: version('python3', /^Python/i),
      node: version('node', /^v/),
      rust: version('rustc', /^rustc/),
      gcc: first(dev, 'gcc')?.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1],
      go: first(dev, 'go')?.match(/go(\d+\.\d+(?:\.\d+)?)/)?.[1],
      dockerRunning: first(dev, 'DOCKER_SOCKET') === '1',
      packageManagers,
      preferredPackageManager: preferredPackageManager(first(os, 'ID') || '', first(os, 'ID_LIKE'), packageManagers),
      tools: dev.get('TOOL') || []
    },
    ros: rosDistros.length || rosEnv ? { distros: rosDistros, activeDistro: rosEnv } : undefined,
    filesystems,
    shells: {
      available: shellLines.filter(l => l.startsWith('/') && !l.includes('git-shell')).map(l => l.trim()),
      defaultShell: first(shellKv, 'DEFAULT') || '/bin/bash',
      detectedDotfiles: shellKv.get('DOT') || []
    },
    network: {
      connectedSsid: first(net, 'SSID'),
      localIp,
      activeVpn: links.find(l => /^(tun|wg|tailscale|proton|nordlynx)/.test(l)),
      hasInternet: Boolean(localIp)
    },
    services: {
      runningServices: (s.get('services') || []).map(l => l.trim()).filter(Boolean),
      listeningPorts: (s.get('ports') || []).map(l => parseInt(l, 10)).filter(n => Number.isFinite(n) && n > 0)
    }
  };
}

const WINDOW_CONTROL: Record<string, string> = {
  hyprland: 'Window control: hyprctl (dispatch focuswindow/movetoworkspace/killactive); screenshots: grim + slurp',
  sway: 'Window control: swaymsg; screenshots: grim + slurp',
  x11: 'Window control: wmctrl / xdotool; screenshots: scrot',
  gnome: 'Window control: no generic CLI on GNOME Wayland; screenshots: gnome-screenshot',
  kde: 'Window control: no generic CLI on KDE Wayland (use qdbus/kdotool if installed); screenshots: spectacle',
};

function windowControlHint(p: SystemProfile): string | undefined {
  const hint = WINDOW_CONTROL[detectCompositor(p.os.desktopEnvironment, p.os.sessionType)];
  return hint ? `- ${hint}` : undefined;
}

export class SystemKnowledgeScanner {
  private static instance: SystemKnowledgeScanner;
  private cachedProfile: SystemProfile | null = null;
  private isScanning = false;
  private static readonly STORAGE_KEY = 'sentinel_system_profile';
  /** Rescan at least this often even if the fingerprint did not change */
  private static readonly MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): SystemKnowledgeScanner {
    if (!SystemKnowledgeScanner.instance) {
      SystemKnowledgeScanner.instance = new SystemKnowledgeScanner();
    }
    return SystemKnowledgeScanner.instance;
  }

  private loadFromStorage(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SystemKnowledgeScanner.STORAGE_KEY) : null;
      if (raw) this.cachedProfile = JSON.parse(raw) as SystemProfile;
    } catch {
      // Non-fatal
    }
  }

  private saveToStorage(profile: SystemProfile): void {
    this.cachedProfile = profile;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SystemKnowledgeScanner.STORAGE_KEY, JSON.stringify(profile));
      }
    } catch {
      // Non-fatal
    }
  }

  public getProfile(): SystemProfile | null {
    return this.cachedProfile;
  }

  /** Parse and store raw SCAN_SCRIPT output (also used by tests). */
  public applyScanOutput(raw: string, fingerprint?: string): SystemProfile {
    const profile = parseScanOutput(raw);
    profile.fingerprint = fingerprint;
    this.saveToStorage(profile);
    return profile;
  }

  /**
   * Fast in-memory lookup for an application by name or binary
   */
  public findApplication(query: string): InstalledAppInfo | undefined {
    if (!this.cachedProfile) return undefined;
    const q = query.toLowerCase().trim();
    if (!q) return undefined;
    const apps = this.cachedProfile.apps.items;
    return apps.find(app => app.name.toLowerCase() === q || app.binary.toLowerCase() === q)
      || apps.find(app => app.name.toLowerCase().includes(q) || app.binary.toLowerCase().includes(q));
  }

  /**
   * Stable facts for the model prompt. Volatile values (free disk, IP, open ports) are left out
   * on purpose: they go stale between scans, and the model can run a command for the live value.
   */
  public getQuickSummary(): string {
    const p = this.cachedProfile;
    if (!p) {
      return 'SYSTEM KNOWLEDGE PROFILE: not scanned yet';
    }

    const hw = p.hardware;
    const cpu = [hw.cpuModel, hw.cpuCores ? `${hw.cpuCores} threads` : undefined, hw.cpuArch].filter(Boolean).join(', ');
    const gpu = hw.gpuName
      || (hw.gpuVendors && hw.gpuVendors.length ? hw.gpuVendors.join(' + ').toUpperCase() : undefined);
    const toolchains = [
      p.developer.python && `Python ${p.developer.python}`,
      p.developer.node && `Node ${p.developer.node}`,
      p.developer.rust && `Rust ${p.developer.rust}`,
      p.developer.gcc && `GCC ${p.developer.gcc}`,
      p.developer.go && `Go ${p.developer.go}`,
      p.developer.dockerRunning && 'Docker'
    ].filter(Boolean).join(', ');
    const apps = p.apps.items.slice(0, 15).map(a => `${a.name} (${a.binary})`).join(', ');

    const lines = [
      'SYSTEM KNOWLEDGE PROFILE:',
      `- OS: ${p.os.name} (kernel ${p.os.kernel}, ${p.os.sessionType} session, ${p.os.desktopEnvironment}, init ${p.os.initSystem})`,
      cpu || hw.ramTotalGb ? `- Hardware: ${[cpu, hw.ramTotalGb ? `${hw.ramTotalGb} GB RAM` : undefined, gpu ? `GPU ${gpu}` : undefined].filter(Boolean).join(' | ')}` : undefined,
      p.developer.preferredPackageManager
        ? `- Package manager: ${p.developer.preferredPackageManager} (also: ${p.developer.packageManagers.join(', ') || 'none'})`
        : (p.developer.packageManagers.length ? `- Package managers: ${p.developer.packageManagers.join(', ')}` : undefined),
      toolchains ? `- Toolchains: ${toolchains}` : undefined,
      p.developer.tools && p.developer.tools.length ? `- Tools on PATH: ${p.developer.tools.join(', ')}` : undefined,
      p.ros ? `- ROS 2: ${p.ros.distros.join(', ') || 'none installed'}${p.ros.activeDistro ? ` (active: ${p.ros.activeDistro})` : ''}` : undefined,
      `- Shell: ${p.shells.defaultShell}`,
      windowControlHint(p),
      apps ? `- Installed apps (${p.apps.totalCount}): ${apps}${p.apps.totalCount > 15 ? ', ...' : ''}` : undefined
    ];
    return lines.filter(Boolean).join('\n');
  }

  private async execCmd(cmd: string, timeoutMs: number): Promise<string> {
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
      return '';
    }
    try {
      const res = await invoke<{ stdout?: string }>('execute_command', { command: 'sh', args: ['-c', cmd], timeoutMs });
      return res?.stdout || '';
    } catch {
      return '';
    }
  }

  /**
   * Scan the system, or reuse the stored profile when nothing relevant changed.
   * `force` always rescans.
   */
  public async scan(force = false): Promise<SystemProfile> {
    if (this.isScanning && this.cachedProfile) return this.cachedProfile;
    this.isScanning = true;
    try {
      const fingerprint = (await this.execCmd(FINGERPRINT_SCRIPT, 5_000)).trim() || undefined;
      const cached = this.cachedProfile;
      const fresh = cached
        && fingerprint
        && cached.fingerprint === fingerprint
        && Date.now() - cached.scannedAt < SystemKnowledgeScanner.MAX_AGE_MS;
      if (!force && fresh) return cached!;

      const raw = await this.execCmd(SCAN_SCRIPT, 30_000);
      if (!raw.includes('@@end')) {
        // Not running inside the app (tests, browser preview) or the scan failed: keep what we had
        return cached || parseScanOutput('');
      }
      return this.applyScanOutput(raw, fingerprint);
    } finally {
      this.isScanning = false;
    }
  }
}
