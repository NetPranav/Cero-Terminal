import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from './OllamaProvider';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider('http://localhost:11434');
    vi.restoreAllMocks();
  });

  it('successfully generates response and passes proper options', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: '{"action": "done", "summary": "Finished"}',
        prompt_eval_count: 15,
        eval_count: 20
      })
    });

    const res = await provider.generate('test prompt', 'qwen3:4b', {
      format: 'json',
      timeoutMs: 1000
    });

    expect(res.content).toBe('{"action": "done", "summary": "Finished"}');
    expect(res.usage.totalTokens).toBe(35);
  });

  it('enforces inference timeout and aborts slow requests', async () => {
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    await expect(
      provider.generate('slow prompt', 'qwen3:4b', { timeoutMs: 50 })
    ).rejects.toThrow(/Model inference timed out after/);
  });

  it('disables thinking, keeps the model resident and sends the action schema on chat requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{"action":"done","summary":"ok"}' } })
    });
    global.fetch = fetchMock;
    const schema = { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] };

    await provider.generate('', 'qwen3:4b', {
      messages: [{ role: 'user', content: 'check disk' }],
      format: 'json',
      grammarJsonSchema: schema
    });

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(body.think).toBe(false);
    expect(body.keep_alive).toBe(OllamaProvider.KEEP_ALIVE);
    expect(body.format).toEqual(schema);
    expect(body.options.num_thread).toBeUndefined();
  });
});
