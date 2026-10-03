import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddedProvider } from './EmbeddedProvider';
import { EmbeddedEngineManager } from '../models/EmbeddedEngineManager';

describe('EmbeddedProvider (Inference & Request Isolation)', () => {
  let provider: EmbeddedProvider;
  let manager: EmbeddedEngineManager;

  beforeEach(() => {
    provider = new EmbeddedProvider();
    manager = EmbeddedEngineManager.getInstance();
    manager.resetCpuFallback();
    vi.restoreAllMocks();
  });

  it('tags inference requests with X-Session-ID and X-Request-ID headers', async () => {
    let capturedHeaders: Record<string, string> = {};

    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedHeaders = init?.headers || {};
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"action":"execute","command":"echo hello"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };
    });

    const response = await provider.generate('echo hello', undefined, {
      sessionId: 'test-tab-42',
      requestId: 'test-req-999'
    });

    expect(response.content).toContain('echo hello');
    expect(capturedHeaders['X-Session-ID']).toBe('test-tab-42');
    expect(capturedHeaders['X-Request-ID']).toBe('test-req-999');
  });

  it('routes requests through the isolated inference queue', async () => {
    const enqueueSpy = vi.spyOn(manager, 'enqueueInference');

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'queue test' } }]
      })
    }));

    await provider.generate('test prompt', undefined, {
      sessionId: 'tab-isolate-1',
      requestId: 'req-isolate-1'
    });

    expect(enqueueSpy).toHaveBeenCalledWith('tab-isolate-1', 'req-isolate-1', expect.any(Function));
  });

  it('recovers automatically from GPU VRAM OOM error by falling back to CPU', async () => {
    let callCount = 0;

    global.fetch = vi.fn().mockImplementation(async (url) => {
      callCount++;
      if (url.toString().includes('/health')) {
        return { ok: true, json: async () => ({ status: 'ok' }) };
      }

      if (callCount === 1) {
        // Simulate CUDA OOM failure on first attempt
        return {
          ok: false,
          status: 500,
          text: async () => 'CUDA error: out of memory allocating 2048 MB'
        };
      }

      // Second attempt succeeds on CPU
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'recovered on CPU' } }]
        })
      };
    });

    const response = await provider.generate('prompt with oom', undefined, {
      sessionId: 'oom-session'
    });

    expect(response.content).toBe('recovered on CPU');
    expect(manager.isCpuFallback()).toBe(true);
    expect(manager.getCpuFallbackNotice()).toContain('CPU fallback mode');
  });

  it('sends temperature 0, top_k 1, top_p 1, numeric seed, and cache_prompt false for mode: "decision"', async () => {
    let capturedBody: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"action":"execute","command":"ls"}' } }]
        })
      };
    });

    await provider.generate('find files', undefined, { mode: 'decision' });
    expect(capturedBody.temperature).toBe(0);
    expect(capturedBody.top_k).toBe(1);
    expect(capturedBody.top_p).toBe(1);
    expect(typeof capturedBody.seed).toBe('number');
    expect(capturedBody.seed).toBe(42);
    expect(capturedBody.cache_prompt).toBe(false);
  });

  it('sends conversational temperature and no fixed seed for mode: "chat"', async () => {
    let capturedBody: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'hello user' } }]
        })
      };
    });

    await provider.generate('hello', undefined, { mode: 'chat' });
    expect(capturedBody.temperature).toBe(0.4);
    expect(capturedBody.top_k).toBe(20);
    expect(capturedBody.seed).toBeUndefined();
    expect(capturedBody.cache_prompt).toBe(true);
  });
});

