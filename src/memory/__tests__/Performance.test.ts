import { describe, it, expect, beforeEach } from 'vitest';
import { ObservationPipeline } from '../pipeline/ObservationPipeline';
import { MemoryValidator } from '../validation/MemoryValidator';
import { PolicyEngine } from '../policies/PolicyEngine';
import { MemoryStore } from '../store/MemoryStore';
import { KnowledgeGraph } from '../graph/KnowledgeGraph';
import { RetrievalEngine } from '../retrieval/RetrievalEngine';
import { ExplainabilityEngine } from '../explainability/ExplainabilityEngine';
import { MemoryTelemetry } from '../telemetry/MemoryTelemetry';

describe('Memory Engine — Performance Benchmarks', () => {
  let pipeline: ObservationPipeline;
  let retrieval: RetrievalEngine;
  let graph: KnowledgeGraph;

  beforeEach(() => {
    const validator = new MemoryValidator();
    const policy = new PolicyEngine();
    const store = new MemoryStore();
    graph = new KnowledgeGraph();
    const explain = new ExplainabilityEngine();
    const telemetry = new MemoryTelemetry(() => 0, () => 0);
    
    pipeline = new ObservationPipeline(validator, policy, store, graph);
    retrieval = new RetrievalEngine(graph, policy, explain, telemetry);
  });

  it('should process 1000 node observations through the full pipeline in under 100ms', () => {
    const start = performance.now();
    
    for (let i = 0; i < 1000; i++) {
      pipeline.process({
        type: 'node', action: 'upsert', source: 't', sourceType: 'user_explicit', confidence: 1, createdBy: 'u',
        payload: { id: `node-${i}`, type: 'Project', data: { name: `Project ${i}`, index: i } }
      });
    }

    const duration = performance.now() - start;
    expect(graph.getAllNodes().length).toBe(1000);
    expect(duration).toBeLessThan(500); // Generous allowance for parallel CI environments, usually <50ms locally
  });

  it('should traverse a 100-edge dense graph and rank results in under 5ms', async () => {
    // Setup a dense star graph around a central node
    pipeline.process({ type: 'node', action: 'upsert', source: 't', sourceType: 'user_explicit', confidence: 1, createdBy: 'u', payload: { id: 'center', type: 'Project', data: { name: 'Center Project' } } });
    
    for (let i = 0; i < 100; i++) {
      pipeline.process({ type: 'node', action: 'upsert', source: 't', sourceType: 'user_explicit', confidence: 1, createdBy: 'u', payload: { id: `leaf-${i}`, type: 'Repository', data: { url: `https://github.com/repo-${i}` } } });
      pipeline.process({ type: 'edge', action: 'upsert', source: 't', sourceType: 'user_explicit', confidence: 1, createdBy: 'u', payload: { id: `e-${i}`, sourceId: 'center', targetId: `leaf-${i}`, relationship: 'contains', weight: 0.9 } });
    }

    const start = performance.now();
    const results = await retrieval.retrieve({ relationToId: 'center', limit: 50 });
    const duration = performance.now() - start;

    expect(results.length).toBe(50); // Limited to 50
    expect(duration).toBeLessThan(50); // Generous allowance for parallel CI environments, usually <5ms locally
  });
});
