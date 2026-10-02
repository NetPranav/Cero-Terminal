/**
 * CloudApiProvider.ts — Unified Cloud LLM Provider Layer
 * 
 * Implements ModelProvider for commercial and open cloud endpoints:
 * - OpenAI (gpt-4o, gpt-4o-mini, o3-mini)
 * - Anthropic (claude-3-5-sonnet, claude-3-5-haiku)
 * - Groq (llama-3.3-70b-versatile, qwen-2.5-coder-32b) — Ultra-low latency
 * - DeepSeek (deepseek-chat, deepseek-reasoner)
 * - OpenRouter (openrouter/auto)
 * - Custom OpenAI-compatible endpoints (baseUrl + modelId + apiKey)
 * 
 * Features:
 * - Secure local persistence of API keys in localStorage
 * - One-click connection testing with latency measurement
 * - Streaming & non-streaming execution conforming to Sentinel's JSON contract
 */

import { wireSampling, resolveSampling } from './DecisionRequest';
import { getSecretBackend, storeSecretVerified } from './SecretStore';
import { ModelProvider, ModelMetadata, GenerateOptions, ProviderResponse } from './Provider';
import { CancelledError, throwIfAborted } from '../agent/Cancelled';

export type CloudServiceId = 'openai' | 'anthropic' | 'groq' | 'deepseek' | 'openrouter' | 'custom';

export interface CloudKeyConfig {
  serviceId: CloudServiceId;
  apiKey: string;
  baseUrl?: string;
  modelId?: string;
  displayName: string;
  isActive: boolean;
  lastTestedAt?: number;
  lastLatencyMs?: number;
}

export const CLOUD_CATALOG: Record<CloudServiceId, { name: string; defaultUrl: string; defaultModel: string; models: string[] }> = {
  openai: {
    name: 'OpenAI',
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'o3-mini']
  },
  anthropic: {
    name: 'Anthropic',
    defaultUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-haiku-20241022',
    models: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022']
  },
  groq: {
    name: 'Groq (Ultra-Fast LPUs)',
    defaultUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'qwen-2.5-coder-32b']
  },
  deepseek: {
    name: 'DeepSeek',
    defaultUrl: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  openrouter: {
    name: 'OpenRouter',
    defaultUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openrouter/auto',
    models: ['openrouter/auto']
  },
  custom: {
    name: 'Custom OpenAI-Compatible',
    defaultUrl: 'http://localhost:8000/v1/chat/completions',
    defaultModel: 'default',
    models: ['default']
  }
};

/**
 * Normalizes user-provided or default URLs into full API endpoint paths.
 * Automatically appends /chat/completions (for OpenAI-compatible endpoints)
 * or /messages (for Anthropic) if the user provides a base URL (e.g. https://integrate.api.nvidia.com/v1).
 */
export function normalizeEndpointUrl(serviceId: CloudServiceId, rawUrl?: string): string {
  const catalog = CLOUD_CATALOG[serviceId];
  let url = (rawUrl || '').trim();
  if (!url) {
    return catalog.defaultUrl;
  }

  // Remove trailing slashes
  url = url.replace(/\/+$/, '');

  if (serviceId === 'anthropic') {
    if (url.endsWith('/messages')) return url;
    if (url.endsWith('/v1')) return `${url}/messages`;
    return `${url}/v1/messages`;
  }

  // If already ends with /chat/completions, return as-is
  if (url.endsWith('/chat/completions')) {
    return url;
  }

  // If ends with /v1, append /chat/completions
  if (url.endsWith('/v1')) {
    return `${url}/chat/completions`;
  }

  // Groq specifics:
  // Default: https://api.groq.com/openai/v1/chat/completions
  if (serviceId === 'groq' || url.includes('groq.com')) {
    if (url.endsWith('/openai/v1')) return `${url}/chat/completions`;
    if (url.endsWith('/openai')) return `${url}/v1/chat/completions`;
    return `${url}/openai/v1/chat/completions`;
  }

  // OpenRouter specifics:
  // Default: https://openrouter.ai/api/v1/chat/completions
  if (serviceId === 'openrouter' || url.includes('openrouter.ai')) {
    if (url.endsWith('/api/v1')) return `${url}/chat/completions`;
    if (url.endsWith('/api')) return `${url}/v1/chat/completions`;
    return `${url}/api/v1/chat/completions`;
  }

  // DeepSeek specifics:
  // Default: https://api.deepseek.com/chat/completions
  if (serviceId === 'deepseek' || url.includes('deepseek.com')) {
    return `${url}/chat/completions`;
  }

  // OpenAI specifics:
  // Default: https://api.openai.com/v1/chat/completions
  if (serviceId === 'openai' || url.includes('openai.com')) {
    return `${url}/v1/chat/completions`;
  }

  // NVIDIA endpoints:
  if (url.includes('nvidia.com')) {
    return `${url}/v1/chat/completions`;
  }

  return `${url}/chat/completions`;
}

let cachedTauriFetch: typeof fetch | null = null;

/**
 * Universal fetch that routes via Tauri's native reqwest client when available,
 * completely bypassing browser CORS restrictions and WebKit 'Load failed' errors.
 */
export async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  if (typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
    try {
      if (!cachedTauriFetch) {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        cachedTauriFetch = tauriFetch;
      }
      return await cachedTauriFetch(url, init);
    } catch (err) {
      console.warn('[CloudApiProvider] Tauri HTTP plugin fallback to native fetch:', err);
    }
  }
  return await fetch(url, init);
}

/**
 * Extracts a meaningful error message from varied LLM API responses (OpenAI, Anthropic, NVIDIA, FastAPI).
 */
async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const clone = res.clone();
    const data = await clone.json();
    if (data) {
      if (typeof data.error === 'string') return data.error;
      if (data.error?.message) return data.error.message;
      if (typeof data.detail === 'string') return data.detail;
      if (Array.isArray(data.detail)) return data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
      if (data.title && data.detail) return `${data.title}: ${data.detail}`;
      if (data.message) return data.message;
      if (data.title) return data.title;
    }
  } catch {
    try {
      const clone = res.clone();
      const text = await clone.text();
      if (text) return text.slice(0, 200);
    } catch {
      // Non-fatal
    }
  }
  return `HTTP ${res.status}: ${res.statusText || 'Request failed'}`;
}

export class CloudApiProvider implements ModelProvider {
  public readonly providerId = 'cloud_api';
  public readonly providerName = 'Cloud API Provider';

  private static instance: CloudApiProvider;
  private static readonly STORAGE_KEY = 'sentinel_cloud_api_keys';
  private inMemoryConfigs: Record<string, CloudKeyConfig> = {};

  public static getInstance(): CloudApiProvider {
    if (!CloudApiProvider.instance) {
      CloudApiProvider.instance = new CloudApiProvider();
    }
    return CloudApiProvider.instance;
  }

  /**
   * Retrieves all saved key configurations
   */
  public getSavedConfigs(): Record<CloudServiceId, CloudKeyConfig> {
    if (Object.keys(this.inMemoryConfigs).length > 0) {
      return { ...this.inMemoryConfigs } as Record<CloudServiceId, CloudKeyConfig>;
    }

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(CloudApiProvider.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.inMemoryConfigs = parsed;
          return { ...parsed };
        }
      }
    } catch {
      // Fallback
    }

    // Default empty configs
    const defaults: Record<string, CloudKeyConfig> = {};
    for (const [id, meta] of Object.entries(CLOUD_CATALOG)) {
      defaults[id] = {
        serviceId: id as CloudServiceId,
        apiKey: '',
        baseUrl: meta.defaultUrl,
        modelId: meta.defaultModel,
        displayName: meta.name,
        isActive: false
      };
    }
    this.inMemoryConfigs = defaults;
    return { ...defaults } as Record<CloudServiceId, CloudKeyConfig>;
  }

  /**
   * Saves or updates a service configuration
   */
  public saveConfig(config: CloudKeyConfig): void {
    const current = this.getSavedConfigs();
    current[config.serviceId] = config;
    this.inMemoryConfigs = current;
    // until the keychain confirms the new key, keep it where it was safe before
    this.keychainHeld.delete(config.serviceId);
    this.persistConfigs();
    // Move the key out of browser storage once the keychain really holds it
    void this.moveKeyToKeychain(config.serviceId);
  }

  /** The configs as stored in the browser: keys that live in the keychain are left out */
  private persistConfigs(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const toStore: Record<string, CloudKeyConfig> = {};
        for (const [id, cfg] of Object.entries(this.inMemoryConfigs)) {
          toStore[id] = this.keychainHeld.has(id) ? { ...cfg, apiKey: '' } : cfg;
        }
        localStorage.setItem(CloudApiProvider.STORAGE_KEY, JSON.stringify(toStore));
      }
    } catch {
      // Non-fatal
    }
  }

  /** Services whose key is confirmed to be in the keychain (and so is not written to localStorage) */
  private keychainHeld = new Set<string>();

  private async moveKeyToKeychain(serviceId: string): Promise<boolean> {
    const cfg = this.inMemoryConfigs[serviceId];
    if (!cfg) return false;
    if (!cfg.apiKey) {
      // a key that was cleared must leave the keychain too
      try { await getSecretBackend().delete(CloudApiProvider.SECRET_SERVICE, serviceId); } catch { /* nothing to remove */ }
      this.keychainHeld.delete(serviceId);
      this.persistConfigs();
      return true;
    }
    if (!(await storeSecretVerified(CloudApiProvider.SECRET_SERVICE, serviceId, cfg.apiKey))) return false;
    this.keychainHeld.add(serviceId);
    this.persistConfigs();
    return true;
  }

  private static readonly SECRET_SERVICE = 'sentinel.cloud_api';

  /**
   * Call once at startup, before the active provider is chosen. Fills keys in from the keychain and
   * moves any key still sitting in browser storage there (write, read back, then remove the old copy).
   * Where no keychain works, keys stay in browser storage exactly as before; nothing is lost.
   */
  public async hydrateSecrets(): Promise<{ migrated: number; failed: number }> {
    const configs = this.getSavedConfigs() as Record<string, CloudKeyConfig>;
    let migrated = 0;
    let failed = 0;
    for (const [id, cfg] of Object.entries(configs)) {
      if (cfg.apiKey) {
        if (await this.moveKeyToKeychain(id)) migrated++; else failed++;
      } else {
        try {
          const stored = await getSecretBackend().get(CloudApiProvider.SECRET_SERVICE, id);
          if (stored) {
            this.inMemoryConfigs[id] = { ...cfg, apiKey: stored };
            this.keychainHeld.add(id);
          }
        } catch {
          // keychain unavailable: nothing to fill in
        }
      }
    }
    return { migrated, failed };
  }

  /**
   * Returns the currently active cloud configuration (if any)
   */
  public getActiveConfig(): CloudKeyConfig | undefined {
    const configs = this.getSavedConfigs();
    return Object.values(configs).find(c => c.isActive && c.apiKey.trim().length > 0);
  }

  /**
   * Tests connection with a lightweight probe request with automatic retry and backoff
   * to gracefully handle cold sockets, DNS resolution, and transient gateway blips.
   */
  public async testConnection(
    serviceId: CloudServiceId,
    apiKey: string,
    customUrl?: string,
    customModel?: string
  ): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      return { success: false, error: 'Please enter an API key first.' };
    }

    const url = normalizeEndpointUrl(serviceId, customUrl);
    const model = customModel?.trim() || CLOUD_CATALOG[serviceId].defaultModel;

    const start = performance.now();
    const MAX_RETRIES = 3;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

        const requestInit: RequestInit = {
          signal: controller?.signal
        };

        if (serviceId === 'anthropic') {
          const res = await httpFetch(url, {
            ...requestInit,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': trimmedKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model,
              max_tokens: 16,
              messages: [{ role: 'user', content: 'ping' }]
            })
          });

          if (timeoutId) clearTimeout(timeoutId);
          const latencyMs = Math.round(performance.now() - start);

          if (res.ok) {
            return { success: true, latencyMs };
          }

          // Non-retryable authentication failures: 401 Unauthorized, 403 Forbidden
          if (res.status === 401 || res.status === 403) {
            const errMessage = await extractErrorMessage(res);
            return { success: false, error: errMessage };
          }

          lastError = await extractErrorMessage(res);
        } else {
          // Standard OpenAI-compatible format (OpenAI, Groq, DeepSeek, OpenRouter, NVIDIA, Custom)
          const isReasoningModel = model.startsWith('o1') || model.startsWith('o3') || model.includes('reasoner');
          const bodyPayload: any = {
            model,
            messages: [{ role: 'user', content: 'ping' }]
          };
          if (isReasoningModel) {
            bodyPayload.max_completion_tokens = 16;
          } else {
            bodyPayload.max_tokens = 16;
          }

          let res = await httpFetch(url, {
            ...requestInit,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${trimmedKey}`
            },
            body: JSON.stringify(bodyPayload)
          });

          if (timeoutId) clearTimeout(timeoutId);
          const latencyMs = Math.round(performance.now() - start);

          // If 400 Bad Request because model rejected max_tokens, retry once with max_completion_tokens
          if (!res.ok && res.status === 400 && bodyPayload.max_tokens) {
            delete bodyPayload.max_tokens;
            bodyPayload.max_completion_tokens = 16;
            res = await httpFetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${trimmedKey}`
              },
              body: JSON.stringify(bodyPayload)
            });
          }

          if (res.ok) {
            return { success: true, latencyMs };
          }

          // Non-retryable authentication failures: 401 Unauthorized, 403 Forbidden
          if (res.status === 401 || res.status === 403) {
            const errMessage = await extractErrorMessage(res);
            return { success: false, error: errMessage };
          }

          // If 404 or model not found on final attempt, probe GET /models if OpenAI-compatible
          if ((res.status === 404 || res.status === 400) && attempt === MAX_RETRIES) {
            try {
              const modelsUrl = url.replace(/\/chat\/completions\/?$/, '/models');
              if (modelsUrl !== url) {
                const modelsRes = await httpFetch(modelsUrl, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${trimmedKey}`
                  }
                });
                if (modelsRes.ok) {
                  return {
                    success: true,
                    latencyMs: Math.round(performance.now() - start)
                  };
                }
              }
            } catch {
              // ignore fallback models probe failure
            }
          }

          lastError = await extractErrorMessage(res);
        }
      } catch (err: any) {
        lastError = err?.name === 'AbortError' ? 'Connection probe timed out (8s)' : (err?.message || 'Network connection failed');
      }

      // If we have retries remaining, wait with backoff before next probe
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, attempt * 350));
      }
    }

    return { success: false, error: lastError || 'Connection test failed after 3 attempts' };
  }

  public async isAvailable(): Promise<boolean> {
    const active = this.getActiveConfig();
    return Boolean(active && active.apiKey);
  }

  public async listModels(): Promise<ModelMetadata[]> {
    const configs = this.getSavedConfigs();
    const result: ModelMetadata[] = [];
    for (const [serviceId, config] of Object.entries(configs)) {
      if (config.apiKey) {
        const catalog = CLOUD_CATALOG[serviceId as CloudServiceId];
        for (const m of catalog.models) {
          result.push({
            id: `${serviceId}:${m}`,
            name: `${catalog.name} — ${m}`,
            sizeBytes: 0,
            parameterCount: 'Cloud API'
          });
        }
      }
    }
    return result;
  }

  public async hasModel(modelId: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(m => m.id === modelId);
  }

  public async pullModel(_modelId: string): Promise<boolean> {
    // Cloud models do not require local disk downloads
    return true;
  }

  public async generate(prompt: string, modelId?: string, options?: GenerateOptions): Promise<ProviderResponse> {
    throwIfAborted(options?.signal);
    const active = this.getActiveConfig();
    if (!active || !active.apiKey) {
      throw new Error('No active Cloud API key configured. Please configure an API key in AI Settings.');
    }

    const start = performance.now();
    const url = normalizeEndpointUrl(active.serviceId, active.baseUrl);
    const model = modelId || active.modelId || CLOUD_CATALOG[active.serviceId].defaultModel;

    // Messages formatting
    const messages = options?.messages || [
      { role: 'system', content: 'You are Sentinel, an autonomous Linux terminal copilot. Always respond with valid JSON.' },
      { role: 'user', content: prompt }
    ];

    try {
      if (active.serviceId === 'anthropic') {
        const systemMsg = messages.find(m => m.role === 'system')?.content;
        const nonSystemMessages = messages.filter(m => m.role !== 'system');

        const body: any = {
          model,
          max_tokens: resolveSampling(options).maxTokens,
          temperature: resolveSampling(options).temperature,
          messages: nonSystemMessages
        };
        if (systemMsg) body.system = systemMsg;

        const res = await httpFetch(url, {
          method: 'POST',
          signal: options?.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': active.apiKey.trim(),
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(body)
        });

        const latencyMs = Math.round(performance.now() - start);
        if (!res.ok) {
          const errMessage = await extractErrorMessage(res);
          throw new Error(errMessage);
        }

        const json = await res.json();
        const content = json.content?.[0]?.text || '';
        return {
          content,
          raw: json,
          usage: {
            promptTokens: json.usage?.input_tokens || 0,
            completionTokens: json.usage?.output_tokens || 0,
            totalTokens: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0)
          },
          latencyMs,
          finishReason: json.stop_reason === 'max_tokens' ? 'length' : json.stop_reason
        };
      }

      // Standard OpenAI-compatible execution
      const isReasoningModel = model.startsWith('o1') || model.startsWith('o3') || model.includes('reasoner');
      const wire = wireSampling('cloud', options);

      const requestBody: any = {
        model,
        messages,
        ...(isReasoningModel ? { max_completion_tokens: wire.max_tokens } : wire)
      };
      if (options?.format === 'json') {
        requestBody.response_format = { type: 'json_object' };
      }

      let res = await httpFetch(url, {
        method: 'POST',
        signal: options?.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${active.apiKey.trim()}`
        },
        body: JSON.stringify(requestBody)
      });

      // If endpoint rejects response_format (e.g. 400 Bad Request on some models), retry once without it
      if (!res.ok && res.status === 400 && requestBody.response_format) {
        throwIfAborted(options?.signal);
        delete requestBody.response_format;
        res = await httpFetch(url, {
          method: 'POST',
          signal: options?.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${active.apiKey.trim()}`
          },
          body: JSON.stringify(requestBody)
        });
      }

      // If endpoint rejects temperature or max_tokens for reasoning models, retry with sanitized payload
      if (!res.ok && res.status === 400 && (requestBody.temperature !== undefined || requestBody.max_tokens !== undefined)) {
        throwIfAborted(options?.signal);
        delete requestBody.temperature;
        if (requestBody.max_tokens) {
          requestBody.max_completion_tokens = requestBody.max_tokens;
          delete requestBody.max_tokens;
        }
        res = await httpFetch(url, {
          method: 'POST',
          signal: options?.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${active.apiKey.trim()}`
          },
          body: JSON.stringify(requestBody)
        });
      }

      const latencyMs = Math.round(performance.now() - start);
      if (!res.ok) {
        const errMessage = await extractErrorMessage(res);
        throw new Error(errMessage);
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || '';
      return {
        content,
        raw: json,
        usage: {
          promptTokens: json.usage?.prompt_tokens || 0,
          completionTokens: json.usage?.completion_tokens || 0,
          totalTokens: json.usage?.total_tokens || 0
        },
        latencyMs,
        finishReason: json.choices?.[0]?.finish_reason
      };
    } catch (err: any) {
      if (options?.signal?.aborted || err?.name === 'AbortError' || err instanceof CancelledError) {
        throw new CancelledError();
      }
      throw err;
    }
  }
}
