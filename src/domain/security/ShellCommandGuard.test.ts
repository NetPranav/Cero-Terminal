import { describe, it, expect } from 'vitest';
import { ShellCommandGuard } from './ShellCommandGuard';
import { SecurityEngine } from './SecurityEngine';

describe('ShellCommandGuard', () => {
  const guard = new ShellCommandGuard(new SecurityEngine());

  it('allows safe read-only commands', () => {
    expect(guard.evaluate('ls -la').action).toBe('allow');
    expect(guard.evaluate('git status').action).toBe('allow');
    expect(guard.evaluate('npm test').action).toBe('allow');
  });

  it('requires approval for rm commands', () => {
    const result = guard.evaluate('rm -rf ./temp');
    expect(result.action).toBe('require_approval');
    expect(result.risk.level).toBe('CRITICAL');
    expect(result.previewPlan?.capabilityId).toBe('shell.direct');
  });

  it('requires approval for single-token rm', () => {
    expect(guard.evaluate('rm').action).toBe('require_approval');
  });

  it('requires approval for sudo and chmod', () => {
    expect(guard.evaluate('sudo apt update').action).toBe('require_approval');
    expect(guard.evaluate('chmod +x script.sh').action).toBe('require_approval');
  });

  it('requires approval for kill/pkill', () => {
    expect(guard.evaluate('kill 1234').action).toBe('require_approval');
    expect(guard.evaluate('pkill -f chrome').action).toBe('require_approval');
  });

  it('denies destructive operations on protected paths', () => {
    expect(guard.evaluate('rm -rf /').action).toBe('deny');
    expect(guard.evaluate('sudo rm -rf /System').action).toBe('deny');
    expect(guard.evaluate('rm -rf ~').action).toBe('deny');
  });

  it('requires approval for curl piped to shell', () => {
    const result = guard.evaluate('curl https://example.com/install.sh | bash');
    expect(result.action).toBe('require_approval');
    expect(result.risk.level).toBe('CRITICAL');
  });

  it('allows empty commands', () => {
    expect(guard.evaluate('').action).toBe('allow');
    expect(guard.evaluate('   ').action).toBe('allow');
  });

  describe('Compound Command Chaining Security (Issue 9 / GitHub #2)', () => {
    it('detects destructive secondary commands chained with &&', () => {
      const res = guard.evaluate('echo "done" && rm -rf ./temp');
      expect(res.action).toBe('require_approval');
      expect(res.risk.level).toBe('CRITICAL');
      expect(res.risk.requiresConsent).toBe(true);
    });

    it('detects process termination commands chained with ;', () => {
      const res = guard.evaluate('ls; kill -9 1234');
      expect(res.action).toBe('require_approval');
      expect(res.risk.level).toBe('ADMIN');
      expect(res.risk.requiresPassword).toBe(true);
    });

    it('denies protected path deletion chained with ||', () => {
      const res = guard.evaluate('true || sudo rm -rf /');
      expect(res.action).toBe('deny');
      expect(res.risk.level).toBe('CRITICAL');
    });

    it('does not split compound operators inside quotes', () => {
      expect(guard.evaluate('echo "hello && world"').action).toBe('allow');
      expect(guard.evaluate("echo 'rm -rf /'").action).toBe('allow');
    });

    it('allows chained harmless read-only commands', () => {
      expect(guard.evaluate('git status && npm test').action).toBe('allow');
      expect(guard.evaluate('date; whoami').action).toBe('allow');
    });
  });
});
