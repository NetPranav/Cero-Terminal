import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { posixQuote, powershellQuote, hasControlChars, changeDirectoryLine } from './shellQuote';

describe('shellQuote', () => {
  it('quotes so that nothing inside is expanded or run', () => {
    expect(posixQuote("it's")).toBe("'it'\\''s'");
    expect(powershellQuote("it's")).toBe("'it''s'");
    expect(changeDirectoryLine('/tmp/a b', false)).toBe("cd '/tmp/a b'\n");
    expect(changeDirectoryLine('C:\\Users\\me', true)).toBe("Set-Location -LiteralPath 'C:\\Users\\me'\r");
    expect(hasControlChars('a\nb')).toBe(true);
    expect(hasControlChars('a b')).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('a real shell treats hostile names as plain text', () => {
    for (const name of ['$(echo PWNED)', '`echo PWNED`', '"; echo PWNED; "', "'; echo PWNED; '", '$HOME', '*']) {
      const out = spawnSync('sh', ['-c', `printf %s ${posixQuote(name)}`], { encoding: 'utf8' });
      expect(out.stdout).toBe(name);
    }
  });
});
