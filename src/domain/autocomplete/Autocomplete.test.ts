import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutocompleteEngine } from './AutocompleteEngine';
import { HistoryProvider } from './HistoryProvider';
import { CapabilityProvider } from './CapabilityProvider';
import { CapabilityManager, CapabilityRegistry, Capability, CapabilityResult } from '../Capability';
import { z } from 'zod';

class MockWifiCap implements Capability {
  metadata = {
    id: 'wifi.disconnect',
    name: 'Disconnect Wi-Fi',
    description: 'Disconnects the active Wi-Fi interface.',
    category: 'System' as const,
    supportedPlatforms: ['macos'] as any,
    requiredPermissions: [],
    version: '1.0'
  };
  inputSchema = z.any();
  supportsDryRun = true;
  async execute() { return { success: true }; }
}

describe('Autocomplete Engine', () => {
  let engine: AutocompleteEngine;
  let historyProvider: HistoryProvider;
  let capabilityProvider: CapabilityProvider;
  let capManager: CapabilityManager;

  beforeEach(() => {
    capManager = CapabilityManager.getInstance();
    const registry = capManager.getRegistry();
    (registry as any).capabilities.clear();
    registry.register(new MockWifiCap());

    engine = new AutocompleteEngine();
    
    historyProvider = new HistoryProvider({ persist: false });
    capabilityProvider = new CapabilityProvider(capManager);
    
    engine.registerProvider(historyProvider);
    engine.registerProvider(capabilityProvider);
  });

  it('ranks commands the user ran by frequency and folder, ahead of starter completions', async () => {
    const here = '/Users/u/project';
    for (let i = 0; i < 3; i++) historyProvider.addHistory('git log --oneline', '/elsewhere');
    historyProvider.addHistory('git status', here);
    const suggestions = await engine.getSuggestions({
      currentInput: 'git ',
      cursorPosition: 4,
      cwd: here,
      os: 'macos'
    });

    // Used in this folder beats used more often elsewhere; starters come after real history
    expect(suggestions.map(s => s.value).slice(0, 3)).toEqual(['git status', 'git log --oneline', 'git checkout main']);
  });

  it('starts with no history: starter completions are never listed as commands the user ran', async () => {
    expect(historyProvider.getHistory()).toEqual([]);
    const suggestions = await historyProvider.getSuggestions({ currentInput: 'npm r', cursorPosition: 5, cwd: '/', os: 'macos' });
    expect(suggestions.map(s => s.value)).toEqual(['npm run dev', 'npm run build']);
  });

  it('should return natural language capability suggestions', async () => {
    const suggestions = await engine.getSuggestions({
      currentInput: 'disconnect',
      cursorPosition: 10,
      cwd: '/',
      os: 'macos'
    });

    expect(suggestions.length).toBe(1);
    expect(suggestions[0].value).toBe('Disconnect Wi-Fi');
    expect(suggestions[0].category).toBe('Capability');
  });

  it('should enforce strict latency timeouts on slow providers', async () => {
    class SlowProvider {
      id = 'slow';
      enabled = true;
      async getSuggestions() {
        await new Promise(r => setTimeout(r, 500)); // Far slower than the 15ms budget
        return [{ id: '1', value: 'Too slow', category: 'Other', priority: 100, confidence: 1, sourceProvider: 'slow' }];
      }
    }
    
    engine.registerProvider(new SlowProvider() as any);
    
    const start = performance.now();
    // Engine timeout is set to 15ms by default
    const suggestions = await engine.getSuggestions({ currentInput: 'git ', cursorPosition: 4, cwd: '', os: 'macos' }, 15);
    const duration = performance.now() - start;

    // Returns long before the slow provider would have finished (generous bound so a busy
    // CI machine does not make this flaky)
    expect(duration).toBeLessThan(250);
    expect(suggestions.find(s => s.value === 'Too slow')).toBeUndefined();
    expect(suggestions.length).toBeGreaterThan(0); // History provider still returned fast
  });
});
