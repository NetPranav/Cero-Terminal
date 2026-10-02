import { describe, it, expect } from 'vitest';
import { describeAi, type AiBadge } from './AiStatus';
import type { ActiveModelInfo } from './ModelManager';

function makeActive(overrides: Partial<ActiveModelInfo> = {}): ActiveModelInfo {
  return {
    providerId: 'embedded',
    modelId: 'sentinel-embedded',
    displayName: 'Sentinel Embedded Model',
    score: 100,
    sizeBytes: 0,
    isReady: true,
    lastVerified: Date.now(),
    ...overrides,
  };
}

describe('describeAi', () => {
  // --- Embedded provider ---
  it('embedded running shows ready with concise local label', () => {
    const badge = describeAi({
      active: makeActive({ providerId: 'embedded' }),
      embedded: { isRunning: true, isWarming: false, isCpuFallback: false, port: 8847, activeModel: 'Qwen 2.5 3B', engineInstalled: true, modelDownloaded: true },
      cloudConfigured: false,
    });
    expect(badge.state).toBe('ready');
    expect(badge.label).toBe('AI: local');
    expect(badge.detail).toContain('Model: Sentinel Embedded Model');
    expect(badge.label).not.toContain('Off');
  });

  it('embedded running with CPU fallback preserves detail in tooltip', () => {
    const badge = describeAi({
      active: makeActive({ providerId: 'embedded' }),
      embedded: { isRunning: true, isWarming: false, isCpuFallback: true, port: 8847, activeModel: 'Qwen 2.5 3B', engineInstalled: true, modelDownloaded: true },
      cloudConfigured: false,
    });
    expect(badge.state).toBe('ready');
    expect(badge.label).toBe('AI: local');
    expect(badge.detail).toContain('(CPU)');
  });

  it('embedded warming shows starting', () => {
    const badge = describeAi({
      active: makeActive({ providerId: 'embedded', isReady: false }),
      embedded: { isRunning: false, isWarming: true, isCpuFallback: false, port: 8847, activeModel: undefined, engineInstalled: true, modelDownloaded: true },
      cloudConfigured: false,
    });
    expect(badge.state).toBe('starting');
    expect(badge.label).toContain('Starting');
  });

  it('embedded stopped shows off', () => {
    const badge = describeAi({
      active: makeActive({ providerId: 'embedded', isReady: false }),
      embedded: { isRunning: false, isWarming: false, isCpuFallback: false, port: 8847, activeModel: undefined, engineInstalled: true, modelDownloaded: true },
      cloudConfigured: false,
    });
    expect(badge.state).toBe('off');
    expect(badge.label).toContain('Off');
  });

  // --- Cloud API provider ---
  it('cloud configured and ready shows concise AI: API label', () => {
    const badge = describeAi({
      active: makeActive({ providerId: 'cloud_api', modelId: 'gpt-4o', displayName: 'GPT-4o' }),
      embedded: null,
      cloudConfigured: true,
    });
    expect(badge.state).toBe('ready');
    expect(badge.label).toBe('AI: API');
    expect(badge.label).not.toContain('Off');
  });

  it('cloud without API key shows unavailable, never off', () => {
    const badge = describeAi({
      active: makeActive({ providerId: 'cloud_api', isReady: false }),
      embedded: null,
      cloudConfigured: false,
    });
    expect(badge.state).toBe('unavailable');
    expect(badge.label).not.toContain('Off');
    expect(badge.detail).toContain('No API key');
  });

  // --- Ollama provider ---
  it('ollama ready shows concise AI: Ollama label', () => {
    const badge = describeAi({
      active: makeActive({ providerId: 'ollama', modelId: 'qwen3:4b', displayName: 'Qwen 3 4B' }),
      embedded: null,
      cloudConfigured: false,
    });
    expect(badge.state).toBe('ready');
    expect(badge.label).toBe('AI: Ollama');
    expect(badge.label).not.toContain('Off');
  });

  it('ollama unavailable shows unavailable, never off', () => {
    const badge = describeAi({
      active: makeActive({ providerId: 'ollama', isReady: false }),
      embedded: null,
      cloudConfigured: false,
    });
    expect(badge.state).toBe('unavailable');
    expect(badge.label).not.toContain('Off');
  });

  // --- Cross-provider rule: "Off" is only for the embedded engine being stopped ---
  it('no external provider label contains "Off"', () => {
    const providers = ['cloud_api', 'ollama'] as const;
    for (const providerId of providers) {
      for (const isReady of [true, false]) {
        const badge = describeAi({
          active: makeActive({ providerId, isReady }),
          embedded: null,
          cloudConfigured: providerId === 'cloud_api',
        });
        expect(badge.label).not.toContain('Off');
      }
    }
  });

  it('tooltip detail lists host and never exposes API key', () => {
    const secretKey = 'sk-proj-secret-1234567890';
    const badge = describeAi({
      active: makeActive({ providerId: 'cloud_api', modelId: 'gpt-4o', displayName: 'GPT-4o' }),
      embedded: null,
      cloudConfigured: true,
      cloudHost: 'api.openai.com',
    });
    expect(badge.detail).toContain('Host: api.openai.com');
    expect(badge.detail).toContain('Provider: Cloud API');
    expect(badge.detail).toContain('Model: GPT-4o');
    expect(badge.detail).not.toContain(secretKey);
  });

  it('preserves full model names in tooltip detail without crowding status bar label', () => {
    const longName = 'claude-3-5-sonnet-20241022-extra-long';
    const badge = describeAi({
      active: makeActive({ providerId: 'cloud_api', modelId: longName, displayName: longName }),
      embedded: null,
      cloudConfigured: true,
      cloudHost: 'api.anthropic.com',
    });
    expect(badge.label).toBe('AI: API');
    expect(badge.detail).toContain(longName);
  });
});

