import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CloudApiProvider, normalizeEndpointUrl, CloudServiceId } from './CloudApiProvider';

describe('CloudApiProvider', () => {
  let provider: CloudApiProvider;

  beforeEach(() => {
    provider = CloudApiProvider.getInstance();
  });

  afterEach(() => {
    const configs = provider.getSavedConfigs();
    for (const key of Object.keys(configs) as CloudServiceId[]) {
      configs[key].apiKey = '';
      configs[key].isActive = false;
      provider.saveConfig(configs[key]);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('should initialize with default configs for all supported cloud providers', () => {
    const configs = provider.getSavedConfigs();
    expect(configs.openai).toBeDefined();
    expect(configs.anthropic).toBeDefined();
    expect(configs.groq).toBeDefined();
    expect(configs.deepseek).toBeDefined();
    expect(configs.openrouter).toBeDefined();
    expect(configs.custom).toBeDefined();
  });

  it('should save and retrieve API key configurations', () => {
    provider.saveConfig({
      serviceId: 'groq',
      apiKey: 'gsk_mock_test_123',
      displayName: 'Groq',
      isActive: true
    });

    const active = provider.getActiveConfig();
    expect(active).toBeDefined();
    expect(active?.serviceId).toBe('groq');
    expect(active?.apiKey).toBe('gsk_mock_test_123');
  });

  it('should report availability based on active API key presence', async () => {
    provider.saveConfig({
      serviceId: 'openai',
      apiKey: 'sk-test-key',
      displayName: 'OpenAI',
      isActive: true
    });

    const isAvail = await provider.isAvailable();
    expect(isAvail).toBe(true);

    provider.saveConfig({
      serviceId: 'openai',
      apiKey: '',
      displayName: 'OpenAI',
      isActive: false
    });

    // Check if other active configs exist, or if none active
    const active = provider.getActiveConfig();
    if (!active) {
      const availNone = await provider.isAvailable();
      expect(availNone).toBe(false);
    }
  });

  describe('normalizeEndpointUrl', () => {
    it('should append /chat/completions to base URL ending in /v1 for NVIDIA and OpenAI-compatible endpoints', () => {
      expect(normalizeEndpointUrl('custom', 'https://integrate.api.nvidia.com/v1'))
        .toBe('https://integrate.api.nvidia.com/v1/chat/completions');
      expect(normalizeEndpointUrl('custom', 'https://integrate.api.nvidia.com/v1/'))
        .toBe('https://integrate.api.nvidia.com/v1/chat/completions');
      expect(normalizeEndpointUrl('custom', 'http://localhost:8000/v1'))
        .toBe('http://localhost:8000/v1/chat/completions');
      expect(normalizeEndpointUrl('custom', 'http://localhost:11434/v1'))
        .toBe('http://localhost:11434/v1/chat/completions');
    });

    it('should preserve full URLs already ending in /chat/completions', () => {
      expect(normalizeEndpointUrl('custom', 'https://integrate.api.nvidia.com/v1/chat/completions'))
        .toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    });

    it('should append /v1/chat/completions to NVIDIA host if /v1 was omitted', () => {
      expect(normalizeEndpointUrl('custom', 'https://integrate.api.nvidia.com'))
        .toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    });

    it('should append /messages to Anthropic base URLs', () => {
      expect(normalizeEndpointUrl('anthropic', 'https://api.anthropic.com/v1'))
        .toBe('https://api.anthropic.com/v1/messages');
      expect(normalizeEndpointUrl('anthropic', 'https://api.anthropic.com/v1/messages'))
        .toBe('https://api.anthropic.com/v1/messages');
    });

    it('should normalize bare domain endpoints without /v1 for major providers', () => {
      expect(normalizeEndpointUrl('openai', 'https://api.openai.com'))
        .toBe('https://api.openai.com/v1/chat/completions');
      expect(normalizeEndpointUrl('groq', 'https://api.groq.com'))
        .toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(normalizeEndpointUrl('groq', 'https://api.groq.com/openai'))
        .toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(normalizeEndpointUrl('openrouter', 'https://openrouter.ai'))
        .toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(normalizeEndpointUrl('openrouter', 'https://openrouter.ai/api'))
        .toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(normalizeEndpointUrl('anthropic', 'https://api.anthropic.com'))
        .toBe('https://api.anthropic.com/v1/messages');
    });

    it('should fallback to default catalog URL when input is blank', () => {
      expect(normalizeEndpointUrl('openai', ''))
        .toBe('https://api.openai.com/v1/chat/completions');
      expect(normalizeEndpointUrl('deepseek', undefined))
        .toBe('https://api.deepseek.com/chat/completions');
    });
  });

  describe('testConnection resilience & retries', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should reject immediately if API key is blank', async () => {
      const res = await provider.testConnection('openai', '   ');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Please enter an API key');
    });

    it('should succeed on first try when endpoint responds 200 OK', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        clone: () => ({ json: async () => ({}), text: async () => '' })
      } as any);

      const res = await provider.testConnection('openai', 'sk-test-valid-key');
      expect(res.success).toBe(true);
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient network/gateway errors and succeed when next attempt passes', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First attempt: 503 Service Unavailable (transient cold start)
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            clone: () => ({
              json: async () => ({ error: { message: 'Engine warming up' } }),
              text: async () => 'Engine warming up'
            })
          };
        }
        // Second attempt: Success!
        return {
          ok: true,
          status: 200,
          clone: () => ({ json: async () => ({}), text: async () => '' })
        };
      });

      const res = await provider.testConnection('groq', 'gsk-test-valid-key');
      expect(res.success).toBe(true);
      expect(callCount).toBe(2);
    });

    it('should fail immediately without retrying on 401 Unauthorized', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          clone: () => ({
            json: async () => ({ error: { message: 'Incorrect API key provided' } }),
            text: async () => 'Incorrect API key provided'
          })
        };
      });

      const res = await provider.testConnection('openai', 'sk-invalid-key');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Incorrect API key provided');
      expect(callCount).toBe(1); // Crucial: must NOT waste retries on bad API keys
    });
  });
});

