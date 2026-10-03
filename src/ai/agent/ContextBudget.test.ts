import { describe, it, expect } from 'vitest';
import { fitMessages, estimateTokens, trimToolOutput, CONTEXT_TOKENS, RESERVED_FOR_REPLY } from './ContextBudget';

describe('ContextBudget', () => {
  it('estimates tokens proportionally based on code/prompt length', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('a'.repeat(320))).toBe(100);
  });

  it('trims 20,000-character tool output to first 600 and last 400 chars', () => {
    const start = 'START_' + 'A'.repeat(594);
    const middle = 'M'.repeat(19000);
    const end = 'Z'.repeat(396) + '_END';
    const oversized = `${start}${middle}${end}`;
    expect(oversized.length).toBe(20000);

    const trimmed = trimToolOutput(oversized);
    expect(trimmed.startsWith('START_')).toBe(true);
    expect(trimmed.endsWith('_END')).toBe(true);
    expect(trimmed).toContain('[... 19000 characters removed ...]');
    expect(trimmed.length).toBeLessThan(1200);
  });

  it('keeps system prompt whole and keeps newest user message', () => {
    const system = 'You are Cero AI rules prompt.';
    const history = [
      { role: 'user', content: 'older question' },
      { role: 'assistant', content: 'older answer' },
      { role: 'user', content: 'newest user request' }
    ];

    const result = fitMessages(system, history, 1000);
    expect(result.messages[0]).toEqual({ role: 'system', content: system });
    expect(result.messages[result.messages.length - 1].content).toBe('newest user request');
  });

  it('drops oldest history first when budget is constrained', () => {
    const system = 'Short system rules.';
    const history = [
      { role: 'user', content: 'first very old message: ' + 'x'.repeat(1500) },
      { role: 'assistant', content: 'second old message: ' + 'y'.repeat(1500) },
      { role: 'user', content: 'recent context: ' + 'z'.repeat(200) },
      { role: 'user', content: 'current newest goal' }
    ];

    // Budget fits system (~6 tokens) + newest goal (~6 tokens) + recent context (~70 tokens) = ~82 tokens, but not the 1500-char old messages
    const budget = 250;
    const result = fitMessages(system, history, budget);

    expect(result.dropped).toBeGreaterThanOrEqual(1);
    expect(result.messages[0].content).toBe(system);
    expect(result.messages[result.messages.length - 1].content).toBe('current newest goal');
    // Oldest message should have been dropped first
    expect(result.messages.some(m => m.content.includes('first very old message'))).toBe(false);
  });

  it('ensures total token estimation stays within budget', () => {
    const system = 'System prompt ' + 'S'.repeat(800);
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}: ` + 'C'.repeat(600)
    }));

    const budget = 1200;
    const result = fitMessages(system, history, budget);

    const totalEstimatedTokens = result.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    expect(totalEstimatedTokens).toBeLessThanOrEqual(budget);
    expect(result.messages[0].content).toBe(system);
    expect(result.messages[result.messages.length - 1].content).toBe(history[history.length - 1].content);
  });

  it('allows dynamic context token configuration', async () => {
    const { getContextTokens, setContextTokens } = await import('./ContextBudget');
    expect(getContextTokens()).toBeGreaterThan(0);
    setContextTokens(12288);
    expect(getContextTokens()).toBe(12288);
    setContextTokens(8192);
    expect(getContextTokens()).toBe(8192);
  });
});
