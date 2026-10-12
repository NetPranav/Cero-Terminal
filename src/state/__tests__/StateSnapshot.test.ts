import { describe, it, expect, beforeEach } from 'vitest';
import { StateSnapshotManager } from '../snapshot/StateSnapshot';
import { createDefaultWorldModel, WorldModel } from '../models/WorldModel';

describe('StateSnapshotManager — Immutable World Model Snapshots & History', () => {
  let manager: StateSnapshotManager;

  beforeEach(() => {
    manager = new StateSnapshotManager();
  });

  it('should create and record an initial immutable World Model snapshot across all 16+ domain trees', () => {
    const defaultModel = createDefaultWorldModel('test-snap-1');
    manager.recordSnapshot(defaultModel);

    const current = manager.getCurrentSnapshot()!;
    expect(current.snapshotId).toBe('test-snap-1');
    expect(current.applications).toBeDefined();
    expect(current.processes).toBeDefined();
    expect(current.wifi.data.connectedSSID).toBe('Cero_5G_Network');
    expect(current.battery.data.batteryLevel).toBe(92);
    expect(current.developerTools.data.activeIde).toBe('Cursor AI');
  });

  it('should enforce strict runtime immutability via deep freezing on every snapshot', () => {
    const model = createDefaultWorldModel('freeze-snap');
    const frozen = manager.recordSnapshot(model);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.applications)).toBe(true);
    expect(Object.isFrozen(frozen.applications.data.runningApps)).toBe(true);
    
    expect(() => {
      (frozen.wifi as any).data = { connectedSSID: 'Hacked_Network' };
    }).toThrow();
  });

  it('should maintain chronological snapshot history for debugging and learning pipelines', () => {
    const s1 = createDefaultWorldModel('snap-100');
    const s2 = createDefaultWorldModel('snap-101');
    const s3 = createDefaultWorldModel('snap-102');

    manager.recordSnapshot(s1);
    manager.recordSnapshot(s2);
    manager.recordSnapshot(s3);

    expect(manager.getHistorySize()).toBe(3);
    expect(manager.getCurrentSnapshot()?.snapshotId).toBe('snap-102');
    expect(manager.getPreviousSnapshot()?.snapshotId).toBe('snap-101');
    expect(manager.getSnapshotById('snap-100')).toBeDefined();
  });
});
