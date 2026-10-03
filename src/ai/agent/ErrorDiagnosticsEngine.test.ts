import { describe, it, expect } from 'vitest';
import { ErrorDiagnosticsEngine } from './ErrorDiagnosticsEngine';

describe('ErrorDiagnosticsEngine', () => {
  describe('Port collision detection (EADDRINUSE)', () => {
    it('should diagnose EADDRINUSE and generate port cleanup remediation', () => {
      const error = 'Error: listen EADDRINUSE: address already in use :::3000';
      const diagnosis = ErrorDiagnosticsEngine.diagnose(error, 'developer.scaffold', { port: 3000 });

      expect(diagnosis.category).toBe('SOFTWARE_RECOVERABLE');
      expect(diagnosis.cause).toContain('Port 3000 is occupied');
      expect(diagnosis.canRetry).toBe(true);
      expect(diagnosis.remediation).toBeDefined();
      expect(diagnosis.remediation?.tool).toBe('system.kill_process');
      expect(diagnosis.remediation?.params.port).toBe(3000);
    });

    it('should extract port number directly from error string if params omit it', () => {
      const error = 'Failed to start server: port 8080 is already bound';
      const diagnosis = ErrorDiagnosticsEngine.diagnose(error);

      expect(diagnosis.category).toBe('SOFTWARE_RECOVERABLE');
      expect(diagnosis.remediation?.params.port).toBe(8080);
    });
  });

  describe('Missing directory detection (ENOENT)', () => {
    it('should diagnose ENOENT and generate mkdir remediation', () => {
      const error = 'Error: ENOENT: no such file or directory, open "dist/bundle.js"';
      const diagnosis = ErrorDiagnosticsEngine.diagnose(error, 'filesystem.write', { path: 'dist' });

      expect(diagnosis.category).toBe('SOFTWARE_RECOVERABLE');
      expect(diagnosis.canRetry).toBe(true);
      expect(diagnosis.remediation).toBeDefined();
      expect(diagnosis.remediation?.tool).toBe('filesystem.mkdir');
      expect(diagnosis.remediation?.params.path).toBe('dist');
    });
  });

  describe('Stale lockfile detection', () => {
    it('should diagnose Git index.lock contention and propose deletion', () => {
      const error = 'fatal: Unable to create \'.git/index.lock\': File exists. Another git process seems to be running';
      const diagnosis = ErrorDiagnosticsEngine.diagnose(error, 'git.commit');

      expect(diagnosis.category).toBe('SOFTWARE_RECOVERABLE');
      expect(diagnosis.remediation?.tool).toBe('filesystem.delete');
      expect(diagnosis.remediation?.params.path).toBe('.git/index.lock');
    });
  });

  describe('Physical action detection', () => {
    it('should detect disconnected Bluetooth peripheral and require physical confirmation', () => {
      const error = 'blueutil: device not found or offline';
      const diagnosis = ErrorDiagnosticsEngine.diagnose(error, 'network.bluetooth.connect', { name: 'Soundcore Space One' });

      expect(diagnosis.category).toBe('PHYSICAL_ACTION_REQUIRED');
      expect(diagnosis.canRetry).toBe(true);
      expect(diagnosis.physicalPrompt).toBeDefined();
      expect(diagnosis.physicalPrompt).toContain('Soundcore Space One');
      expect(diagnosis.physicalPrompt).toContain('type "done" or press Enter');
    });

    it('should detect disconnected hardware USB cable', () => {
      const error = 'Error: USB device disconnected or hardware not responding';
      const diagnosis = ErrorDiagnosticsEngine.diagnose(error);

      expect(diagnosis.category).toBe('PHYSICAL_ACTION_REQUIRED');
      expect(diagnosis.physicalPrompt).toContain('Hardware device is disconnected');
    });

    it('should detect Wi-Fi hardware radio switch turned off', () => {
      const error = 'Network interface en0: Wi-Fi hardware is powered off';
      const diagnosis = ErrorDiagnosticsEngine.diagnose(error);

      expect(diagnosis.category).toBe('PHYSICAL_ACTION_REQUIRED');
      expect(diagnosis.physicalPrompt).toContain('Wi-Fi hardware adapter is switched off');
    });
  });

  describe('Phase 5.2 — DeterministicRuleOracle (thefuck Architecture) Integration', () => {
    it('diagnoses missing git upstream and provides exact git push command', () => {
      const error = `fatal: The current branch feat-payments has no upstream branch.
To push the current branch and set the remote as upstream, use

    git push --set-upstream origin feat-payments`;

      const diagnosis = ErrorDiagnosticsEngine.diagnose(error, 'shell.execute', { command: 'git push' });

      expect(diagnosis.category).toBe('SOFTWARE_RECOVERABLE');
      expect(diagnosis.canRetry).toBe(true);
      expect(diagnosis.remediation).toBeDefined();
      expect(diagnosis.remediation?.tool).toBe('shell.execute');
      expect(diagnosis.remediation?.params.command).toBe('git push --set-upstream origin feat-payments');
    });

    it('diagnoses Docker daemon stopped and suggests launching Docker Desktop', () => {
      const error = 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?';
      const diagnosis = ErrorDiagnosticsEngine.diagnose(error, 'shell.execute', { command: 'docker ps' });

      expect(diagnosis.category).toBe('SOFTWARE_RECOVERABLE');
      expect(diagnosis.remediation?.params.command).toContain('open -a Docker');
    });

    it('diagnoses command typo (gti -> git)', () => {
      const error = 'zsh: command not found: gti';
      const diagnosis = ErrorDiagnosticsEngine.diagnose(error, 'shell.execute', { command: 'gti status' });

      expect(diagnosis.category).toBe('SOFTWARE_RECOVERABLE');
      expect(diagnosis.remediation?.params.command).toBe('git status');
    });
  });

  describe('Fatal Unknown Error Fallback', () => {
    it('should classify unrecoverable syntax/binary failure as FATAL_UNKNOWN without infinite loop', () => {
      const error = 'Segmentation fault (core dumped)';
      const diagnosis = ErrorDiagnosticsEngine.diagnose(error);

      expect(diagnosis.category).toBe('FATAL_UNKNOWN');
      expect(diagnosis.canRetry).toBe(false);
      expect(diagnosis.remediation).toBeUndefined();
    });
  });
});
