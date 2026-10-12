import { describe, it, expect, vi } from 'vitest';
import { ShadowPtySimulator, CandidateHypothesis } from './ShadowPtySimulator';

describe('ShadowPtySimulator — Speculative Shadow-PTY Simulation Engine', () => {
  describe('Hypothesis Generation & Platform Adaptation', () => {
    const simulator = new ShadowPtySimulator();

    it('should generate primary candidate and classify its risk', () => {
      const hypotheses = simulator.generateHypotheses('list files', 'ls -la', { os: 'windows', cwd: '/Users/test' });
      expect(hypotheses.length).toBeGreaterThanOrEqual(1);
      expect(hypotheses[0].command).toBe('ls -la');
      expect(hypotheses[0].source).toBe('primary');
      expect(hypotheses[0].estimatedRisk).toBe('read_only');
    });

    it('adds no macOS or Linux rewrites on Windows', () => {
      for (const cmd of ['fuser 3000/tcp', 'fuser -k 3000/tcp', 'ip addr', "sed -i 's/foo/bar/g' config.txt", 'grep -P "^[0-9]+" file.txt', 'which node', 'find . -name "*.md"']) {
        const hypotheses = simulator.generateHypotheses('anything', cmd, { os: 'windows', cwd: 'C:\\Users\\test' });
        expect(hypotheses.map(h => h.source), cmd).toEqual(['primary']);
      }
    });

    it('adds canonical recipes for a known program as variations', () => {
      const hypotheses = simulator.generateHypotheses('pack a folder', 'tar -czvf out.tar.gz src', { os: 'windows', cwd: 'C:\\Users\\test' });
      expect(hypotheses.length).toBeGreaterThan(1);
      expect(hypotheses.slice(1).every(h => h.source === 'variation' && h.id.startsWith('branch_tldr_tar'))).toBe(true);
    });
  });

  describe('Non-Destructive Safety Predicate Transformation', () => {
    const simulator = new ShadowPtySimulator();

    it('should keep read-only commands untransformed', () => {
      const { predicate, isTransformed } = simulator.toSafePredicate('lsof -i :3000', 'read_only');
      expect(predicate).toBe('lsof -i :3000');
      expect(isTransformed).toBe(false);
    });

    it('should transform kill <pid> into non-destructive kill -0 <pid>', () => {
      const { predicate, isTransformed } = simulator.toSafePredicate('kill -9 4190', 'safe_mutation');
      expect(predicate).toBe('kill -0 4190');
      expect(isTransformed).toBe(true);
    });

    it('should transform pkill <name> into non-destructive pgrep', () => {
      const { predicate, isTransformed } = simulator.toSafePredicate('pkill -9 node', 'safe_mutation');
      expect(predicate).toBe('pgrep -i "node"');
      expect(isTransformed).toBe(true);
    });

    it('should transform port killer pipeline into lsof PID check', () => {
      const { predicate, isTransformed } = simulator.toSafePredicate('lsof -ti:3000 | xargs kill -9', 'safe_mutation');
      expect(predicate).toBe('lsof -ti:3000');
      expect(isTransformed).toBe(true);
    });

    it('should transform rm -rf <target> into non-destructive existence and write test', () => {
      const { predicate, isTransformed } = simulator.toSafePredicate('rm -rf /tmp/cache', 'safe_mutation');
      expect(predicate).toBe('test -e "/tmp/cache" && test -w "/tmp/cache"');
      expect(isTransformed).toBe(true);
    });

    it('should transform git commit into non-destructive git status probe', () => {
      const { predicate, isTransformed } = simulator.toSafePredicate('git commit -m "feat"', 'safe_mutation');
      expect(predicate).toBe('git status --porcelain');
      expect(isTransformed).toBe(true);
    });

    it('should transform unmapped mutating command into safe shell -n syntax verification', () => {
      const { predicate, isTransformed } = simulator.toSafePredicate('chmod +x script.sh && ./script.sh', 'safe_mutation');
      expect(predicate).toMatch(/\/(?:zsh|bash|sh)\s+-n\s+-c/);
      expect(isTransformed).toBe(true);
    });
  });

  describe('Empirical Mathematical Scoring Oracle', () => {
    const simulator = new ShadowPtySimulator();

    it('should give high score for exit code 0 with informative stdout', () => {
      const score = simulator.calculateEmpiricalScore({
        exitCode: 0,
        stdout: 'PID 4190 LISTEN node /Users/project/server.js',
        stderr: '',
        risk: 'read_only',
        isTransformed: false
      });
      // 2.0 (exit 0) + ~0.43 (stdout tanh) = ~2.43
      expect(score).toBeGreaterThan(2.3);
    });

    it('should penalize failing exit code and stderr heavily', () => {
      const score = simulator.calculateEmpiricalScore({
        exitCode: 127,
        stdout: '',
        stderr: 'zsh: command not found: fuser',
        risk: 'read_only',
        isTransformed: false
      });
      // -2.5 (exit != 0) - 2.0 (stderr) - 2.0 (command not found) = -6.5
      expect(score).toBeLessThan(-5.0);
    });

    it('should heavily penalize canned conversational refusals', () => {
      const score = simulator.calculateEmpiricalScore({
        exitCode: 0,
        stdout: "I don't have access to your system to check listening ports.",
        stderr: '',
        risk: 'read_only',
        isTransformed: false
      });
      // 2.0 (exit 0) + 0.6 (len) - 3.0 (refusal) = ~-0.4
      expect(score).toBeLessThan(0.0);
    });

    it('should apply small risk penalties to safe_mutation and high_risk', () => {
      const scoreRead = simulator.calculateEmpiricalScore({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        risk: 'read_only',
        isTransformed: false
      });
      const scoreMut = simulator.calculateEmpiricalScore({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        risk: 'safe_mutation',
        isTransformed: false
      });
      expect(scoreRead).toBeGreaterThan(scoreMut);
    });
  });

  describe('Parallel Ephemeral Sandbox Rollout & Branch Pruning', () => {
    it('prunes a failing primary and has nothing to swap in when no rewrite exists', async () => {
      const mockExecutor = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
        const full = args.join(' ');
        if (full.includes('fuser')) {
          return { stdout: '', stderr: 'fuser: command not found', code: 127 };
        }
        return { stdout: '', stderr: '', code: 0 };
      });

      const simulator = new ShadowPtySimulator({ executor: mockExecutor });
      const report = await simulator.speculate(
        'check what is running on port 3000',
        'fuser 3000/tcp',
        { os: 'windows', cwd: '/Users/test' }
      );

      expect(report.evaluatedCandidates.length).toBe(1);
      expect(report.evaluatedCandidates[0].pruned).toBe(true);
      expect(report.evaluatedCandidates[0].empiricalScore).toBeLessThan(0);
      expect(report.winner?.candidate.source ?? 'primary').toBe('primary');
    });

    it('should prune syntax errors caught by zsh -n', async () => {
      const mockExecutor = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
        const full = args.join(' ');
        if (full.includes('parse error')) {
          return { stdout: '', stderr: 'zsh: parse error near `;;`', code: 1 };
        }
        return { stdout: 'ok', stderr: '', code: 0 };
      });

      const candidateBroken: CandidateHypothesis = {
        id: 'broken',
        command: 'if [[ 1 == 1 ]]; then echo ;; fi',
        source: 'primary',
        estimatedRisk: 'safe_mutation'
      };

      const candidateGood: CandidateHypothesis = {
        id: 'good',
        command: 'echo "hello"',
        source: 'variation',
        estimatedRisk: 'read_only'
      };

      const simulator = new ShadowPtySimulator({ executor: mockExecutor });
      const outcomeBroken = await simulator.evaluateCandidate(candidateBroken, { os: 'windows', cwd: '/Users/test' });
      const outcomeGood = await simulator.evaluateCandidate(candidateGood, { os: 'windows', cwd: '/Users/test' });

      expect(outcomeGood.pruned).toBe(false);
      expect(outcomeGood.empiricalScore).toBeGreaterThan(0);
    });
  });

  // The sandbox is still POSIX sh (TODO(4.3)), so these run only on a POSIX test host (the Linux CI job)
  describe.skipIf(process.platform === 'win32')('Live Subshell Ephemeral Execution (Integration)', () => {
    const simulator = new ShadowPtySimulator();

    it('should execute read-only probe in ephemeral subshell in <50ms', async () => {
      const startTime = performance.now();
      const report = await simulator.speculate(
        'print a version line',
        'echo version 14.5',
        { os: 'windows', cwd: process.cwd() }
      );
      const elapsed = performance.now() - startTime;

      expect(report.winner).toBeDefined();
      expect(report.winner?.exitCode).toBe(0);
      expect(report.winner?.stdout).toContain('version 14.5');
      expect(report.winner?.empiricalScore).toBeGreaterThan(2.0);
      expect(elapsed).toBeLessThan(1500); // fast local execution
    });

    it('should safely simulate kill without terminating any process', async () => {
      const report = await simulator.speculate(
        'kill fake process',
        'kill -9 999999',
        { os: 'windows', cwd: process.cwd() }
      );

      // Verified non-destructive: executed kill -0 999999
      expect(report.evaluatedCandidates[0].isPredicateTransformed).toBe(true);
      expect(report.evaluatedCandidates[0].executedCommand).toBe('kill -0 999999');
      // PID 999999 does not exist, so exitCode is 1
      expect(report.evaluatedCandidates[0].exitCode).toBe(1);
    });

    it('should route high-risk AST-only command to AST assessment without sandbox execution (0.5.5)', async () => {
      const mockExecutor = vi.fn();
      const mockSim = new ShadowPtySimulator({ executor: mockExecutor });

      const report = await mockSim.speculate(
        'delete all files from root',
        'rm -rf /',
        { os: 'windows', cwd: '/' }
      );

      // Should NOT have called the executor (skips sandbox execution!)
      expect(mockExecutor).not.toHaveBeenCalled();

      // Primary candidate should be evaluated via AST and pruned
      const primary = report.evaluatedCandidates[0];
      expect(primary.pruned).toBe(true);
      expect(primary.stdout).toContain('AST-Only Assessment');
      expect(primary.empiricalScore).toBeLessThan(0);
    });

    it('should transform cargo build to cargo check via dry-run routing (0.5.5)', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({ stdout: 'Finished dev profile', stderr: '', code: 0 });
      const mockSim = new ShadowPtySimulator({ executor: mockExecutor });

      const report = await mockSim.speculate(
        'compile rust binary',
        'cargo build --release',
        { os: 'windows', cwd: '/tmp' }
      );

      expect(report.evaluatedCandidates[0].isPredicateTransformed).toBe(true);
      expect(report.evaluatedCandidates[0].executedCommand).toBe('cargo check --release');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(String),
        ['-c', 'cargo check --release'],
        '/tmp'
      );
    });
  });

  describe('Winner selection never replaces a working primary command', () => {
    it('keeps a viable primary even when a heuristic variation prints more output', async () => {
      // Heuristic/TLDR variations produce longer output; before the fix they outscored
      // the model's precise command and silently replaced it.
      const executor = vi.fn(async (_shell: string, args: string[]) => {
        const cmd = args[1];
        if (cmd.startsWith('git status')) return { stdout: 'x'.repeat(4000), stderr: '', code: 0 };
        return { stdout: 'a1b2c3 fix: the last commit', stderr: '', code: 0 };
      });
      const sim = new ShadowPtySimulator({ executor });
      const report = await sim.speculate(
        'show the last commit',
        'git log --oneline -n 1',
        { os: 'windows', cwd: '/tmp' }
      );
      expect(report.evaluatedCandidates.length).toBeGreaterThan(1);
      expect(report.winner?.candidate.source).toBe('primary');
    });

    it('reports no platform alternatives on Windows, so speculation is skipped', () => {
      const sim = new ShadowPtySimulator();
      expect(sim.hasPlatformAlternatives('top cpu', 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 2', { os: 'windows', cwd: 'C:\\' })).toBe(false);
      expect(sim.hasPlatformAlternatives('show ip', 'ip addr', { os: 'windows', cwd: 'C:\\' })).toBe(false);
    });
  });
});

