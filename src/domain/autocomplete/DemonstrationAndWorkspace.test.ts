import { describe, it, expect, beforeEach } from 'vitest';
import { DemonstrationProvider } from './DemonstrationProvider';
import { WorkspaceContextProvider } from './WorkspaceContextProvider';
import { DemonstrationLearningEngine } from '../learning/DemonstrationLearningEngine';
import * as path from 'path';

describe('DemonstrationProvider & WorkspaceContextProvider (Issue 5.2)', () => {
  beforeEach(() => {
    DemonstrationLearningEngine.getInstance().clearAll();
  });

  it('suggests learned workflows when in AI prompt mode (> prefix)', async () => {
    DemonstrationLearningEngine.getInstance().learnExplicit(
      'compress backups',
      'tar -czvf backups.tar.gz ./backups'
    );

    const provider = new DemonstrationProvider();
    const suggestions = await provider.getSuggestions({
      currentInput: '> comp',
      cursorPosition: 6,
      cwd: '/test',
      os: 'macos'
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].value).toBe('> compress backups');
    expect(suggestions[0].description).toContain('tar -czvf backups.tar.gz ./backups');
  });

  it('suggests learned commands when typing shell prefix', async () => {
    DemonstrationLearningEngine.getInstance().learnExplicit(
      'kill hung server',
      'kill -9 $(lsof -t -i:3000)'
    );

    const provider = new DemonstrationProvider();
    const suggestions = await provider.getSuggestions({
      currentInput: 'kill -9',
      cursorPosition: 7,
      cwd: '/test',
      os: 'macos'
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].value).toContain('kill -9 $(lsof -t -i:3000)');
  });

  it('suggests workspace scripts based on project files', async () => {
    const provider = new WorkspaceContextProvider();
    // Test against the actual current project repository
    const cwd = path.resolve('.');
    const suggestions = await provider.getSuggestions({
      currentInput: 'npm ',
      cursorPosition: 4,
      cwd,
      os: 'macos'
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.value.startsWith('npm run') || s.value === 'npm test')).toBe(true);
  });
});
