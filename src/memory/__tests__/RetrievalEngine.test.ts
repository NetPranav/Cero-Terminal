import { describe, it, expect, beforeEach } from 'vitest';
import { RetrievalEngine, RetrievalQuery } from '../retrieval/RetrievalEngine';
import { KnowledgeGraph } from '../graph/KnowledgeGraph';
import { PolicyEngine } from '../policies/PolicyEngine';
import { ExplainabilityEngine } from '../explainability/ExplainabilityEngine';
import { MemoryTelemetry } from '../telemetry/MemoryTelemetry';
import { MemoryNode, MemoryEdge } from '../models/MemoryTypes';

function createNode(id: string, type: string, data: any): MemoryNode {
  return {
    id, type, layer: 'long_term', label: 'private', data,
    provenance: { source: 't', sourceType: 'user_explicit', createdBy: 'u', createdAt: 0, updatedAt: Date.now(), revision: 1, confidence: 1.0, accessCount: 0 },
    revisionHistory: []
  };
}

describe('RetrievalEngine — Multi-Stage Hybrid Memory Retrieval', () => {
  let retrieval: RetrievalEngine;
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();
    const policy = new PolicyEngine();
    const explain = new ExplainabilityEngine();
    const telemetry = new MemoryTelemetry(() => 0, () => 0);
    retrieval = new RetrievalEngine(graph, policy, explain, telemetry);

    // Setup mock graph
    graph.addNode(createNode('p1', 'Project', { name: 'Cero' }));
    graph.addNode(createNode('p2', 'Project', { name: 'Apollo' }));
    graph.addNode(createNode('r1', 'Repository', { url: 'github.com/cero' }));
    graph.addNode(createNode('w1', 'Workflow', { name: 'Deploy' }));
    
    const e1: MemoryEdge = { id: 'e1', sourceId: 'p1', targetId: 'r1', relationship: 'uses', weight: 0.9, provenance: {} as any };
    const e2: MemoryEdge = { id: 'e2', sourceId: 'p1', targetId: 'w1', relationship: 'has_workflow', weight: 0.8, provenance: {} as any };
    graph.addEdge(e1);
    graph.addEdge(e2);
  });

  it('should retrieve by exact ID match with explanation', async () => {
    const results = await retrieval.retrieve({ id: 'p1' });
    expect(results.length).toBe(1);
    expect(results[0].node.id).toBe('p1');
    expect(results[0].explanation).toContain('explicit request');
    expect(results[0].relevanceScore).toBe(1.0);
  });

  it('should retrieve via relationship traversal (expansion)', async () => {
    // Find everything related to Project p1
    const results = await retrieval.retrieve({ relationToId: 'p1' });
    expect(results.length).toBe(2); // Should find r1 and w1
    expect(results.some(r => r.node.id === 'r1')).toBe(true);
    expect(results.some(r => r.node.id === 'w1')).toBe(true);
    expect(results.some(r => r.explanation.includes('uses')) || results.some(r => r.explanation.includes('has workflow'))).toBe(true);
  });

  it('should retrieve via semantic keyword filtering', async () => {
    const results = await retrieval.retrieve({ semanticKeywords: ['Apollo'] });
    expect(results.length).toBe(1);
    expect(results[0].node.id).toBe('p2');
    expect(results[0].explanation).toContain('semantic context');
  });

  it('should filter results by entity Type', async () => {
    // Traverse p1, but only want Workflow types
    const results = await retrieval.retrieve({ relationToId: 'p1', type: 'Workflow' });
    expect(results.length).toBe(1);
    expect(results[0].node.id).toBe('w1');
  });

  it('should rank results correctly based on base confidence and relationship weights', async () => {
    const results = await retrieval.retrieve({ relationToId: 'p1' });
    expect(results.length).toBe(2);
    // r1 is linked via 'uses' (0.9), w1 is linked via 'has_workflow' (0.8)
    // So r1 should be ranked higher
    expect(results[0].node.id).toBe('r1');
    expect(results[1].node.id).toBe('w1');
    expect(results[0].relevanceScore).toBeGreaterThan(results[1].relevanceScore);
  });
});
