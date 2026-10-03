import { describe, it, expect } from 'vitest';
import { parseOpenRequest } from './OpenRequest';

describe('parseOpenRequest', () => {
  const rows: Array<[string, Record<string, unknown>]> = [
    ['open the folder gitBrains in vs code', { kind: 'folder', name: 'gitBrains', withApp: 'vs code' }],
    ['please open a folder named gitBrains in VS Code. This folder is inside /padhai_in_linux/Projects/', { kind: 'folder', name: 'gitBrains', withApp: 'VS Code', locationHint: '/padhai_in_linux/Projects/' }],
    ['open gitbrains with code', { kind: 'folder', name: 'gitbrains', withApp: 'code' }],
    ['open my project api in cursor', { kind: 'folder', name: 'api', withApp: 'cursor' }],
    ['open ~/Projects/gitBrains in code', { kind: 'folder', name: '~/Projects/gitBrains', withApp: 'code' }],
    ['launch vscode on the gitBrains directory under Projects', { kind: 'folder', name: 'gitBrains', locationHint: 'Projects' }],
    ['open file notes.txt in the Documents folder', { kind: 'file', name: 'notes.txt', locationHint: 'Documents' }],
    ['open the gitbrains folder', { kind: 'folder', name: 'gitbrains' }],
    ['open folder "My Projects"', { kind: 'folder', name: 'My Projects' }],
    ['open the folder gitBrains inside ~/work in zed', { kind: 'folder', name: 'gitBrains', locationHint: '~/work', withApp: 'zed' }],
    ['open folder api from /srv/apps with codium', { kind: 'folder', name: 'api', locationHint: '/srv/apps', withApp: 'codium' }],
    ['open the folder gitBrains. It is located in /home/me/Projects.', { kind: 'folder', name: 'gitBrains', locationHint: '/home/me/Projects' }],
    ['open the readme.md in cursor', { kind: 'file', name: 'readme.md', withApp: 'cursor' }],
    ['open folder gitBrains in vs code, create it if missing', { kind: 'folder', name: 'gitBrains', withApp: 'vs code', create: true }],
    ['open ./tests in vscode', { kind: 'folder', name: './tests', withApp: 'vscode' }],
    ['open folder gitBrains in the Projects folder with code', { kind: 'folder', name: 'gitBrains', locationHint: 'Projects', withApp: 'code' }],
  ];
  for (const [input, want] of rows) {
    it(`reads: ${input}`, () => {
      expect(parseOpenRequest(input)).toMatchObject(want);
    });
  }

  it('defaults create to false', () => {
    expect(parseOpenRequest('open the gitbrains folder')?.create).toBe(false);
  });

  const negatives = [
    'open the door',
    'open a pull request in github',
    'open spotify',
    'open youtube in chrome',
    'open gmail',
    'list files in src',
    'cd gitbrains',
    'what folder is this',
  ];
  for (const input of negatives) {
    it(`leaves alone: ${input}`, () => {
      expect(parseOpenRequest(input)).toBeNull();
    });
  }
});

describe('parseOpenRequest: other ways to say the same thing', () => {
  const rows: Array<[string, Record<string, unknown>]> = [
    // the place as a relative clause must not end up in the folder name
    ['open the folder gitBrains which is located in /padhai_in_linux/Projects in vs code', { kind: 'folder', name: 'gitBrains', locationHint: '/padhai_in_linux/Projects', withApp: 'vs code' }],
    ['open the folder gitBrains that is in ~/Projects in code', { kind: 'folder', name: 'gitBrains', locationHint: '~/Projects', withApp: 'code' }],
    ['open the folder gitBrains, it is in /padhai_in_linux/Projects/ with vscode', { kind: 'folder', name: 'gitBrains', locationHint: '/padhai_in_linux/Projects/', withApp: 'vscode' }],
    // the editor first
    ['In VS Code open the gitBrains folder inside ~/padhai_in_linux/Projects', { kind: 'folder', name: 'gitBrains', locationHint: '~/padhai_in_linux/Projects', withApp: 'VS Code' }],
    ['with vscode, open gitBrains from Projects', { kind: 'folder', name: 'gitBrains', locationHint: 'Projects', withApp: 'vscode' }],
    ['launch vscode with the gitBrains folder, it is in /padhai_in_linux/Projects/', { kind: 'folder', name: 'gitBrains', locationHint: '/padhai_in_linux/Projects/', withApp: 'vscode' }],
    ['open vs code and open the folder gitBrains in it', { kind: 'folder', name: 'gitBrains', withApp: 'vs code' }],
    ['open vscode and then open gitBrains folder from Projects', { kind: 'folder', name: 'gitBrains', locationHint: 'Projects', withApp: 'vscode' }],
    ['start code and open the gitBrains project', { kind: 'folder', name: 'gitBrains', withApp: 'code' }],
    // other verbs
    ['edit gitBrains project in vscode', { kind: 'folder', name: 'gitBrains', withApp: 'vscode' }],
    ['show me the gitBrains folder', { kind: 'folder', name: 'gitBrains' }],
    // a window of its own, only when asked
    ['open gitBrains in a new vscode window', { kind: 'folder', name: 'gitBrains', withApp: 'vscode', newWindow: true }],
    ['open the folder gitBrains in vs code in a separate window', { kind: 'folder', name: 'gitBrains', withApp: 'vs code', newWindow: true }],
    ['open the folder gitBrains inside ~/Projects in a new window of code', { kind: 'folder', name: 'gitBrains', locationHint: '~/Projects', withApp: 'code', newWindow: true }],
  ];
  for (const [input, want] of rows) {
    it(`reads: ${input}`, () => {
      expect(parseOpenRequest(input)).toMatchObject(want);
    });
  }

  it('does not ask for a new window unless the person did', () => {
    expect(parseOpenRequest('open the folder gitBrains in vs code')?.newWindow).toBeUndefined();
  });

  it('still leaves unrelated requests alone', () => {
    for (const input of ['edit this paragraph', 'edit the file in vim', 'open vscode', 'open code', 'start code', 'show me the weather', 'open a new window', 'launch vscode']) {
      expect(parseOpenRequest(input), input).toBeNull();
    }
  });
});
