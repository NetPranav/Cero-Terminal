/**
 * Cero — Dotfile & Profile Sync Engine
 *
 * Bundles themes, glassmorphism UI preferences, learned AI demonstration workflows,
 * and custom shell aliases into a portable profile JSON for multi-machine synchronization.
 */

import { DemonstrationLearningEngine } from '../learning/DemonstrationLearningEngine';

export interface CeroSyncBundle {
  version: number;
  exportedAt: string;
  themeId: string;
  transparency: number;
  blurLevel: number;
  learnedPatterns: any[];
  customAliases?: Record<string, string>;
}

export class DotfileSyncEngine {
  private static instance: DotfileSyncEngine;

  public static getInstance(): DotfileSyncEngine {
    if (!DotfileSyncEngine.instance) {
      DotfileSyncEngine.instance = new DotfileSyncEngine();
    }
    return DotfileSyncEngine.instance;
  }

  /**
   * Export complete configuration, theme, and learned AI patterns to a JSON string.
   */
  public exportBundle(themeId = 'classic-dark', transparency = 0.82, blurLevel = 20): string {
    const patterns = DemonstrationLearningEngine.getInstance().getAllPatterns();
    const bundle: CeroSyncBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      themeId,
      transparency,
      blurLevel,
      learnedPatterns: patterns
    };
    return JSON.stringify(bundle, null, 2);
  }

  /**
   * Import and restore configuration from a sync bundle.
   */
  public importBundle(bundleJson: string): {
    success: boolean;
    restoredPatterns: number;
    themeId?: string;
    error?: string;
  } {
    try {
      const parsed: CeroSyncBundle = JSON.parse(bundleJson);
      if (!parsed || parsed.version !== 1) {
        return { success: false, restoredPatterns: 0, error: 'Unsupported bundle version' };
      }

      let count = 0;
      if (Array.isArray(parsed.learnedPatterns)) {
        const engine = DemonstrationLearningEngine.getInstance();
        for (const p of parsed.learnedPatterns) {
          if (p && p.id && p.commandTemplate) {
            engine.addPattern(p);
            count++;
          }
        }
      }

      return {
        success: true,
        restoredPatterns: count,
        themeId: parsed.themeId
      };
    } catch (err: any) {
      return {
        success: false,
        restoredPatterns: 0,
        error: err.message || 'Malformed JSON'
      };
    }
  }
}
