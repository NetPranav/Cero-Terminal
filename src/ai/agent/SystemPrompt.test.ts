import { describe, it, expect, vi } from 'vitest';
import { buildSystemPrompt, buildStaticPromptPrefix, ToolSpec } from './SystemPrompt';

describe('SystemPrompt — Shell-Native Autonomous Copilot Prompt', () => {
  const mockTools: ToolSpec[] = [
    { id: 'shell.execute', name: 'Execute Shell Command', description: 'Run shell command', parameters: [{ name: 'command', type: 'string', required: true, description: '' }] }
  ];

  it('builds shell-native system prompt for macOS with zero-refusal rules and JSON contract', () => {
    const prompt = buildSystemPrompt(mockTools, { os: 'mac', cwd: '/Users/test/projects' });
    expect(prompt).toContain('You are Sentinel, an autonomous mac terminal AI copilot.');
    expect(prompt).toContain('Working Directory: /Users/test/projects');
    expect(prompt).toContain('Shell: /bin/zsh');
    expect(prompt).toContain('CRITICAL RULES:');
    expect(prompt).toContain('YOU MUST NEVER REFUSE ACTIONABLE SYSTEM REQUESTS');
    expect(prompt).toContain('JSON CONTRACT:');
    expect(prompt).toContain('{"action": "execute", "command": "<terminal_command>", "explanation": "<1-line plain English explanation of what this command will do>"}');
  });

  it('builds shell-native system prompt for Windows with PowerShell', () => {
    const prompt = buildSystemPrompt(mockTools, { os: 'windows', cwd: 'C:\\Users\\test' });
    expect(prompt).toContain('Shell: powershell');
    expect(prompt).toContain('Working Directory: C:\\Users\\test');
  });

  it('includes key terminal command examples for fast Spotlight, network, and port queries', () => {
    const prompt = buildSystemPrompt(mockTools, { os: 'mac', cwd: '/workspace' });
    expect(prompt).toContain('mdfind');
    expect(prompt).toContain('networksetup');
    expect(prompt).toContain('lsof');
    expect(prompt).toContain('pmset');
  });

  it('keeps a byte-identical static prefix across requests so the KV/prompt cache is reused', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
      const a = buildSystemPrompt([], { os: 'linux', cwd: '/home/u/a' }, 'check disk');
      vi.setSystemTime(new Date('2026-09-28T17:31:45Z'));
      const b = buildSystemPrompt([], { os: 'linux', cwd: '/home/u/b' }, 'list ports');
      const prefix = buildStaticPromptPrefix('linux');
      expect(a.startsWith(prefix)).toBe(true);
      expect(b.startsWith(prefix)).toBe(true);
      // Nothing request-specific may leak into the cached prefix
      expect(prefix).not.toContain('/home/u/');
      expect(prefix).not.toContain('2026');
      expect(a.slice(prefix.length)).toContain('Working Directory: /home/u/a');
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for concrete, grounded, emoji-free summaries', () => {
    const prefix = buildStaticPromptPrefix('linux');
    expect(prefix).toContain('ANSWER QUALITY');
    expect(prefix).toContain('Only report facts present in <TOOL_OUTPUT>');
  });
});
