/**
 * AiStatus.ts — pure function that computes the status-bar AI badge.
 *
 * Task 1.3: The badge must reflect the *active provider* (embedded, cloud, ollama),
 * not just the embedded engine state.  "Off" is reserved for the built-in engine
 * being stopped while no other provider is active.
 */

import type { ActiveModelInfo } from './ModelManager';
import type { EmbeddedStatus } from '../models/EmbeddedEngineManager';

export type AiBadgeState = 'ready' | 'starting' | 'unavailable' | 'off';

export interface AiBadge {
  /** Current state for colour / icon logic in the status bar. */
  state: AiBadgeState;
  /** Short text shown in the bar, max ~24 visible characters. */
  label: string;
  /** Tooltip with full details: provider, model, host/port, reason. */
  detail: string;
}

/** Truncate a model name to `max` characters for the status bar. */
function truncateModel(name: string, max = 24): string {
  return name.length <= max ? name : name.slice(0, max - 1) + '...';
}

export function describeAi(input: {
  active: ActiveModelInfo;
  embedded: EmbeddedStatus | null;
  cloudConfigured: boolean;
}): AiBadge {
  const { active, embedded, cloudConfigured } = input;
  const providerId = active.providerId;

  // --- Embedded provider ---
  if (providerId === 'embedded') {
    if (embedded?.isRunning) {
      const modelName = active.displayName || embedded.activeModel || 'Qwen 2.5 3B';
      const cpuSuffix = embedded.isCpuFallback ? ' (CPU)' : '';
      return {
        state: 'ready',
        label: `AI: ${truncateModel(modelName)}${cpuSuffix}`,
        detail: `Provider: Sentinel Embedded\nModel: ${modelName}${cpuSuffix}\nPort: ${embedded.port || 8847}\nStatus: Running`,
      };
    }
    if (embedded?.isWarming) {
      return {
        state: 'starting',
        label: 'AI: Starting...',
        detail: 'Provider: Sentinel Embedded\nStatus: Warming up the model',
      };
    }
    return {
      state: 'off',
      label: 'AI: Off',
      detail: 'Provider: Sentinel Embedded\nStatus: Built-in AI is stopped. Click to start it.',
    };
  }

  // --- Cloud API provider ---
  if (providerId === 'cloud_api') {
    if (!cloudConfigured) {
      return {
        state: 'unavailable',
        label: 'AI: unavailable',
        detail: 'Provider: Cloud API\nStatus: No API key set',
      };
    }
    if (active.isReady) {
      const modelName = active.displayName || active.modelId || 'API model';
      return {
        state: 'ready',
        label: `AI: ${truncateModel(modelName)} (API)`,
        detail: `Provider: Cloud API\nModel: ${modelName}\nStatus: Ready`,
      };
    }
    const reason = (active as any).unavailableReason || 'Provider not reachable';
    return {
      state: 'unavailable',
      label: 'AI: unavailable',
      detail: `Provider: Cloud API\nModel: ${active.displayName || active.modelId}\nStatus: ${reason}`,
    };
  }

  // --- Ollama provider ---
  if (providerId === 'ollama') {
    if (active.isReady) {
      const modelName = active.displayName || active.modelId || 'Ollama model';
      return {
        state: 'ready',
        label: `AI: ${truncateModel(modelName)} (local)`,
        detail: `Provider: Ollama\nModel: ${modelName}\nHost: localhost:11434\nStatus: Ready`,
      };
    }
    const reason = (active as any).unavailableReason || 'Ollama is not running';
    return {
      state: 'unavailable',
      label: 'AI: unavailable',
      detail: `Provider: Ollama\nModel: ${active.displayName || active.modelId}\nStatus: ${reason}`,
    };
  }

  // --- Unknown provider (defensive fallback) ---
  if (active.isReady) {
    return {
      state: 'ready',
      label: `AI: ${truncateModel(active.displayName || active.modelId)}`,
      detail: `Provider: ${providerId}\nModel: ${active.displayName || active.modelId}\nStatus: Ready`,
    };
  }
  return {
    state: 'unavailable',
    label: 'AI: unavailable',
    detail: `Provider: ${providerId}\nModel: ${active.displayName || active.modelId}\nStatus: Not available`,
  };
}
