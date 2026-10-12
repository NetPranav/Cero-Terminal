/**
 * StateWatchers.ts — Real-time event subscription handlers and OS mutation watchers
 *
 * Replaces iterative polling by listening to system event hooks and publishing
 * synchronized delta events directly onto the StateEventBus.
 */

import { StateEventBus, globalStateEventBus } from '../events/StateEventBus';

export class StateWatchers {
  private eventBus: StateEventBus;
  private active = false;
  private simulationTimer?: NodeJS.Timeout;

  constructor(eventBus: StateEventBus = globalStateEventBus) {
    this.eventBus = eventBus;
  }

  public startWatching(mockPeriodicEmits = false): void {
    if (this.active) return;
    this.active = true;

    // TODO(3.7): bind to Windows change notifications (power, Wi-Fi, Bluetooth) instead of simulated events
    if (mockPeriodicEmits && process.env.NODE_ENV !== 'test') {
      this.simulationTimer = setInterval(() => {
        this.notifyBatteryChanged(91, true);
      }, 30000);
    }
  }

  public stopWatching(): void {
    this.active = false;
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = undefined;
    }
  }

  public isWatching(): boolean {
    return this.active;
  }

  // ── Emitter APIs for live system mutation hooks ─────────────────────────────

  public notifyApplicationStarted(name: string, bundleId: string, pid: number): void {
    this.eventBus.emit('ApplicationStarted', { name, bundleId, pid, isForeground: true }, 'watcher:application');
  }

  public notifyApplicationClosed(name: string, pid: number): void {
    this.eventBus.emit('ApplicationClosed', { name, pid }, 'watcher:application');
  }

  public notifyWifiChanged(ssid: string | null, interfaceName = 'en0'): void {
    const evType = ssid ? 'WiFiConnected' : 'WiFiDisconnected';
    this.eventBus.emit(evType, { ssid, interface: interfaceName }, 'watcher:wifi');
  }

  public notifyBluetoothChanged(device: string, connected: boolean): void {
    const evType = connected ? 'BluetoothConnected' : 'BluetoothDisconnected';
    this.eventBus.emit(evType, { device, connected }, 'watcher:bluetooth');
  }

  public notifyFileCreated(path: string, sizeBytes = 1024): void {
    this.eventBus.emit('FileCreated', { path, sizeBytes, timestamp: Date.now() }, 'watcher:filesystem');
  }

  public notifyFolderDeleted(path: string): void {
    this.eventBus.emit('FolderDeleted', { path }, 'watcher:filesystem');
  }

  public notifyPortOpened(port: number, pid: number, protocol: 'TCP' | 'UDP' = 'TCP'): void {
    this.eventBus.emit('PortOpened', { port, pid, protocol }, 'watcher:network');
  }

  public notifyContainerStarted(id: string, name: string, image: string): void {
    this.eventBus.emit('ContainerStarted', { id, name, image, status: 'Up 1 second' }, 'watcher:docker');
  }

  public notifyRepositoryChanged(repoPath: string, branch: string, isClean: boolean): void {
    this.eventBus.emit('RepositoryChanged', { repoPath, branch, isClean }, 'watcher:git');
  }

  public notifyBatteryChanged(level: number, charging: boolean): void {
    this.eventBus.emit('BatteryChanged', { batteryLevel: level, isCharging: charging }, 'watcher:battery');
  }
}

export const globalStateWatchers = new StateWatchers(globalStateEventBus);
