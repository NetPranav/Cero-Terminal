/**
 * EmbeddedProvider.ts — Embedded llama.cpp Model Provider
 * 
 * Communicates with a bundled llama-server sidecar binary that ships inside
 * the Sentinel Terminal .app bundle. This eliminates the need for users to 
 * install Ollama or any external dependency.
 * 
 * Lifecycle:
 * 1. On app launch, Tauri spawns the llama-server sidecar with the bundled GGUF model
 * 2. EmbeddedProvider connects to localhost:8847 (dedicated port, won't conflict with Ollama)
 * 3. On app quit, Tauri kills the sidecar process
 * 
 * Fallback: If embedded model is unavailable, ModelManager falls back to OllamaProvider.
 */

import { ModelProvider, ModelMetadata, GenerateOptions, ProviderResponse } from './Provider';
import { EmbeddedEngineManager } from '../models/EmbeddedEngineManager';
import { CancelledError, throwIfAborted } from '../agent/Cancelled';

const EMBEDDED_PORT = 8847;
const EMBEDDED_BASE_URL = `http://localhost:${EMBEDDED_PORT}`;
const HEALTH_TIMEOUT_MS = 2000;
const MAX_HEALTH_RETRIES = 15; // 15 * 2s = 30s max wait for model load

export class EmbeddedProvider implements ModelProvider {
  readonly providerId = 'embedded';
  readonly providerName = 'Sentinel Embedded AI (llama.cpp)';

  private baseUrl: string;
  private _isHealthy = false;

  constructor(customPort?: number) {
    this.baseUrl = customPort 
      ? `http://localhost:${customPort}` 
      : EMBEDDED_BASE_URL;
  }

  /**
   * Check if the embedded llama-server is running and ready.
   * Uses the /health endpoint which returns 200 when model is loaded.
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      
      const res = await fetch(`${this.baseUrl}/health`, { 
        method: 'GET',
        signal: controller.signal 
      });
      clearTimeout(timeout);
      
      if (res.ok) {
        const data = await res.json().catch(() => ({})) as any;
        // llama-server returns {"status":"ok"} when model is loaded
        this._isHealthy = data?.status === 'ok' || res.status === 200;
        return this._isHealthy;
      }
      return false;
    } catch {
      this._isHealthy = false;
      return false;
    }
  }

  /**
   * Wait for the embedded server to become ready (called during app startup).
   * Returns true when the model is loaded and inference is available.
   */
  public async waitForReady(onProgress?: (status: string) => void): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_HEALTH_RETRIES; attempt++) {
      onProgress?.(`Initializing Sentinel AI... (${attempt + 1}/${MAX_HEALTH_RETRIES})`);
      
      if (await this.isAvailable()) {
        onProgress?.('Sentinel AI ready.');
        return true;
      }
      
      // Wait 2 seconds between health checks
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    onProgress?.('Embedded AI server failed to start. Falling back to Ollama.');
    return false;
  }

  public async listModels(): Promise<ModelMetadata[]> {
    if (!this._isHealthy) {
      await this.isAvailable();
    }
    
    if (!this._isHealthy) return [];

    try {
      // llama-server /v1/models endpoint
      const res = await fetch(`${this.baseUrl}/v1/models`);
      if (!res.ok) {
        // Server is running but may not support /v1/models — return default
        return [{
          id: 'sentinel-embedded',
          name: 'Sentinel Embedded Model',
          sizeBytes: 0,
          quantization: 'Q4_K_M'
        }];
      }
      
      const data = await res.json() as any;
      return (data.data || []).map((m: any) => ({
        id: m.id || 'sentinel-embedded',
        name: m.id || 'Sentinel Embedded Model',
        sizeBytes: 0,
        quantization: 'Q4_K_M'
      }));
    } catch {
      return [{
        id: 'sentinel-embedded',
        name: 'Sentinel Embedded Model',
        sizeBytes: 0,
        quantization: 'Q4_K_M'
      }];
    }
  }

  public async hasModel(_modelId: string): Promise<boolean> {
    // The embedded server always has exactly one model loaded
    return this._isHealthy || await this.isAvailable();
  }

  public async pullModel(_modelId: string, onProgress?: (percent: number, status: string) => void): Promise<boolean> {
    // Embedded models are pre-bundled — no pulling needed
    onProgress?.(100, 'Model is bundled with Sentinel.');
    return true;
  }

  /**
   * Generate text using the embedded llama-server.
   * Uses /v1/chat/completions (OpenAI-compatible) as primary — best for instruct models.
   * Falls back to raw /completion endpoint if chat endpoint fails.
   * Tagged with sessionId and requestId for per-tab request isolation.
   */
  public async generate(prompt: string, _modelId?: string, options?: GenerateOptions): Promise<ProviderResponse> {
    const sessionId = options?.sessionId || 'default-session';
    const requestId = options?.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return EmbeddedEngineManager.getInstance().enqueueInference(sessionId, requestId, async () => {
      return this.executeInference(prompt, sessionId, requestId, options, true);
    });
  }

  private async executeInference(
    prompt: string,
    sessionId: string,
    requestId: string,
    options?: GenerateOptions,
    allowOomRecovery = true
  ): Promise<ProviderResponse> {
    throwIfAborted(options?.signal);
    const startTime = performance.now();

    let messages: { role: string; content: string }[];

    if (options?.messages && options.messages.length > 0) {
      messages = options.messages;
    } else {
      // Split system prompt from user message if present
      const systemSplit = prompt.indexOf('\n\nUser: ');
      
      if (systemSplit > 0) {
        const systemPrompt = prompt.substring(0, systemSplit).trim();
        const conversationPart = prompt.substring(systemSplit).trim();
        
        // Parse User:/Assistant: blocks into proper messages
        messages = [{ role: 'system', content: systemPrompt }];
        const lines = conversationPart.split('\n');
        let currentRole = '';
        let currentContent = '';
        
        for (const line of lines) {
          if (line.startsWith('User: ')) {
            if (currentRole && currentContent) {
              messages.push({ role: currentRole, content: currentContent.trim() });
            }
            currentRole = 'user';
            currentContent = line.substring(6);
          } else if (line.startsWith('Assistant: ')) {
            if (currentRole && currentContent) {
              messages.push({ role: currentRole, content: currentContent.trim() });
            }
            currentRole = 'assistant';
            currentContent = line.substring(11);
          } else if (currentRole) {
            currentContent += '\n' + line;
          }
        }
        if (currentRole && currentContent) {
          messages.push({ role: currentRole, content: currentContent.trim() });
        }
      } else {
        messages = [{ role: 'user', content: prompt }];
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId,
      'X-Request-ID': requestId
    };

    // Primary: OpenAI-compatible chat completions (best for instruct models)
    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        signal: options?.signal,
        body: JSON.stringify({
          messages,
          max_tokens: options?.maxTokens ?? 256,
          temperature: options?.temperature ?? 0.05,
          top_p: options?.topP ?? 0.9,
          stream: false,
          // Optimizations for speed
          // 1.0 = off. A repeat penalty corrupts JSON and shell syntax, which legitimately repeat
          // quotes, dashes and braces.
          repeat_penalty: 1.0,
          top_k: 20,
          cache_prompt: true,
          ...(options?.logitBias ? { logit_bias: options.logitBias } : {}),
          ...(options?.grammar ? { grammar: options.grammar } : {})
        })
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Chat completion failed: ${response.status} ${errText}`);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || '';
      const latencyMs = performance.now() - startTime;

      return {
        content,
        raw: data,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0
        },
        latencyMs
      };
    } catch (chatError) {
      if (options?.signal?.aborted || (chatError as any)?.name === 'AbortError' || chatError instanceof CancelledError) {
        throw new CancelledError();
      }

      // If error was caused by grammar parsing failure, retry immediately without grammar constraint
      if (options?.grammar && String(chatError).toLowerCase().includes('grammar')) {
        console.warn('[EmbeddedProvider] Grammar rejected by llama-server, falling back to unconstrained inference:', chatError);
        return this.executeInference(prompt, sessionId, requestId, { ...options, grammar: undefined }, allowOomRecovery);
      }

      // Check for GPU VRAM exhaustion on chat failure
      if (allowOomRecovery && EmbeddedEngineManager.getInstance().isVramExhaustionError(chatError)) {
        const recovered = await EmbeddedEngineManager.getInstance().handleOomCrash(String(chatError));
        if (recovered) {
          await this.waitForReady();
          return this.executeInference(prompt, sessionId, requestId, options, false);
        }
      }

      // Fallback: raw /completion endpoint
      try {
        const response = await fetch(`${this.baseUrl}/completion`, {
          method: 'POST',
          headers,
          signal: options?.signal,
          body: JSON.stringify({
            prompt,
            n_predict: options?.maxTokens ?? 256,
            temperature: options?.temperature ?? 0.05,
            top_p: options?.topP ?? 0.9,
            stop: ['</s>', '<|im_end|>', '\n\n\n'],
            cache_prompt: true,
            ...(options?.grammar ? { grammar: options.grammar } : {})
          })
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Completion failed: ${response.status} ${errText}`);
        }

        const data = await response.json() as any;
        const content = data.content || data.text || '';
        const latencyMs = performance.now() - startTime;

        return {
          content,
          raw: data,
          usage: {
            promptTokens: data.tokens_evaluated || 0,
            completionTokens: data.tokens_predicted || 0,
            totalTokens: (data.tokens_evaluated || 0) + (data.tokens_predicted || 0)
          },
          latencyMs
        };
      } catch (completionError) {
        if (options?.signal?.aborted || (completionError as any)?.name === 'AbortError' || completionError instanceof CancelledError) {
          throw new CancelledError();
        }

        if (allowOomRecovery && EmbeddedEngineManager.getInstance().isVramExhaustionError(completionError)) {
          const recovered = await EmbeddedEngineManager.getInstance().handleOomCrash(String(completionError));
          if (recovered) {
            await this.waitForReady();
            return this.executeInference(prompt, sessionId, requestId, options, false);
          }
        }

        throw new Error(`[EmbeddedProvider] All inference endpoints failed. Chat: ${chatError}. Completion: ${completionError}`);
      }
    }
  }

  /**
   * Get the base URL for the embedded server.
   */
  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Check if the server is currently healthy (cached, no network call).
   */
  public isHealthy(): boolean {
    return this._isHealthy;
  }
}
