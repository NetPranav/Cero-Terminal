import { describe, it, expect, beforeEach } from 'vitest';
import { DotfileSyncEngine } from './DotfileSyncEngine';
import { DemonstrationLearningEngine } from '../learning/DemonstrationLearningEngine';

describe('DotfileSyncEngine (Pillar 3.3)', () => {
  let engine: DotfileSyncEngine;

  beforeEach(() => {
    engine = new DotfileSyncEngine();
  });

  it('exports valid sync bundle JSON with themes and patterns', () => {
    const raw = engine.exportBundle('cyberpunk-neon', 0.75, 25);
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.themeId).toBe('cyberpunk-neon');
    expect(parsed.transparency).toBe(0.75);
    expect(Array.isArray(parsed.learnedPatterns)).toBe(true);
  });

  it('imports and restores learned patterns from bundle', () => {
    const mockBundle = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      themeId: 'dracula',
      transparency: 0.8,
      blurLevel: 20,
      learnedPatterns: [
        {
          id: 'mock_pattern_sync',
          triggerRegex: '^deploy to staging$',
          rawGoalTemplate: 'deploy to staging',
          commandTemplate: 'docker compose up -d',
          explanation: 'Deploys to staging with docker compose',
          source: 'explicit_user_teach',
          originalGoal: 'deploy to staging',
          demonstratedCommand: 'docker compose up -d',
          confidence: 1.0,
          timesUsed: 1,
          createdAt: Date.now()
        }
      ]
    });

    const result = engine.importBundle(mockBundle);
    expect(result.success).toBe(true);
    expect(result.restoredPatterns).toBe(1);
    expect(result.themeId).toBe('dracula');

    const matched = DemonstrationLearningEngine.getInstance().matchGoal('deploy to staging');
    expect(matched).not.toBeNull();
    expect(matched?.interpolatedCommand).toBe('docker compose up -d');
  });

  it('gracefully handles malformed JSON during import', () => {
    const result = engine.importBundle('{ invalid json ');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
