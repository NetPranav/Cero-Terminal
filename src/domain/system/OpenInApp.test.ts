import { describe, it, expect } from 'vitest';
import { openCommand, osOf } from './OpenInApp';

const SPACEY = "/home/me/it's a folder/git Brains";

describe('openCommand', () => {
  it('opens a folder in VS Code on Linux without making a new window', () => {
    const c = openCommand('/home/me/Projects/gitBrains', 'linux', 'VS Code');
    expect(c.command).toBe("command -v code >/dev/null 2>&1 && setsid -f code '/home/me/Projects/gitBrains' >/dev/null 2>&1");
    expect(c.command).not.toMatch(/ -n\b|--new-window/);
    expect(c.appName).toBe('Visual Studio Code');
    expect(c.fallbacks.some(f => f.includes('flatpak info com.visualstudio.code') && f.includes('flatpak run com.visualstudio.code'))).toBe(true);
    expect(c.fallbacks.some(f => f.includes('snap run code'))).toBe(true);
    expect(c.fallbacks[c.fallbacks.length - 1]).toContain('xdg-open');
  });

  it('uses the app bundle on macOS and Start-Process on Windows', () => {
    expect(openCommand('/Users/me/gb', 'macos', 'cursor').command).toBe("open -a 'Cursor' '/Users/me/gb'");
    expect(openCommand('C:\\Users\\me\\gb', 'windows', 'vscode').command).toBe("Start-Process -FilePath 'code' -ArgumentList 'C:\\Users\\me\\gb'");
  });

  it('quotes a path with a space and a quote on every OS', () => {
    expect(openCommand(SPACEY, 'linux', 'zed').command).toContain(`'/home/me/it'\\''s a folder/git Brains'`);
    expect(openCommand(SPACEY, 'macos', 'zed').command).toContain(`'/home/me/it'\\''s a folder/git Brains'`);
    expect(openCommand("C:\\it's here", 'windows', 'zed').command).toContain("'C:\\it''s here'");
  });

  it('every editor has a command on every OS', () => {
    for (const name of ['code', 'codium', 'cursor', 'windsurf', 'zed', 'sublime', 'idea', 'pycharm', 'webstorm']) {
      for (const os of ['linux', 'macos', 'windows'] as const) {
        expect(openCommand('/x', os, name).command.length).toBeGreaterThan(5);
      }
    }
  });

  it('with no app, opens in the file manager or default app', () => {
    expect(openCommand('/x y', 'linux').command).toBe("setsid -f xdg-open '/x y' >/dev/null 2>&1");
    expect(openCommand('/x y', 'macos').command).toBe("open '/x y'");
    expect(openCommand('C:\\x y', 'windows').command).toBe("Start-Process -FilePath 'C:\\x y'");
  });

  it('knows the OS from the names the app uses', () => {
    expect(osOf('darwin')).toBe('macos');
    expect(osOf('macOS')).toBe('macos');
    expect(osOf('win32')).toBe('windows');
    expect(osOf('linux')).toBe('linux');
  });
});

describe('openCommand: a window of its own only when asked', () => {
  it('adds -n for VS Code on Linux and keeps the path quoted', () => {
    const c = openCommand("/home/me/it's here", 'linux', 'vscode', { newWindow: true });
    expect(c.command).toContain("setsid -f code -n '/home/me/it'\\''s here'");
    expect(c.fallbacks.join('\n')).toContain("flatpak run com.visualstudio.code --new-window");
  });
  it('is unchanged without the option', () => {
    expect(openCommand('/p', 'linux', 'vscode').command).toBe("command -v code >/dev/null 2>&1 && setsid -f code '/p' >/dev/null 2>&1");
    expect(openCommand('/p', 'linux', 'vscode').command).not.toContain(' -n ');
  });
  it('uses the CLI flag on Windows; macOS keeps opening in the running app', () => {
    expect(openCommand('C:\\p', 'windows', 'code', { newWindow: true }).command).toContain("-ArgumentList '-n','C:\\p'");
    expect(openCommand('/p', 'macos', 'code', { newWindow: true }).command).toBe(openCommand('/p', 'macos', 'code').command);
  });
  it('ignores the option for editors without a new-window flag', () => {
    expect(openCommand('/p', 'linux', 'pycharm', { newWindow: true }).command).not.toContain(' -n ');
  });
});
