import { describe, it, expect } from 'vitest';
import { findFastPath } from './AgentLoop';

describe('Search Query Parsing & Fast Path', () => {
  it('correctly extracts "frontend" and directory type from conversational queries', () => {
    const res1 = findFastPath('Hey there can you find all the frontend folders in my system');
    expect(res1).not.toBeNull();
    expect(res1?.tool).toBe('filesystem.search');
    expect(res1?.params.pattern).toBe('frontend');
    expect(res1?.params.type).toBe('directory');
    expect(res1?.params.dir).toBe('~');

    const res2 = findFastPath('can you find all the frontend folders');
    expect(res2?.params.pattern).toBe('frontend');
    expect(res2?.params.type).toBe('directory');

    const res3 = findFastPath('tell me all the folders named as fronted in my system with there paths');
    expect(res3?.params.pattern).toBe('fronted');
    expect(res3?.params.type).toBe('directory');
    expect(res3?.params.dir).toBe('~');
  });
});
