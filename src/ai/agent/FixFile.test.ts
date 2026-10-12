import { describe, it, expect } from 'vitest';
import { parseFixFileRequest, runCommandFor, extractCodeBlock, extractFixNote, lineDiff } from './FixFile';

describe('FixFile', () => {
  it('parses fix requests with an optional goal', () => {
    expect(parseFixFileRequest('fix buggy.py so it runs and prints the correct total')).toEqual({ file: 'buggy.py', want: 'runs and prints the correct total' });
    expect(parseFixFileRequest('fix the bugs in src/app.js')).toEqual({ file: 'src/app.js', want: undefined });
    expect(parseFixFileRequest('fix my wifi')).toBeNull();
    expect(parseFixFileRequest('fix README.md')).toBeNull();
  });

  it('picks the interpreter per OS', () => {
    expect(runCommandFor('a b.py', 'macos')).toBe("python3 'a b.py'");
    expect(runCommandFor('x.py', 'windows')).toBe("python 'x.py'");
    expect(runCommandFor('x.sh', 'windows')).toBeNull();
    expect(runCommandFor('x.ts', 'linux')).toBeNull();
  });

  it('extracts the corrected file and the note', () => {
    const reply = 'Here you go:\n```python\ntotal = 0\nprint(total)\n```\nFix: items mixed strings and numbers.';
    expect(extractCodeBlock(reply)).toBe('total = 0\nprint(total)\n');
    expect(extractFixNote(reply)).toBe('items mixed strings and numbers.');
    expect(extractCodeBlock('no code here')).toBeNull();
  });

  it('shows only the changed lines', () => {
    expect(lineDiff('a\nb\nc\n', 'a\nB\nc\n')).toBe('- b\n+ B');
  });
});
