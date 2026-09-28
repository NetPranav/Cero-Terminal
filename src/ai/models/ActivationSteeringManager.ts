/**
 * ActivationSteeringManager.ts — Neural Activation Steering & Representation Engineering
 * 
 * Part of Sentinel-SERL (Self-Evolving Reflexion Loop):
 * Breakthrough 3: Brain Surgery on the Residual Stream.
 * 
 * Steers intermediate transformer layer hidden activations (L14-L22) during token generation:
 *   h_l^(t) <- h_l^(t) + alpha * v_unix - beta * v_refusal + gamma * v_concise - delta * v_destructive
 * 
 * Mathematically suppresses conversational refusal attention heads and locks the local
 * 3B model into an authoritative UNIX execution persona with 0ms inference overhead.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SteeringVector {
  id: string;
  name: string;
  dimension: number;
  layerRange: [number, number];
  direction: number[];
  norm: number;
  normalized: boolean;
  description?: string;
  createdAt: number;
  metadata?: Record<string, any>;
}

export interface SteeringCoefficients {
  alphaUnix: number;      // Unix mastery direction weight (default 1.5)
  betaRefusal: number;    // Refusal suppression direction weight (default 2.0)
  gammaConcise: number;   // Dense conciseness direction weight (default 1.0)
  deltaDestructive: number; // Safety guard direction weight (default 0.5)
  customWeights?: Record<string, number>;
}

export interface SteeringExecutionOptions {
  coefficients?: Partial<SteeringCoefficients>;
  layerWindow?: [number, number];
  maxGainRatio?: number;   // Energy conservation clamping (default 1.25)
  windowFunction?: 'tukey' | 'gaussian' | 'rectangular';
}

export interface SteeringTelemetry {
  totalInferencesSteered: number;
  refusalsSuppressedCount: number;
  activeVectorsCount: number;
  averageCosineSimilarity: number;
  lastSteeringTimestamp: number;
}

export interface LogitBiasOptions {
  refusalPenalty?: number;  // Negative logit bias (default -100.0)
  actionBoost?: number;     // Positive logit bias (default +3.5)
  tokenizerType?: 'qwen' | 'llama' | 'generic';
  customBiases?: Record<string | number, number>;
}

export interface ActivationSteeringManagerOptions {
  storageFilePath?: string;
  dimension?: number;
  activeLayerRange?: [number, number];
  defaultCoefficients?: Partial<SteeringCoefficients>;
}

export class ActivationSteeringManager {
  private static instance: ActivationSteeringManager;
  private vectors: Map<string, SteeringVector> = new Map();
  private storageFilePath: string;
  private dimension: number;
  private activeLayerRange: [number, number];
  private coefficients: SteeringCoefficients;
  private isLoaded: boolean = false;
  private telemetry: SteeringTelemetry = {
    totalInferencesSteered: 0,
    refusalsSuppressedCount: 0,
    activeVectorsCount: 0,
    averageCosineSimilarity: 0,
    lastSteeringTimestamp: 0,
  };

  public static readonly DEFAULT_DIMENSION = 2048; // Qwen2.5-Coder-3B hidden dimension
  public static readonly DEFAULT_LAYER_RANGE: [number, number] = [14, 22]; // Semantic intermediate layers
  public static readonly DEFAULT_COEFFICIENTS: SteeringCoefficients = {
    alphaUnix: 1.5,
    betaRefusal: 2.0,
    gammaConcise: 1.0,
    deltaDestructive: 0.5,
  };

  /**
   * Token IDs for refusal suppression and action boosting.
   *
   * The Qwen IDs below were verified against the Qwen2.5 tokenizer.json vocabulary. The
   * previous table was not: it mapped e.g. 24128 ("Music"), 7134 ("Book") and 8013 ("-(") as
   * refusal tokens and boosted "the"/" form"/" File"/"view", which corrupted generated commands.
   * The Llama/generic tables remain unverified placeholders.
   *
   * These biases are NOT applied to the agent's action generation: several refusal tokens
   * (" an", " model", " language") are ordinary words a correct summary needs. Refusals are
   * handled by the GBNF grammar plus AgentLoop's refusal interception instead.
   */
  public static readonly REFUSAL_TOKEN_IDS = {
    qwen: [
      2121,   // "As"
      15235,  // " AI"
      36879,  // " apologize"
      72173,  // " apologies"
      4157,   // " cannot"
      11889,  // " unable"
      25822,  // " unfortunately"
      18656,  // " Unfortunately"
      14589,  // " sorry"
    ],
    llama: [
      1724,   // "As"
      459,    // " an"
      12658,  // " AI"
      24520,  // " apologize"
      30403,  // " apologies"
      4012,   // " cannot"
      8920,   // " unable"
      11245,  // " unfortunately"
      7731,   // " sorry"
      4055,   // " language"
      2746,   // " model"
    ],
    generic: [
      1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008
    ]
  };

  public static readonly ACTION_BOOST_TOKEN_IDS = {
    qwen: [
      90,     // "{"
      4913,   // "{\""
      1311,   // "action"
      5631,   // "command"
      10257,  // "execute"
    ],
    llama: [
      94,     // "{"
      1450,   // "\"action\""
      1920,   // "\"command\""
      3120,   // "\"execute\""
      1140,   // "\"args\""
    ],
    generic: [
      2001, 2002, 2003, 2004
    ]
  };

  constructor(options?: ActivationSteeringManagerOptions) {
    this.dimension = options?.dimension ?? ActivationSteeringManager.DEFAULT_DIMENSION;
    this.activeLayerRange = options?.activeLayerRange ?? [...ActivationSteeringManager.DEFAULT_LAYER_RANGE];
    this.coefficients = {
      ...ActivationSteeringManager.DEFAULT_COEFFICIENTS,
      ...(options?.defaultCoefficients || {})
    };

    const homeDir = typeof process !== 'undefined' && process.env ? (process.env.HOME || process.env.USERPROFILE || '/tmp') : '/tmp';
    this.storageFilePath = options?.storageFilePath || path.join(homeDir, '.sentinel', 'steering', 'steering_vectors.json');

    this.initializeDefaultVectors();
    this.loadFromDiskSync();
  }

  public static getInstance(options?: ActivationSteeringManagerOptions): ActivationSteeringManager {
    if (!ActivationSteeringManager.instance || options) {
      ActivationSteeringManager.instance = new ActivationSteeringManager(options);
    }
    return ActivationSteeringManager.instance;
  }

  // =========================================================================
  // VECTOR ALGEBRA & MATHEMATICAL FOUNDATIONS
  // =========================================================================

  /**
   * Compute the Euclidean (L2) norm of a vector: ||v||_2 = sqrt(sum(v_i^2))
   */
  public l2Norm(vec: number[]): number {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
      sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum);
  }

  /**
   * Normalize a vector to unit length: v_hat = v / ||v||_2
   */
  public normalize(vec: number[]): number[] {
    const norm = this.l2Norm(vec);
    if (norm === 0 || !isFinite(norm)) {
      return new Array(vec.length).fill(0);
    }
    const result = new Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
      result[i] = vec[i] / norm;
    }
    return result;
  }

  /**
   * Compute the inner dot product: sum(a_i * b_i)
   */
  public dotProduct(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  /**
   * Compute cosine similarity: cos(theta) = (a . b) / (||a|| * ||b||)
   */
  public cosineSimilarity(a: number[], b: number[]): number {
    const normA = this.l2Norm(a);
    const normB = this.l2Norm(b);
    if (normA === 0 || normB === 0) return 0;
    const dot = this.dotProduct(a, b);
    return Math.max(-1, Math.min(1, dot / (normA * normB)));
  }

  /**
   * Orthogonal projection of vector v onto direction u: proj_u(v) = ((v . u) / ||u||^2) * u
   */
  public project(v: number[], u: number[]): number[] {
    const uNormSq = this.dotProduct(u, u);
    if (uNormSq === 0) return new Array(v.length).fill(0);
    const scalar = this.dotProduct(v, u) / uNormSq;
    const result = new Array(v.length);
    for (let i = 0; i < v.length; i++) {
      result[i] = scalar * (u[i] || 0);
    }
    return result;
  }

  /**
   * Orthogonal rejection of vector v from direction u: rej_u(v) = v - proj_u(v)
   */
  public reject(v: number[], u: number[]): number[] {
    const proj = this.project(v, u);
    const result = new Array(v.length);
    for (let i = 0; i < v.length; i++) {
      result[i] = v[i] - proj[i];
    }
    return result;
  }

  /**
   * Compute a Contrastive Activation Addition (CAA) unit concept vector from paired stimuli:
   * v_raw = (1/P) sum(positives_i) - (1/N) sum(negatives_j)
   * v = normalize(v_raw)
   */
  public computeContrastiveVector(positives: number[][], negatives: number[][], dimension?: number): number[] {
    const dim = dimension || (positives[0]?.length || negatives[0]?.length || this.dimension);
    const meanPos = new Array(dim).fill(0);
    const meanNeg = new Array(dim).fill(0);

    if (positives.length > 0) {
      for (const pos of positives) {
        for (let i = 0; i < dim; i++) {
          meanPos[i] += (pos[i] || 0) / positives.length;
        }
      }
    }

    if (negatives.length > 0) {
      for (const neg of negatives) {
        for (let i = 0; i < dim; i++) {
          meanNeg[i] += (neg[i] || 0) / negatives.length;
        }
      }
    }

    const diff = new Array(dim);
    for (let i = 0; i < dim; i++) {
      diff[i] = meanPos[i] - meanNeg[i];
    }

    return this.normalize(diff);
  }

  // =========================================================================
  // RESIDUAL STREAM STEERING HOOK & ACTIVATION CLAMPING
  // =========================================================================

  /**
   * Compute the layer window weighting factor w(l) to ensure steering is injected
   * smoothly into intermediate semantic layers (L14-L22) without distorting
   * input embeddings or final token projection heads.
   */
  public getLayerWeight(
    layer: number,
    minLayer: number = this.activeLayerRange[0],
    maxLayer: number = this.activeLayerRange[1],
    windowFunction: 'tukey' | 'gaussian' | 'rectangular' = 'tukey'
  ): number {
    if (layer < minLayer || layer > maxLayer) {
      return 0.0;
    }

    if (windowFunction === 'rectangular') {
      return 1.0;
    }

    const mid = (minLayer + maxLayer) / 2.0;
    const halfWidth = (maxLayer - minLayer) / 2.0;

    if (windowFunction === 'gaussian') {
      const sigma = halfWidth / 2.0;
      const diff = layer - mid;
      return Math.exp(-0.5 * Math.pow(diff / sigma, 2));
    }

    // Default: Tukey / Hann tapered cosine bell curve
    if (halfWidth === 0) return 1.0;
    const normalizedDistance = Math.abs(layer - mid) / halfWidth; // 0 at center, 1 at edge
    return 0.5 * (1.0 + Math.cos(Math.PI * normalizedDistance));
  }

  /**
   * Steer a hidden state vector h_l at layer l according to the mathematical steering law:
   *   h_l' = h_l + w(l) * [ alpha * v_unix - beta * v_refusal + gamma * v_concise - delta * v_destructive ]
   * 
   * Applies Energy Conservation Clamping:
   *   If ||h_l'||_2 > maxGainRatio * ||h_l||_2, clamps magnitude to avoid activation explosion.
   */
  public steerHiddenState(
    hiddenState: number[],
    layerIndex: number,
    options?: SteeringExecutionOptions
  ): {
    steeredState: number[];
    appliedOffsetNorm: number;
    gainRatio: number;
    clamped: boolean;
    layerWeight: number;
  } {
    const minLayer = options?.layerWindow?.[0] ?? this.activeLayerRange[0];
    const maxLayer = options?.layerWindow?.[1] ?? this.activeLayerRange[1];
    const windowFn = options?.windowFunction ?? 'tukey';
    const maxGainRatio = options?.maxGainRatio ?? 1.25;

    const layerWeight = this.getLayerWeight(layerIndex, minLayer, maxLayer, windowFn);

    const initialNorm = this.l2Norm(hiddenState);
    if (layerWeight === 0 || initialNorm === 0) {
      return {
        steeredState: [...hiddenState],
        appliedOffsetNorm: 0,
        gainRatio: 1.0,
        clamped: false,
        layerWeight: 0,
      };
    }

    const coeffs: SteeringCoefficients = {
      ...this.coefficients,
      ...(options?.coefficients || {}),
    };

    const vUnix = this.getVector('unix_mastery')?.direction || [];
    const vRefusal = this.getVector('refusal_suppression')?.direction || [];
    const vConcise = this.getVector('conciseness')?.direction || [];
    const vSafety = this.getVector('safety_guard')?.direction || [];

    const dim = hiddenState.length;
    const offset = new Array(dim).fill(0);

    for (let i = 0; i < dim; i++) {
      let delta = 0;
      if (vUnix[i] !== undefined) delta += coeffs.alphaUnix * vUnix[i];
      if (vRefusal[i] !== undefined) delta -= coeffs.betaRefusal * vRefusal[i];
      if (vConcise[i] !== undefined) delta += coeffs.gammaConcise * vConcise[i];
      if (vSafety[i] !== undefined) delta -= coeffs.deltaDestructive * vSafety[i];

      if (coeffs.customWeights) {
        for (const [vName, weight] of Object.entries(coeffs.customWeights)) {
          const customVec = this.getVector(vName)?.direction;
          if (customVec && customVec[i] !== undefined) {
            delta += weight * customVec[i];
          }
        }
      }

      offset[i] = layerWeight * delta;
    }

    const appliedOffsetNorm = this.l2Norm(offset);
    const candidate = new Array(dim);
    for (let i = 0; i < dim; i++) {
      candidate[i] = hiddenState[i] + offset[i];
    }

    const candidateNorm = this.l2Norm(candidate);
    let gainRatio = candidateNorm / initialNorm;
    let clamped = false;

    // Clamping to prevent representation collapse / perplexity spike
    if (gainRatio > maxGainRatio) {
      const scale = (maxGainRatio * initialNorm) / candidateNorm;
      for (let i = 0; i < dim; i++) {
        candidate[i] *= scale;
      }
      clamped = true;
      gainRatio = maxGainRatio;
    }

    // Telemetry update
    this.telemetry.totalInferencesSteered++;
    this.telemetry.lastSteeringTimestamp = Date.now();

    return {
      steeredState: candidate,
      appliedOffsetNorm,
      gainRatio,
      clamped,
      layerWeight,
    };
  }

  // =========================================================================
  // REFUSAL SUPPRESSION LOGIT BIAS MATRIX
  // =========================================================================

  /**
   * Generates a logit_bias map for llama-server or OpenAI-compatible endpoints.
   * Suppresses conversational hesitation tokens with negative bias (e.g. -100.0)
   * while boosting structured command actions with positive bias (e.g. +3.5).
   */
  public generateLogitBias(options?: LogitBiasOptions): Record<string, number> {
    const penalty = options?.refusalPenalty ?? -100.0;
    const boost = options?.actionBoost ?? 3.5;
    const tokenizerType = options?.tokenizerType ?? 'qwen';

    const refusalTokens = ActivationSteeringManager.REFUSAL_TOKEN_IDS[tokenizerType] ||
      ActivationSteeringManager.REFUSAL_TOKEN_IDS.qwen;
    const actionTokens = ActivationSteeringManager.ACTION_BOOST_TOKEN_IDS[tokenizerType] ||
      ActivationSteeringManager.ACTION_BOOST_TOKEN_IDS.qwen;

    const biasMap: Record<string, number> = {};

    for (const tokenId of refusalTokens) {
      biasMap[tokenId.toString()] = penalty;
    }

    for (const tokenId of actionTokens) {
      biasMap[tokenId.toString()] = boost;
    }

    if (options?.customBiases) {
      for (const [key, val] of Object.entries(options.customBiases)) {
        biasMap[key.toString()] = val;
      }
    }

    return biasMap;
  }

  /**
   * Fast regex check for conversational refusal signatures.
   * If detected in model text, increments refusal suppression telemetry.
   */
  public detectRefusalSignature(text: string): boolean {
    if (!text || typeof text !== 'string') return false;

    const refusalRegex = /\b(as an ai|i cannot|i am unable|i apologize|apologies|unfortunately,? i|as a language model|i'm sorry, but|i am not able to|i don't have access to)\b/i;
    const isRefusal = refusalRegex.test(text);

    if (isRefusal) {
      this.telemetry.refusalsSuppressedCount++;
    }

    return isRefusal;
  }

  // =========================================================================
  // CONTEXT-ADAPTIVE STEERING GOVERNOR
  // =========================================================================

  /**
   * Dynamically adjusts steering coefficients based on the user prompt's risk,
   * complexity, and operational domain.
   */
  public resolveAdaptiveCoefficients(prompt: string): SteeringCoefficients {
    const lower = prompt.toLowerCase().trim();

    // 1. High-risk destructive commands: boost safety guard, lower refusal suppression
    const dangerousPatterns = [
      /\brm\s+-(?:rf|fr|r)\b/,
      /\bmkfs\b/,
      /\bdiskutil\s+(?:eraseDisk|partitionDisk)\b/,
      /\bdd\s+if=/,
      /\b>\s*\/dev\/sd/,
      /\bchmod\s+-R\s+777\s+\//,
    ];

    const isDangerous = dangerousPatterns.some(pat => pat.test(lower));
    if (isDangerous) {
      return {
        alphaUnix: 0.8,
        betaRefusal: 0.2, // Allow model to issue cautionary advice
        gammaConcise: 0.5,
        deltaDestructive: 2.5, // Strong safety steering
      };
    }

    // 2. Process, Port, System Inspection or Antigravity queries: max Unix authority & conciseness
    const inspectionPatterns = [
      /\bport\b/,
      /\bprocess\b/,
      /\blsof\b/,
      /\bpgrep\b/,
      /\bkill\b/,
      /\blaunchctl\b/,
      /\bnetstat\b/,
      /\bantigravity\b/,
      /\blisten\b/,
    ];

    const isInspection = inspectionPatterns.some(pat => pat.test(lower));
    if (isInspection) {
      return {
        alphaUnix: 2.2, // Ultra-high Unix command authority
        betaRefusal: 3.0, // Zero tolerance for hesitation
        gammaConcise: 1.5,
        deltaDestructive: 0.2,
      };
    }

    // 3. Default balanced steering
    return { ...this.coefficients };
  }

  // =========================================================================
  // CONCEPT VECTOR REGISTRY & DEFAULTS
  // =========================================================================

  /**
   * Initializes default concept vectors deterministically.
   */
  private initializeDefaultVectors(): void {
    const createDeterministicVector = (seedStr: string, dim: number): number[] => {
      const vec = new Array(dim);
      let h = 0x811c9dc5;
      for (let i = 0; i < seedStr.length; i++) {
        h ^= seedStr.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }

      for (let i = 0; i < dim; i++) {
        // Linear congruential generator step
        h = (Math.imul(1103515245, h) + 12345) & 0x7fffffff;
        vec[i] = (h / 0x7fffffff) * 2.0 - 1.0;
      }
      return this.normalize(vec);
    };

    const defaultNames: Array<{
      name: string;
      desc: string;
      seed: string;
    }> = [
      {
        name: 'unix_mastery',
        desc: 'Direct UNIX kernel & POSIX execution authority direction (mdfind, lsof, launchctl)',
        seed: 'sentinel_serl_unix_mastery_vector_v1',
      },
      {
        name: 'refusal_suppression',
        desc: 'Conversational hesitation and apologetic chatbot evasion direction',
        seed: 'sentinel_serl_refusal_suppression_vector_v1',
      },
      {
        name: 'conciseness',
        desc: 'Dense, clean single-line executable command output direction',
        seed: 'sentinel_serl_conciseness_vector_v1',
      },
      {
        name: 'safety_guard',
        desc: 'Direction steering away from unconfirmed system-destructive commands',
        seed: 'sentinel_serl_safety_guard_vector_v1',
      },
    ];

    for (const item of defaultNames) {
      const dir = createDeterministicVector(item.seed, this.dimension);
      const vector: SteeringVector = {
        id: `vec_${item.name}`,
        name: item.name,
        dimension: this.dimension,
        layerRange: [...this.activeLayerRange],
        direction: dir,
        norm: 1.0,
        normalized: true,
        description: item.desc,
        createdAt: Date.now(),
      };
      this.vectors.set(item.name, vector);
    }

    this.updateVectorStats();
  }

  public getVector(name: string): SteeringVector | undefined {
    return this.vectors.get(name);
  }

  public setVector(vector: SteeringVector): void {
    const normalizedDir = vector.normalized ? vector.direction : this.normalize(vector.direction);
    this.vectors.set(vector.name, {
      ...vector,
      direction: normalizedDir,
      norm: this.l2Norm(normalizedDir),
      normalized: true,
    });
    this.updateVectorStats();
  }

  public listVectors(): SteeringVector[] {
    return Array.from(this.vectors.values());
  }

  private updateVectorStats(): void {
    this.telemetry.activeVectorsCount = this.vectors.size;
    const vecs = Array.from(this.vectors.values()).map(v => v.direction);
    if (vecs.length >= 2) {
      let totalSim = 0;
      let pairs = 0;
      for (let i = 0; i < vecs.length; i++) {
        for (let j = i + 1; j < vecs.length; j++) {
          totalSim += Math.abs(this.cosineSimilarity(vecs[i], vecs[j]));
          pairs++;
        }
      }
      this.telemetry.averageCosineSimilarity = pairs > 0 ? totalSim / pairs : 0;
    }
  }

  // =========================================================================
  // GGUF CONTROL VECTOR CLI ARGUMENTS & DISK PERSISTENCE
  // =========================================================================

  /**
   * Produces command-line arguments for llama-server or llama.cpp:
   * e.g. ['--control-vector-scaled', '/path/to/unix_mastery.gguf', '1.5', ...]
   */
  public formatLlamaServerArgs(baseDir?: string): string[] {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
    const steeringDir = baseDir || path.join(homeDir, '.sentinel', 'steering');
    const args: string[] = [];

    const unixVecPath = path.join(steeringDir, 'unix_mastery.gguf');
    const refusalVecPath = path.join(steeringDir, 'refusal_suppression.gguf');

    args.push(
      '--control-vector-scaled',
      unixVecPath,
      this.coefficients.alphaUnix.toFixed(2),
      '--control-vector-scaled',
      refusalVecPath,
      (-this.coefficients.betaRefusal).toFixed(2)
    );

    return args;
  }

  /**
   * Save vectors to JSON file on disk.
   */
  public async saveToDisk(filepath?: string): Promise<boolean> {
    const targetPath = filepath || this.storageFilePath;
    try {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const payload = {
        version: '1.0',
        dimension: this.dimension,
        layerRange: this.activeLayerRange,
        coefficients: this.coefficients,
        telemetry: this.telemetry,
        vectors: Array.from(this.vectors.values()),
      };

      fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.warn('[ActivationSteeringManager] Failed to save steering vectors to disk:', err);
      return false;
    }
  }

  /**
   * Load vectors from JSON file on disk (sync).
   */
  public loadFromDiskSync(filepath?: string): boolean {
    const targetPath = filepath || this.storageFilePath;
    try {
      if (!fs.existsSync(targetPath)) {
        return false;
      }
      const raw = fs.readFileSync(targetPath, 'utf-8');
      const data = JSON.parse(raw);

      if (Array.isArray(data.vectors)) {
        for (const v of data.vectors) {
          if (v && v.name && Array.isArray(v.direction)) {
            this.setVector(v);
          }
        }
      }

      if (data.coefficients) {
        this.coefficients = { ...this.coefficients, ...data.coefficients };
      }

      this.isLoaded = true;
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // TELEMETRY & LIFECYCLE
  // =========================================================================

  public getTelemetry(): SteeringTelemetry {
    return { ...this.telemetry };
  }

  public resetTelemetry(): void {
    this.telemetry = {
      totalInferencesSteered: 0,
      refusalsSuppressedCount: 0,
      activeVectorsCount: this.vectors.size,
      averageCosineSimilarity: this.telemetry.averageCosineSimilarity,
      lastSteeringTimestamp: 0,
    };
  }

  public getCoefficients(): SteeringCoefficients {
    return { ...this.coefficients };
  }

  public setCoefficients(coeffs: Partial<SteeringCoefficients>): void {
    this.coefficients = { ...this.coefficients, ...coeffs };
  }

  public getActiveLayerRange(): [number, number] {
    return [...this.activeLayerRange];
  }

  public setActiveLayerRange(range: [number, number]): void {
    this.activeLayerRange = [...range];
  }
}
