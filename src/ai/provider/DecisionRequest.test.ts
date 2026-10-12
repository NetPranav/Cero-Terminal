import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { samplingFor, resolveSampling, wireSampling } from './DecisionRequest';
import { buildDecisionCall } from '../agent/DecisionCall';

describe('DecisionRequest', () => {
  it('decisions are deterministic, chat may vary, and both are fully specified', () => {
    expect(samplingFor('decision')).toEqual({ temperature: 0, topK: 1, topP: 1, seed: 42, maxTokens: 400 });
    expect(samplingFor('chat')).toEqual({ temperature: 0.4, topK: 20, topP: 0.9, maxTokens: 512 });
    expect(samplingFor('decision', { isPlanner: true }).maxTokens).toBe(1024);
    expect(samplingFor('decision', { maxTokens: 123 }).maxTokens).toBe(123);
  });

  it('an unset option is filled from the same table for every provider', () => {
    expect(resolveSampling({ mode: 'decision' })).toEqual(samplingFor('decision'));
    expect(resolveSampling(undefined).temperature).toBe(0.1);
    expect(resolveSampling({ mode: 'decision', temperature: 0.7 }).temperature).toBe(0.7);
  });

  it('the three kinds share temperature, seed and max tokens (only the field names differ)', () => {
    const options = { mode: 'decision' as const, maxTokens: 300 };
    const embedded = wireSampling('embedded', options);
    const ollama = wireSampling('ollama', options);
    const cloud = wireSampling('cloud', options);
    for (const w of [embedded, ollama, cloud]) {
      expect(w.temperature).toBe(0);
      expect(w.seed).toBe(42);
    }
    expect(embedded.max_tokens).toBe(300);
    expect(cloud.max_tokens).toBe(300);
    expect(ollama.num_predict).toBe(300);
    expect(embedded.top_k).toBe(1);
    expect(ollama.top_k).toBe(1);
    expect(cloud).not.toHaveProperty('top_k');
    expect(embedded.cache_prompt).toBe(false);
  });

  it('chat sends no seed', () => {
    expect(wireSampling('embedded', { mode: 'chat' })).not.toHaveProperty('seed');
  });

  it('the agent decision call and the providers agree', () => {
    const call = buildDecisionCall('list files', { os: 'linux', cwd: '/x' } as any, []);
    const fromCall = { temperature: call.options.temperature, seed: call.options.seed, maxTokens: call.options.maxTokens };
    const fromWire = wireSampling('embedded', call.options);
    expect(fromWire.temperature).toBe(fromCall.temperature);
    expect(fromWire.seed).toBe(fromCall.seed);
    expect(fromWire.max_tokens).toBe(fromCall.maxTokens);
  });

  it('no provider file sets its own sampling numbers', () => {
    for (const file of ['EmbeddedProvider.ts', 'OllamaProvider.ts', 'CloudApiProvider.ts']) {
      const src = fs.readFileSync(path.join(__dirname, file), 'utf8').split('\n')
        .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
      const offending = src.filter(line => /(?:temperature|top_k|top_p|topK|topP|maxTokens)\s*(?:\?\?|\|\|)\s*[\d.(]/.test(line) || /\btemperature:\s*[\d.]/.test(line) || /max_tokens:\s*\d+/.test(line));
      // the connectivity probe asks for 16 tokens on purpose; it is not an agent decision
      const real = offending.filter(l => !/max_tokens:\s*16\b/.test(l) && !/bodyPayload\.max_tokens\s*=\s*16/.test(l));
      expect(real, `${file}: ${real.join(' | ')}`).toEqual([]);
    }
  });
});
