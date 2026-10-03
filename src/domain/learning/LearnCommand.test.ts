import { describe, it, expect } from 'vitest';
import { decideLearn, candidateFromRun, isBareLearn, LEARN_WINDOW_MS } from './LearnCommand';

const ok = { success: true, steps: [{ tool: 'shell.execute', params: { command: 'tar -czf a.tgz a' }, result: { success: true } }] };

describe('learning only when flagged', () => {
  it('offers a candidate only for a request that worked with one command', () => {
    expect(candidateFromRun('compress a', ok, 1000)).toMatchObject({ goal: 'compress a', command: 'tar -czf a.tgz a', source: 'ran' });
    expect(candidateFromRun('x', { ...ok, success: false })).toBeNull();
    expect(candidateFromRun('x', { success: true, steps: [] })).toBeNull();
    expect(candidateFromRun('x', { success: true, steps: [ok.steps[0], ok.steps[0]] })).toBeNull();
    expect(candidateFromRun('x', { success: true, steps: [{ ...ok.steps[0], result: { success: false } }] })).toBeNull();
  });

  it('a failed request is never learnable', () => {
    const failed = candidateFromRun('compress a', { success: false, steps: ok.steps });
    expect(decideLearn(failed).kind).toBe('refuse');
  });

  it('learns the candidate when asked, and only while it is recent', () => {
    const c = { goal: 'g', command: 'c', at: 1000, source: 'typed' as const };
    expect(decideLearn(c, 2000)).toEqual({ kind: 'learn', goal: 'g', command: 'c', source: 'typed' });
    expect(decideLearn(c, 1000 + LEARN_WINDOW_MS + 1).kind).toBe('refuse');
  });

  it('with no candidate it says why', () => {
    const d = decideLearn(null);
    expect(d.kind).toBe('refuse');
    if (d.kind === 'refuse') expect(d.reason).toContain('nothing to learn');
  });

  it('recognises a bare /learn only', () => {
    expect(isBareLearn('/learn')).toBe(true);
    expect(isBareLearn('  /learn  ')).toBe(true);
    expect(isBareLearn('/learn compress -> tar')).toBe(false);
    expect(isBareLearn('/learned')).toBe(false);
  });
});
