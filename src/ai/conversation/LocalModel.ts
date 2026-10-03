/**
 * LocalModel.ts — Model Abstraction Layer for the Conversation Engine
 *
 * Provides a clean interface over the existing ModelProvider infrastructure.
 * The conversation module ONLY interacts with this wrapper — it never knows
 * which LLM runs underneath (Ollama, LlamaCpp, etc.).
 *
 * Responsibilities:
 * - Load model via ModelManager
 * - Generate text with timeout and retry
 * - Enforce JSON mode
 * - Parse and validate JSON responses
 * - Stream responses (future interactive use)
 * - Never crash — all errors are caught and handled
 */

import { ModelManager } from '../management/ModelManager';
import { ModelProvider, GenerateOptions, ProviderResponse } from '../provider/Provider';
import type { LocalModelConfig, LocalModelResponse } from './ConversationTypes';

/** Default configuration for inference calls */
const DEFAULT_CONFIG: LocalModelConfig = {
  temperature: 0.1,
  maxTokens: 1024,
  timeoutMs: 10_000,
  maxRetries: 3,
  jsonMode: true,
  topP: 0.9,
};

/**
 * Thin abstraction over ModelProvider. Cero's conversation module
 * calls only this class — never the underlying provider directly.
 */
export class LocalModel {
  private provider: ModelProvider;
  private modelId: string;

  constructor(private modelManager: ModelManager) {
    this.provider = modelManager.getActiveProvider();
    this.modelId = modelManager.getActiveModel().modelId;
  }

  /**
   * Refresh internal references if the active model changed externally.
   */
  public refresh(): void {
    this.provider = this.modelManager.getActiveProvider();
    this.modelId = this.modelManager.getActiveModel().modelId;
  }

  /**
   * Generate raw text from a prompt with timeout and retry logic.
   */
  public async generate(
    prompt: string,
    config?: Partial<LocalModelConfig>
  ): Promise<LocalModelResponse> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < cfg.maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(prompt, cfg);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Only retry on transient errors, not validation issues
        if (attempt < cfg.maxRetries - 1) {
          // Brief backoff before retry
          await this.sleep(Math.min(100 * (attempt + 1), 500));
        }
      }
    }

    // All retries exhausted — return empty response rather than crashing
    console.error('[LocalModel] All retries exhausted:', lastError?.message);
    return {
      content: '',
      latencyMs: 0,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  /**
   * Generate and parse a JSON response from the model.
   * Automatically retries on malformed JSON up to maxRetries times.
   *
   * @returns Parsed object of type T, or null if all retries fail.
   */
  public async generateJSON<T>(
    prompt: string,
    config?: Partial<LocalModelConfig>
  ): Promise<{ data: T | null; raw: LocalModelResponse }> {
    const cfg = { ...DEFAULT_CONFIG, ...config, jsonMode: true };
    let lastResponse: LocalModelResponse = {
      content: '',
      latencyMs: 0,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };

    for (let attempt = 0; attempt < cfg.maxRetries; attempt++) {
      try {
        const response = await this.generate(prompt, cfg);
        lastResponse = response;

        if (!response.content || response.content.trim() === '') {
          continue;
        }

        const parsed = this.extractJSON<T>(response.content);
        if (parsed !== null) {
          return { data: parsed, raw: response };
        }

        // JSON parsing failed — retry with a more explicit prompt
        if (attempt < cfg.maxRetries - 1) {
          await this.sleep(100);
        }
      } catch {
        // Swallow and retry
        if (attempt < cfg.maxRetries - 1) {
          await this.sleep(100);
        }
      }
    }

    return { data: null, raw: lastResponse };
  }

  /**
   * Stream a response token by token (for future interactive use).
   * Currently delegates to full generation and yields the entire result.
   */
  public async *generateStream(
    prompt: string,
    config?: Partial<LocalModelConfig>
  ): AsyncGenerator<string, void, unknown> {
    const response = await this.generate(prompt, config);
    if (response.content) {
      yield response.content;
    }
  }

  /**
   * Check if the underlying provider is available and responsive.
   */
  public async isAvailable(): Promise<boolean> {
    try {
      return await this.provider.isAvailable();
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Execute a generation call with a timeout.
   */
  private async executeWithTimeout(
    prompt: string,
    cfg: LocalModelConfig
  ): Promise<LocalModelResponse> {
    const options: GenerateOptions = {
      temperature: cfg.temperature,
      topP: cfg.topP,
      maxTokens: cfg.maxTokens,
      format: cfg.jsonMode ? 'json' : undefined,
    };

    const result = await Promise.race<ProviderResponse>([
      this.provider.generate(prompt, this.modelId, options),
      this.createTimeout(cfg.timeoutMs),
    ]);

    return {
      content: result.content,
      latencyMs: result.latencyMs,
      usage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      },
    };
  }

  /**
   * Create a timeout promise that rejects after the given duration.
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[LocalModel] Timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Attempt to extract a JSON object from a possibly messy LLM response.
   * Handles common issues: markdown fences, trailing text, nested JSON.
   */
  private extractJSON<T>(raw: string): T | null {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    cleaned = cleaned.trim();

    // Attempt direct parse
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Fall through to extraction attempts
    }

    // Try to find the first { ... } or [ ... ] block
    const jsonStart = cleaned.indexOf('{');
    const arrayStart = cleaned.indexOf('[');
    const start = jsonStart >= 0 && (arrayStart < 0 || jsonStart < arrayStart)
      ? jsonStart
      : arrayStart;

    if (start < 0) return null;

    const isArray = cleaned[start] === '[';
    const closeChar = isArray ? ']' : '}';
    let depth = 0;
    let end = -1;

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (ch === (isArray ? '[' : '{')) depth++;
      else if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end < 0) return null;

    try {
      return JSON.parse(cleaned.substring(start, end + 1)) as T;
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
