/**
 * MemoryTypes.ts — Core Data Models for Cero Memory Engine
 *
 * Enforces immutable provenance, strict privacy labels, confidence scoring,
 * and semantic revision histories for the Knowledge Graph.
 */

export type MemoryLayer =
  | 'working'
  | 'session'
  | 'long_term'
  | 'semantic'
  | 'episodic'
  | 'preference'
  | 'workflow'
  | 'project'
  | 'device';

export type PrivacyLabel =
  | 'private'
  | 'shared'
  | 'workspace'
  | 'temporary'
  | 'archived'
  | 'deleted'
  | 'pinned';

export type MemorySourceType = 'user_explicit' | 'observation_automatic' | 'inferred';

export interface MemoryProvenance {
  readonly source: string;
  readonly sourceType: MemorySourceType;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly revision: number;
  readonly confidence: number;
  readonly accessCount: number;
  readonly lastAccessed?: number;
}

export interface MemoryRevision {
  readonly revision: number;
  readonly timestamp: number;
  readonly diffDescription: string;
  readonly previousState: any;
}

export interface MemoryNode<T = Record<string, unknown>> {
  readonly id: string;
  readonly type: string; // The Entity Type (e.g. 'Project', 'Application')
  readonly layer: MemoryLayer;
  readonly label: PrivacyLabel;
  readonly data: T;
  readonly provenance: MemoryProvenance;
  readonly revisionHistory: MemoryRevision[];
}

export interface MemoryEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly relationship: string;
  readonly weight: number; // 0.0 to 1.0 representing strength
  readonly provenance: MemoryProvenance;
}

export interface MemoryObservation {
  readonly type: 'node' | 'edge';
  readonly action: 'upsert' | 'delete' | 'decay';
  readonly payload: Partial<MemoryNode> | Partial<MemoryEdge>;
  readonly source: string;
  readonly sourceType: MemorySourceType;
  readonly confidence: number;
  readonly createdBy: string;
}
