/**
 * DecisionRequest.ts: the one place that decides how an agent request is sampled.
 *
 * The built-in model, Ollama and the cloud APIs must be asked the same way, so a prompt that works on
 * one is not failing on another because of a hidden default. Callers get a plain `Sampling`; each
 * provider only translates it to its own field names (`wireSampling`).
 */
import type { GenerateOptions } from './Provider';

export type ProviderKind = 'embedded' | 'cloud' | 'ollama';

export interface Sampling {
  temperature: number;
  topK: number;
  topP: number;
  seed?: number;
  maxTokens: number;
}

export const DECISION_SEED = 42;
export const DEFAULT_REPLY_TOKENS = { chat: 512, decision: 400, planner: 1024, other: 512 } as const;

/** Sampling for a request. Decisions are deterministic; chat may vary a little. */
export function samplingFor(mode: GenerateOptions['mode'], extra: { maxTokens?: number; isPlanner?: boolean } = {}): Sampling {
  const isChat = mode === 'chat';
  const isDecision = mode === 'decision';
  const base = isChat
    ? { temperature: 0.4, topK: 20, topP: 0.9 }
    : isDecision
      ? { temperature: 0, topK: 1, topP: 1 }
      : { temperature: 0.1, topK: 20, topP: 0.9 };
  const fallbackTokens = extra.isPlanner ? DEFAULT_REPLY_TOKENS.planner : isChat ? DEFAULT_REPLY_TOKENS.chat : isDecision ? DEFAULT_REPLY_TOKENS.decision : DEFAULT_REPLY_TOKENS.other;
  return { ...base, ...(isChat ? {} : { seed: DECISION_SEED }), maxTokens: extra.maxTokens ?? fallbackTokens };
}

/** What the caller set, with anything missing filled from `samplingFor` */
export function resolveSampling(options: GenerateOptions | undefined): Sampling {
  const base = samplingFor(options?.mode, { maxTokens: options?.maxTokens });
  return {
    temperature: options?.temperature ?? base.temperature,
    topK: options?.topK ?? base.topK,
    topP: options?.topP ?? base.topP,
    seed: options?.seed ?? base.seed,
    maxTokens: options?.maxTokens ?? base.maxTokens,
  };
}

/** The wire field names each kind of server expects */
export function wireSampling(kind: ProviderKind, options: GenerateOptions | undefined): Record<string, number | boolean> {
  const s = resolveSampling(options);
  const seed: Record<string, number> = s.seed !== undefined ? { seed: s.seed } : {};
  switch (kind) {
    case 'embedded':
      return { max_tokens: s.maxTokens, temperature: s.temperature, top_p: s.topP, top_k: s.topK, cache_prompt: options?.mode === 'chat', ...seed };
    case 'ollama':
      return { num_predict: s.maxTokens, temperature: s.temperature, top_p: s.topP, top_k: s.topK, ...seed };
    case 'cloud':
      // OpenAI-compatible APIs take no top_k; top_p is left at the API default so reasoning models are not rejected
      return { max_tokens: s.maxTokens, temperature: s.temperature, ...seed };
  }
}
