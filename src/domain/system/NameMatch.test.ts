import { describe, it, expect } from 'vitest';
import { normalizeName, compactName, scoreName, rankNames } from './NameMatch';

describe('NameMatch', () => {
  it('normalizes spellings', () => {
    expect(normalizeName('gitBrains')).toBe('git brains');
    expect(normalizeName('git-brains')).toBe('git brains');
    expect(normalizeName('Git_Brains.')).toBe('git brains');
    expect(compactName('HTTPServer')).toBe('httpserver');
  });

  it('treats the five spellings of gitbrains as the same name', () => {
    const spellings = ['gitBrains', 'gitbrains', 'git-brains', 'git_brains', 'Git Brains'];
    for (const a of spellings) for (const b of spellings) {
      expect(scoreName(a, b).score).toBeGreaterThanOrEqual(95);
    }
  });

  it('exact beats same letters', () => {
    expect(scoreName('gitBrains', 'gitBrains')).toEqual({ score: 100, why: 'exact' });
    expect(scoreName('gitBrains', 'git-brains').why).toBe('same-letters');
  });

  it('prefix, word, contains and typo levels', () => {
    expect(scoreName('git', 'gitbrains').why).toBe('prefix');
    expect(scoreName('brains', 'git brains').why).toBe('word');
    expect(scoreName('brain', 'my-gitbrains-app').why).toBe('contains');
    const typo = scoreName('gitbrian', 'gitbrains');
    expect(typo.why).toBe('typo');
    expect(typo.score).toBeLessThan(60);
    expect(scoreName('zzzz', 'gitbrains')).toEqual({ score: 0, why: 'none' });
  });

  it('handles plural and a leading "the"', () => {
    expect(scoreName('the projects', 'project').score).toBeGreaterThanOrEqual(95);
  });

  it('ranks stably, ties alphabetical', () => {
    const r = rankNames('brains', ['b-brains', 'a-brains', 'gitbrains', 'unrelated'], n => n);
    expect(r.map(x => x.item)).toEqual(['a-brains', 'b-brains', 'gitbrains']);
    expect(rankNames('brains', ['x-brains', 'y-brains'], n => n, { limit: 1 })).toHaveLength(1);
  });

  it('scores a list of names per item by the best one', () => {
    const r = rankNames('code', [{ n: 'Visual Studio Code', a: ['code', 'vscode'] }], i => [i.n, ...i.a]);
    expect(r[0].score).toBe(100);
  });
});
