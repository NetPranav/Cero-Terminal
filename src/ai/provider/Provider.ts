/**
 * Provider.ts — Pluggable Model Provider Layer
 * 
 * Defines the foundational interface for local and pluggable model inference providers.
 * Sentinel's planner and intent systems never depend directly on Ollama or Llama.cpp.
 */

export interface GenerateOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stopSequences?: string[];
  grammarJsonSchema?: Record<string, any>;
  format?: 'json' | string;
  messages?: { role: string; content: string }[];
  logitBias?: Record<string | number, number>;
  grammar?: string; // Phase 5.3: GBNF (GGML BNF) Grammar constraint
  sessionId?: string; // Phase 0.5 item 11: Request isolation per-tab / PTY session
  requestId?: string; // Phase 0.5 item 11: Unique request tracking ID
  timeoutMs?: number;
  /** Set by the caller; aborting it stops inference immediately */
  signal?: AbortSignal;
  /** Decision vs conversational mode (Task 3.2 determinism) */
  mode?: 'decision' | 'chat';
  seed?: number;
  topK?: number;
}

export interface ProviderResponse {
  content: string;
  raw?: any;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  finishReason?: string;
}

export interface ModelMetadata {
  id: string;
  name: string;
  sizeBytes: number;
  quantization?: string;
  parameterCount?: string;
  modifiedAt?: string;
  digest?: string;
}

export interface ModelProvider {
  readonly providerId: string;
  readonly providerName: string;
  
  isAvailable(): Promise<boolean>;
  listModels(): Promise<ModelMetadata[]>;
  hasModel(modelId: string): Promise<boolean>;
  pullModel(modelId: string, onProgress?: (percent: number, status: string) => void): Promise<boolean>;
  generate(prompt: string, modelId?: string, options?: GenerateOptions): Promise<ProviderResponse>;
}
