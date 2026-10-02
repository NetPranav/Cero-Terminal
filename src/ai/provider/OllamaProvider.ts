/**
 * OllamaProvider.ts — Ollama Model Provider Implementation
 * 
 * Communicates cleanly with local Ollama runtime over HTTP REST endpoints.
 */

import { ModelProvider, ModelMetadata, GenerateOptions, ProviderResponse } from './Provider';
import { CancelledError, throwIfAborted } from '../agent/Cancelled';

export class OllamaProvider implements ModelProvider {
  readonly providerId = 'ollama';
  readonly providerName = 'Ollama Local Runtime';

  /** How long Ollama keeps the model resident after a request. */
  public static readonly KEEP_ALIVE = '30m';

  constructor(public baseUrl: string = 'http://localhost:11434') {}

  public async isAvailable(): Promise<boolean> {
    // Bounded: an unanswered probe must not stall every request
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const res = await fetch(this.baseUrl, { method: 'GET', signal: controller.signal });
      return res.status === 200;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  public async listModels(): Promise<ModelMetadata[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json() as any;
      return (data.models || []).map((m: any) => ({
        id: m.name,
        name: m.name,
        sizeBytes: m.size || 0,
        quantization: m.details?.quantization_level || 'unknown',
        parameterCount: m.details?.parameter_size || 'unknown',
        modifiedAt: m.modified_at,
        digest: m.digest
      }));
    } catch {
      return [];
    }
  }

  public async hasModel(modelId: string): Promise<boolean> {
    const models = await this.listModels();
    const cleanId = modelId.toLowerCase().trim();
    return models.some(m => m.id.toLowerCase() === cleanId || m.id.toLowerCase().startsWith(cleanId + ':'));
  }

  public async pullModel(modelId: string, onProgress?: (percent: number, status: string) => void): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelId, stream: true })
      });

      if (!response.body) return false;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const status = parsed.status || 'Downloading...';
            let percent = 0;
            if (parsed.total && parsed.completed) {
              percent = Math.round((parsed.completed / parsed.total) * 100);
            }
            onProgress?.(percent, status);
          } catch (e) {
            // ignore incomplete line parses
          }
        }
      }
      return await this.hasModel(modelId);
    } catch (e) {
      console.error(`[OllamaProvider] Failed to pull model ${modelId}:`, e);
      return false;
    }
  }

  public async generate(prompt: string, modelId: string = 'qwen2.5:1.5b', options?: GenerateOptions): Promise<ProviderResponse> {
    throwIfAborted(options?.signal);
    const startTime = performance.now();
    const timeoutMs = options?.timeoutMs ?? 180000;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    if (options?.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    const isChat = Array.isArray(options?.messages) && options.messages.length > 0;
    const endpoint = isChat ? `${this.baseUrl}/api/chat` : `${this.baseUrl}/api/generate`;
    // A JSON schema constrains decoding like a grammar does; plain 'json' only guarantees valid JSON.
    const format = options?.grammarJsonSchema
      ?? (options?.format === 'json' ? 'json' : options?.format);
    const isDecision = options?.mode === 'decision';
    const isChatMode = options?.mode === 'chat';
    const sampling: Record<string, any> = {
      temperature: options?.temperature ?? (isDecision ? 0 : (isChatMode ? 0.4 : 0.1)),
      top_p: options?.topP ?? (isDecision ? 1 : 0.9),
      top_k: options?.topK ?? (isDecision ? 1 : 40),
      num_predict: options?.maxTokens ?? 1024,
      stop: options?.stopSequences,
      ...(options?.seed !== undefined || isDecision ? { seed: options?.seed ?? 42 } : {})
    };
    // think:false keeps reasoning models (qwen3, deepseek-r1) from spending seconds to minutes
    // on hidden chain-of-thought per command; keep_alive avoids a model reload after 5 idle
    // minutes (Ollama's default), which otherwise shows up as a slow "first" request.
    const payload = isChat
      ? {
          model: modelId,
          messages: options!.messages,
          format,
          stream: false,
          think: false,
          keep_alive: OllamaProvider.KEEP_ALIVE,
          options: sampling
        }
      : {
          model: modelId,
          prompt,
          format,
          stream: false,
          think: false,
          keep_alive: OllamaProvider.KEEP_ALIVE,
          options: sampling
        };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(payload)
      });
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      if (options?.signal?.aborted) {
        throw new CancelledError();
      }
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new Error(`[OllamaProvider] Model inference timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutHandle);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
    }

    const latencyMs = performance.now() - startTime;

    if (!response.ok) {
      throw new Error(`[OllamaProvider] Generation failed (${response.status}): ${response.statusText}`);
    }

    const data = await response.json() as any;
    const promptTokens = data.prompt_eval_count || 0;
    const completionTokens = data.eval_count || 0;

    let content = '';
    if (isChat && data.message) {
      content = (typeof data.message.content === 'string' && data.message.content.trim().length > 0)
        ? data.message.content
        : (typeof data.message.thinking === 'string' ? data.message.thinking : '');
    } else {
      content = (typeof data.response === 'string' && data.response.trim().length > 0)
        ? data.response
        : (typeof data.thinking === 'string' && data.thinking.trim().length > 0)
          ? data.thinking
          : (data.response || '');
    }

    return {
      content,
      raw: data,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      },
      latencyMs,
      finishReason: data.done_reason === 'length' ? 'length' : data.done_reason
    };
  }
}
