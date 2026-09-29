import { describe, it, expect, beforeEach } from 'vitest';
import { EmbeddedEngineManager, PINNED_MANIFEST, EMBEDDED_MODEL_TIERS, selectEngineAsset } from './EmbeddedEngineManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

describe('EmbeddedEngineManager (In-App Local AI Integration)', () => {
  let manager: EmbeddedEngineManager;

  beforeEach(() => {
    manager = new EmbeddedEngineManager();
    manager.resetCpuFallback();
  });

  it('provides the sweet-spot 3B recommended model configuration with pinned sha256', () => {
    const model = EmbeddedEngineManager.RECOMMENDED_MODEL;
    expect(model.id).toContain('3b');
    expect(model.fileName).toBe('qwen2.5-coder-3b-instruct-q4_k_m.gguf');
    expect(model.sizeBytes).toBeGreaterThan(1000000000); // ~1.9 GB
    expect(model.metalAcceleration).toBe(true);
    expect(model.sha256).toBe(PINNED_MANIFEST['qwen2.5-coder-3b-instruct-q4_k_m.gguf'].sha256);
  });

  it('checks status and reports model and engine availability', async () => {
    const status = await manager.getStatus();
    expect(status.port).toBe(8847);
    expect(status.engineInstalled).toBe(true);
    expect(status.modelDownloaded).toBe(true);
    expect(status.isCpuFallback).toBe(false);
  });

  it('manages engine lifecycle commands', async () => {
    const started = await manager.startEngine();
    expect(typeof started).toBe('boolean');

    const stopped = await manager.stopEngine();
    expect(typeof stopped).toBe('boolean');
  });

  it('supports attaching LoRA adapters and tracking activeLora status', async () => {
    const loraPath = '/Users/test/.sentinel/models/sentinel_mlx_lora.gguf';
    const started = await manager.startEngine(undefined, loraPath);
    expect(started).toBe(true);
    expect(manager.getActiveLora()).toBe(loraPath);

    const status = await manager.getStatus();
    expect(status.activeLora).toBe(loraPath);

    const stopped = await manager.stopEngine();
    expect(stopped).toBe(true);
    expect(manager.getActiveLora()).toBeUndefined();
  });

  it('hot-reloads a new LoRA adapter into the running engine', async () => {
    const initialLora = '/Users/test/.sentinel/models/v1_adapter.gguf';
    await manager.startEngine(undefined, initialLora);
    expect(manager.getActiveLora()).toBe(initialLora);

    const newLora = '/Users/test/.sentinel/models/sentinel_mlx_lora.gguf';
    const reloaded = await manager.hotReloadLora(newLora);
    expect(reloaded).toBe(true);
    expect(manager.getActiveLora()).toBe(newLora);

    const status = await manager.getStatus();
    expect(status.activeLora).toBe(newLora);
  });

  // =========================================================================
  // Phase 0.5 Item 11: Multi-Tab Request Isolation & Inference Queue
  // =========================================================================
  describe('Multi-Tab Request Isolation (Item 0.5.11)', () => {
    it('serializes concurrent requests across tabs to prevent KV-cache cross-contamination', async () => {
      const executionOrder: string[] = [];

      const p1 = manager.enqueueInference('tab-1', 'req-1', async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        executionOrder.push('tab-1-req-1');
        return 'res-1';
      });

      const p2 = manager.enqueueInference('tab-2', 'req-2', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        executionOrder.push('tab-2-req-2');
        return 'res-2';
      });

      const p3 = manager.enqueueInference('tab-1', 'req-3', async () => {
        executionOrder.push('tab-1-req-3');
        return 'res-3';
      });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(r1).toBe('res-1');
      expect(r2).toBe('res-2');
      expect(r3).toBe('res-3');

      // Even though tab-2 task was faster (10ms vs 30ms), tab-1 was enqueued first
      // and inference requests are strictly serialized to prevent collision
      expect(executionOrder).toEqual(['tab-1-req-1', 'tab-2-req-2', 'tab-1-req-3']);
    });

    it('tracks inference queue status and per-session counts', async () => {
      let resolveFirst: () => void = () => {};
      const blockPromise = new Promise<void>(res => {
        resolveFirst = res;
      });

      const p1 = manager.enqueueInference('tab-alpha', 'req-1', async () => {
        await blockPromise;
        return 'done-1';
      });

      const p2 = manager.enqueueInference('tab-beta', 'req-2', async () => 'done-2');
      const p3 = manager.enqueueInference('tab-alpha', 'req-3', async () => 'done-3');

      // Queue status while blocked
      const status = manager.getInferenceQueueStatus();
      expect(status.activeRequest?.sessionId).toBe('tab-alpha');
      expect(status.activeRequest?.requestId).toBe('req-1');
      expect(status.queuedCount).toBe(2);
      expect(status.perSession['tab-alpha']).toBe(2); // 1 active + 1 queued
      expect(status.perSession['tab-beta']).toBe(1); // 1 queued

      resolveFirst();
      await Promise.all([p1, p2, p3]);

      const finalStatus = manager.getInferenceQueueStatus();
      expect(finalStatus.activeRequest).toBeUndefined();
      expect(finalStatus.queuedCount).toBe(0);
    });

    it('cancels pending queued requests when a tab/session is closed', async () => {
      let releaseActive: () => void = () => {};
      const block = new Promise<void>(res => {
        releaseActive = res;
      });

      const activeP = manager.enqueueInference('tab-stay', 'req-active', async () => {
        await block;
        return 'active-done';
      });

      const queuedTabA = manager.enqueueInference('tab-close-me', 'req-dead-1', async () => 'dead-1');
      const queuedTabA2 = manager.enqueueInference('tab-close-me', 'req-dead-2', async () => 'dead-2');
      const queuedTabB = manager.enqueueInference('tab-stay', 'req-stay-2', async () => 'stay-2');

      // Cancel tab-close-me
      const cancelledCount = manager.cancelSessionRequests('tab-close-me');
      expect(cancelledCount).toBe(2);

      // Cancelled promises should reject
      await expect(queuedTabA).rejects.toThrow(/cancelled.*tab-close-me/i);
      await expect(queuedTabA2).rejects.toThrow(/cancelled.*tab-close-me/i);

      // Remaining tasks should finish normally
      releaseActive();
      expect(await activeP).toBe('active-done');
      expect(await queuedTabB).toBe('stay-2');
    });
  });

  // =========================================================================
  // Phase 0.5 Item 16: SHA-256 Checksum Verification
  // =========================================================================
  describe('SHA-256 Checksum Verification (Item 0.5.16)', () => {
    it('verifies valid file checksum correctly', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-test-'));
      const testFile = path.join(tempDir, 'sample.bin');
      const content = Buffer.from('Sentinel AI test payload for integrity verification');
      fs.writeFileSync(testFile, content);

      const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

      const result = await manager.verifyChecksum(testFile, expectedHash);
      expect(result.valid).toBe(true);
      expect(result.actualSha256).toBe(expectedHash);

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('detects and rejects checksum mismatch on corrupted file', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-test-'));
      const testFile = path.join(tempDir, 'corrupt.bin');
      fs.writeFileSync(testFile, Buffer.from('Corrupted payload data'));

      const wrongHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const result = await manager.verifyChecksum(testFile, wrongHash);
      expect(result.valid).toBe(false);

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('contains pinned manifest entries for recommended model and server binaries', () => {
      expect(PINNED_MANIFEST['qwen2.5-coder-3b-instruct-q4_k_m.gguf']).toBeDefined();
      expect(PINNED_MANIFEST['llama-b11227-bin-ubuntu-x64.tar.gz']).toBeDefined();
      expect(PINNED_MANIFEST['llama-b11227-bin-macos-arm64.tar.gz']).toBeDefined();

      // Every pin must be a real SHA-256 (the old Linux pin was the hash of an empty file)
      for (const entry of Object.values(PINNED_MANIFEST)) {
        expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(entry.sha256).not.toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      }

      const modelEntry = PINNED_MANIFEST['qwen2.5-coder-3b-instruct-q4_k_m.gguf'];
      expect(modelEntry.sha256).toHaveLength(64);
      expect(modelEntry.sizeBytes).toBeGreaterThan(1000000000);
    });
  });

  // =========================================================================
  // Phase 0.5 Item 17: Graceful GPU VRAM Exhaustion Fallback
  // =========================================================================
  describe('Graceful GPU VRAM Fallback (Item 0.5.17)', () => {
    it('detects VRAM exhaustion and CUDA/Metal OOM error patterns', () => {
      expect(manager.isVramExhaustionError('CUDA out of memory: tried to allocate 2.00 GiB')).toBe(true);
      expect(manager.isVramExhaustionError('failed to allocate Metal buffer of size 2048 MB')).toBe(true);
      expect(manager.isVramExhaustionError('ggml_metal_init: error allocating memory')).toBe(true);
      expect(manager.isVramExhaustionError('Process terminated with signal: 9 (SIGKILL) exit code 137')).toBe(true);
      expect(manager.isVramExhaustionError('VK_ERROR_OUT_OF_DEVICE_MEMORY')).toBe(true);

      // Non-OOM errors
      expect(manager.isVramExhaustionError('Connection refused: port 8847')).toBe(false);
      expect(manager.isVramExhaustionError('Model file not found')).toBe(false);
      expect(manager.isVramExhaustionError(null)).toBe(false);
    });

    it('handles OOM crash by switching to CPU fallback and providing notification', async () => {
      expect(manager.isCpuFallback()).toBe(false);
      expect(manager.getCpuFallbackNotice()).toBeNull();

      const handled = await manager.handleOomCrash('CUDA out of memory: VRAM exhausted');
      expect(handled).toBe(true);
      expect(manager.isCpuFallback()).toBe(true);
      expect(manager.getCpuFallbackNotice()).toContain('CPU fallback mode');

      const status = await manager.getStatus();
      expect(status.isCpuFallback).toBe(true);
      expect(status.cpuFallbackNotice).toContain('CPU fallback mode');

      // Subsequent OOM while already in CPU mode cannot degrade further
      const secondAttempt = await manager.handleOomCrash('Process killed');
      expect(secondAttempt).toBe(false);

      // Reset allows returning to GPU attempts
      manager.resetCpuFallback();
      expect(manager.isCpuFallback()).toBe(false);
      expect(manager.getCpuFallbackNotice()).toBeNull();
    });

    it('passes forceCpu option to startEngine when CPU fallback is active', async () => {
      const started = await manager.startEngine(undefined, undefined, { forceCpu: true });
      expect(started).toBe(true);
      expect(manager.isCpuFallback()).toBe(true);
    });
  });

  // =========================================================================
  // Download Management & UI Controls (Progress, Cancel, Delete)
  // =========================================================================
  describe('Download Management & UI Controls', () => {
    it('reports download progress structure correctly', async () => {
      const progress = await manager.getDownloadProgress();
      expect(progress).toHaveProperty('isDownloading');
      expect(progress).toHaveProperty('downloadedBytes');
      expect(progress).toHaveProperty('totalBytes');
      expect(progress).toHaveProperty('percent');
      expect(progress.totalBytes).toBe(EmbeddedEngineManager.RECOMMENDED_MODEL.sizeBytes);
    });

    it('handles cancelDownload safely with or without discarding partial file', async () => {
      const cancelResume = await manager.cancelDownload(false);
      expect(cancelResume).toBe(true);

      const cancelDiscard = await manager.cancelDownload(true);
      expect(cancelDiscard).toBe(true);
    });

    it('handles deleteModel by stopping engine and removing model file', async () => {
      const deleted = await manager.deleteModel();
      expect(deleted).toBe(true);
    });
  });

  describe('Proactive Engine Warmup (Task 0.75.7)', () => {
    it('supports proactive engine warmup and exposes isWarming state', async () => {
      expect(manager.isEngineWarming()).toBe(false);
      const warmed = await manager.proactiveWarmup();
      expect(typeof warmed).toBe('boolean');
      expect(manager.isEngineWarming()).toBe(false);

      const status = await manager.getStatus();
      expect(status).toHaveProperty('isWarming');
      expect(status.isWarming).toBe(false);
    });
  });
});

describe('Engine asset selection and model tiers', () => {
  it('selects the pinned build for each platform', () => {
    expect(selectEngineAsset('Linux', 'x86_64', false)?.key).toBe('linux-x64-cpu');
    expect(selectEngineAsset('Linux', 'x86_64', true)?.key).toBe('linux-x64-vulkan');
    expect(selectEngineAsset('Linux', 'aarch64', false)?.key).toBe('linux-arm64-cpu');
    expect(selectEngineAsset('Darwin', 'arm64', false)?.key).toBe('macos-arm64');
    expect(selectEngineAsset('Linux', 'riscv64', false)).toBeNull();
    expect(selectEngineAsset('Linux', 'x86_64', false)?.url)
      .toBe('https://github.com/ggml-org/llama.cpp/releases/download/b11227/llama-b11227-bin-ubuntu-x64.tar.gz');
  });

  it('follows the selected tier and recommends one from RAM', () => {
    expect(EmbeddedEngineManager.recommendTier(4)).toBe('lite');
    expect(EmbeddedEngineManager.recommendTier(8)).toBe('balanced');
    expect(EmbeddedEngineManager.recommendTier(32)).toBe('accuracy');
    expect(EmbeddedEngineManager.RECOMMENDED_MODEL.fileName).toBe(EMBEDDED_MODEL_TIERS.balanced.fileName);
    for (const tier of Object.values(EMBEDDED_MODEL_TIERS)) {
      expect(PINNED_MANIFEST[tier.fileName].sha256).toBe(tier.sha256);
    }
  });
});

describe('selectEngineAsset on Windows', () => {
  it('picks the Vulkan zip when vulkan-1.dll exists, else the CPU build', async () => {
    const { selectEngineAsset } = await import('./EmbeddedEngineManager');
    expect(selectEngineAsset('windows', 'x86_64', true)?.fileName).toBe('llama-b11227-bin-win-vulkan-x64.zip');
    expect(selectEngineAsset('windows', 'x86_64', false)?.fileName).toBe('llama-b11227-bin-win-cpu-x64.zip');
    expect(selectEngineAsset('windows', 'aarch64', true)?.fileName).toBe('llama-b11227-bin-win-cpu-arm64.zip');
    expect(selectEngineAsset('Darwin', 'arm64', false)?.fileName).toBe('llama-b11227-bin-macos-arm64.tar.gz');
  });
});
