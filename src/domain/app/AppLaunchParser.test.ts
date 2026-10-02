import { describe, it, expect } from 'vitest';
import { parseAppLaunch } from './AppLaunchParser';

describe('AppLaunchParser', () => {
  const phrasings = [
    { input: 'open firefox', app: 'firefox' },
    { input: 'launch spotify', app: 'spotify' },
    { input: 'start google chrome', app: 'google chrome' },
    { input: 'open the discord app', app: 'discord' },
    { input: 'launch slack application', app: 'slack' },
    { input: 'start visual studio code', app: 'visual studio code' },
    { input: 'open vlc', app: 'vlc' },
    { input: 'please open chrome', app: 'chrome' },
    { input: 'could you launch postman', app: 'postman' },
    { input: 'open calculator', app: 'calculator' },
    { input: 'start cursor', app: 'cursor' },
    { input: 'open brave', app: 'brave' }
  ];

  for (const { input, app } of phrasings) {
    it(`parses "${input}" -> app: "${app}"`, () => {
      const parsed = parseAppLaunch(input);
      expect(parsed).not.toBeNull();
      expect(parsed?.app).toBe(app);
      expect(parsed?.background).toBe(true);
    });
  }

  it('rejects folder and file open requests', () => {
    expect(parseAppLaunch('open folder gitBrains in vs code')).toBeNull();
    expect(parseAppLaunch('open file notes.txt')).toBeNull();
    expect(parseAppLaunch('open directory src')).toBeNull();
    expect(parseAppLaunch('open project backend')).toBeNull();
  });

  it('rejects quit and stop requests', () => {
    expect(parseAppLaunch('quit firefox')).toBeNull();
    expect(parseAppLaunch('close chrome')).toBeNull();
    expect(parseAppLaunch('stop spotify')).toBeNull();
  });

  it('rejects non-launch requests', () => {
    expect(parseAppLaunch('what is the weather today')).toBeNull();
    expect(parseAppLaunch('git status')).toBeNull();
    expect(parseAppLaunch('show the queue')).toBeNull();
  });
});
