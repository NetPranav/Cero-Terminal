/**
 * ModelManifestManager.ts — Adapter Version Registry & Rollback Controller
 *
 * Phase 0.75.12: Tracks active and historical adapter versions in
 * `~/.cero/models/manifest.json` with semantic versioning
 * (`cero-intent-vX.Y.Z`, `cero-coder-vX.Y.Z`).
 *
 * Supports:
 * - Registering new adapter versions with metadata
 * - One-command rollback (`>rollback model intent` / `>rollback model coder`)
 * - Version history with timestamps, eval scores, and training source
 * - Automatic promotion/demotion based on regression gate results
 */

import * as fs from 'fs';
import * as path from 'path';

export interface AdapterVersion {
  /** Semantic version string: cero-{role}-v{major}.{minor}.{patch} */
  version: string;
  /** Absolute path to the adapter GGUF/LoRA file */
  adapterPath: string;
  /** Timestamp of registration */
  registeredAt: number;
  /** Optional eval accuracy against tool_test_cases.json */
  evalScore?: number;
  /** Number of training samples used */
  trainingSamples?: number;
  /** Source of this adapter (e.g., 'grpo', 'mlx_dpo', 'manual') */
  source?: string;
  /** Whether this version passed regression gate */
  passedRegressionGate?: boolean;
  /** SHA-256 checksum of the adapter file */
  checksum?: string;
}

export interface ModelRole {
  /** Currently active adapter version string */
  activeVersion: string;
  /** Ordered history of adapter versions (newest first) */
  history: AdapterVersion[];
}

export interface ModelManifest {
  /** Manifest schema version */
  schemaVersion: number;
  /** Last updated timestamp */
  lastUpdated: number;
  /** Intent model role (CPU, 0.5-1.5B) */
  intent: ModelRole;
  /** Coder model role (GPU, 3B) */
  coder: ModelRole;
}

export type ModelRoleName = 'intent' | 'coder';

export function createDefaultManifest(): ModelManifest {
  return {
    schemaVersion: 1,
    lastUpdated: Date.now(),
    intent: {
      activeVersion: 'cero-intent-v1.0.0',
      history: [],
    },
    coder: {
      activeVersion: 'cero-coder-v1.0.0',
      history: [],
    },
  };
}

export class ModelManifestManager {
  private static instance: ModelManifestManager;
  private manifestPath: string;
  private manifest: ModelManifest;

  constructor(manifestPath?: string) {
    const home = typeof process !== 'undefined'
      ? (process.env.HOME || process.env.USERPROFILE || '/tmp')
      : '/tmp';
    this.manifestPath = manifestPath || path.join(home, '.cero', 'models', 'manifest.json');
    this.manifest = this.loadManifest();
  }

  public static getInstance(manifestPath?: string): ModelManifestManager {
    if (!ModelManifestManager.instance || manifestPath) {
      ModelManifestManager.instance = new ModelManifestManager(manifestPath);
    }
    return ModelManifestManager.instance;
  }

  public static resetInstance(): void {
    (ModelManifestManager as any).instance = undefined;
  }

  // =========================================================================
  // 1. VERSION REGISTRATION
  // =========================================================================

  /**
   * Registers a new adapter version for a given model role.
   * Automatically increments the patch version if no explicit version is provided.
   */
  public registerVersion(
    role: ModelRoleName,
    adapterPath: string,
    options?: {
      version?: string;
      evalScore?: number;
      trainingSamples?: number;
      source?: string;
      passedRegressionGate?: boolean;
      checksum?: string;
    }
  ): AdapterVersion {
    const roleData = this.manifest[role];
    const version = options?.version || this.incrementVersion(roleData.activeVersion);

    const entry: AdapterVersion = {
      version,
      adapterPath,
      registeredAt: Date.now(),
      evalScore: options?.evalScore,
      trainingSamples: options?.trainingSamples,
      source: options?.source,
      passedRegressionGate: options?.passedRegressionGate,
      checksum: options?.checksum,
    };

    // Push to front of history (newest first)
    roleData.history.unshift(entry);

    // Only promote to active if regression gate passed (or not evaluated)
    if (options?.passedRegressionGate !== false) {
      roleData.activeVersion = version;
    }

    this.manifest.lastUpdated = Date.now();
    this.saveManifest();
    return entry;
  }

  // =========================================================================
  // 2. ROLLBACK
  // =========================================================================

  /**
   * Rolls back to the previous adapter version for a given model role.
   * Returns the rolled-back version entry, or null if no history is available.
   *
   * Usage: `>rollback model intent` or `>rollback model coder`
   */
  public rollback(role: ModelRoleName): AdapterVersion | null {
    const roleData = this.manifest[role];
    const currentActive = roleData.activeVersion;

    // Find the current active entry index
    const activeIdx = roleData.history.findIndex(v => v.version === currentActive);

    // Find the next older version that passed regression
    let targetIdx = -1;
    const startSearch = activeIdx >= 0 ? activeIdx + 1 : 0;
    for (let i = startSearch; i < roleData.history.length; i++) {
      if (roleData.history[i].passedRegressionGate !== false) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx === -1) {
      return null; // No rollback target available
    }

    const target = roleData.history[targetIdx];
    roleData.activeVersion = target.version;
    this.manifest.lastUpdated = Date.now();
    this.saveManifest();
    return target;
  }

  /**
   * Rolls back to a specific version string for a given model role.
   */
  public rollbackToVersion(role: ModelRoleName, targetVersion: string): AdapterVersion | null {
    const roleData = this.manifest[role];
    const entry = roleData.history.find(v => v.version === targetVersion);
    if (!entry) return null;

    roleData.activeVersion = targetVersion;
    this.manifest.lastUpdated = Date.now();
    this.saveManifest();
    return entry;
  }

  // =========================================================================
  // 3. QUERIES
  // =========================================================================

  /**
   * Returns the currently active adapter version for a role.
   */
  public getActiveVersion(role: ModelRoleName): string {
    return this.manifest[role].activeVersion;
  }

  /**
   * Returns the full adapter entry for the active version, or undefined if not in history.
   */
  public getActiveEntry(role: ModelRoleName): AdapterVersion | undefined {
    const roleData = this.manifest[role];
    return roleData.history.find(v => v.version === roleData.activeVersion);
  }

  /**
   * Returns the version history for a given role (newest first).
   */
  public getHistory(role: ModelRoleName): AdapterVersion[] {
    return [...this.manifest[role].history];
  }

  /**
   * Returns the full manifest snapshot.
   */
  public getManifest(): ModelManifest {
    return { ...this.manifest };
  }

  /**
   * Returns a human-readable status summary for display.
   */
  public getStatusSummary(): string {
    const m = this.manifest;
    const intentEntry = this.getActiveEntry('intent');
    const coderEntry = this.getActiveEntry('coder');

    const lines = [
      `Model Manifest (v${m.schemaVersion})`,
      `├─ Intent: ${m.intent.activeVersion} (${m.intent.history.length} versions)`,
    ];
    if (intentEntry?.evalScore !== undefined) {
      lines.push(`│  └─ Eval: ${(intentEntry.evalScore * 100).toFixed(1)}%`);
    }
    lines.push(`├─ Coder: ${m.coder.activeVersion} (${m.coder.history.length} versions)`);
    if (coderEntry?.evalScore !== undefined) {
      lines.push(`│  └─ Eval: ${(coderEntry.evalScore * 100).toFixed(1)}%`);
    }
    lines.push(`└─ Updated: ${new Date(m.lastUpdated).toISOString()}`);
    return lines.join('\n');
  }

  // =========================================================================
  // 4. PERSISTENCE
  // =========================================================================

  private loadManifest(): ModelManifest {
    try {
      if (fs.existsSync(this.manifestPath)) {
        const content = fs.readFileSync(this.manifestPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed && parsed.schemaVersion === 1) {
          return parsed as ModelManifest;
        }
      }
    } catch {
      // Return default on any parse/read error
    }
    return createDefaultManifest();
  }

  private saveManifest(): void {
    try {
      const dir = path.dirname(this.manifestPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.manifestPath,
        JSON.stringify(this.manifest, null, 2),
        'utf-8'
      );
    } catch {
      // Ignore persistence errors in sandboxed environments
    }
  }

  // =========================================================================
  // 5. VERSION HELPERS
  // =========================================================================

  /**
   * Increments the patch component of a semantic version string.
   * cero-intent-v1.0.0 → cero-intent-v1.0.1
   */
  private incrementVersion(currentVersion: string): string {
    const match = currentVersion.match(/^(cero-(?:intent|coder)-v)(\d+)\.(\d+)\.(\d+)$/);
    if (match) {
      const [, prefix, major, minor, patch] = match;
      return `${prefix}${major}.${minor}.${parseInt(patch, 10) + 1}`;
    }
    // Fallback: append timestamp
    return `${currentVersion}-${Date.now()}`;
  }

  /**
   * Prunes version history to keep only the most recent N entries per role.
   */
  public pruneHistory(role: ModelRoleName, keepCount: number = 20): number {
    const roleData = this.manifest[role];
    const original = roleData.history.length;
    if (original > keepCount) {
      roleData.history = roleData.history.slice(0, keepCount);
      this.saveManifest();
    }
    return Math.max(0, original - keepCount);
  }
}
