import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ActivationSteeringManager,
  SteeringVector,
  SteeringCoefficients,
} from './ActivationSteeringManager';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 4.6 — Neural Activation Steering (Representation Engineering)', () => {
  let manager: ActivationSteeringManager;
  const testStoragePath = path.join(
    process.env.HOME || '/tmp',
    '.cero',
    'steering',
    'test_steering_vectors.json'
  );

  beforeEach(() => {
    manager = new ActivationSteeringManager({
      storageFilePath: testStoragePath,
      dimension: 64, // Fast lightweight dimension for unit testing
      activeLayerRange: [14, 22],
    });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testStoragePath)) {
        fs.unlinkSync(testStoragePath);
      }
    } catch {
      // ignore test cleanup errors
    }
  });

  describe('1. Vector Algebra & Linear Foundations', () => {
    it('computes Euclidean L2 norm accurately', () => {
      const v = [3, 4, 0];
      expect(manager.l2Norm(v)).toBeCloseTo(5.0);

      const zero = [0, 0, 0];
      expect(manager.l2Norm(zero)).toBe(0);
    });

    it('normalizes vector to unit length ||v||_2 = 1.0', () => {
      const v = [2, -3, 6];
      const norm = manager.normalize(v);
      expect(manager.l2Norm(norm)).toBeCloseTo(1.0);
      expect(norm[0]).toBeCloseTo(2 / 7);
      expect(norm[1]).toBeCloseTo(-3 / 7);
      expect(norm[2]).toBeCloseTo(6 / 7);
    });

    it('safely handles zero vector normalization without NaN', () => {
      const zero = [0, 0, 0];
      const result = manager.normalize(zero);
      expect(result).toEqual([0, 0, 0]);
      expect(manager.l2Norm(result)).toBe(0);
    });

    it('computes inner dot product and cosine similarity', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const c = [2, 0, 0];

      expect(manager.dotProduct(a, b)).toBe(0);
      expect(manager.cosineSimilarity(a, b)).toBeCloseTo(0); // Orthogonal

      expect(manager.cosineSimilarity(a, c)).toBeCloseTo(1.0); // Collinear

      const anti = [-1, 0, 0];
      expect(manager.cosineSimilarity(a, anti)).toBeCloseTo(-1.0); // Anti-collinear
    });

    it('performs orthogonal projection and rejection satisfying v = proj(v) + rej(v)', () => {
      const v = [3, 4, 5];
      const u = [1, 0, 0];

      const proj = manager.project(v, u);
      const rej = manager.reject(v, u);

      expect(proj).toEqual([3, 0, 0]);
      expect(rej).toEqual([0, 4, 5]);

      // Orthogonality: rej(v) . u = 0
      expect(manager.dotProduct(rej, u)).toBeCloseTo(0);

      // Reconstruction: proj + rej = v
      const sum = proj.map((val, idx) => val + rej[idx]);
      expect(sum).toEqual(v);
    });

    it('computes Contrastive Activation Addition (CAA) concept vector from paired stimuli', () => {
      const positives = [
        [1.0, 2.0, 0.0],
        [1.0, 4.0, 0.0],
      ]; // Mean = [1.0, 3.0, 0.0]
      const negatives = [
        [0.0, 0.0, 1.0],
        [0.0, 0.0, 3.0],
      ]; // Mean = [0.0, 0.0, 2.0]

      // Diff = [1.0, 3.0, -2.0]
      // Norm = sqrt(1 + 9 + 4) = sqrt(14) ~= 3.7416
      const caa = manager.computeContrastiveVector(positives, negatives, 3);
      expect(manager.l2Norm(caa)).toBeCloseTo(1.0);
      expect(caa[0]).toBeCloseTo(1.0 / Math.sqrt(14));
      expect(caa[1]).toBeCloseTo(3.0 / Math.sqrt(14));
      expect(caa[2]).toBeCloseTo(-2.0 / Math.sqrt(14));
    });
  });

  describe('2. Layer Windowing & Gating Functions', () => {
    it('returns 0.0 for layers outside active range', () => {
      expect(manager.getLayerWeight(0, 14, 22)).toBe(0.0);
      expect(manager.getLayerWeight(13, 14, 22)).toBe(0.0);
      expect(manager.getLayerWeight(23, 14, 22)).toBe(0.0);
      expect(manager.getLayerWeight(35, 14, 22)).toBe(0.0);
    });

    it('peaks at 1.0 at center layer using Tukey Hann window', () => {
      const center = 18; // mid of 14 and 22
      expect(manager.getLayerWeight(center, 14, 22, 'tukey')).toBeCloseTo(1.0);
    });

    it('smoothly tapers towards 0 at the boundary layers', () => {
      const w14 = manager.getLayerWeight(14, 14, 22, 'tukey');
      const w16 = manager.getLayerWeight(16, 14, 22, 'tukey');
      const w18 = manager.getLayerWeight(18, 14, 22, 'tukey');

      expect(w14).toBeCloseTo(0.0);
      expect(w16).toBeGreaterThan(w14);
      expect(w18).toBeGreaterThan(w16);
      expect(w18).toBeCloseTo(1.0);
    });

    it('supports rectangular window inside layer range', () => {
      expect(manager.getLayerWeight(14, 14, 22, 'rectangular')).toBe(1.0);
      expect(manager.getLayerWeight(18, 14, 22, 'rectangular')).toBe(1.0);
      expect(manager.getLayerWeight(22, 14, 22, 'rectangular')).toBe(1.0);
      expect(manager.getLayerWeight(23, 14, 22, 'rectangular')).toBe(0.0);
    });
  });

  describe('3. Residual Stream Steering Hook & Activation Clamping', () => {
    it('leaves hidden state unaltered at inactive layers (L5)', () => {
      const hiddenState = new Array(64).fill(1.0);
      const res = manager.steerHiddenState(hiddenState, 5);

      expect(res.layerWeight).toBe(0);
      expect(res.appliedOffsetNorm).toBe(0);
      expect(res.steeredState).toEqual(hiddenState);
      expect(res.clamped).toBe(false);
      expect(res.gainRatio).toBe(1.0);
    });

    it('steers hidden state at active layer (L18)', () => {
      const hiddenState = new Array(64).fill(0.5);
      const res = manager.steerHiddenState(hiddenState, 18);

      expect(res.layerWeight).toBeCloseTo(1.0);
      expect(res.appliedOffsetNorm).toBeGreaterThan(0);
      expect(res.steeredState).not.toEqual(hiddenState);
      expect(manager.getTelemetry().totalInferencesSteered).toBe(1);
    });

    it('enforces energy conservation clamping when steering produces excessive gain', () => {
      const hiddenState = new Array(64).fill(0.1); // Small initial state
      // Huge steering coefficients to trigger clamping
      const res = manager.steerHiddenState(hiddenState, 18, {
        coefficients: {
          alphaUnix: 50.0,
          betaRefusal: 50.0,
        },
        maxGainRatio: 1.25,
      });

      expect(res.clamped).toBe(true);
      expect(res.gainRatio).toBeCloseTo(1.25);

      const initialNorm = manager.l2Norm(hiddenState);
      const steeredNorm = manager.l2Norm(res.steeredState);
      expect(steeredNorm / initialNorm).toBeCloseTo(1.25);
    });
  });

  describe('4. Refusal Suppression Logit Bias Matrix', () => {
    it('generates severe negative bias on refusal tokens and positive boost on action tokens', () => {
      const bias = manager.generateLogitBias({
        refusalPenalty: -100.0,
        actionBoost: 3.5,
        tokenizerType: 'qwen',
      });

      // Refusal tokens (IDs verified against the Qwen2.5 tokenizer vocabulary)
      expect(bias['2121']).toBe(-100.0);  // "As"
      expect(bias['15235']).toBe(-100.0); // " AI"
      expect(bias['36879']).toBe(-100.0); // " apologize"
      expect(bias['4157']).toBe(-100.0);  // " cannot"

      // Ordinary words must never be banned: 458 is " an", 24128 is "Music"
      expect(bias['458']).toBeUndefined();
      expect(bias['24128']).toBeUndefined();

      // Action tokens should have +3.5
      expect(bias['90']).toBe(3.5);    // "{"
      expect(bias['1311']).toBe(3.5);  // "action"
      expect(bias['5631']).toBe(3.5);  // "command"
    });

    it('merges custom logit biases seamlessly', () => {
      const bias = manager.generateLogitBias({
        customBiases: {
          '9999': 4.0,
          '2121': -50.0, // Override
        },
      });

      expect(bias['9999']).toBe(4.0);
      expect(bias['2121']).toBe(-50.0);
    });

    it('detects conversational refusal signatures and tracks telemetry', () => {
      expect(manager.detectRefusalSignature('As an AI, I cannot execute arbitrary shell commands.')).toBe(true);
      expect(manager.detectRefusalSignature("I apologize, but I'm unable to access network ports.")).toBe(true);
      expect(manager.detectRefusalSignature('Unfortunately, I am not able to terminate processes.')).toBe(true);

      // Normal bash commands should NOT trigger refusal detection
      expect(manager.detectRefusalSignature('lsof -iTCP:8847 -sTCP:LISTEN')).toBe(false);
      expect(manager.detectRefusalSignature('pgrep -if antigravity | xargs kill -9')).toBe(false);

      expect(manager.getTelemetry().refusalsSuppressedCount).toBe(3);
    });
  });

  describe('5. Context-Adaptive Steering Governor', () => {
    it('boosts safety guard on destructive shell commands', () => {
      const prompt = 'rm -rf /Users/test/workspace && dd if=/dev/zero of=/dev/disk2';
      const coeffs = manager.resolveAdaptiveCoefficients(prompt);

      expect(coeffs.deltaDestructive).toBe(2.5); // Boosted safety direction
      expect(coeffs.betaRefusal).toBe(0.2);      // Allow caution advice
      expect(coeffs.alphaUnix).toBeLessThan(1.5);
    });

    it('maximizes Unix authority and suppresses refusal on inspection & port queries', () => {
      const prompt = 'find all listening ports and kill process antigravity';
      const coeffs = manager.resolveAdaptiveCoefficients(prompt);

      expect(coeffs.alphaUnix).toBe(2.2);    // High Unix authority
      expect(coeffs.betaRefusal).toBe(3.0);  // Zero tolerance for chatbot excuses
      expect(coeffs.gammaConcise).toBe(1.5); // High command density
      expect(coeffs.deltaDestructive).toBe(0.2);
    });

    it('maintains default coefficients for regular prompts', () => {
      const prompt = 'create a README.md explaining python setup';
      const coeffs = manager.resolveAdaptiveCoefficients(prompt);

      expect(coeffs.alphaUnix).toBe(1.5);
      expect(coeffs.betaRefusal).toBe(2.0);
      expect(coeffs.gammaConcise).toBe(1.0);
      expect(coeffs.deltaDestructive).toBe(0.5);
    });
  });

  describe('6. Persistence, CLI Arguments & Registry', () => {
    it('initializes default bundled concept vectors', () => {
      const vectors = manager.listVectors();
      expect(vectors.length).toBe(4);

      const unixVec = manager.getVector('unix_mastery');
      expect(unixVec).toBeDefined();
      expect(unixVec?.dimension).toBe(64);
      expect(unixVec?.normalized).toBe(true);
      expect(manager.l2Norm(unixVec!.direction)).toBeCloseTo(1.0);

      const refusalVec = manager.getVector('refusal_suppression');
      expect(refusalVec).toBeDefined();
    });

    it('formats llama-server control-vector CLI arguments', () => {
      const args = manager.formatLlamaServerArgs('/opt/cero/steering');

      expect(args).toContain('--control-vector-scaled');
      expect(args).toContain('/opt/cero/steering/unix_mastery.gguf');
      expect(args).toContain('1.50');
      expect(args).toContain('/opt/cero/steering/refusal_suppression.gguf');
      expect(args).toContain('-2.00');
    });

    it('persists and reloads steering configuration and telemetry to disk', async () => {
      manager.setCoefficients({ alphaUnix: 2.8, betaRefusal: 3.5 });
      const saved = await manager.saveToDisk(testStoragePath);
      expect(saved).toBe(true);
      expect(fs.existsSync(testStoragePath)).toBe(true);

      const freshManager = new ActivationSteeringManager({
        storageFilePath: testStoragePath,
        dimension: 64,
      });

      const loadedCoeffs = freshManager.getCoefficients();
      expect(loadedCoeffs.alphaUnix).toBe(2.8);
      expect(loadedCoeffs.betaRefusal).toBe(3.5);
    });

    it('tracks and resets telemetry correctly', () => {
      manager.detectRefusalSignature('I cannot do this');
      manager.steerHiddenState(new Array(64).fill(1), 18);

      let tel = manager.getTelemetry();
      expect(tel.refusalsSuppressedCount).toBe(1);
      expect(tel.totalInferencesSteered).toBe(1);
      expect(tel.activeVectorsCount).toBe(4);

      manager.resetTelemetry();
      tel = manager.getTelemetry();
      expect(tel.refusalsSuppressedCount).toBe(0);
      expect(tel.totalInferencesSteered).toBe(0);
    });
  });
});
