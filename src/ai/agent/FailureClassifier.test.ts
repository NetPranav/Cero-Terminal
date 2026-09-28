import { describe, it, expect } from 'vitest';
import { FailureClassifier } from './FailureClassifier';

describe('FailureClassifier — Failure Classification Before Retry (0.5.10)', () => {
  describe('MISSING_BINARY (Unrecoverable without installing software)', () => {
    it('should classify exit code 127 as MISSING_BINARY', () => {
      const res = FailureClassifier.classify('zsh: command not found: fuser', 127, 'fuser 3000/tcp');
      expect(res.category).toBe('MISSING_BINARY');
      expect(res.recoverable).toBe(false);
      expect(res.missingBinary).toBe('fuser');
      expect(res.suggestedAction).toContain('Install "fuser"');
    });

    it('should classify bash command not found error as MISSING_BINARY', () => {
      const res = FailureClassifier.classify('bash: jq: command not found', 1, 'jq .data.id');
      expect(res.category).toBe('MISSING_BINARY');
      expect(res.recoverable).toBe(false);
      expect(res.missingBinary).toBe('jq');
    });

    it('should classify which: no binary as MISSING_BINARY', () => {
      const res = FailureClassifier.classify('which: no ffmpeg in (/usr/bin:/bin)', 1, 'which ffmpeg');
      expect(res.category).toBe('MISSING_BINARY');
      expect(res.recoverable).toBe(false);
      expect(res.missingBinary).toBe('ffmpeg');
    });
  });

  describe('PERMISSION_DENIED (Unrecoverable without privilege escalation)', () => {
    it('should classify exit code 126 as PERMISSION_DENIED', () => {
      const res = FailureClassifier.classify('/usr/local/bin/vpn: Permission denied', 126, 'vpn connect');
      expect(res.category).toBe('PERMISSION_DENIED');
      expect(res.recoverable).toBe(false);
      expect(res.suggestedAction).toContain('sudo');
    });

    it('should classify must be root errors as PERMISSION_DENIED', () => {
      const res = FailureClassifier.classify('apt-get: error: must be run as root', 100, 'apt-get install htop');
      expect(res.category).toBe('PERMISSION_DENIED');
      expect(res.recoverable).toBe(false);
    });

    it('should classify operation not permitted as PERMISSION_DENIED', () => {
      const res = FailureClassifier.classify('chown: /etc/hosts: Operation not permitted', 1, 'chown user /etc/hosts');
      expect(res.category).toBe('PERMISSION_DENIED');
      expect(res.recoverable).toBe(false);
    });
  });

  describe('WRONG_FLAG (Recoverable via ReAct loop self-healing)', () => {
    it('should classify unrecognized option as WRONG_FLAG and extract the flag', () => {
      const res = FailureClassifier.classify('grep: unrecognized option `--perl-regexp`', 2, 'grep --perl-regexp "pattern"');
      expect(res.category).toBe('WRONG_FLAG');
      expect(res.recoverable).toBe(true);
      expect(res.flag).toBe('--perl-regexp');
    });

    it('should classify illegal option as WRONG_FLAG', () => {
      const res = FailureClassifier.classify('ps: illegal option -- P', 1, 'ps -P');
      expect(res.category).toBe('WRONG_FLAG');
      expect(res.recoverable).toBe(true);
      expect(res.flag).toBe('-P');
    });

    it('should classify invalid argument as WRONG_FLAG', () => {
      const res = FailureClassifier.classify('sed: invalid option -- i', 1, 'sed -i');
      expect(res.category).toBe('WRONG_FLAG');
      expect(res.recoverable).toBe(true);
    });
  });

  describe('SYNTAX_ERROR (Recoverable via ReAct loop self-healing)', () => {
    it('should classify shell syntax errors near token', () => {
      const res = FailureClassifier.classify('zsh: parse error near `;;`', 1, 'if true; then echo ;; fi');
      expect(res.category).toBe('SYNTAX_ERROR');
      expect(res.recoverable).toBe(true);
      expect(res.suggestedAction).toContain('valid POSIX quoting');
    });

    it('should classify unmatched quotes as SYNTAX_ERROR', () => {
      const res = FailureClassifier.classify('bash: unexpected EOF while looking for matching `"`', 2, 'echo "hello');
      expect(res.category).toBe('SYNTAX_ERROR');
      expect(res.recoverable).toBe(true);
    });
  });

  describe('TRANSIENT (Recoverable via retry)', () => {
    it('should classify network timeout as TRANSIENT', () => {
      const res = FailureClassifier.classify('curl: (28) Connection timed out after 5000 milliseconds', 28, 'curl https://api.io');
      expect(res.category).toBe('TRANSIENT');
      expect(res.recoverable).toBe(true);
    });

    it('should classify temporary DNS resolution failure as TRANSIENT', () => {
      const res = FailureClassifier.classify('ping: temporary failure in name resolution', 2, 'ping example.com');
      expect(res.category).toBe('TRANSIENT');
      expect(res.recoverable).toBe(true);
    });
  });

  describe('UNKNOWN (Default handling)', () => {
    it('should default to UNKNOWN and allow self-healing retry', () => {
      const res = FailureClassifier.classify('Application error: key not found in dictionary', 1, 'python3 run.py');
      expect(res.category).toBe('UNKNOWN');
      expect(res.recoverable).toBe(true);
    });
  });

  it('classifies a Sentinel execution timeout as a recoverable TIMEOUT with scoping guidance', () => {
    const res = FailureClassifier.classify('[sentinel] command timed out after 300000 ms and was terminated', 124, 'find / -name foo');
    expect(res.category).toBe('TIMEOUT');
    expect(res.recoverable).toBe(true);
    expect(res.suggestedAction).toContain('Narrow the scope');
  });
});
