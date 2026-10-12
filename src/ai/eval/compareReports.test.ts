import { describe, it, expect } from 'vitest';
import { compareReports, formatComparison } from './compareReports';

const api = { model: 'api', results: [
  { caseId: 'a', runs: 1, passes: 1 }, { caseId: 'b', runs: 1, passes: 1 }, { caseId: 'c', runs: 1, passes: 0 }, { caseId: 'only-api', runs: 1, passes: 1 },
] };
const builtin = { model: 'builtin', results: [
  { caseId: 'a', runs: 10, passes: 10 }, { caseId: 'b', runs: 10, passes: 6 }, { caseId: 'c', runs: 10, passes: 1 },
] };

describe('compareReports', () => {
  it('lists cases where the reference passes and the other is below 80%', () => {
    const { rows, gaps } = compareReports(api, builtin);
    expect(rows.map(r => r.caseId)).toEqual(['a', 'b', 'c']);
    expect(gaps.map(g => g.caseId)).toEqual(['b']);
  });
  it('a case the reference also fails is not a gap', () => {
    expect(compareReports(api, builtin).rows.find(r => r.caseId === 'c')!.gap).toBe(false);
  });
  it('prints a readable table and a summary line', () => {
    const text = formatComparison(api, builtin);
    expect(text).toContain('b | 1/1 | 6/10  <- gap');
    expect(text).toContain('1 case(s)');
    expect(formatComparison(api, { model: 'x', results: [{ caseId: 'a', runs: 1, passes: 1 }] })).toContain('No gaps.');
  });
});
