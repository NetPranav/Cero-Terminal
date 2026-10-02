import { describe, it, expect } from 'vitest';
import { parseOpenFolder } from './FolderOpenParser';

describe('FolderOpenParser', () => {
  const phrasings = [
    { input: 'open folder gitBrains in cursor', folder: 'gitBrains', editor: 'cursor' },
    { input: 'open ~/Project Folder/AI Terminal in vscode', folder: '~/Project Folder/AI Terminal', editor: 'code' },
    { input: 'open project backend in clion', folder: 'backend', editor: 'clion' },
    { input: 'open directory src in sublime text', folder: 'src', editor: 'subl' },
    { input: 'open gitBrains folder', folder: 'gitBrains', editor: undefined },
    { input: 'open the src folder in code', folder: 'src', editor: 'code' },
    { input: 'open directory docs with cursor', folder: 'docs', editor: 'cursor' },
    { input: 'launch vscode on the gitBrains directory', folder: 'gitBrains', editor: 'code' },
    { input: 'please open folder components in vs code', folder: 'components', editor: 'code' },
    { input: 'open /var/log in zed', folder: '/var/log', editor: 'zed' },
    { input: 'open project frontend in webstorm', folder: 'frontend', editor: 'webstorm' },
    { input: 'open ./tests folder in visual studio code', folder: './tests', editor: 'code' }
  ];

  for (const { input, folder, editor } of phrasings) {
    it(`parses "${input}" -> folder: "${folder}", editor: "${editor}"`, () => {
      const parsed = parseOpenFolder(input);
      expect(parsed).not.toBeNull();
      expect(parsed?.folder).toBe(folder);
      expect(parsed?.editor).toBe(editor);
    });
  }

  it('rejects general web browsing and app launching', () => {
    expect(parseOpenFolder('open firefox')).toBeNull();
    expect(parseOpenFolder('launch spotify')).toBeNull();
    expect(parseOpenFolder('open https://google.com')).toBeNull();
    expect(parseOpenFolder('git status')).toBeNull();
  });
});
