import { describe, it, expect } from 'vitest';
import { ProjectDiscoveryEngine, DiscoveredProject, FileSystemScanner } from './ProjectDiscoveryEngine';

describe('ProjectDiscoveryEngine', () => {
  const mockScanner: FileSystemScanner = {
    readdir: async (dir: string) => {
      if (dir === '/code') {
        return ['shop_web', 'shop_api', 'blog'];
      }
      if (dir === '/code/shop_web') {
        return ['package.json', 'src'];
      }
      if (dir === '/code/shop_api') {
        return ['requirements.txt', 'app.py'];
      }
      if (dir === '/code/blog') {
        return ['Cargo.toml'];
      }
      return [];
    },
    stat: async (p: string) => {
      const isDir = !p.includes('.') || p.endsWith('/src');
      return { isDirectory: () => isDir };
    },
    readFile: async (p: string) => {
      if (p.includes('shop_web/package.json')) {
        return JSON.stringify({ name: 'shop-web', scripts: { dev: 'vite' } });
      }
      return '';
    },
    exists: async () => false
  };

  it('should scan workspaces and discover projects matching keyword', async () => {
    const probe = await ProjectDiscoveryEngine.probe('shop', ['/code'], mockScanner);

    expect(probe.matches.length).toBe(2);
    expect(probe.matches[0].name).toBe('shop_web');
    expect(probe.matches[0].type).toBe('node');
    expect(probe.matches[0].launchTarget).toBe('npm run dev');

    expect(probe.matches[1].name).toBe('shop_api');
    expect(probe.matches[1].type).toBe('python');
    expect(probe.matches[1].launchTarget).toBe('python app.py');
  });

  it('should format clean numbered disambiguation prompt when multiple projects match', async () => {
    const probe = await ProjectDiscoveryEngine.probe('shop', ['/code'], mockScanner);

    expect(probe.disambiguationRequired).toBe(true);
    expect(probe.disambiguationPrompt).toBeDefined();
    expect(probe.disambiguationPrompt).toContain('Found 2 project workspaces matching "shop":');
    expect(probe.disambiguationPrompt).toContain('[1]');
    expect(probe.disambiguationPrompt).toContain('[2]');
    expect(probe.disambiguationPrompt).toContain('(NODE)');
    expect(probe.disambiguationPrompt).toContain('Which project would you like to run? [1-2]:');
  });

  it('should resolve user selection by numeric choice', () => {
    const candidates: DiscoveredProject[] = [
      { id: '1', name: 'shop_web', path: '/code/shop_web', type: 'node', confidence: 100 },
      { id: '2', name: 'shop_api', path: '/code/shop_api', type: 'python', confidence: 90 }
    ];

    const selected1 = ProjectDiscoveryEngine.resolveSelection('1', candidates);
    expect(selected1).toBeDefined();
    expect(selected1?.name).toBe('shop_web');

    const selected2 = ProjectDiscoveryEngine.resolveSelection('2', candidates);
    expect(selected2).toBeDefined();
    expect(selected2?.name).toBe('shop_api');
  });

  it('should resolve user selection by project name substring', () => {
    const candidates: DiscoveredProject[] = [
      { id: '1', name: 'shop_web', path: '/code/shop_web', type: 'node', confidence: 100 },
      { id: '2', name: 'shop_api', path: '/code/shop_api', type: 'python', confidence: 90 }
    ];

    const selected = ProjectDiscoveryEngine.resolveSelection('api', candidates);
    expect(selected).toBeDefined();
    expect(selected?.id).toBe('2');
    expect(selected?.name).toBe('shop_api');
  });
});
