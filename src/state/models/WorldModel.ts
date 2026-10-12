/**
 * WorldModel.ts — The Single Source of Truth representing current Operating System state.
 *
 * All domain state is structured, immutable, and stamped with explicit confidence metadata.
 * No other module in Cero V3 should cache OS state independently.
 */

import { StateMetadata } from './StateTypes';

// ── Structured Domain State Interfaces ────────────────────────────────────────

export interface ApplicationState {
  runningApps: Array<{ name: string; bundleId: string; pid: number; isForeground: boolean }>;
  installedApps: string[];
}

export interface ProcessState {
  processes: Array<{ pid: number; name: string; cpuUsage: number; memoryUsage: number }>;
  listeningPorts: Array<{ port: number; pid: number; protocol: 'TCP' | 'UDP' }>;
}

export interface WindowState {
  activeWindows: Array<{ title: string; appName: string; bounds: { x: number; y: number; w: number; h: number } }>;
}

export interface FilesystemState {
  knownDirectories: Record<string, { exists: boolean; isEmpty: boolean; lastModified: number }>;
}

export interface NetworkState {
  activeInterfaces: Array<{ interface: string; ip: string; isOnline: boolean }>;
}

export interface WifiState {
  connectedSSID: string | null;
  powered: boolean;
  interface: string;
}

export interface BluetoothState {
  powered: boolean;
  connectedDevices: Array<{ name: string; address: string; connected: boolean }>;
}

export interface VolumeState {
  mountedVolumes: Array<{ name: string; path: string; totalSpaceGb: number; availableSpaceGb: number }>;
}

export interface DisplayState {
  displays: Array<{ resolution: string; isPrimary: boolean; brightness: number }>;
}

export interface AudioState {
  outputVolume: number;
  isMuted: boolean;
  inputVolume: number;
}

export interface BatteryState {
  batteryLevel: number; // 0 to 100
  isCharging: boolean;
  timeRemainingMinutes: number | null;
}

export interface DockerState {
  daemonRunning: boolean;
  containers: Array<{ id: string; name: string; image: string; status: string; ports: number[] }>;
}

export interface GitState {
  knownRepositories: Record<string, { currentBranch: string; isClean: boolean; aheadBehind: string }>;
}

export interface NodeState {
  version: string | null;
  globalNpmPackages: string[];
}

export interface PythonState {
  version: string | null;
  virtualEnvironments: string[];
}

export interface DeveloperToolsState {
  xcodeInstalled: boolean;
  activeIde: string | null; // e.g. 'Cursor' or 'VS Code'
  simulatorRunning: boolean;
}

export interface EnvironmentVariableState {
  vars: Record<string, string>;
}

export interface TerminalSessionState {
  sessions: Array<{ tty: string; shell: string; activeProcess: string; pid: number }>;
}

// ── Complete World Model Representation ───────────────────────────────────────

export interface WorldModel {
  readonly snapshotId: string;
  readonly timestamp: number;
  readonly applications: StateMetadata<ApplicationState>;
  readonly processes: StateMetadata<ProcessState>;
  readonly windows: StateMetadata<WindowState>;
  readonly filesystem: StateMetadata<FilesystemState>;
  readonly network: StateMetadata<NetworkState>;
  readonly wifi: StateMetadata<WifiState>;
  readonly bluetooth: StateMetadata<BluetoothState>;
  readonly volumes: StateMetadata<VolumeState>;
  readonly displays: StateMetadata<DisplayState>;
  readonly audio: StateMetadata<AudioState>;
  readonly battery: StateMetadata<BatteryState>;
  readonly docker: StateMetadata<DockerState>;
  readonly git: StateMetadata<GitState>;
  readonly node: StateMetadata<NodeState>;
  readonly python: StateMetadata<PythonState>;
  readonly developerTools: StateMetadata<DeveloperToolsState>;
  readonly environmentVariables: StateMetadata<EnvironmentVariableState>;
  readonly terminalSessions: StateMetadata<TerminalSessionState>;
}

/**
 * Deep freezes an object to enforce strict runtime immutability on WorldModel snapshots.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const val = (obj as any)[prop];
    if (val !== null && (typeof val === 'object' || typeof val === 'function')) {
      deepFreeze(val);
    }
  });
  return Object.freeze(obj);
}

export function createDefaultMetadata<T>(data: T, source = 'system:default', confidence = 1.0): StateMetadata<T> {
  return {
    data,
    timestamp: Date.now(),
    confidence,
    source,
    freshness: 'hot',
  };
}

/**
 * Creates an initial, immutable default World Model snapshot.
 */
export function createDefaultWorldModel(snapshotId = `snap-${Date.now()}`): WorldModel {
  const model: WorldModel = {
    snapshotId,
    timestamp: Date.now(),
    applications: createDefaultMetadata({ runningApps: [{ name: 'Cursor', bundleId: 'com.cursor.app', pid: 4510, isForeground: true }], installedApps: ['Cursor', 'Safari', 'Xcode', 'Terminal'] }, 'collector:application'),
    processes: createDefaultMetadata({ processes: [{ pid: 4510, name: 'Cursor', cpuUsage: 2.1, memoryUsage: 412 }], listeningPorts: [{ port: 3000, pid: 4510, protocol: 'TCP' }, { port: 8080, pid: 8812, protocol: 'TCP' }] }, 'collector:process'),
    windows: createDefaultMetadata({ activeWindows: [{ title: 'AI Terminal — Cursor', appName: 'Cursor', bounds: { x: 0, y: 0, w: 1440, h: 900 } }] }, 'collector:window'),
    filesystem: createDefaultMetadata({ knownDirectories: { '/home/user/project': { exists: true, isEmpty: false, lastModified: Date.now() }, '/tmp/empty_test_folder': { exists: true, isEmpty: true, lastModified: Date.now() } } }, 'collector:filesystem'),
    network: createDefaultMetadata({ activeInterfaces: [{ interface: 'en0', ip: '192.168.1.105', isOnline: true }] }, 'collector:network'),
    wifi: createDefaultMetadata({ connectedSSID: 'Cero_5G_Network', powered: true, interface: 'en0' }, 'collector:wifi'),
    bluetooth: createDefaultMetadata({ powered: true, connectedDevices: [{ name: 'Magic Keyboard', address: '00:1A:7D:DA:71:13', connected: true }, { name: 'AirPods Pro', address: '00:1A:7D:EE:22:91', connected: true }] }, 'collector:bluetooth'),
    volumes: createDefaultMetadata({ mountedVolumes: [{ name: 'Macintosh HD', path: '/', totalSpaceGb: 994, availableSpaceGb: 412 }, { name: 'External SSD', path: '/Volumes/External SSD', totalSpaceGb: 2000, availableSpaceGb: 1450 }] }, 'collector:system'),
    displays: createDefaultMetadata({ displays: [{ resolution: '3456x2234', isPrimary: true, brightness: 85 }] }, 'collector:system'),
    audio: createDefaultMetadata({ outputVolume: 65, isMuted: false, inputVolume: 80 }, 'collector:system'),
    battery: createDefaultMetadata({ batteryLevel: 92, isCharging: true, timeRemainingMinutes: null }, 'collector:system'),
    docker: createDefaultMetadata({ daemonRunning: true, containers: [{ id: 'c8f2d910a30b', name: 'dev-db', image: 'postgres:15', status: 'Up 4 hours', ports: [5432] }] }, 'collector:docker'),
    git: createDefaultMetadata({ knownRepositories: { '/home/user/project': { currentBranch: 'main', isClean: true, aheadBehind: '0/0' } } }, 'collector:git'),
    node: createDefaultMetadata({ version: 'v20.11.0', globalNpmPackages: ['npm', 'typescript', 'vitest', 'eslint'] }, 'collector:node'),
    python: createDefaultMetadata({ version: '3.12.2', virtualEnvironments: ['/Users/dev/.venv/default'] }, 'collector:python'),
    developerTools: createDefaultMetadata({ xcodeInstalled: true, activeIde: 'Cursor AI', simulatorRunning: false }, 'collector:developer'),
    environmentVariables: createDefaultMetadata({ vars: { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', SHELL: '/bin/zsh', USER: 'user', TERM: 'xterm-256color' } }, 'collector:terminal'),
    terminalSessions: createDefaultMetadata({ sessions: [{ tty: '/dev/ttys001', shell: '/bin/zsh', activeProcess: 'node', pid: 4512 }] }, 'collector:terminal'),
  };
  return deepFreeze(model);
}
