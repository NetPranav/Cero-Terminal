/**
 * StateTypes.ts — Core Data Contracts for Cero V3 State Engine & World Model
 *
 * Implements rigorous state wrappers containing timestamp, confidence (0.0 to 1.0),
 * origin source, and dynamically computed freshness indicators.
 */

export type StateFreshness = 'hot' | 'warm' | 'stale' | 'expired';
export type CacheTier = 'hot' | 'cold';

/**
 * Every state value stored in the World Model or returned by collectors MUST be wrapped
 * in StateMetadata. The Planner should never assume state is perfectly accurate or timeless.
 */
export interface StateMetadata<T = unknown> {
  /** Underlying domain state payload */
  readonly data: T;
  /** Unix timestamp in milliseconds when this state was harvested or observed */
  readonly timestamp: number;
  /** Confidence score between 0.0 (unreliable/guess) and 1.0 (verified native system query) */
  readonly confidence: number;
  /** Identifier of the originator (e.g., 'collector:wifi', 'watcher:process', 'event:runtime') */
  readonly source: string;
  /** Calculated aging categorization based on TTL and elapsed duration */
  readonly freshness: StateFreshness;
}

/**
 * Real-time event notifications emitted across the system when operating system state mutates.
 * Prefer subscriptions over polling to maintain synchronization.
 */
export type StateEventType =
  | 'ApplicationStarted'
  | 'ApplicationClosed'
  | 'WiFiConnected'
  | 'WiFiDisconnected'
  | 'BluetoothConnected'
  | 'BluetoothDisconnected'
  | 'FileCreated'
  | 'FileModified'
  | 'FolderDeleted'
  | 'PortOpened'
  | 'PortClosed'
  | 'ContainerStarted'
  | 'ContainerStopped'
  | 'RepositoryChanged'
  | 'BatteryChanged'
  | 'StateUpdated';

export interface StateEvent<T = unknown> {
  readonly id: string;
  readonly type: StateEventType;
  readonly timestamp: number;
  readonly payload: T;
  readonly source: string;
}

export interface CacheEntry<T = unknown> {
  key: string;
  tier: CacheTier;
  value: StateMetadata<T>;
  ttlMs: number;
  expiresAt: number;
}

export interface StateDiffItem {
  domain: string;
  key: string;
  type: 'added' | 'modified' | 'deleted' | 'unchanged';
  before?: unknown;
  after?: unknown;
}

export interface StateDiffReport {
  timestamp: number;
  previousSnapshotId: string;
  currentSnapshotId: string;
  changes: StateDiffItem[];
  hasModifications: boolean;
}
