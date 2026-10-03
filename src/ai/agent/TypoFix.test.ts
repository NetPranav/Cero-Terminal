import { describe, it, expect } from 'vitest';
import { fixTypos } from './TypoFix';

describe('fixTypos', () => {
  const rows: Array<[string, string]> = [
    ['opne fldor docs in cod', 'open folder docs in code'],
    ['gt sttus', 'git status'],
    ['fnd al .log fiels', 'find all .log files'],
    ['kil prt 3000', 'kill port 3000'],
    ['opn firefoc', 'open firefoc'],
    ['mkdr prject nd cd into it', 'mkdir project and cd into it'],
    ['qut slck', 'quit slck'],
    ['whch brnch am i on', 'which branch am i on'],
    ['shw git dif', 'show git diff'],
    ['clos port 8000', 'close port 8000'],
    ['lsit files in src', 'list files in src'],
    ['instl express', 'install express'],
    ['fnd fil main.rs', 'find file main.rs'],
  ];
  for (const [input, want] of rows) it(`${input} -> ${want}`, () => expect(fixTypos(input)).toBe(want));

  it('leaves correct requests, commands, names and paths alone', () => {
    for (const t of ['open firefox', 'git push origin main', 'ls -la', 'touch foo.txt', 'tar xzf a.tgz', 'find lodsh in src', 'open Main.rs', 'run npm test', 'kill 1234',
      'fine, thanks', 'quite a lot of files', 'what is the capital of France?', 'mkdir -p a/b', 'install lodsh', 'open ~/Projects/gitBrains in code']) {
      expect(fixTypos(t)).toBe(t);
    }
  });
  it('does nothing to prose that is not a request', () => {
    expect(fixTypos('the opne door was fine')).toBe('the opne door was fine');
  });
  it('leaves app names to the app finder, which asks before guessing', () => {
    expect(fixTypos('open crome')).toBe('open crome');
  });
  it('keeps the original spacing', () => {
    expect(fixTypos('opne   cod')).toBe('open   code');
  });
});
