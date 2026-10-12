import { describe, it, expect } from 'vitest';
import { ModelRecommendationEngine } from './ModelRecommendationEngine';

describe('ModelRecommendationEngine', () => {
  const engine = ModelRecommendationEngine.getInstance();

  it('should assign budget tier for RAM under 6GB and suggest cloud API key', () => {
    const res = engine.getRecommendation({ ramTotalGb: 4, cpuCores: 2 });
    expect(res.tier).toBe('budget');
    expect(res.cloudApiKeySuggested).toBe(true);
    expect(res.recommendedModels.length).toBeGreaterThan(0);
    expect(res.recommendedModels[0].id).toBe('qwen2.5:1.5b');
  });

  it('should assign balanced tier for RAM between 6GB and 12GB', () => {
    const res = engine.getRecommendation({ ramTotalGb: 8, cpuCores: 4 });
    expect(res.tier).toBe('balanced');
    expect(res.cloudApiKeySuggested).toBe(false);
    expect(res.recommendedModels[0].id).toBe('qwen2.5-coder:3b');
  });

  it('should assign performance tier for RAM between 12GB and 24GB', () => {
    const res = engine.getRecommendation({ ramTotalGb: 16, cpuCores: 8 });
    expect(res.tier).toBe('performance');
    expect(res.recommendedModels.some(m => m.id === 'qwen2.5-coder:7b')).toBe(true);
  });

  it('should assign workstation tier for RAM > 24GB', () => {
    const res = engine.getRecommendation({ ramTotalGb: 32, cpuCores: 16, isGpuAvailable: true, gpuName: 'NVIDIA RTX 4070' });
    expect(res.tier).toBe('workstation');
    expect(res.gpuSummary).toContain('NVIDIA RTX 4070');
    expect(res.recommendedModels[0].id).toBe('qwen2.5-coder:14b');
  });
});
