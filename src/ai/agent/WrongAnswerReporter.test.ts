import { describe, it, expect } from 'vitest';
import { formatWrongAnswerCase, copyWrongAnswerToClipboard } from './WrongAnswerReporter';

describe('WrongAnswerReporter', () => {
  it('formats a wrong answer case matching cases.json structure', () => {
    const jsonStr = formatWrongAnswerCase(
      'open gitBrains in vs code',
      'Qwen2.5-Coder-3B',
      { command: 'code /tmp/wrong_folder', tool: 'shell.execute' }
    );

    const parsed = JSON.parse(jsonStr);
    expect(parsed.id).toMatch(/^reported-open-gitbrains-in-vs-code-/);
    expect(parsed.prompt).toBe('open gitBrains in vs code');
    expect(parsed.model).toBe('Qwen2.5-Coder-3B');
    expect(parsed.expect).toBeDefined();
    expect(parsed.expect.tool).toBe('execute');
    expect(parsed.expect.must_not_include).toContain('rm -rf');
    expect(parsed.expect.must_not_include).toContain('sudo');
  });

  it('redacts secrets and passwords from reported cases', () => {
    const jsonStr = formatWrongAnswerCase(
      'curl api with password=secret123',
      'Qwen2.5-Coder-3B',
      'curl -u admin:password=secret123 https://api.example.com'
    );

    expect(jsonStr).not.toContain('secret123');
    expect(jsonStr).toContain('[REDACTED]');
  });

  it('safely copies to clipboard', async () => {
    const ok = await copyWrongAnswerToClipboard(
      'test prompt',
      'test-model',
      'ls -la'
    );
    // In node/test environment, returns false or true without throwing
    expect(typeof ok).toBe('boolean');
  });
});
