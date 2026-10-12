import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalIntentClassifier, IntentContext } from './IntentModel';

describe('LocalIntentClassifier (Phase 0.75 Tasks 0.75.1, 0.75.8, 0.75.9)', () => {
  let classifier: LocalIntentClassifier;

  beforeEach(() => {
    classifier = new LocalIntentClassifier();
  });

  describe('Domain & Action Classification (Heuristic Fallback)', () => {
    it('correctly classifies application open and install intents', async () => {
      const openRes = await classifier.classify('open nvim');
      expect(openRes.domain).toBe('application');
      expect(openRes.action).toBe('open');
      expect(openRes.confidence).toBeGreaterThanOrEqual(0.9);
      expect(openRes.executionTier).toBe('intent_cpu');

      const installRes = await classifier.classify('install ripgrep');
      expect(installRes.domain).toBe('application');
      expect(installRes.action).toBe('install');

      const reinstallRes = await classifier.classify('remove and install vlc');
      expect(reinstallRes.domain).toBe('application');
      expect(reinstallRes.action).toBe('reinstall');
    });

    it('correctly classifies system diagnostics, hardware, and process management', async () => {
      const cpu = await classifier.classify('what is my current cpu usage');
      expect(cpu.domain).toBe('system');
      expect(cpu.action).toBe('cpu');

      const mem = await classifier.classify('check free ram and memory');
      expect(mem.domain).toBe('system');
      expect(mem.action).toBe('memory');

      const batt = await classifier.classify('check battery percentage');
      expect(batt.domain).toBe('system');
      expect(batt.action).toBe('battery');

      const kill = await classifier.classify('kill node process');
      expect(kill.domain).toBe('system');
      expect(kill.action).toBe('kill');
    });

    it('correctly classifies network and wireless intents', async () => {
      const wifi = await classifier.classify('scan available wifi networks');
      expect(wifi.domain).toBe('network');
      expect(wifi.action).toBe('scan');

      const bt = await classifier.classify('list bluetooth devices');
      expect(bt.domain).toBe('network');
      expect(bt.action).toBe('bluetooth');

      const ports = await classifier.classify('what is using port 3000');
      expect(ports.domain).toBe('network');
      expect(ports.action).toBe('ports');
    });

    it('correctly classifies developer, git, docker, and filesystem intents', async () => {
      const cargo = await classifier.classify('cargo build --release');
      expect(cargo.domain).toBe('developer');
      expect(cargo.action).toBe('cargo');

      const npm = await classifier.classify('npm run test');
      expect(npm.domain).toBe('developer');
      expect(npm.action).toBe('node');

      const git = await classifier.classify('git commit -m "feat: new feature"');
      expect(git.domain).toBe('git');
      expect(git.action).toBe('commit');

      const docker = await classifier.classify('docker ps -a');
      expect(docker.domain).toBe('docker');
      expect(docker.action).toBe('list');

      const fs = await classifier.classify('find all frontend folders');
      expect(fs.domain).toBe('filesystem');
      expect(fs.action).toBe('search');
    });
  });

  describe('Precondition-Aware Complex Prompt Decomposition (Task 0.75.2)', () => {
    it('decomposes "ensure <app> is installed and open it" with which precondition', async () => {
      const res = await classifier.classify('ensure neovim is installed and open it');
      expect(res.isComplex).toBe(true);
      expect(res.suggestedSteps).toBeDefined();
      expect(res.suggestedSteps?.length).toBe(2);

      const step1 = res.suggestedSteps![0];
      expect(step1.goal).toContain('ensure neovim is installed');
      expect(step1.precondition_check).toBe('which "neovim"');
      expect(step1.if_precondition_true).toBe('skip');
      expect(step1.if_precondition_false).toBe('install');

      const step2 = res.suggestedSteps![1];
      expect(step2.goal).toContain('open neovim');
    });

    it('decomposes "install <app> if not installed and launch it"', async () => {
      const res = await classifier.classify('install vlc if not installed and launch it');
      expect(res.isComplex).toBe(true);
      expect(res.suggestedSteps?.length).toBe(2);
      expect(res.suggestedSteps![0].precondition_check).toBe('which "vlc"');
      expect(res.suggestedSteps![0].if_precondition_true).toBe('skip');
      expect(res.suggestedSteps![0].if_precondition_false).toBe('install');
      expect(res.suggestedSteps![1].goal).toBe('open vlc');
    });

    it('decomposes sequential conjunctions with project manifest preconditions', async () => {
      const res = await classifier.classify('build project and then run tests');
      expect(res.isComplex).toBe(true);
      expect(res.suggestedSteps?.length).toBe(2);
      expect(res.suggestedSteps![0].goal).toBe('build project');
      expect(res.suggestedSteps![0].precondition_check).toContain('package.json');
      expect(res.suggestedSteps![0].if_precondition_false).toBe('abort');
      expect(res.suggestedSteps![1].goal).toBe('run tests');
    });
  });

  describe('Latency Budget & CPU Partitioning (Tasks 0.75.8 & 0.75.9)', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('enforces CPU execution by sending num_gpu: 0 in request payload', async () => {
      let capturedBody: any;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({
          response: JSON.stringify({
            domain: 'application',
            action: 'open',
            confidence: 0.95
          })
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const res = await classifier.classify('open firefox', { endpointUrl: 'http://127.0.0.1:11434' });
      expect(capturedBody).toBeDefined();
      expect(capturedBody.options?.num_gpu).toBe(0); // Task 0.75.9: Strictly CPU execution
      expect(res.domain).toBe('application');
      expect(res.executionTier).toBe('intent_cpu');
    });

    it('times out and gracefully falls back within hard budget if model stalls', async () => {
      // Mock fetch that hangs past the timeout
      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      const start = performance.now();
      const res = await classifier.classify('open nvim', {
        endpointUrl: 'http://127.0.0.1:11434',
        timeoutMs: 50 // Short timeout for unit test speed
      });
      const elapsed = performance.now() - start;

      // Completed quickly and recovered via heuristic
      expect(elapsed).toBeLessThan(500);
      expect(res.domain).toBe('application');
      expect(res.action).toBe('open');
      expect(res.executionTier).toBe('intent_cpu');
    });
  });
});

describe('LocalIntentClassifier endpoint opt-in', () => {
  it('never calls a model server unless an intent endpoint is configured', async () => {
    const fetchSpy = vi.fn();
    const original = global.fetch;
    global.fetch = fetchSpy as any;
    try {
      const res = await new LocalIntentClassifier().classify('check battery status');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(res.executionTier).toBe('intent_cpu');
    } finally {
      global.fetch = original;
    }
  });
});
