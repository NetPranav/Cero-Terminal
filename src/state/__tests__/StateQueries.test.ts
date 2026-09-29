import { describe, it, expect, beforeEach } from 'vitest';
import { StateQueries } from '../queries/StateQueries';
import { StateCache } from '../cache/StateCache';
import { StateSnapshotManager } from '../snapshot/StateSnapshot';
import { createDefaultWorldModel } from '../models/WorldModel';
import { StateEventBus } from '../events/StateEventBus';

describe('StateQueries — Strongly-Typed Ergonomic Query Layer', () => {
  let queries: StateQueries;
  let cache: StateCache;
  let snapshotManager: StateSnapshotManager;

  beforeEach(() => {
    cache = new StateCache(new StateEventBus());
    snapshotManager = new StateSnapshotManager(createDefaultWorldModel('query-snap-001'));
    queries = new StateQueries(cache, snapshotManager);
  });

  it('1 & 2. isRunning & isInstalled: should verify application states with explicit confidence scoring', async () => {
    const runRes = await queries.isRunning('Cursor');
    expect(runRes.data).toBe(true);
    expect(runRes.confidence).toBe(1.0);
    expect(runRes.freshness).toBe('hot');

    const notRun = await queries.isRunning('NonExistentApp');
    expect(notRun.data).toBe(false);

    const instRes = await queries.isInstalled('Safari');
    expect(instRes.data).toBe(true);
  });

  it('3. isConnected: should audit Wi-Fi SSID and Bluetooth hardware device affiliations', async () => {
    const btConn = await queries.isConnected('Magic Keyboard');
    expect(btConn.data).toBe(true);

    const wifiConn = await queries.isConnected('Sentinel_5G_Network');
    expect(wifiConn.data).toBe(true);
  });

  it('4 & 5. exists & isEmpty: should verify directory paths and emptiness assertions', async () => {
    const exRes = await queries.exists('/home/user/project');
    expect(exRes.data).toBe(true);

    const emptyRes = await queries.isEmpty('/tmp/empty_test_folder');
    expect(emptyRes.data).toBe(true);
    expect(emptyRes.source).toContain('query:isEmpty');
  });

  it('6 & 7. isMounted & ownsPort: should verify storage volumes and TCP socket process allocations', async () => {
    const mountRes = await queries.isMounted('Macintosh HD');
    expect(mountRes.data).toBe(true);

    const portRes = await queries.ownsPort(3000);
    expect(portRes.data).toBe(4510); // PID of Cursor test service
    expect(portRes.confidence).toBe(1.0);
  });

  it('8, 9 & 10. currentSSID, batteryLevel & foregroundApp: should query system status with metadata', async () => {
    const ssidRes = await queries.currentSSID();
    expect(ssidRes.data).toBe('Sentinel_5G_Network');

    const battRes = await queries.batteryLevel();
    expect(battRes.data).toBe(92);

    const fgRes = await queries.foregroundApp();
    expect(fgRes.data).toBe('Cursor');
    expect(fgRes.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('should guarantee all returned state results include confidence, timestamp, source, and freshness attributes', async () => {
    const res = await queries.batteryLevel();
    expect(typeof res.confidence).toBe('number');
    expect(typeof res.timestamp).toBe('number');
    expect(typeof res.source).toBe('string');
    expect(['hot', 'warm', 'stale', 'expired']).toContain(res.freshness);
  });
});
