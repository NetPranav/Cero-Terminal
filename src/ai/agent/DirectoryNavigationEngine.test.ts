import { describe, it, expect } from 'vitest';
import { 
  DirectoryNavigationEngine, 
  calculateLevenshteinDistance,
  DirectoryScanner 
} from './DirectoryNavigationEngine';

describe('DirectoryNavigationEngine', () => {
  const engine = DirectoryNavigationEngine.getInstance();

  it('calculates string Levenshtein distance accurately', () => {
    expect(calculateLevenshteinDistance('sentinal', 'sentinel')).toBe(1);
    expect(calculateLevenshteinDistance('backend', 'backnd')).toBe(1);
    expect(calculateLevenshteinDistance('doc', 'docs')).toBe(1);
    expect(calculateLevenshteinDistance('same', 'same')).toBe(0);
    expect(calculateLevenshteinDistance('completely', 'different')).toBeGreaterThan(5);
  });

  describe('parseIntent', () => {
    it('detects natural language directory switching prompts', () => {
      expect(engine.parseIntent('switch to backend')).toEqual({ isNavigation: true, target: 'backend' });
      expect(engine.parseIntent('cd into sentinal')).toEqual({ isNavigation: true, target: 'sentinal' });
      expect(engine.parseIntent('navigate to src directory')).toEqual({ isNavigation: true, target: 'src' });
      expect(engine.parseIntent('switch pwd to /tmp')).toEqual({ isNavigation: true, target: '/tmp' });
      expect(engine.parseIntent('go to "my project"')).toEqual({ isNavigation: true, target: 'my project' });
      expect(engine.parseIntent('change directory to docs')).toEqual({ isNavigation: true, target: 'docs' });
    });

    it('rejects non-navigation prompts', () => {
      expect(engine.parseIntent('switch to visual mode')).toEqual({ isNavigation: false });
      expect(engine.parseIntent('switch into zen mode')).toEqual({ isNavigation: false });
      expect(engine.parseIntent('list all docker containers')).toEqual({ isNavigation: false });
      expect(engine.parseIntent('run tests')).toEqual({ isNavigation: false });
    });
  });

  describe('resolve', () => {
    const mockScanner: DirectoryScanner = {
      listSubdirectories: async (dir: string) => {
        if (dir === '/workspace') return ['sentinel', 'backend', 'docs'];
        if (dir === '/home/user/Projects') return ['my-app', 'robotics'];
        return [];
      },
      directoryExists: async (p: string) => {
        const existing = ['/workspace/sentinel', '/workspace/backend', '/workspace/docs', '/tmp'];
        return existing.includes(p);
      },
      mkdir: async () => true
    };

    it('resolves exact directory matches immediately', async () => {
      const res = await engine.resolve('cd into backend', '/workspace', mockScanner);
      expect(res.type).toBe('exact');
      expect(res.cdPath).toBe('/workspace/backend');
      expect(res.summary).toContain('Switched working directory to /workspace/backend');
    });

    it('detects typos and generates "Did you mean?" question', async () => {
      // User typed "sentinal" instead of "sentinel"
      const res = await engine.resolve('switch to sentinal', '/workspace', mockScanner);
      expect(res.type).toBe('did_you_mean');
      expect(res.candidate?.name).toBe('sentinel');
      expect(res.candidate?.path).toBe('/workspace/sentinel');
      expect(res.question).toContain("Directory 'sentinal' not found. Did you mean 'sentinel'");
    });

    it('detects slight typos for docs ("doc" -> "docs")', async () => {
      const res = await engine.resolve('navigate to doc', '/workspace', mockScanner);
      expect(res.type).toBe('did_you_mean');
      expect(res.candidate?.name).toBe('docs');
      expect(res.question).toContain("Did you mean 'docs'");
    });

    it('detects non-existent directories and asks to create them', async () => {
      const res = await engine.resolve('switch to completely_new_folder', '/workspace', mockScanner);
      expect(res.type).toBe('not_found');
      expect(res.question).toContain("Directory 'completely_new_folder' does not exist. Would you like me to create it");
      expect(res.createCommand).toContain('mkdir -p "/workspace/completely_new_folder"');
    });
  });
});
