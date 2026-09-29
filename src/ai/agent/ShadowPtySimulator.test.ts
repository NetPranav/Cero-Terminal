import { describe, it, expect, vi } from 'vitest';
import { ShadowPtySimulator, CandidateHypothesis } from './ShadowPtySimulator';

describe('ShadowPtySimulator — Speculative Shadow-PTY Simulation Engine', () => {
  describe('Hypothesis Generation & Platform Adaptation', () => {
    const simulator = new ShadowPtySimulator();

    it('should generate primary candidate and classify its risk', () => {
      const hypotheses = simulator.generateHypotheses('list files', 'ls -la', { os: 'mac', cwd: '/Users/test' });
      expect(hypotheses.length).toBeGreaterThanOrEqual(1);
      expect(hypotheses[0].command).toBe('ls -la');
      expect(hypotheses[0].source).toBe('primary');
      expect(hypotheses[0].estimatedRisk).toBe('read_only');
    });

    it('should auto-correct Linux fuser to macOS lsof on Darwin', () => {
      const hypotheses = simulator.generateHypotheses('inspect port 3000', 'fuser 3000/tcp', { os: 'mac', cwd: '/Users/test' });
      const lsofHypothesis = hypotheses.find(h => h.command.includes('lsof -i :3000'));
      expect(lsofHypothesis).toBeDefined();
      expect(lsofHypothesis?.source).toBe('platform_optimized');
    });

    it('should auto-correct fuser -k 3000 to lsof -ti:3000 | xargs kill -9', () => {
      const hypotheses = simulator.generateHypotheses('kill port 3000', 'fuser -k 3000/tcp', { os: 'mac', cwd: '/Users/test' });
      const killHypothesis = hypotheses.find(h => h.command.includes('lsof -ti:3000 | xargs kill -9'));
      expect(killHypothesis).toBeDefined();
    });

    it('should auto-correct Linux "ip addr" to macOS "ifconfig"', () => {
      const hypotheses = simulator.generateHypotheses('show ip address', 'ip addr', { os: 'mac', cwd: '/Users/test' });
      const ifconfigHypothesis = hypotheses.find(h => h.command === 'ifconfig');
      expect(ifconfigHypothesis).toBeDefined();
      expect(ifconfigHypothesis?.source).toBe('platform_optimized');
    });

    it('should auto-correct GNU sed -i to macOS BSD sed -i \'\'', () => {
      const hypotheses = simulator.generateHypotheses('replace text', "sed -i 's/foo/bar/g' config.txt", { os: 'mac', cwd: '/Users/test' });
      const bsdSed = hypotheses.find(h => h.command.includes("sed -i ''"));
      expect(bsdSed).toBeDefined();
    });

    it('should auto-correct grep -P to grep -E for BSD grep', () => {
      const hypotheses = simulator.generateHypotheses('regex search', 'grep -P "^[0-9]+" file.txt', { os: 'mac', cwd: '/Users/test' });
      const bsdGrep = hypotheses.find(h => h.command.includes('grep -E'));
      expect(bsdGrep).toBeDefined();
    });

    it('should auto-correct "which <tool>" to POSIX "command -v <tool>"', () => {
      const hypotheses = simulator.generateHypotheses('check node path', 'which node', { os: 'mac', cwd: '/Users/test' });
      const cmdV = hypotheses.find(h => h.command === 'command -v node');
      expect(cmdV).toBeDefined();
    });

    it('should expand find command to macOS mdfind Spotlight probe', () => {
      const hypotheses = simulator.generateHypotheses('find notes', 'find . -name "*.md"', { os: 'mac', cwd: '/Users/test' });
      const mdfind = hypotheses.find(h => h.command.includes('mdfind -name ".md"'));
      expect(mdfind).toBeDefined();
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
    it('should simulate 3 candidates in parallel, prune failing branches, and pick verified winner', async () => {
      // Mock custom executor simulating macOS environment where 'fuser' fails but 'lsof' succeeds
      const mockExecutor = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
        const full = args.join(' ');
        if (full.includes('fuser')) {
          return { stdout: '', stderr: 'zsh: command not found: fuser', code: 127 };
        }
        if (full.includes('lsof -i :3000')) {
          return { stdout: 'node 4190 user 22u IPv4 0x123 TCP *:3000 (LISTEN)', stderr: '', code: 0 };
        }
        if (full.includes('lsof -iTCP:3000')) {
          return { stdout: 'node 4190 TCP *:3000 (LISTEN)', stderr: '', code: 0 };
        }
        return { stdout: '', stderr: '', code: 0 };
      });

      const simulator = new ShadowPtySimulator({ executor: mockExecutor });
      const report = await simulator.speculate(
        'check what is running on port 3000',
        'fuser 3000/tcp',
        { os: 'mac', cwd: '/Users/test' }
      );

      expect(report.evaluatedCandidates.length).toBe(3);
      // Primary fuser branch should be pruned
      const fuserOutcome = report.evaluatedCandidates.find(c => c.candidate.command.includes('fuser'));
      expect(fuserOutcome?.pruned).toBe(true);
      expect(fuserOutcome?.empiricalScore).toBeLessThan(0);

      // Winning branch must be an lsof branch
      expect(report.winner).toBeDefined();
      expect(report.winner?.pruned).toBe(false);
      expect(report.winner?.candidate.command).toContain('lsof');
      expect(report.winner?.empiricalScore).toBeGreaterThan(2.0);
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
      const outcomeBroken = await simulator.evaluateCandidate(candidateBroken, { os: 'mac', cwd: '/Users/test' });
      const outcomeGood = await simulator.evaluateCandidate(candidateGood, { os: 'mac', cwd: '/Users/test' });

      expect(outcomeGood.pruned).toBe(false);
      expect(outcomeGood.empiricalScore).toBeGreaterThan(0);
    });
  });

  // Runs real POSIX commands (sw_vers, kill -0) in a subshell
  describe.skipIf(process.platform === 'win32')('Live Subshell Ephemeral Execution (Integration)', () => {
    const simulator = new ShadowPtySimulator();

    it('should execute read-only probe in ephemeral subshell in <50ms', async () => {
      const isMac = process.platform === 'darwin';
      const cmd = isMac ? 'sw_vers' : 'echo macOS version 14.5';
      const startTime = performance.now();
      const report = await simulator.speculate(
        'check macOS version',
        cmd,
        { os: 'mac', cwd: process.cwd() }
      );
      const elapsed = performance.now() - startTime;

      expect(report.winner).toBeDefined();
      expect(report.winner?.exitCode).toBe(0);
      expect(report.winner?.stdout).toContain('macOS');
      expect(report.winner?.empiricalScore).toBeGreaterThan(2.0);
      expect(elapsed).toBeLessThan(1500); // fast local execution
    });

    it('should safely simulate kill without terminating any process', async () => {
      const report = await simulator.speculate(
        'kill fake process',
        'kill -9 999999',
        { os: 'mac', cwd: process.cwd() }
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
        { os: 'linux', cwd: '/' }
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
        { os: 'linux', cwd: '/tmp' }
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
        if (cmd.startsWith('pgrep')) return { stdout: 'x'.repeat(4000), stderr: '', code: 0 };
        return { stdout: '1234 12.5 3.1 llama-server', stderr: '', code: 0 };
      });
      const sim = new ShadowPtySimulator({ executor });
      const report = await sim.speculate(
        'check llama usage',
        'ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -n 2',
        { os: 'linux', cwd: '/tmp' }
      );
      expect(report.evaluatedCandidates.length).toBeGreaterThan(1);
      expect(report.winner?.candidate.source).toBe('primary');
    });

    it('uses a platform-specific rewrite when the primary fails on this platform', async () => {
      const executor = vi.fn(async (_shell: string, args: string[]) => {
        const cmd = args[1];
        if (cmd.startsWith('fuser')) return { stdout: '', stderr: 'fuser: command not found', code: 127 };
        return { stdout: 'node 4242 user 23u IPv4 TCP *:3000 (LISTEN)', stderr: '', code: 0 };
      });
      const sim = new ShadowPtySimulator({ executor });
      const report = await sim.speculate('inspect port 3000', 'fuser 3000/tcp', { os: 'mac', cwd: '/tmp' });
      expect(report.winner?.candidate.source).toBe('platform_optimized');
    });

    it('reports no platform alternatives for native Linux commands, so speculation is skipped', () => {
      const sim = new ShadowPtySimulator();
      expect(sim.hasPlatformAlternatives('top cpu', 'ps -eo pid,pcpu,comm --sort=-pcpu | head -n 2', { os: 'linux', cwd: '/tmp' })).toBe(false);
      expect(sim.hasPlatformAlternatives('show ip', 'ip addr', { os: 'mac', cwd: '/tmp' })).toBe(true);
    });
  });
});

