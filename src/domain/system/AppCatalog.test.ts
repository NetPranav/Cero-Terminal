import { describe, it, expect, beforeEach } from 'vitest';
import { parseWindowsStartApps, resolveApp, launchCommand, loadCatalog, clearCatalogCache, type AppEntry } from './AppCatalog';

// Shape of `Get-StartApps | ForEach-Object { '"' + $_.Name + '","' + $_.AppID + '"' }`
const sample = [
  '"Visual Studio Code","Microsoft.VisualStudioCode"',
  '"File Explorer","Microsoft.Windows.Explorer"',
  '"Google Chrome","Chrome"',
  '"Chromium","Chromium.F2KQ5B6G7J"',
  '"Firefox","308046B0AF4A39CB"',
  '"Notepad","Microsoft.WindowsNotepad_8wekyb3d8bbwe!App"',
].join('\r\n');
const apps = parseWindowsStartApps(sample);

describe('AppCatalog parsing', () => {
  it('reads Get-StartApps lines, skipping headers and separators', () => {
    expect(apps.map(a => a.name)).toEqual(['Visual Studio Code', 'File Explorer', 'Google Chrome', 'Chromium', 'Firefox', 'Notepad']);
    expect(apps[5]).toMatchObject({ name: 'Notepad', launch: { kind: 'appid', value: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App' }, source: 'start-menu' });
    const columns = parseWindowsStartApps('Name                AppID\n----                -----\nCalculator          Microsoft.WindowsCalculator_8wekyb3d8bbwe!App\n');
    expect(columns).toEqual([{ name: 'Calculator', aliases: [], launch: { kind: 'appid', value: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' }, source: 'start-menu' }]);
  });
});

describe('resolveApp', () => {
  it('"vs code" finds Visual Studio Code', () => {
    const r = resolveApp('vs code', apps);
    expect(r.type).toBe('found');
    if (r.type === 'found') expect(r.app.name).toBe('Visual Studio Code');
  });
  it('"vscode" works through the aliases too', () => {
    expect(resolveApp('vscode', apps).type).toBe('found');
  });
  it('a typo asks', () => {
    const r = resolveApp('crome', apps);
    expect(r.type).toBe('choose');
  });
  it('the same app from two sources asks which', () => {
    const twice: AppEntry[] = [...apps, { name: 'Firefox', aliases: [], launch: { kind: 'exec', value: 'C:\\Tools\\firefox\\firefox.exe' }, source: 'portable' }];
    const r = resolveApp('firefox', twice);
    expect(r.type).toBe('choose');
    if (r.type === 'choose') expect(r.reason).toBe('several');
  });
  it('an app that is not installed is missing, never guessed', () => {
    expect(resolveApp('nonexistentapp', apps).type).toBe('missing');
  });
});

describe('launchCommand', () => {
  it('starts Start-menu apps through shell:AppsFolder and programs by path', () => {
    expect(launchCommand(apps[5], 'windows')).toBe("Start-Process 'shell:AppsFolder\\Microsoft.WindowsNotepad_8wekyb3d8bbwe!App'");
    expect(launchCommand({ name: 'Tool', aliases: [], source: 'portable', launch: { kind: 'exec', value: "C:\\it's\\tool.exe" } }, 'windows'))
      .toBe("Start-Process -FilePath 'C:\\it''s\\tool.exe'");
  });
});

describe('loadCatalog', () => {
  beforeEach(() => clearCatalogCache());
  it('lists once and reuses the answer for five minutes', async () => {
    let calls = 0;
    const run = async () => { calls++; return sample; };
    const a = await loadCatalog('windows', run, 1000);
    const callsAfterFirst = calls;
    const b = await loadCatalog('windows', run, 1000 + 60_000);
    expect(b).toBe(a);
    expect(calls).toBe(callsAfterFirst);
    await loadCatalog('windows', run, 1000 + 6 * 60_000);
    expect(calls).toBeGreaterThan(callsAfterFirst);
  });
  it('a failing listing gives an empty list instead of throwing', async () => {
    expect(await loadCatalog('windows', async () => { throw new Error('no'); })).toEqual([]);
  });
});
