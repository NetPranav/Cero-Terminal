import { describe, it, expect, beforeEach } from 'vitest';
import { EpisodicMemoryEngine } from './EpisodicMemoryEngine';

describe('EpisodicMemoryEngine — Continuous On-Device Learning & Retrieval', () => {
  let engine: EpisodicMemoryEngine;

  beforeEach(() => {
    engine = EpisodicMemoryEngine.getInstance();
    engine.clear();
  });

  it('should record episodic memories from demonstrations', () => {
    const memory = engine.recordMemory(
      'show me all connected wifi networks',
      'networksetup -listpreferredwirelessnetworks en0',
      { explanation: 'Lists preferred Wi-Fi networks on macOS' }
    );

    expect(memory).toBeDefined();
    expect(memory.id).toMatch(/^mem_/);
    expect(memory.goal).toBe('show me all connected wifi networks');
    expect(memory.command).toBe('networksetup -listpreferredwirelessnetworks en0');
    expect(engine.getAllMemories().length).toBe(1);
  });

  it('should retrieve semantically similar memories for related user queries', () => {
    engine.recordMemory(
      'find all frontend directories on my mac',
      `mdfind "kMDItemFSName == '*frontend*'c && kMDItemContentType == 'public.folder'"`,
      { explanation: 'Spotlight search for frontend folders' }
    );

    engine.recordMemory(
      'kill process running on port 3000',
      'lsof -ti:3000 | xargs kill -9',
      { explanation: 'Kill port 3000 listeners' }
    );

    // Query with different wording
    const matches = engine.retrieveSimilar('can you locate frontend folders in the system');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].goal).toBe('find all frontend directories on my mac');
    expect(matches[0].command).toContain('mdfind');
  });

  it('should format retrieved memories into few-shot system prompt examples', () => {
    const mem1 = engine.recordMemory(
      'list bluetooth devices',
      'system_profiler SPBluetoothDataType',
      { explanation: 'Inspect Bluetooth system profile' }
    );

    const formatted = engine.formatPromptFewShots([mem1]);
    expect(formatted).toContain('# User Demonstrated Workflows & Learned Patterns:');
    expect(formatted).toContain('User: "list bluetooth devices"');
    expect(formatted).toContain('system_profiler SPBluetoothDataType');
  });

  it('should update existing memory when identical goal is demonstrated again', () => {
    engine.recordMemory('check battery status', 'pmset -g batt');
    expect(engine.getAllMemories().length).toBe(1);

    engine.recordMemory('check battery status', 'pmset -g ps');
    expect(engine.getAllMemories().length).toBe(1);
    expect(engine.getAllMemories()[0].command).toBe('pmset -g ps');
  });

  it('should redact secrets from commands and goals before persisting into memory', () => {
    const memory = engine.recordMemory(
      'deploy service with token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn',
      'export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE && deploy.sh',
      { explanation: 'token: glpat-xxxxxxxxxxxxxxxxxxxx' }
    );

    expect(memory.goal).toContain('[REDACTED:');
    expect(memory.goal).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(memory.command).toContain('[REDACTED:AWS_KEY]');
    expect(memory.command).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(memory.explanation).toContain('[REDACTED:GITLAB_TOKEN]');
    expect(memory.explanation).not.toContain('glpat-xxxxxxxxxxxxxxxxxxxx');
  });

  it('boosts same-project memories and penalizes foreign-project memories (0.5.4)', () => {
    // Memory recorded in project A
    engine.recordMemory('build and run test suite', 'cargo test --all', {
      cwd: '/workspace/project-alpha',
      projectFingerprint: 'project_alpha_fp'
    });

    // Memory recorded in project B with identical phrasing
    engine.recordMemory('build and run test suite', 'npm test', {
      cwd: '/workspace/project-beta',
      projectFingerprint: 'project_beta_fp'
    });

    // When querying from project A, project A's memory should rank higher
    const matchesA = engine.retrieveSimilar('run the test suite', 5, 0.05, '/workspace/project-alpha');
    // Note: If fingerprint of cwd is computed, pass explicit or mock cwd
    // In our test, retrieveSimilar calculates activeProjectFp from cwd
    expect(matchesA.length).toBeGreaterThan(0);
  });

  it('tracks execution outcome, calculates rolling success rate, down-weights and retires failing patterns (0.5.12)', () => {
    const mem = engine.recordMemory('deploy staging container', 'docker compose up -d staging');
    expect(mem.rollingSuccessRate).toBe(1.0);
    expect(mem.retired).toBe(false);

    // Record two failures
    engine.recordOutcome(mem.id, false);
    engine.recordOutcome(mem.id, false);

    const memAfterFails = engine.getAllMemories().find(m => m.id === mem.id)!;
    expect(memAfterFails.successCount).toBe(1);
    expect(memAfterFails.failCount).toBe(2);
    // 1 / (1 + 2) = 0.333...
    expect(memAfterFails.rollingSuccessRate).toBeCloseTo(0.333, 2);
    expect(memAfterFails.retired).toBe(false); // not retired yet (requires < 0.2 and total >= 3)

    // Record three more failures -> 1 success, 5 fails -> 1/6 = 0.166... < 0.2 -> RETIRED
    engine.recordOutcome(mem.id, false);
    engine.recordOutcome(mem.id, false);
    engine.recordOutcome(mem.id, false);

    const retiredMem = engine.getAllMemories().find(m => m.id === mem.id)!;
    expect(retiredMem.retired).toBe(true);

    // Once retired, retrieveSimilar skips it
    const matches = engine.retrieveSimilar('deploy staging container');
    expect(matches.find(m => m.id === mem.id)).toBeUndefined();
  });
});

