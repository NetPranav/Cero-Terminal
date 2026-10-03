import { describe, it, expect } from 'vitest';
import { APP_ALIASES, aliasTargets } from './appAliases';

describe('appAliases', () => {
  it('every key is lower case and maps to at least one name', () => {
    for (const [key, names] of Object.entries(APP_ALIASES)) {
      expect(key).toBe(key.toLowerCase());
      expect(names.length).toBeGreaterThan(0);
    }
  });
  it('looks up by any spacing or case', () => {
    expect(aliasTargets('  VS   Code ')).toContain('Visual Studio Code');
    expect(aliasTargets('nope')).toEqual([]);
  });
});
