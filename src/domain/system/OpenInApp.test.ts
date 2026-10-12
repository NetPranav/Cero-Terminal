import { describe, it, expect } from 'vitest';
import { openCommand, osOf } from './OpenInApp';

describe('openCommand', () => {
  it('opens a folder in VS Code without making a new window', () => {
    const c = openCommand('C:\\Users\\me\\Projects\\gitBrains', 'windows', 'VS Code');
    expect(c.command).toBe("Start-Process -FilePath 'code' -ArgumentList 'C:\\Users\\me\\Projects\\gitBrains'");
    expect(c.command).not.toMatch(/'-n'|--new-window/);
    expect(c.appName).toBe('Visual Studio Code');
    expect(c.processName).toBe('code');
    expect(c.fallbacks).toEqual([]);
  });

  it('quotes a path with a space and a quote', () => {
    expect(openCommand("C:\\it's here", 'windows', 'zed').command).toContain("'C:\\it''s here'");
  });

  it('every editor has a command', () => {
    for (const name of ['code', 'codium', 'cursor', 'windsurf', 'zed', 'sublime', 'idea', 'pycharm', 'webstorm']) {
      expect(openCommand('C:\\x', 'windows', name).command).toMatch(/^Start-Process -FilePath '/);
    }
  });

  it('opens with another named app, or with the default app', () => {
    expect(openCommand('C:\\x y', 'windows', 'Notepad++').command).toBe("Start-Process -FilePath 'Notepad++' -ArgumentList 'C:\\x y'");
    expect(openCommand('C:\\x y', 'windows').command).toBe("Start-Process -FilePath 'C:\\x y'");
  });

  it('is always Windows in this build', () => {
    expect(osOf('win32')).toBe('windows');
    expect(osOf(undefined)).toBe('windows');
  });
});

describe('openCommand: a window of its own only when asked', () => {
  it('passes the CLI flag before the path', () => {
    expect(openCommand('C:\\p', 'windows', 'code', { newWindow: true }).command).toContain("-ArgumentList '-n','C:\\p'");
  });
  it('ignores the option for editors without a new-window flag', () => {
    expect(openCommand('C:\\p', 'windows', 'pycharm', { newWindow: true }).command).toBe("Start-Process -FilePath 'pycharm' -ArgumentList 'C:\\p'");
  });
});
