/**
 * SystemKnowledgeScanner.ts — what Cero knows about this machine.
 *
 * The profile (OS, hardware, installed apps, toolchains, package managers, shells) is injected into
 * the model prompt. Unknown values are left out: a profile never fills gaps with invented values,
 * because the model would treat them as facts about the user's machine.
 */

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
  /** The package manager to suggest (winget, scoop, choco) */
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
  /** nvidia | amd | intel */
  gpuVendors?: string[];
  hasVulkan?: boolean;
  isGpuAvailable: boolean;
  batteryPercent?: number;
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

/** A profile with nothing known yet */
export function emptyProfile(now = Date.now()): SystemProfile {
  return {
    scannedAt: now,
    os: { name: 'Windows', id: 'windows', version: '', kernel: '', initSystem: '', sessionType: 'unknown', desktopEnvironment: 'Windows' },
    hardware: { isGpuAvailable: false },
    apps: { totalCount: 0, items: [] },
    developer: { packageManagers: [] },
    filesystems: [],
    shells: { available: [], defaultShell: 'powershell.exe', detectedDotfiles: [] },
    network: { hasInternet: false },
    services: { runningServices: [], listeningPorts: [] },
  };
}

export class SystemKnowledgeScanner {
  private static instance: SystemKnowledgeScanner;
  private cachedProfile: SystemProfile | null = null;
  private static readonly STORAGE_KEY = 'cero_system_profile';

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

  /** Store a profile (from the Windows scan once it exists, and from tests). */
  public setProfile(profile: SystemProfile): void {
    this.saveToStorage(profile);
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
      `- Shell: ${p.shells.defaultShell}`,
      apps ? `- Installed apps (${p.apps.totalCount}): ${apps}${p.apps.totalCount > 15 ? ', ...' : ''}` : undefined
    ];
    return lines.filter(Boolean).join('\n');
  }

  /**
   * The stored profile, or an empty one.
   * TODO(4.1): scan Windows (Get-CimInstance for OS, CPU, RAM and GPU; Get-StartApps; winget/scoop/choco;
   * python/node/git versions) with a cheap fingerprint, as the Linux scanner did with its package databases.
   */
  public async scan(_force = false): Promise<SystemProfile> {
    return this.cachedProfile || emptyProfile();
  }
}
