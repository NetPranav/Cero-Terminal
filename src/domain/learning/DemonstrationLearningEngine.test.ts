import { describe, it, expect, beforeEach } from 'vitest';
import { DemonstrationLearningEngine, isPlausibleDemonstration } from './DemonstrationLearningEngine';

describe('DemonstrationLearningEngine — Experiential Learning & Pattern Generalization', () => {
  let engine: DemonstrationLearningEngine;

  beforeEach(() => {
    engine = new DemonstrationLearningEngine();
    engine.clear();
  });

  it('autonomously learns a pattern when user demonstrates the manual solution after a failed goal', () => {
    const pattern = engine.learnFromDemonstration(
      'convert lecture.mp4 to webm',
      'ffmpeg -i lecture.mp4 -c:v libvpx-vp9 lecture.webm'
    );

    expect(pattern).not.toBeNull();
    expect(pattern?.originalGoal).toBe('convert lecture.mp4 to webm');
    expect(pattern?.commandTemplate).toContain('{1}');
    expect(pattern?.commandTemplate).toContain('{name_1}.webm');
  });

  it('recalls a learned pattern and interpolates new variable arguments', () => {
    // 1. Learn from demonstration
    engine.learnFromDemonstration(
      'convert lecture.mp4 to webm',
      'ffmpeg -i lecture.mp4 -c:v libvpx-vp9 lecture.webm'
    );

    // 2. Next time user asks for a completely different file
    const match = engine.matchGoal('convert holiday_recording.mp4 to webm');
    expect(match.matched).toBe(true);
    expect(match.interpolatedCommand).toBe('ffmpeg -i holiday_recording.mp4 -c:v libvpx-vp9 holiday_recording.webm');
    expect(match.explanation).toContain('ffmpeg -i holiday_recording.mp4');
  });

  it('handles conversational variations when recalling learned patterns (e.g. "please convert")', () => {
    engine.learnFromDemonstration(
      'convert lecture.mp4 to webm',
      'ffmpeg -i lecture.mp4 -c:v libvpx-vp9 lecture.webm'
    );

    const match = engine.matchGoal('please convert drone_flight.mp4 to webm format');
    expect(match.matched).toBe(true);
    expect(match.interpolatedCommand).toBe('ffmpeg -i drone_flight.mp4 -c:v libvpx-vp9 drone_flight.webm');
  });

  it('supports explicit teaching of workflow mappings', () => {
    engine.learnExplicit(
      'sync drone logs',
      'rsync -avz pi@192.168.1.50:/var/log/drone/ ./logs/',
      'Syncs remote drone telemetry and flight logs locally'
    );

    const match = engine.matchGoal('sync drone logs');
    expect(match.matched).toBe(true);
    expect(match.interpolatedCommand).toBe('rsync -avz pi@192.168.1.50:/var/log/drone/ ./logs/');
    expect(match.pattern?.explanation).toBe('Syncs remote drone telemetry and flight logs locally');
  });

  it('allows forgetting a learned pattern', () => {
    const pattern = engine.learnExplicit('test command', 'echo hello');
    expect(engine.getAllPatterns().length).toBe(1);

    const forgot = engine.forgetPattern(pattern.id);
    expect(forgot).toBe(true);
    expect(engine.getAllPatterns().length).toBe(0);
    expect(engine.matchGoal('test command').matched).toBe(false);
  });

  it('redacts secrets from demonstrated and explicitly taught patterns', () => {
    const pattern = engine.learnExplicit(
      'connect to db with password="super_secret_123"',
      'psql -h localhost -U admin -W "super_secret_123" && export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
      'auth_token: abcdef123456789'
    );

    expect(pattern.originalGoal).toContain('[REDACTED:SECRET_VALUE]');
    expect(pattern.originalGoal).not.toContain('super_secret_123');
    expect(pattern.commandTemplate).toContain('[REDACTED:AWS_KEY]');
    expect(pattern.commandTemplate).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(pattern.explanation).toContain('[REDACTED:SECRET_VALUE]');
  });

  it('tags patterns with project fingerprint and updates pattern confidence on outcome (0.5.4 & 0.5.12)', () => {
    const pattern = engine.learnExplicit(
      'build release binary',
      'cargo build --release',
      'Compiles release binary for Rust project',
      '/workspace/rust-app'
    );

    expect(pattern.projectFingerprint).toBeDefined();
    expect(pattern.successCount).toBe(1);
    expect(pattern.failCount).toBe(0);
    expect(pattern.rollingSuccessRate).toBe(1.0);

    // Record a failure
    engine.recordPatternOutcome(pattern.id, false);
    const updated = engine.getAllPatterns().find(p => p.id === pattern.id)!;
    expect(updated.failCount).toBe(1);
    expect(updated.rollingSuccessRate).toBe(0.5);
  });
});


describe('isPlausibleDemonstration', () => {
  it.each([
    ['delete the build folder', 'rm -rf build'],
    ['compress the logs folder', 'tar -czf logs.tgz logs && rm -rf logs'],
    ['show disk usage', 'df -h'],
    ['what is listening on port 3000', 'lsof -i :3000'],
    ['convert video.mp4 to gif', 'ffmpeg -i video.mp4 out.gif'],
  ])('learns "%s" -> %s', (goal, cmd) => {
    expect(isPlausibleDemonstration(goal, cmd)).toBe(true);
  });

  it.each([
    ['delete the build folder', 'ls build'],
    ['install htop', 'which htop'],
    ['what changed in the last commit', 'git reset --hard'],
    ['show disk usage', 'rm -rf ~/Downloads/big'],
  ])('ignores "%s" -> %s', (goal, cmd) => {
    expect(isPlausibleDemonstration(goal, cmd)).toBe(false);
  });
});
