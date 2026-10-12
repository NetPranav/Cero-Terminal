/**
 * StateEngine.ts — Centralized State Engine & World Model Synchronization Hub
 *
 * Serves as Cero's single source of truth for all operating system state.
 * Orchestrates Hot/Cold caching, watcher subscriptions, decentralized collector harvests,
 * immutable snapshot history, structural diffing, and ergonomic query evaluation.
 */

import { WorldModel, createDefaultWorldModel, createDefaultMetadata } from '../models/WorldModel';
import { StateCache, globalStateCache } from '../cache/StateCache';
import { StateEventBus, globalStateEventBus } from '../events/StateEventBus';
import { StateWatchers, globalStateWatchers } from '../watchers/StateWatchers';
import { StateCollectorManager, globalStateCollectorManager } from '../collectors/StateCollectorManager';
import { StateSnapshotManager, globalStateSnapshotManager } from '../snapshot/StateSnapshot';
import { StateDiffer, globalStateDiffer } from '../diff/StateDiffer';
import { StateQueries, globalStateQueries } from '../queries/StateQueries';
import { StateTelemetry, globalStateTelemetry } from '../telemetry/StateTelemetry';
import { StateDiffReport } from '../models/StateTypes';

export class StateEngine {
  public readonly cache: StateCache;
  public readonly eventBus: StateEventBus;
  public readonly watchers: StateWatchers;
  public readonly collectors: StateCollectorManager;
  public readonly snapshots: StateSnapshotManager;
  public readonly differ: StateDiffer;
  public readonly queries: StateQueries;
  public readonly telemetry: StateTelemetry;
  private initialized = false;

  constructor(
    cache = globalStateCache,
    eventBus = globalStateEventBus,
    watchers = globalStateWatchers,
    collectors = globalStateCollectorManager,
    snapshots = globalStateSnapshotManager,
    differ = globalStateDiffer,
    queries = globalStateQueries,
    telemetry = globalStateTelemetry
  ) {
    this.cache = cache;
    this.eventBus = eventBus;
    this.watchers = watchers;
    this.collectors = collectors;
    this.snapshots = snapshots;
    this.differ = differ;
    this.queries = queries;
    this.telemetry = telemetry;
  }

  /**
   * Initialize State Engine, start event watcher subscriptions, and synthesize initial World Model.
   */
  public async initialize(): Promise<WorldModel> {
    if (this.initialized && this.snapshots.getCurrentSnapshot()) {
      return this.snapshots.getCurrentSnapshot()!;
    }

    // 1. Generate baseline immutable World Model
    const initialModel = createDefaultWorldModel();
    this.snapshots.recordSnapshot(initialModel);
    this.telemetry.recordSnapshotGenerated();

    // 2. Start live OS mutation watcher hooks (Event-Driven updates)
    this.watchers.startWatching();

    // 3. Populate initial hot cache parameters
    await this.queries.currentSSID();
    await this.queries.batteryLevel();

    this.initialized = true;
    return initialModel;
  }

  /**
   * Harvest fresh state from decentralized SDK Capability collectors, synthesize a new
   * immutable snapshot, and compute structural deltas.
   */
  public async refreshState(domainFilter?: string): Promise<{ snapshot: WorldModel; diff?: StateDiffReport }> {
    if (!this.initialized) await this.initialize();

    const current = this.snapshots.getCurrentSnapshot() || createDefaultWorldModel();
    this.telemetry.recordCollectorRefresh();

    // Harvest decentralized state payloads
    const harvested = domainFilter
      ? [await this.collectors.collectDomain(domainFilter)].filter(Boolean)
      : await this.collectors.collectAll();

    // Create shallow copy of current snapshot to prepare next immutable state
    const nextOverrides: Record<string, any> = {};

    for (const h of harvested) {
      if (!h) continue;
      const domain = h.domain;
      // Map domain ID to corresponding WorldModel domain attribute if compatible
      const wmKey = this.mapDomainToModelKey(domain);
      if (wmKey) {
        nextOverrides[wmKey] = createDefaultMetadata(h.data, h.source, h.confidence);
        // Also invalidate corresponding cache prefix
        this.cache.invalidatePrefix(domain);
      }
    }

    const nextModel: WorldModel = {
      ...current,
      ...nextOverrides,
      snapshotId: `snap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    } as WorldModel;

    // Record immutable snapshot in history
    const frozen = this.snapshots.recordSnapshot(nextModel);
    this.telemetry.recordSnapshotGenerated();

    // Calculate diff against immediate predecessor
    let diffReport: StateDiffReport | undefined;
    if (current.snapshotId !== frozen.snapshotId) {
      diffReport = this.differ.diff(current, frozen);
      this.telemetry.recordDiffComputed();
    }

    this.eventBus.emit('StateUpdated', { snapshotId: frozen.snapshotId, changes: diffReport?.changes.length || 0 }, 'state:engine');

    return { snapshot: frozen, diff: diffReport };
  }

  /**
   * Compute structural diff between any two historical snapshots.
   */
  public getDiff(previousSnapshotId?: string, currentSnapshotId?: string): StateDiffReport {
    const current = currentSnapshotId ? this.snapshots.getSnapshotById(currentSnapshotId) : this.snapshots.getCurrentSnapshot();
    const previous = previousSnapshotId ? this.snapshots.getSnapshotById(previousSnapshotId) : this.snapshots.getPreviousSnapshot();

    if (!current || !previous) {
      const model = current || this.snapshots.getCurrentSnapshot() || createDefaultWorldModel();
      return this.differ.diff(model, model);
    }

    this.telemetry.recordDiffComputed();
    return this.differ.diff(previous, current);
  }

  private mapDomainToModelKey(domain: string): keyof WorldModel | undefined {
    const map: Record<string, keyof WorldModel> = {
      application: 'applications',
      process: 'processes',
      window: 'windows',
      filesystem: 'filesystem',
      network: 'network',
      wifi: 'wifi',
      bluetooth: 'bluetooth',
      system: 'volumes',
      docker: 'docker',
      git: 'git',
      node: 'node',
      python: 'python',
      developer: 'developerTools',
      terminal: 'terminalSessions',
    };
    return map[domain.toLowerCase()];
  }

  public getAuthoritativeSnapshot(): WorldModel {
    return this.snapshots.getCurrentSnapshot() || createDefaultWorldModel();
  }

  public shutdown(): void {
    this.watchers.stopWatching();
    this.cache.destroy();
    this.eventBus.clearSubscribers();
    this.initialized = false;
  }
}

export const globalStateEngine = new StateEngine();
