import { describe, it, expect } from 'vitest';
import { AutoRemediationPolicy } from './AutoRemediationPolicy';
import type { RemediationSuggestion } from './DeterministicRuleOracle';

const suggestion = (ruleId: string, extra: Partial<RemediationSuggestion> = {}): RemediationSuggestion => ({
  ruleId,
  ruleName: ruleId,
  title: ruleId,
  explanation: '',
  fixedCommand: 'echo fix',
  confidence: 0.99,
  ...extra
});

describe('AutoRemediationPolicy', () => {
  it('auto-applies only vetted fixes in auto-safe mode, with its own exact command', () => {
    const policy = new AutoRemediationPolicy(() => 0);
    const decision = policy.decide(suggestion('git_index_lock'), { mode: 'auto-safe', source: 'rule_oracle', cwd: "/home/u/it's repo" });
    expect(decision.action).toBe('auto');
    expect(decision.command).toBe("cd '/home/u/it'\\''s repo' && ! pgrep -x git >/dev/null && rm -f .git/index.lock");
  });

  it('never auto-installs packages suggested by untrusted output', () => {
    const policy = new AutoRemediationPolicy();
    for (const ruleId of ['npm_missing_package', 'python_missing_module', 'cargo_missing_crate', 'port_in_use_lsof_kill']) {
      expect(policy.decide(suggestion(ruleId), { mode: 'auto-safe', source: 'rule_oracle', cwd: '/w' }).action).toBe('propose');
    }
  });

  it('never auto-runs model output and respects off/suggest modes', () => {
    const policy = new AutoRemediationPolicy();
    expect(policy.decide(suggestion('git_index_lock'), { mode: 'auto-safe', source: 'model', cwd: '/w' }).action).toBe('propose');
    expect(policy.decide(suggestion('git_index_lock'), { mode: 'suggest', source: 'rule_oracle', cwd: '/w' }).action).toBe('propose');
    expect(policy.decide(suggestion('git_index_lock'), { mode: 'off', source: 'rule_oracle', cwd: '/w' }).action).toBe('ignore');
    expect(policy.decide(suggestion('git_index_lock', { requiresElevation: true }), { mode: 'auto-safe', source: 'rule_oracle', cwd: '/w' }).action).toBe('propose');
  });

  it('does not repeat a fix for the same directory within the window, and caps the hourly count', () => {
    let now = 0;
    const policy = new AutoRemediationPolicy(() => now);
    const s = suggestion('git_index_lock');
    const opts = { mode: 'auto-safe' as const, source: 'rule_oracle' as const, cwd: '/w' };
    expect(policy.decide(s, opts).action).toBe('auto');
    policy.recordApplied(s, '/w');
    now += 60_000;
    expect(policy.decide(s, opts).action).toBe('propose');
    now += AutoRemediationPolicy.REPEAT_WINDOW_MS;
    expect(policy.decide(s, opts).action).toBe('auto');

    for (let i = 0; i < AutoRemediationPolicy.MAX_AUTO_PER_HOUR; i++) policy.recordApplied(s, `/other/${i}`);
    expect(policy.decide(s, { ...opts, cwd: '/fresh' }).action).toBe('propose');
  });
});
