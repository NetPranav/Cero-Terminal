import { describe, it, expect } from 'vitest';
import { parseDirectoryAction } from './DirectoryActionParser';

describe('DirectoryActionParser', () => {
  const phrasings = [
    { input: 'make a folder called demo', kind: 'mkdir', target: 'demo' },
    { input: 'create directory temp', kind: 'mkdir', target: 'temp' },
    { input: 'create a new folder named test', kind: 'mkdir', target: 'test' },
    { input: 'mkdir my_project', kind: 'mkdir', target: 'my_project' },
    { input: 'list files in current directory', kind: 'list', target: undefined },
    { input: 'show directory contents', kind: 'list', target: undefined },
    { input: 'list all files', kind: 'list', target: undefined },
    { input: 'list files in src', kind: 'list', target: 'src' },
    { input: 'show files in dist', kind: 'list', target: 'dist' },
    { input: 'cd into src', kind: 'cd', target: 'src' },
    { input: 'change directory to projects', kind: 'cd', target: 'projects' },
    { input: 'switch to directory build', kind: 'cd', target: 'build' },
    { input: 'go to folder docs', kind: 'cd', target: 'docs' }
  ];

  for (const { input, kind, target } of phrasings) {
    it(`parses "${input}" -> kind: "${kind}", target: "${target}"`, () => {
      const parsed = parseDirectoryAction(input);
      expect(parsed).not.toBeNull();
      expect(parsed?.kind).toBe(kind);
      if (target) {
        expect(parsed?.targetPath).toBe(target);
      }
    });
  }

  it('rejects ambiguous or destructive commands', () => {
    expect(parseDirectoryAction('rm -rf temp')).toBeNull();
    expect(parseDirectoryAction('delete folder test')).toBeNull();
    expect(parseDirectoryAction('open folder in vscode')).toBeNull();
  });
});
