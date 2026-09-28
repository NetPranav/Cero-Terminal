import { describe, it, expect, vi } from 'vitest';
import { ModelManager } from '../management/ModelManager';
import { ModelProvider } from '../provider/Provider';

class MockOfflineProvider implements ModelProvider {
  readonly providerId = 'mock';
  readonly providerName = 'Mock Local Runtime';
  public isReady = true;
  public mockModels = [
    { id: 'qwen2.5:1.5b', name: 'qwen2.5:1.5b', sizeBytes: 1100000000, digest: 'sha256:abc123999' },
    { id: 'phi4:mini', name: 'phi4:mini', sizeBytes: 1500000000, digest: 'sha256:xyz888' }
  ];

  async isAvailable() { return this.isReady; }
  async listModels() { return this.mockModels; }
  async hasModel(id: string) { return this.mockModels.some(m => m.id === id); }
  async pullModel() { return true; }
  async generate() { return { content: '{}', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, latencyMs: 120 }; }
}

describe('Phase X — ModelManager Verification', () => {
  it('should evaluate and automatically select the highest-scoring lightweight open-source model', async () => {
    const mockProvider = new MockOfflineProvider();
    const manager = new ModelManager([mockProvider]);

    const active = await manager.initialize();
    // qwen2.5:1.5b (score 99) should beat phi4:mini (score 85)
    expect(active.modelId).toBe('qwen2.5:1.5b');
    expect(active.providerId).toBe('mock');
    expect(active.score).toBe(99);
  });

  it('should verify model checksums accurately against provider digests', async () => {
    const mockProvider = new MockOfflineProvider();
    const manager = new ModelManager([mockProvider]);
    await manager.initialize();

    const verified = await manager.verifyModelIntegrity();
    expect(verified).toBe(true);
    expect(manager.getActiveModel().digest).toBe('sha256:abc123999');
  });

  it('should support switching models and rollback history', async () => {
    const mockProvider = new MockOfflineProvider();
    const manager = new ModelManager([mockProvider]);
    await manager.initialize();

    await manager.setModel('phi4:mini', 'mock');
    expect(manager.getActiveModel().modelId).toBe('phi4:mini');

    const rolledBack = manager.rollback();
    expect(rolledBack?.modelId).toBe('qwen2.5:1.5b');
  });
});

describe('ModelManager provider preference', () => {
  const provider = (providerId: string, models: string[]) => ({
    providerId,
    providerName: providerId,
    isAvailable: async () => true,
    listModels: async () => models.map(id => ({ id, name: id, sizeBytes: 0 })),
    hasModel: async () => true,
    pullModel: async () => true,
    generate: async () => ({ content: '', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 0 })
  });

  it('prefers a running embedded engine over higher-scored Ollama models', async () => {
    const manager = new ModelManager([
      provider('embedded', ['qwen2.5-coder-3b-instruct-q4_k_m.gguf']) as any,
      provider('ollama', ['qwen2.5-coder:7b', 'qwen3:4b']) as any
    ]);
    const active = await manager.initialize();
    expect(active.providerId).toBe('embedded');
  });

  it('still picks the best Ollama model when the embedded engine is not running', async () => {
    const offline = { ...provider('embedded', []), isAvailable: async () => false };
    const manager = new ModelManager([offline as any, provider('ollama', ['qwen2.5-coder:7b', 'smollm2:1.7b']) as any]);
    const active = await manager.initialize();
    expect(active.providerId).toBe('ollama');
    expect(active.modelId).toBe('qwen2.5-coder:7b');
  });
});
