import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../store/MemoryStore';
import { MemoryNode, MemoryEdge } from '../models/MemoryTypes';

describe('MemoryStore — Append-Only Revision History Persistence', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('should save a new node and establish its initial revision provenance', () => {
    const node: MemoryNode = {
      id: 'proj-1',
      type: 'Project',
      layer: 'long_term',
      label: 'private',
      data: { name: 'Cero', status: 'active' },
      provenance: {
        source: 'user',
        sourceType: 'user_explicit',
        createdBy: 'pranav',
        createdAt: 0,
        updatedAt: 0,
        revision: 0,
        confidence: 1.0,
        accessCount: 0,
      },
      revisionHistory: [],
    };

    const saved = store.saveNode(node, 'Initial creation');
    expect(saved.provenance.revision).toBe(1);
    expect(saved.provenance.createdAt).toBeGreaterThan(0);
    expect(store.getNode('proj-1')).toBeDefined();
  });

  it('should never overwrite facts, but instead generate a MemoryRevision snapshot on update', () => {
    const node: MemoryNode = {
      id: 'proj-2',
      type: 'Project',
      layer: 'long_term',
      label: 'private',
      data: { name: 'Apollo', status: 'active' },
      provenance: {
        source: 'user',
        sourceType: 'user_explicit',
        createdBy: 'pranav',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        revision: 1,
        confidence: 1.0,
        accessCount: 0,
      },
      revisionHistory: [],
    };

    store.saveNode(node);
    
    const update = { ...node, data: { name: 'Apollo V2', status: 'archived' } };
    const savedUpdate = store.saveNode(update, 'Renamed project');

    expect(savedUpdate.provenance.revision).toBe(2);
    expect(savedUpdate.revisionHistory.length).toBe(1);
    expect(savedUpdate.revisionHistory[0].revision).toBe(1);
    expect(savedUpdate.revisionHistory[0].diffDescription).toBe('Renamed project');
    expect(savedUpdate.revisionHistory[0].previousState.name).toBe('Apollo');
  });

  it('should save and retrieve edges with updated provenance timestamps', () => {
    const edge: MemoryEdge = {
      id: 'edge-1',
      sourceId: 'proj-1',
      targetId: 'repo-1',
      relationship: 'uses',
      weight: 0.9,
      provenance: {
        source: 'parser',
        sourceType: 'observation_automatic',
        createdBy: 'system',
        createdAt: 0,
        updatedAt: 0,
        revision: 0,
        confidence: 0.8,
        accessCount: 0,
      }
    };

    const saved = store.saveEdge(edge);
    expect(saved.provenance.revision).toBe(1);
    expect(store.getEdge('edge-1')).toBeDefined();
  });

  it('should clear all nodes and edges', () => {
    const node: MemoryNode = {
      id: 'proj-3', type: 'Project', layer: 'long_term', label: 'private', data: {},
      provenance: { source: 'a', sourceType: 'user_explicit', createdBy: 'u', createdAt: 0, updatedAt: 0, revision: 0, confidence: 1, accessCount: 0 },
      revisionHistory: []
    };
    store.saveNode(node);
    expect(store.getAllNodes().length).toBe(1);

    store.clear();
    expect(store.getAllNodes().length).toBe(0);
  });
});
