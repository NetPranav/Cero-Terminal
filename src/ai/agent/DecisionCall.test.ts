import { describe, it, expect } from 'vitest';
import { buildDecisionCall, formatConversationPrompt } from './DecisionCall';

describe('DecisionCall', () => {
  it('formats conversation prompt with system prompt and alternating messages', () => {
    const prompt = formatConversationPrompt('You are Sentinel.', [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '{"action":"chat"}' },
      { role: 'user', content: 'what is my ip' }
    ]);
    expect(prompt).toContain('You are Sentinel.\n\n');
    expect(prompt).toContain('User: hello\n');
    expect(prompt).toContain('Assistant: {"action":"chat"}\n');
    expect(prompt).toContain('User: what is my ip\n');
    expect(prompt.endsWith('Assistant: ')).toBe(true);
  });

  it('builds structured decision call with system prompt, history, and GBNF options', () => {
    const call = buildDecisionCall('check my ip', { os: 'linux', cwd: '/workspace' }, [
      { role: 'user', content: 'prior request' }
    ]);

    expect(call.systemPrompt).toBeDefined();
    expect(call.systemPrompt.length).toBeGreaterThan(100);
    expect(call.messages[0].role).toBe('system');
    expect(call.messages[1]).toEqual({ role: 'user', content: 'prior request' });
    expect(call.messages[2]).toEqual({ role: 'user', content: 'check my ip' });
    expect(call.fullPrompt).toContain('User: check my ip');
    expect(call.options.format).toBe('json');
    expect(call.options.maxTokens).toBe(400);
    expect(call.options.grammar).toBeDefined();
    expect(call.options.mode).toBe('decision');

    const plannerCall = buildDecisionCall('make a plan', { os: 'linux', cwd: '/workspace' }, [], {
      isPlanner: true
    });
    expect(plannerCall.options.maxTokens).toBe(1024);
  });

  it('honors custom systemPrompt and messages passed in extra', () => {
    const customPrompt = 'Custom System Rules';
    const customMessages = [{ role: 'user', content: 'custom prompt' }];
    const call = buildDecisionCall('ignored goal', { os: 'linux', cwd: '/test' }, [], {
      systemPrompt: customPrompt,
      messages: customMessages
    });

    expect(call.systemPrompt).toBe(customPrompt);
    expect(call.messages[0]).toEqual({ role: 'system', content: customPrompt });
    expect(call.messages[1]).toEqual({ role: 'user', content: 'custom prompt' });
  });
});
