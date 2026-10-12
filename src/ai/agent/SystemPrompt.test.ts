import { describe, it, expect, vi } from 'vitest';
import { buildSystemPrompt, buildStaticPromptPrefix, ToolSpec } from './SystemPrompt';

describe('SystemPrompt — Shell-Native Autonomous Copilot Prompt', () => {
  const mockTools: ToolSpec[] = [
    { id: 'shell.execute', name: 'Execute Shell Command', description: 'Run shell command', parameters: [{ name: 'command', type: 'string', required: true, description: '' }] }
  ];

  it('builds a PowerShell system prompt with zero-refusal rules and the JSON contract', () => {
    const prompt = buildSystemPrompt(mockTools, { os: 'windows', cwd: 'C:\\Users\\test' });
    expect(prompt).toContain('You are Cero, an autonomous windows terminal AI copilot.');
    expect(prompt).toContain('Shell: powershell');
    expect(prompt).toContain('Working Directory: C:\\Users\\test');
    expect(prompt).toContain('CRITICAL RULES:');
    expect(prompt).toContain('YOU MUST NEVER REFUSE ACTIONABLE SYSTEM REQUESTS');
    expect(prompt).toContain('JSON CONTRACT:');
    expect(prompt).toContain('{"action": "execute", "command": "<terminal_command>", "explanation": "<1-line plain English explanation of what this command will do>"}');
  });

  it('gives PowerShell examples and Windows tools, never macOS or Linux ones', () => {
    const prompt = buildStaticPromptPrefix('windows');
    for (const expected of ['Get-ChildItem', 'Get-NetTCPConnection', 'Get-Process', 'winget install']) {
      expect(prompt).toContain(expected);
    }
    for (const unwanted of ['mdfind', 'networksetup', 'pmset', 'pacman', 'hyprctl', '/bin/zsh', 'zen-browser']) {
      expect(prompt).not.toContain(unwanted);
    }
  });

  it('keeps a byte-identical static prefix across requests so the KV/prompt cache is reused', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
      const a = buildSystemPrompt([], { os: 'windows', cwd: 'C:\\Users\\u\\a' }, 'check disk');
      vi.setSystemTime(new Date('2026-09-28T17:31:45Z'));
      const b = buildSystemPrompt([], { os: 'windows', cwd: 'C:\\Users\\u\\b' }, 'list ports');
      const prefix = buildStaticPromptPrefix('windows');
      expect(a.startsWith(prefix)).toBe(true);
      expect(b.startsWith(prefix)).toBe(true);
      // Nothing request-specific may leak into the cached prefix
      expect(prefix).not.toContain('C:\\Users\\u');
      expect(prefix).not.toContain('2026');
      expect(a.slice(prefix.length)).toContain('Working Directory: C:\\Users\\u\\a');
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for concrete, grounded, emoji-free summaries', () => {
    const prefix = buildStaticPromptPrefix('windows');
    expect(prefix).toContain('ANSWER QUALITY');
    expect(prefix).toContain('Only report facts present in <TOOL_OUTPUT>');
  });
});
