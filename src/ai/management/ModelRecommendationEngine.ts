/**
 * ModelRecommendationEngine.ts — Hardware-Aware LLM Tier & Model Recommendation Engine
 * 
 * Analyzes host hardware profile (RAM, CPU cores, GPU/VRAM) and assigns an optimal model tier:
 * - Budget (< 6 GB RAM): Ultra-lightweight models (1.5B) or Cloud API keys
 * - Balanced (6 GB - 12 GB RAM): Default sweet-spot models (3B / 4B)
 * - Performance (12 GB - 24 GB RAM): High-reasoning developer models (7B / 8B)
 * - Workstation (> 24 GB RAM / Discrete GPU): Frontier local models (14B / 22B)
 */

import { SystemKnowledgeScanner, HardwareProfileInfo } from '../../domain/knowledge/SystemKnowledgeScanner';

export type HardwareTier = 'budget' | 'balanced' | 'performance' | 'workstation';

export interface ModelRecommendationItem {
  id: string;
  name: string;
  parameterCount: string;
  quantization: string;
  ramRequiredGb: number;
  expectedTokensPerSec: number;
  contextWindowTokens: number;
  bestFor: string;
  isDefault?: boolean;
}

export interface TierRecommendationResult {
  tier: HardwareTier;
  tierLabel: string;
  detectedRamGb: number;
  detectedCores: number;
  hasGpu: boolean;
  gpuSummary?: string;
  summaryRationale: string;
  recommendedModels: ModelRecommendationItem[];
  cloudApiKeySuggested: boolean;
}

export class ModelRecommendationEngine {
  private static instance: ModelRecommendationEngine;

  public static getInstance(): ModelRecommendationEngine {
    if (!ModelRecommendationEngine.instance) {
      ModelRecommendationEngine.instance = new ModelRecommendationEngine();
    }
    return ModelRecommendationEngine.instance;
  }

  /**
   * Evaluates system hardware profile and returns optimal local model recommendations
   */
  public getRecommendation(overrideHardware?: Partial<HardwareProfileInfo>): TierRecommendationResult {
    const scanner = SystemKnowledgeScanner.getInstance();
    const profile = scanner.getProfile();

    const ramGb = overrideHardware?.ramTotalGb ?? profile?.hardware.ramTotalGb ?? 8;
    const cores = overrideHardware?.cpuCores ?? profile?.hardware.cpuCores ?? 4;
    const hasGpu = overrideHardware?.isGpuAvailable ?? profile?.hardware.isGpuAvailable ?? false;
    const gpuName = overrideHardware?.gpuName ?? profile?.hardware.gpuName;
    const vramGb = overrideHardware?.gpuVramGb ?? profile?.hardware.gpuVramGb;

    const gpuSummary = hasGpu && gpuName ? `${gpuName}${vramGb ? ` (${vramGb}GB VRAM)` : ''}` : undefined;

    // Determine Hardware Tier
    if (ramGb < 6) {
      return {
        tier: 'budget',
        tierLabel: 'Budget / Low Memory Tier',
        detectedRamGb: ramGb,
        detectedCores: cores,
        hasGpu,
        gpuSummary,
        summaryRationale: 'Host system has under 6GB total RAM. Ultra-lightweight models or Cloud API keys (Groq/OpenAI) are recommended to preserve desktop responsiveness.',
        cloudApiKeySuggested: true,
        recommendedModels: [
          {
            id: 'qwen2.5:1.5b',
            name: 'Qwen 2.5 1.5B Instruct',
            parameterCount: '1.5B',
            quantization: 'Q4_K_M',
            ramRequiredGb: 1.1,
            expectedTokensPerSec: 45,
            contextWindowTokens: 8192,
            bestFor: 'Fastest latency on entry hardware and low memory footprint',
            isDefault: true
          },
          {
            id: 'smollm2:1.7b',
            name: 'SmolLM2 1.7B Instruct',
            parameterCount: '1.7B',
            quantization: 'Q4_K_M',
            ramRequiredGb: 1.2,
            expectedTokensPerSec: 40,
            contextWindowTokens: 8192,
            bestFor: 'Compact general shell assistant with minimal RAM usage'
          }
        ]
      };
    }

    if (ramGb < 12) {
      return {
        tier: 'balanced',
        tierLabel: 'Balanced / Standard Developer Tier',
        detectedRamGb: ramGb,
        detectedCores: cores,
        hasGpu,
        gpuSummary,
        summaryRationale: 'Host system has 6GB–12GB RAM. Ideal for 3B-4B parameter coding models that provide strong reasoning while leaving ample memory for IDEs and browsers.',
        cloudApiKeySuggested: false,
        recommendedModels: [
          {
            id: 'qwen2.5-coder:3b',
            name: 'Qwen 2.5 Coder 3B Instruct',
            parameterCount: '3B',
            quantization: 'Q4_K_M',
            ramRequiredGb: 2.5,
            expectedTokensPerSec: 32,
            contextWindowTokens: 16384,
            bestFor: 'Cero default sweet spot: excellent shell tool calling and code reasoning',
            isDefault: true
          },
          {
            id: 'qwen3:4b',
            name: 'Qwen 3 4B Instruct',
            parameterCount: '4B',
            quantization: 'Q4_K_M',
            ramRequiredGb: 3.0,
            expectedTokensPerSec: 28,
            contextWindowTokens: 16384,
            bestFor: 'Enhanced multilingual reasoning and command planning'
          }
        ]
      };
    }

    if (ramGb <= 24) {
      return {
        tier: 'performance',
        tierLabel: 'High-Performance Developer Tier',
        detectedRamGb: ramGb,
        detectedCores: cores,
        hasGpu,
        gpuSummary,
        summaryRationale: 'Host system has 12GB–24GB RAM. Capable of running 7B-8B parameter state-of-the-art developer models with full multi-turn planning capabilities.',
        cloudApiKeySuggested: false,
        recommendedModels: [
          {
            id: 'qwen2.5-coder:7b',
            name: 'Qwen 2.5 Coder 7B Instruct',
            parameterCount: '7B',
            quantization: 'Q4_K_M',
            ramRequiredGb: 4.8,
            expectedTokensPerSec: 22,
            contextWindowTokens: 32768,
            bestFor: 'Top-tier code generation, complex multi-step debugging and agentic workflows',
            isDefault: true
          },
          {
            id: 'llama3.1:8b',
            name: 'Llama 3.1 8B Instruct',
            parameterCount: '8B',
            quantization: 'Q4_K_M',
            ramRequiredGb: 5.2,
            expectedTokensPerSec: 20,
            contextWindowTokens: 32768,
            bestFor: 'General domain reasoning and natural language conversation'
          },
          {
            id: 'qwen2.5-coder:3b',
            name: 'Qwen 2.5 Coder 3B Instruct',
            parameterCount: '3B',
            quantization: 'Q4_K_M',
            ramRequiredGb: 2.5,
            expectedTokensPerSec: 42,
            contextWindowTokens: 16384,
            bestFor: 'Low-latency alternative when multitasking heavily'
          }
        ]
      };
    }

    return {
      tier: 'workstation',
      tierLabel: 'Workstation / Power User Tier',
      detectedRamGb: ramGb,
      detectedCores: cores,
      hasGpu,
      gpuSummary,
      summaryRationale: 'Host system has over 24GB RAM. Capable of hosting high-parameter local models (14B-22B) with expansive context windows and maximum accuracy.',
      cloudApiKeySuggested: false,
      recommendedModels: [
        {
          id: 'qwen2.5-coder:14b',
          name: 'Qwen 2.5 Coder 14B Instruct',
          parameterCount: '14B',
          quantization: 'Q4_K_M',
          ramRequiredGb: 9.5,
          expectedTokensPerSec: 15,
          contextWindowTokens: 32768,
          bestFor: 'Frontier local coding accuracy and multi-step complex system refactoring',
          isDefault: true
        },
        {
          id: 'qwen2.5-coder:7b',
          name: 'Qwen 2.5 Coder 7B Instruct',
          parameterCount: '7B',
          quantization: 'Q4_K_M',
          ramRequiredGb: 4.8,
          expectedTokensPerSec: 28,
          contextWindowTokens: 32768,
          bestFor: 'Ultra-fast inference while running heavy developer workloads'
        }
      ]
    };
  }
}
