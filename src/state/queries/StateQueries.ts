/**
 * StateQueries.ts — Ergonomic, Strongly-Typed State Query Layer
 *
 * Planner and Runtime should NEVER inspect raw snapshots directly.
 * All state inspections MUST occur via these typed APIs, which return verified
 * StateMetadata wrappers containing confidence, timestamp, and freshness indicators.
 */

import { StateMetadata } from '../models/StateTypes';
import { WorldModel, createDefaultMetadata } from '../models/WorldModel';
import { StateCache, globalStateCache } from '../cache/StateCache';
import { StateSnapshotManager, globalStateSnapshotManager } from '../snapshot/StateSnapshot';

export class StateQueries {
  private cache: StateCache;
  private snapshotManager: StateSnapshotManager;

  constructor(
    cache: StateCache = globalStateCache,
    snapshotManager: StateSnapshotManager = globalStateSnapshotManager
  ) {
    this.cache = cache;
    this.snapshotManager = snapshotManager;
  }

  private getModel(): WorldModel {
    return this.snapshotManager.getCurrentSnapshot() || ({} as WorldModel);
  }

  /**
   * Check if a specific application is currently running in the active process table.
   */
  public async isRunning(appName: string): Promise<StateMetadata<boolean>> {
    const cacheKey = `isRunning:${appName.toLowerCase()}`;
    const cached = this.cache.get<boolean>(cacheKey);
    if (cached && cached.freshness !== 'expired') return cached;

    const model = this.getModel();
    const apps = model.applications?.data?.runningApps || [];
    const running = apps.some(a => a.name.toLowerCase() === appName.toLowerCase() || a.bundleId.toLowerCase() === appName.toLowerCase());
    
    return this.cache.set(cacheKey, running, 'hot', model.applications?.confidence ?? 1.0, 'query:isRunning');
  }

  /**
   * Check if an application is in the installed-apps list of the state model.
   */
  public async isInstalled(appName: string): Promise<StateMetadata<boolean>> {
    const cacheKey = `isInstalled:${appName.toLowerCase()}`;
    const cached = this.cache.get<boolean>(cacheKey);
    if (cached && cached.freshness !== 'expired') return cached;

    const model = this.getModel();
    const installed = model.applications?.data?.installedApps || [];
    const isInst = installed.some(a => a.toLowerCase().includes(appName.toLowerCase()));

    return this.cache.set(cacheKey, isInst, 'cold', model.applications?.confidence ?? 1.0, 'query:isInstalled');
  }

  /**
   * Check if a Wi-Fi network SSID or Bluetooth peripheral device is connected.
   */
  public async isConnected(target: string): Promise<StateMetadata<boolean>> {
    const cacheKey = `isConnected:${target.toLowerCase()}`;
    const cached = this.cache.get<boolean>(cacheKey);
    if (cached && cached.freshness !== 'expired') return cached;

    const model = this.getModel();
    const wifiSsid = model.wifi?.data?.connectedSSID || '';
    const btDevices = model.bluetooth?.data?.connectedDevices || [];

    const wifiMatch = wifiSsid.toLowerCase() === target.toLowerCase();
    const btMatch = btDevices.some(d => d.connected && (d.name.toLowerCase() === target.toLowerCase() || d.address.toLowerCase() === target.toLowerCase()));

    return this.cache.set(cacheKey, wifiMatch || btMatch, 'hot', 1.0, 'query:isConnected');
  }

  /**
   * Verify whether a directory or file exists in the filesystem state cache.
   */
  public async exists(path: string): Promise<StateMetadata<boolean>> {
    const cacheKey = `exists:${path}`;
    const cached = this.cache.get<boolean>(cacheKey);
    if (cached && cached.freshness !== 'expired') return cached;

    const model = this.getModel();
    const dirs = model.filesystem?.data?.knownDirectories || {};
    const doesExist = dirs[path]?.exists ?? false;

    return this.cache.set(cacheKey, doesExist, 'hot', 0.95, 'query:exists');
  }

  /**
   * Verify whether a specified folder path is completely empty.
   */
  public async isEmpty(path: string): Promise<StateMetadata<boolean>> {
    const cacheKey = `isEmpty:${path}`;
    const cached = this.cache.get<boolean>(cacheKey);
    if (cached && cached.freshness !== 'expired') return cached;

    const model = this.getModel();
    const dirs = model.filesystem?.data?.knownDirectories || {};
    const empty = dirs[path]?.isEmpty ?? true;

    return this.cache.set(cacheKey, empty, 'hot', 0.95, 'query:isEmpty');
  }

  /**
   * Verify whether a specific external disk or storage volume is mounted.
   */
  public async isMounted(volumeName: string): Promise<StateMetadata<boolean>> {
    const cacheKey = `isMounted:${volumeName.toLowerCase()}`;
    const cached = this.cache.get<boolean>(cacheKey);
    if (cached && cached.freshness !== 'expired') return cached;

    const model = this.getModel();
    const vols = model.volumes?.data?.mountedVolumes || [];
    const mounted = vols.some(v => v.name.toLowerCase() === volumeName.toLowerCase() || v.path.toLowerCase().includes(volumeName.toLowerCase()));

    return this.cache.set(cacheKey, mounted, 'cold', 1.0, 'query:isMounted');
  }

  /**
   * Inspect which active process ID (PID) currently owns or listens on a target TCP/UDP socket port.
   */
  public async ownsPort(port: number): Promise<StateMetadata<number | null>> {
    const cacheKey = `ownsPort:${port}`;
    const cached = this.cache.get<number | null>(cacheKey);
    if (cached && cached.freshness !== 'expired') return cached;

    const model = this.getModel();
    const ports = model.processes?.data?.listeningPorts || [];
    const match = ports.find(p => p.port === port);
    const pid = match ? match.pid : null;

    return this.cache.set(cacheKey, pid, 'hot', 1.0, 'query:ownsPort');
  }

  /**
   * Retrieve the currently associated Wi-Fi SSID.
   */
  public async currentSSID(): Promise<StateMetadata<string | null>> {
    const cacheKey = 'currentSSID';
    const cached = this.cache.get<string | null>(cacheKey);
    if (cached && cached.freshness !== 'expired') return cached;

    const model = this.getModel();
    const ssid = model.wifi?.data?.connectedSSID || null;

    return this.cache.set(cacheKey, ssid, 'hot', model.wifi?.confidence ?? 1.0, 'query:currentSSID');
  }

  /**
   * Retrieve the current system hardware battery percentage (0 to 100).
   */
  public async batteryLevel(): Promise<StateMetadata<number>> {
    const cacheKey = 'batteryLevel';
    const cached = this.cache.get<number>(cacheKey);
    if (cached && cached.freshness !== 'expired') return cached;

    const model = this.getModel();
    const level = model.battery?.data?.batteryLevel ?? 100;

    return this.cache.set(cacheKey, level, 'hot', 1.0, 'query:batteryLevel');
  }

  /**
   * Retrieve the bundle ID or display name of the currently active foreground application window.
   */
  public async foregroundApp(): Promise<StateMetadata<string | null>> {
    const cacheKey = 'foregroundApp';
    const cached = this.cache.get<string | null>(cacheKey);
    if (cached && cached.freshness !== 'expired') return cached;

    const model = this.getModel();
    const apps = model.applications?.data?.runningApps || [];
    const fg = apps.find(a => a.isForeground);
    const appName = fg ? fg.name : null;

    return this.cache.set(cacheKey, appName, 'hot', 1.0, 'query:foregroundApp');
  }
}

export const globalStateQueries = new StateQueries();
