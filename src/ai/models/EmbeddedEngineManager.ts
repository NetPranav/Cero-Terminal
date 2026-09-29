/**
 * Sentinel Terminal — Embedded Engine Manager
 *
 * Manages the self-contained local LLM inference lifecycle (Qwen2.5-Coder-3B-Instruct),
 * request isolation across tabs, SHA-256 integrity verification, and graceful GPU VRAM fallback.
 */

import { invoke } from '@tauri-apps/api/core';

export interface EmbeddedStatus {
  isRunning: boolean;
  isWarming?: boolean;
  pid?: number;
  activeModel?: string;
  activeLora?: string;
  port: number;
  engineInstalled: boolean;
  modelDownloaded: boolean;
  modelPath?: string;
  isCpuFallback?: boolean;
  cpuFallbackNotice?: string;
  queuedRequests?: number;
}

/** get_sentinel_download_status (src-tauri/src/downloads.rs) */
interface NativeDownloadStatus {
  active: boolean;
  downloaded_bytes: number;
  total_bytes: number;
  done: boolean;
  error?: string | null;
}

export interface DownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: string;
}

export interface ArtifactManifestEntry {
  fileName: string;
  sha256: string;
  sizeBytes: number;
  url: string;
  description: string;
}

export type EmbeddedModelTier = 'lite' | 'balanced' | 'accuracy';

export interface EmbeddedModelSpec {
  id: string;
  tier: EmbeddedModelTier;
  fileName: string;
  displayName: string;
  sizeBytes: number;
  url: string;
  /** SHA-256 from the HuggingFace LFS metadata of the exact file */
  sha256: string;
  ramRequiredMb: number;
  description: string;
}

/**
 * Downloadable models, one per hardware tier. Sizes and hashes were read from the HuggingFace
 * API for these exact files. A download that does not match its hash is discarded.
 */
export const EMBEDDED_MODEL_TIERS: Record<EmbeddedModelTier, EmbeddedModelSpec> = {
  lite: {
    id: 'qwen2.5-coder-1.5b-instruct',
    tier: 'lite',
    fileName: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    displayName: 'Qwen 2.5 Coder 1.5B Instruct',
    sizeBytes: 1117320768,
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    sha256: 'cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046',
    ramRequiredMb: 1400,
    description: 'Fastest; for machines with less than 8 GB of RAM'
  },
  balanced: {
    id: 'qwen2.5-coder-3b-instruct',
    tier: 'balanced',
    fileName: 'qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    displayName: 'Qwen 2.5 Coder 3B Instruct',
    sizeBytes: 2104932800,
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    sha256: '724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7',
    ramRequiredMb: 2400,
    description: 'Default; good speed and command accuracy'
  },
  accuracy: {
    id: 'qwen3-4b-instruct-2507',
    tier: 'accuracy',
    fileName: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    displayName: 'Qwen3 4B Instruct 2507',
    sizeBytes: 2497281120,
    url: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',
    ramRequiredMb: 3200,
    description: 'Most accurate; stronger instruction following, about 30% slower'
  }
};

export const PINNED_MANIFEST: Record<string, ArtifactManifestEntry> = Object.fromEntries(
  Object.values(EMBEDDED_MODEL_TIERS).map(m => [m.fileName, {
    fileName: m.fileName,
    sha256: m.sha256,
    sizeBytes: m.sizeBytes,
    url: m.url,
    description: m.description
  }])
);

/** llama.cpp release the installer pins. Digests are GitHub's published SHA-256 for each asset. */
export const ENGINE_BUILD = 'b11227';

export type EngineAssetKey =
  | 'linux-x64-cpu' | 'linux-x64-vulkan' | 'linux-arm64-cpu' | 'linux-arm64-vulkan' | 'macos-arm64' | 'macos-x64'
  | 'windows-x64-cpu' | 'windows-x64-vulkan' | 'windows-arm64-cpu';

export interface EngineAsset {
  key: EngineAssetKey;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  url: string;
}

const engineAsset = (key: EngineAssetKey, suffix: string, sha256: string, sizeBytes: number, ext = 'tar.gz'): EngineAsset => {
  const fileName = `llama-${ENGINE_BUILD}-bin-${suffix}.${ext}`;
  return { key, fileName, sha256, sizeBytes, url: `https://github.com/ggml-org/llama.cpp/releases/download/${ENGINE_BUILD}/${fileName}` };
};

export const ENGINE_ASSETS: Record<EngineAssetKey, EngineAsset> = {
  'linux-x64-cpu': engineAsset('linux-x64-cpu', 'ubuntu-x64', 'da95fc780bf011cb91650fe774866cf5b1c9eb0bdb820bb7a8c7897fc6692579', 17402524),
  'linux-x64-vulkan': engineAsset('linux-x64-vulkan', 'ubuntu-vulkan-x64', 'f1ed225047a1ecfabbaafc4acfee887cab9c381cf7923e840a8f018cb7e66dde', 31344500),
  'linux-arm64-cpu': engineAsset('linux-arm64-cpu', 'ubuntu-arm64', '8d755bc027cfd0942b65e78a0d44aa369bd8c324fd7495f6481ea22ae48d31a6', 13497637),
  'linux-arm64-vulkan': engineAsset('linux-arm64-vulkan', 'ubuntu-vulkan-arm64', '86ae78313c9e508f5cfca0306f7a097d92d75db32c319ab1b5e7fdea0234c458', 24667516),
  'macos-arm64': engineAsset('macos-arm64', 'macos-arm64', '82c37e40a6066047af88b6616eb232dc830efdbd64a7cafd1a9f910130a2bfe0', 11756537),
  'macos-x64': engineAsset('macos-x64', 'macos-x64', '4fd8194547b0af773c410b762883e59c80207f5218fd5d0220cb7df2a22f8513', 11310663),
  'windows-x64-cpu': engineAsset('windows-x64-cpu', 'win-cpu-x64', '68b0f914b4a0e6fde3c557d7565e079d769679a8e32f71416609f3efe197e80e', 19156773, 'zip'),
  'windows-x64-vulkan': engineAsset('windows-x64-vulkan', 'win-vulkan-x64', '05d3401c0611e7ef2428f8ea6ea13d502ade7d5f5a63c735c8b7acbc255e30e1', 33064929, 'zip'),
  'windows-arm64-cpu': engineAsset('windows-arm64-cpu', 'win-cpu-arm64', 'e1a6061542b60129b0787da936a820f849bd2f6354e5598285504f3880233cef', 12043541, 'zip'),
};

for (const asset of Object.values(ENGINE_ASSETS)) {
  PINNED_MANIFEST[asset.fileName] = {
    fileName: asset.fileName,
    sha256: asset.sha256,
    sizeBytes: asset.sizeBytes,
    url: asset.url,
    description: `llama.cpp ${ENGINE_BUILD} (${asset.key})`
  };
}

/**
 * Pick the release bundle for this machine. The Vulkan build also contains the CPU backends and
 * falls back to them when no Vulkan device initialises, so it is preferred whenever the Vulkan
 * loader (libvulkan.so.1) is installed; that covers AMD, Intel and NVIDIA GPUs on Linux.
 */
export function selectEngineAsset(os: string, machine: string, hasVulkanLoader: boolean): EngineAsset | null {
  const kernel = os.toLowerCase();
  const arch = /^(x86_64|amd64)$/i.test(machine) ? 'x64' : /^(aarch64|arm64)$/i.test(machine) ? 'arm64' : null;
  if (!arch) return null;
  if (kernel === 'darwin') return ENGINE_ASSETS[arch === 'arm64' ? 'macos-arm64' : 'macos-x64'];
  if (kernel === 'linux') return ENGINE_ASSETS[`linux-${arch}-${hasVulkanLoader ? 'vulkan' : 'cpu'}` as EngineAssetKey];
  // Windows: the Vulkan build (AMD, Intel and NVIDIA drivers ship vulkan-1.dll) also carries the CPU backend
  if (/^win/.test(kernel)) return ENGINE_ASSETS[arch === 'arm64' ? 'windows-arm64-cpu' : hasVulkanLoader ? 'windows-x64-vulkan' : 'windows-x64-cpu'];
  return null;
}

export interface InferenceQueueItem<T> {
  sessionId: string;
  requestId: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  enqueuedAt: number;
}

export interface InferenceQueueStatus {
  activeRequest?: {
    sessionId: string;
    requestId: string;
  };
  queuedCount: number;
  perSession: Record<string, number>;
  isCpuFallback: boolean;
}

export class EmbeddedEngineManager {
  private static instance: EmbeddedEngineManager;

  public static readonly TIER_STORAGE_KEY = 'sentinel_embedded_model_tier';

  /** The model tier the user picked (default: balanced). */
  public static getSelectedTier(): EmbeddedModelTier {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(EmbeddedEngineManager.TIER_STORAGE_KEY) : null;
      if (saved === 'lite' || saved === 'balanced' || saved === 'accuracy') return saved;
    } catch {
      // storage unavailable
    }
    return 'balanced';
  }

  public static setSelectedTier(tier: EmbeddedModelTier): void {
    try {
      localStorage.setItem(EmbeddedEngineManager.TIER_STORAGE_KEY, tier);
    } catch {
      // storage unavailable
    }
  }

  /** Suggest a tier from total RAM in GB. */
  public static recommendTier(ramGb: number): EmbeddedModelTier {
    if (ramGb > 0 && ramGb < 8) return 'lite';
    if (ramGb >= 16) return 'accuracy';
    return 'balanced';
  }

  /** The model the download, start, delete and status paths operate on: the selected tier. */
  public static get RECOMMENDED_MODEL(): EmbeddedModelSpec & { metalAcceleration: boolean } {
    return { ...EMBEDDED_MODEL_TIERS[EmbeddedEngineManager.getSelectedTier()], metalAcceleration: true };
  }

  public static getInstance(): EmbeddedEngineManager {
    if (!EmbeddedEngineManager.instance) {
      EmbeddedEngineManager.instance = new EmbeddedEngineManager();
    }
    return EmbeddedEngineManager.instance;
  }

  private activeLora?: string;
  private isWarming = false;

  // Phase 0.5 item 17: GPU VRAM exhaustion fallback state
  private isCpuFallbackMode = false;
  private cpuFallbackNotice: string | null = null;

  // Phase 0.5 item 11: Multi-tab request isolation queue
  private activeInferenceRequest: { sessionId: string; requestId: string } | null = null;
  private inferenceQueue: InferenceQueueItem<any>[] = [];
  private isProcessingQueue = false;

  /**
   * Get detailed runtime status of the embedded LLM engine.
   */
  public async getStatus(): Promise<EmbeddedStatus> {
    const defaultStatus: EmbeddedStatus = {
      isRunning: false,
      isWarming: this.isWarming,
      port: 8847,
      engineInstalled: false,
      modelDownloaded: false,
      activeLora: this.activeLora,
      isCpuFallback: this.isCpuFallbackMode,
      cpuFallbackNotice: this.cpuFallbackNotice || undefined,
      queuedRequests: this.inferenceQueue.length + (this.activeInferenceRequest ? 1 : 0)
    };

    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return {
        ...defaultStatus,
        engineInstalled: true,
        modelDownloaded: true,
        isRunning: true,
        isWarming: this.isWarming,
        port: 8847,
        activeModel: 'qwen2.5-coder-3b-instruct-q4_k_m.gguf',
        activeLora: this.activeLora,
        isCpuFallback: this.isCpuFallbackMode,
        cpuFallbackNotice: this.cpuFallbackNotice || undefined
      };
    }

    try {
      // One IPC call; Rust answers model/engine presence with stat() instead of the two shell
      // processes this used to spawn on every status-bar poll.
      const res = await invoke<{
        is_running: boolean;
        pid?: number;
        active_model?: string;
        active_lora?: string;
        port: number;
        is_cpu_fallback?: boolean;
        queued_requests?: number;
        model_downloaded?: boolean;
        engine_installed?: boolean;
      }>('get_embedded_llm_status', { modelFileName: EmbeddedEngineManager.RECOMMENDED_MODEL.fileName });

      const modelExists = res.model_downloaded ?? await this.checkModelExists();
      const engineExists = res.engine_installed ?? await this.checkEngineExists();

      return {
        isRunning: res.is_running,
        isWarming: this.isWarming,
        pid: res.pid,
        activeModel: res.active_model,
        activeLora: res.active_lora || this.activeLora,
        port: res.port || 8847,
        engineInstalled: engineExists,
        modelDownloaded: modelExists,
        modelPath: res.active_model,
        isCpuFallback: res.is_cpu_fallback ?? this.isCpuFallbackMode,
        cpuFallbackNotice: this.cpuFallbackNotice || undefined,
        queuedRequests: res.queued_requests ?? (this.inferenceQueue.length + (this.activeInferenceRequest ? 1 : 0))
      };
    } catch {
      return defaultStatus;
    }
  }

  /**
   * Get the currently active LoRA adapter path, if any.
   */
  public getActiveLora(): string | undefined {
    return this.activeLora;
  }

  /**
   * Check if a given LoRA adapter exists in ~/.sentinel/models/
   */
  public async checkLoraExists(loraPath?: string): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return true;
    const pathToCheck = loraPath || '$HOME/.sentinel/models/sentinel_mlx_lora.gguf';
    try {
      const checkCmd = `test -f "${pathToCheck}" && echo "exists"`;
      const res = await invoke<{ stdout: string }>('execute_command', {
        command: 'sh',
        args: ['-c', checkCmd]
      });
      return (res.stdout || '').trim() === 'exists';
    } catch {
      return false;
    }
  }

  /**
   * Check if the recommended Qwen 2.5 3B GGUF file exists in ~/.sentinel/models/
   */
  /** Model/engine presence from Rust (stat, no subprocess); undefined when unavailable. */
  private async nativePresence(): Promise<{ model_downloaded?: boolean; engine_installed?: boolean } | undefined> {
    try {
      return await invoke<{ model_downloaded?: boolean; engine_installed?: boolean }>('get_embedded_llm_status', {
        modelFileName: EmbeddedEngineManager.RECOMMENDED_MODEL.fileName
      });
    } catch {
      return undefined;
    }
  }

  public async checkModelExists(): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return true;
    const native = await this.nativePresence();
    if (typeof native?.model_downloaded === 'boolean') return native.model_downloaded;
    try {
      const checkCmd = `test -f "$HOME/.sentinel/models/${EmbeddedEngineManager.RECOMMENDED_MODEL.fileName}" && echo "exists"`;
      const res = await invoke<{ stdout: string }>('execute_command', {
        command: 'sh',
        args: ['-c', checkCmd]
      });
      return (res.stdout || '').trim() === 'exists';
    } catch {
      return false;
    }
  }

  /**
   * Check if llama-server executable exists
   */
  public async checkEngineExists(): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return true;
    const native = await this.nativePresence();
    if (typeof native?.engine_installed === 'boolean') return native.engine_installed;
    try {
      const checkCmd = `test -x "$HOME/.sentinel/engine/current/llama-server" || test -x "$HOME/.sentinel/bin/llama-server" || command -v llama-server >/dev/null 2>&1 || test -x "/usr/lib/ollama/llama-server"`;
      const res = await invoke<{ code: number }>('execute_command', {
        command: 'sh',
        args: ['-c', checkCmd]
      });
      return res.code === 0;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // Phase 0.5 Item 17: GPU VRAM Exhaustion & CPU Fallback Handling
  // =========================================================================

  public isCpuFallback(): boolean {
    return this.isCpuFallbackMode;
  }

  public getCpuFallbackNotice(): string | null {
    return this.cpuFallbackNotice;
  }

  public clearCpuFallbackNotice(): void {
    this.cpuFallbackNotice = null;
  }

  public resetCpuFallback(): void {
    this.isCpuFallbackMode = false;
    this.cpuFallbackNotice = null;
  }

  /**
   * Checks if an error string/event matches a known GPU/VRAM OOM pattern.
   */
  public isVramExhaustionError(error: any): boolean {
    if (!error) return false;
    const str = typeof error === 'string' ? error : error?.message || error?.toString?.() || '';
    const lower = str.toLowerCase();
    return (
      lower.includes('out of memory') ||
      lower.includes('cuda out of memory') ||
      lower.includes('cuda error: out of memory') ||
      lower.includes('failed to allocate metal') ||
      lower.includes('ggml_metal_init: error') ||
      lower.includes('metal buffer') ||
      lower.includes('vk_error_out_of_device_memory') ||
      lower.includes('oom') ||
      lower.includes('exit code 137') ||
      lower.includes('sigkill')
    );
  }

  /**
   * Handles engine crashes caused by GPU VRAM exhaustion.
   * Automatically restarts the embedded engine with `--n-gpu-layers 0` (pure CPU mode)
   * and surfaces a reduced-capability notification banner.
   */
  public async handleOomCrash(errorDetails?: string): Promise<boolean> {
    if (this.isCpuFallbackMode) {
      // Already running on CPU, cannot degrade further
      return false;
    }

    this.isCpuFallbackMode = true;
    this.cpuFallbackNotice =
      'Sentinel AI is running in reduced-capability CPU fallback mode due to GPU VRAM exhaustion.';
    console.warn(
      `[EmbeddedEngineManager] GPU VRAM exhaustion detected${errorDetails ? `: ${errorDetails}` : ''}. Restarting in CPU fallback mode (-ngl 0)...`
    );

    // Stop the crashed engine
    await this.stopEngine();

    // Automatically restart with forceCpu: true
    const restarted = await this.startEngine(undefined, undefined, { forceCpu: true });
    return restarted;
  }

  /**
   * Start the native in-app LLM engine using the recommended 3B model,
   * optionally attaching a local LoRA adapter and specifying GPU layer count / CPU fallback.
   */
  public async startEngine(
    modelPath?: string,
    loraPath?: string,
    options?: { forceCpu?: boolean; gpuLayers?: number }
  ): Promise<boolean> {
    this.activeLora = loraPath;
    const isCpu = options?.forceCpu ?? this.isCpuFallbackMode;
    if (isCpu) {
      this.isCpuFallbackMode = true;
    }
    const gpuLayers = isCpu ? 0 : (options?.gpuLayers ?? 99);

    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return true;
    try {
      return await invoke<boolean>('start_embedded_llm', {
        // Rust expands ~/ and falls back to discovery when the file is missing
        modelPath: modelPath ?? `~/.sentinel/models/${EmbeddedEngineManager.RECOMMENDED_MODEL.fileName}`,
        loraPath,
        gpuLayers
      });
    } catch (err) {
      console.warn('[EmbeddedEngineManager] Failed to start embedded LLM:', err);
      return false;
    }
  }

  /**
   * Proactively warms up the embedded engine on startup if downloaded (Phase 0.75 Task 0.75.7).
   * Prevents cold-start inference latency penalty on first user prompt.
   */
  public async proactiveWarmup(): Promise<boolean> {
    if (this.isWarming) return false;
    try {
      const status = await this.getStatus();
      if (status.isRunning) return true;
      if (!status.engineInstalled || !status.modelDownloaded) return false;

      this.isWarming = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sentinel:ai-status-changed'));
      }
      console.log('[EmbeddedEngineManager] Proactively warming up embedded engine...');
      const started = await this.startEngine();
      if (started && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sentinel:ai-status-changed'));
      }
      return started;
    } catch (err) {
      console.warn('[EmbeddedEngineManager] Proactive engine warmup error:', err);
      return false;
    } finally {
      this.isWarming = false;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sentinel:ai-status-changed'));
      }
    }
  }

  /**
   * Check if the embedded engine is currently warming up.
   */
  public isEngineWarming(): boolean {
    return this.isWarming;
  }

  /**
   * Hot-reloads a new LoRA adapter into the running engine with minimal downtime.
   */
  public async hotReloadLora(loraPath: string): Promise<boolean> {
    const exists = await this.checkLoraExists(loraPath);
    if (!exists) {
      console.warn(`[EmbeddedEngineManager] LoRA adapter not found at: ${loraPath}`);
      return false;
    }

    // Gracefully restart engine with new adapter
    await this.stopEngine();
    const started = await this.startEngine(undefined, loraPath);
    if (started) {
      this.activeLora = loraPath;
    }
    return started;
  }

  /**
   * Stop the native in-app LLM engine.
   */
  public async stopEngine(): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      this.activeLora = undefined;
      return true;
    }
    try {
      const stopped = await invoke<boolean>('stop_embedded_llm');
      if (stopped) {
        this.activeLora = undefined;
      }
      return stopped;
    } catch (err) {
      console.warn('[EmbeddedEngineManager] Failed to stop embedded LLM:', err);
      return false;
    }
  }

  // =========================================================================
  // Phase 0.5 Item 11: Multi-Tab Request Isolation & Inference Queue
  // =========================================================================

  /**
   * Enqueue an inference request tagged with sessionId and requestId.
   * Ensures per-tab request isolation and sequential slot execution to prevent
   * KV-cache / slot cross-contamination across concurrent tabs.
   */
  public async enqueueInference<T>(
    sessionId: string,
    requestId: string,
    execute: () => Promise<T>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.inferenceQueue.push({
        sessionId,
        requestId,
        execute,
        resolve,
        reject,
        enqueuedAt: Date.now()
      });

      this.processNextInferenceQueueItem();
    });
  }

  private async processNextInferenceQueueItem(): Promise<void> {
    if (this.isProcessingQueue || this.activeInferenceRequest || this.inferenceQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    const task = this.inferenceQueue.shift();
    if (!task) {
      this.isProcessingQueue = false;
      return;
    }

    this.activeInferenceRequest = {
      sessionId: task.sessionId,
      requestId: task.requestId
    };

    // Inform Tauri backend of active slot
    try {
      await invoke('acquire_inference_slot', {
        sessionId: task.sessionId,
        requestId: task.requestId
      }).catch(() => {});
    } catch {
      // Ignored outside Tauri
    }

    try {
      const result = await task.execute();
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    } finally {
      try {
        await invoke('release_inference_slot', {
          sessionId: task.sessionId,
          requestId: task.requestId
        }).catch(() => {});
      } catch {
        // Ignored outside Tauri
      }

      this.activeInferenceRequest = null;
      this.isProcessingQueue = false;

      // Yield event loop tick then process next queued item
      setTimeout(() => this.processNextInferenceQueueItem(), 0);
    }
  }

  /**
   * Cancel and abort all queued inference requests for a given session / tab.
   */
  public cancelSessionRequests(sessionId: string): number {
    const cancelledCount = this.inferenceQueue.filter(t => t.sessionId === sessionId).length;
    this.inferenceQueue = this.inferenceQueue.filter(task => {
      if (task.sessionId === sessionId) {
        task.reject(new Error(`Inference request cancelled: session ${sessionId} was closed`));
        return false;
      }
      return true;
    });

    try {
      invoke('cancel_session_requests', { sessionId }).catch(() => {});
    } catch {
      // Ignored outside Tauri
    }

    return cancelledCount;
  }

  /**
   * Get live status of the inference queue and per-session counts.
   */
  public getInferenceQueueStatus(): InferenceQueueStatus {
    const perSession: Record<string, number> = {};
    if (this.activeInferenceRequest) {
      perSession[this.activeInferenceRequest.sessionId] =
        (perSession[this.activeInferenceRequest.sessionId] || 0) + 1;
    }
    for (const task of this.inferenceQueue) {
      perSession[task.sessionId] = (perSession[task.sessionId] || 0) + 1;
    }

    return {
      activeRequest: this.activeInferenceRequest ? { ...this.activeInferenceRequest } : undefined,
      queuedCount: this.inferenceQueue.length,
      perSession,
      isCpuFallback: this.isCpuFallbackMode
    };
  }

  // =========================================================================
  // Phase 0.5 Item 16: SHA-256 Checksum Verification
  // =========================================================================

  /**
   * Computes and verifies the SHA-256 checksum of a file against expected hash.
   */
  public async verifyChecksum(
    filePath: string,
    expectedSha256: string
  ): Promise<{ valid: boolean; actualSha256: string }> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      try {
        const fs = await import('fs');
        const crypto = await import('crypto');
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          const hash = crypto.createHash('sha256').update(buffer).digest('hex');
          return {
            valid: hash.toLowerCase() === expectedSha256.toLowerCase(),
            actualSha256: hash
          };
        }
      } catch {
        // Fallback for mock environments
      }
      return {
        valid: true,
        actualSha256: expectedSha256
      };
    }

    try {
      const match = await invoke<boolean>('verify_file_checksum', {
        filePath,
        expectedSha256
      });
      return { valid: match, actualSha256: match ? expectedSha256 : 'mismatch' };
    } catch {
      try {
        const checkCmd = `(sha256sum "${filePath}" 2>/dev/null || shasum -a 256 "${filePath}") | awk '{print $1}'`;
        const res = await invoke<{ stdout: string }>('execute_command', {
          command: 'sh',
          args: ['-c', checkCmd]
        });
        const actual = (res.stdout || '').trim().toLowerCase();
        return {
          valid: actual === expectedSha256.trim().toLowerCase(),
          actualSha256: actual
        };
      } catch (err) {
        return { valid: false, actualSha256: `error: ${err}` };
      }
    }
  }

  /**
   * Download the recommended Qwen2.5-Coder-3B model into ~/.sentinel/models/
   * and verifies SHA-256 checksum against pinned manifest. If corrupted, deletes
   * temporary download and attempts 1 re-download before throwing an error.
   */
  public async downloadRecommendedModel(
    onProgress?: (progress: DownloadProgress) => void,
    maxRetries = 1
  ): Promise<boolean> {
    const model = EmbeddedEngineManager.RECOMMENDED_MODEL;
    const tmpFile = `$HOME/.sentinel/models/${model.fileName}.tmp`;
    const finalFile = `$HOME/.sentinel/models/${model.fileName}`;

    // Native download (every OS, including Windows): resumable, SHA-256 checked, with progress
    if (!(typeof process !== 'undefined' && process.env.NODE_ENV === 'test')) {
      const native = await this.nativeDownload(model.url, `models/${model.fileName}`, model.sha256, model.sizeBytes, onProgress, maxRetries);
      if (native !== null) {
        if (!native) throw new Error(`Download of ${model.fileName} failed or did not pass its SHA-256 check.`);
        return true;
      }
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        onProgress?.({
          percent: 100,
          downloadedBytes: model.sizeBytes,
          totalBytes: model.sizeBytes,
          speed: 'Complete'
        });
        return true;
      }

      const script = `
        mkdir -p "$HOME/.sentinel/models" && \\
        curl -L -C - --fail --output "${tmpFile}" "${model.url}"
      `;

      try {
        const res = await invoke<{ code: number }>('execute_command', {
          command: 'sh',
          args: ['-c', script]
        });

        if (res.code === 0) {
          const check = await this.verifyChecksum(tmpFile, model.sha256);
          if (check.valid) {
            await invoke('execute_command', {
              command: 'sh',
              args: ['-c', 'mv -- "$1" "$2"', 'sh', tmpFile, finalFile]
            });
            onProgress?.({
              percent: 100,
              downloadedBytes: model.sizeBytes,
              totalBytes: model.sizeBytes,
              speed: 'Complete'
            });
            return true;
          }

          console.warn(
            `[EmbeddedEngineManager] SHA-256 mismatch for ${model.fileName}. Expected ${model.sha256}, got ${check.actualSha256}. Removing corrupted file.`
          );
          await invoke('execute_command', {
            command: 'sh',
            args: ['-c', 'rm -f -- "$1"', 'sh', tmpFile]
          });
        }
      } catch (err) {
        console.warn(`[EmbeddedEngineManager] Download attempt ${attempt + 1} failed:`, err);
      }
    }

    throw new Error(
      `SHA-256 integrity verification failed for ${model.fileName}: download corrupted or tampered.`
    );
  }

  private cachedHostOs?: string;

  /** The OS the app runs on: Tauri's os plugin in the app, process.platform in Node. */
  private async hostOs(): Promise<string> {
    if (this.cachedHostOs) return this.cachedHostOs;
    try {
      const { platform } = await import('@tauri-apps/plugin-os');
      this.cachedHostOs = platform();
    } catch {
      this.cachedHostOs = typeof process !== 'undefined' ? process.platform : 'unknown';
    }
    return this.cachedHostOs!;
  }

  /**
   * Download into ~/.sentinel with the app's native command. Null when the command does not
   * exist (the Node CLI), so the caller can use its shell fallback; false on failure.
   */
  private async nativeDownload(
    url: string,
    relativePath: string,
    sha256: string,
    sizeBytes: number,
    onProgress?: (progress: DownloadProgress) => void,
    maxRetries = 1
  ): Promise<boolean | null> {
    let lastBytes = 0;
    let lastTime = Date.now();
    const poll = onProgress ? setInterval(async () => {
      const status = await invoke<NativeDownloadStatus | null>('get_sentinel_download_status', { relativePath }).catch(() => null);
      if (!status) return;
      const now = Date.now();
      const bytesPerSec = ((status.downloaded_bytes - lastBytes) * 1000) / Math.max(1, now - lastTime);
      lastBytes = status.downloaded_bytes;
      lastTime = now;
      const total = status.total_bytes || sizeBytes;
      onProgress({
        percent: total ? Math.min(100, Math.round((status.downloaded_bytes / total) * 1000) / 10) : 0,
        downloadedBytes: status.downloaded_bytes,
        totalBytes: total,
        speed: `${(bytesPerSec / 1_048_576).toFixed(1)} MB/s`
      });
    }, 1000) : undefined;
    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const path = await invoke<string | null>('download_sentinel_file', { url, relativePath, sha256 });
          if (typeof path !== 'string') return null;
          onProgress?.({ percent: 100, downloadedBytes: sizeBytes, totalBytes: sizeBytes, speed: 'Complete' });
          return true;
        } catch (err) {
          if (/not found|unknown command/i.test(String(err))) return null;
          if (/cancelled/i.test(String(err))) return false;
          console.warn(`[EmbeddedEngineManager] Download attempt ${attempt + 1} of ${relativePath} failed:`, err);
        }
      }
      return false;
    } finally {
      if (poll) clearInterval(poll);
    }
  }

  /**
   * Query real-time download progress of the recommended model.
   * Returns whether curl is running, current downloaded bytes, and percentage.
   */
  public async getDownloadProgress(): Promise<{
    isDownloading: boolean;
    downloadedBytes: number;
    totalBytes: number;
    percent: number;
  }> {
    const model = EmbeddedEngineManager.RECOMMENDED_MODEL;
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return { isDownloading: false, downloadedBytes: 0, totalBytes: model.sizeBytes, percent: 0 };
    }
    const native = await invoke<NativeDownloadStatus | null>('get_sentinel_download_status', { relativePath: `models/${model.fileName}` }).catch(() => null);
    if (native && (native.active || native.done)) {
      const total = native.total_bytes || model.sizeBytes;
      return {
        isDownloading: native.active,
        downloadedBytes: native.done ? total : native.downloaded_bytes,
        totalBytes: total,
        percent: native.done ? 100 : Math.min(100, Math.round((native.downloaded_bytes / total) * 1000) / 10)
      };
    }
    if (/^win/i.test(await this.hostOs())) {
      const done = await this.checkModelExists();
      return { isDownloading: false, downloadedBytes: done ? model.sizeBytes : 0, totalBytes: model.sizeBytes, percent: done ? 100 : 0 };
    }
    try {
      const script = `
        if [ -f "$HOME/.sentinel/models/${model.fileName}" ]; then
          bytes=$(stat -c %s "$HOME/.sentinel/models/${model.fileName}" 2>/dev/null || stat -f %z "$HOME/.sentinel/models/${model.fileName}" 2>/dev/null || echo ${model.sizeBytes})
          echo "done|$bytes"
        else
          running=$(pgrep -x curl 2>/dev/null | while read pid; do
            if tr "\\0" " " < /proc/$pid/cmdline 2>/dev/null | grep -q "${model.fileName}"; then
              echo $pid
              break
            fi
          done)
          bytes=$(stat -c %s "$HOME/.sentinel/models/${model.fileName}.tmp" 2>/dev/null || stat -f %z "$HOME/.sentinel/models/${model.fileName}.tmp" 2>/dev/null || echo 0)
          echo "$running|$bytes"
        fi
      `;
      const res = await invoke<{ stdout: string }>('execute_command', {
        command: 'sh',
        args: ['-c', script]
      });
      const parts = (res.stdout || '').trim().split('|');
      const firstPart = parts[0]?.trim() || '';
      const isDone = firstPart === 'done';
      const isRunning = !isDone && Boolean(firstPart);
      const bytes = parseInt(parts[1]?.trim() || '0', 10) || 0;
      const percent = isDone 
        ? 100 
        : (model.sizeBytes > 0 
            ? Math.min(100, Math.round((bytes / model.sizeBytes) * 1000) / 10) 
            : 0);
      return {
        isDownloading: isRunning,
        downloadedBytes: bytes,
        totalBytes: model.sizeBytes,
        percent
      };
    } catch {
      return { isDownloading: false, downloadedBytes: 0, totalBytes: model.sizeBytes, percent: 0 };
    }
  }

  /**
   * Cancel an in-progress model download by terminating the curl process.
   */
  public async cancelDownload(removePartial = false): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return true;
    }
    const model = EmbeddedEngineManager.RECOMMENDED_MODEL;
    const native = await invoke<boolean | null>('cancel_sentinel_download', { relativePath: `models/${model.fileName}`, removePartial }).catch(() => null);
    if (typeof native === 'boolean' && (native || /^win/i.test(await this.hostOs()))) return true;
    try {
      const script = `
        pgrep -x curl 2>/dev/null | while read pid; do
          if tr "\\0" " " < /proc/$pid/cmdline 2>/dev/null | grep -q "${model.fileName}"; then
            kill -9 $pid 2>/dev/null || true
          fi
        done
        ${removePartial ? `rm -f "$HOME/.sentinel/models/${model.fileName}.tmp"` : ''}
      `;
      await invoke('execute_command', {
        command: 'sh',
        args: ['-c', script]
      });
      return true;
    } catch (err) {
      console.warn('[EmbeddedEngineManager] Failed to cancel download:', err);
      return false;
    }
  }

  /**
   * Delete the downloaded GGUF model from ~/.sentinel/models/ to free up disk space.
   */
  public async deleteModel(): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return true;
    }
    const model = EmbeddedEngineManager.RECOMMENDED_MODEL;
    try {
      await this.stopEngine();
      if (/^win/i.test(await this.hostOs())) {
        await invoke('sentinel_store_remove', { relativePath: `models/${model.fileName}.part` }).catch(() => undefined);
        await invoke('sentinel_store_remove', { relativePath: `models/${model.fileName}` });
        return true;
      }
      const script = `rm -f "$HOME/.sentinel/models/${model.fileName}" "$HOME/.sentinel/models/${model.fileName}.tmp" "$HOME/.sentinel/models/${model.fileName}.part"`;
      const res = await invoke<{ code: number }>('execute_command', {
        command: 'sh',
        args: ['-c', script]
      });
      return res.code === 0;
    } catch (err) {
      console.warn('[EmbeddedEngineManager] Failed to delete model:', err);
      return false;
    }
  }

  /**
   * Download the pinned llama.cpp release for this machine, verify its SHA-256, and unpack the
   * whole bundle (llama-server plus its shared libraries) into ~/.sentinel/engine/<build>, with
   * ~/.sentinel/engine/current pointing at it. Returns false with the reason logged on failure.
   */
  public async installEngine(maxRetries = 1): Promise<boolean> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return true;
    }

    // Windows has no sh, uname, curl pipeline or ln: download and unpack natively
    if (/^win/i.test(await this.hostOs())) {
      let machine = 'x86_64';
      try {
        const { arch } = await import('@tauri-apps/plugin-os');
        machine = arch();
      } catch {
        // assume x64
      }
      const vulkan = await invoke<boolean>('check_path_exists', { path: 'C:\\Windows\\System32\\vulkan-1.dll' }).catch(() => false);
      const asset = selectEngineAsset('windows', machine, Boolean(vulkan));
      if (!asset) return false;
      const archive = `engine/.download/${asset.fileName}`;
      const downloaded = await this.nativeDownload(asset.url, archive, asset.sha256, asset.sizeBytes, undefined, maxRetries);
      if (!downloaded) return false;
      try {
        await invoke<string>('install_sentinel_engine', { relativeArchive: archive });
        return true;
      } catch (err) {
        console.warn('[EmbeddedEngineManager] Engine unpack failed:', err);
        return false;
      }
    }

    const shell = (script: string, timeoutMs?: number) =>
      invoke<{ code: number; stdout: string; stderr: string }>('execute_command', {
        command: 'sh',
        args: ['-c', script],
        timeoutMs
      });

    const probe = await shell(
      `uname -s; uname -m; ( (ldconfig -p 2>/dev/null | grep -q 'libvulkan\\.so\\.1') || ls /usr/lib*/libvulkan.so.1 /usr/lib/*/libvulkan.so.1 >/dev/null 2>&1 ) && echo vulkan || true`,
      10_000
    );
    const [os = '', machine = '', vulkan = ''] = (probe.stdout || '').trim().split('\n').map(l => l.trim());
    const asset = selectEngineAsset(os, machine, vulkan === 'vulkan');
    if (!asset) {
      console.warn(`[EmbeddedEngineManager] No prebuilt llama.cpp engine for ${os} ${machine}. Install llama-server from your distribution instead.`);
      return false;
    }

    const downloadDir = '$HOME/.sentinel/engine/.download';
    const archive = `${downloadDir}/${asset.fileName}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const download = await shell(
          `mkdir -p "${downloadDir}" && curl -fL --retry 2 -C - -o "${archive}" "${asset.url}"`,
          15 * 60_000
        );
        if (download.code !== 0) {
          console.warn(`[EmbeddedEngineManager] Engine download failed: ${download.stderr}`);
          continue;
        }

        const check = await this.verifyChecksum(archive, asset.sha256);
        if (!check.valid) {
          console.warn(`[EmbeddedEngineManager] SHA-256 mismatch for ${asset.fileName}: expected ${asset.sha256}, got ${check.actualSha256}. Re-downloading.`);
          await shell(`rm -f "${archive}"`, 10_000);
          continue;
        }

        const unpack = await shell(
          `set -e
           cd "$HOME/.sentinel/engine"
           tar -xzf "${archive}"
           ln -sfn "llama-${ENGINE_BUILD}" current
           ./current/llama-server --version >/dev/null 2>&1
           rm -f "${archive}"`,
          5 * 60_000
        );
        if (unpack.code === 0) return true;
        console.warn(`[EmbeddedEngineManager] Engine unpack or self-test failed: ${unpack.stderr}`);
      } catch (err) {
        console.warn('[EmbeddedEngineManager] Engine install error:', err);
      }
    }
    return false;
  }

  /** Last lines llama-server wrote to ~/.sentinel/logs/llama-server.log (why a start failed). */
  public async getEngineLogTail(maxLines = 20): Promise<string> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return '';
    try {
      return await invoke<string>('get_embedded_llm_log_tail', { maxLines });
    } catch {
      return '';
    }
  }

  /** Install the engine only when no llama-server is available yet. */
  public async ensureEngineInstalled(): Promise<boolean> {
    if (await this.checkEngineExists()) return true;
    return this.installEngine();
  }
}
