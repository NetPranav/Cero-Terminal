import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseDesktopEntries, parseMacApps, parseWindowsStartApps, resolveApp, launchCommand, loadCatalog, clearCatalogCache } from './AppCatalog';

const sample = fs.readFileSync(path.join(__dirname, '__fixtures__', 'desktop-grep.txt'), 'utf8');
const apps = parseDesktopEntries(sample);

describe('AppCatalog parsing', () => {
  it('reads names, drops NoDisplay and field codes, notes Flatpak', () => {
    const names = apps.map(a => a.name);
    expect(names).toContain('Visual Studio Code');
    expect(names).not.toContain('Hidden Helper');
    const code = apps.find(a => a.name === 'Visual Studio Code')!;
    expect(code.launch).toMatchObject({ kind: 'desktop', value: 'code', exec: '/usr/share/code/code --unity-launch' });
    expect(code.aliases).toContain('Text Editor');
    expect(apps.find(a => a.launch.value === 'org.mozilla.firefox')!.source).toBe('flatpak');
    expect(apps.find(a => a.launch.value === 'org.mozilla.firefox')!.launch.exec).toBe('/usr/bin/flatpak run --branch=stable org.mozilla.firefox');
  });

  it('reads mac and Windows listings', () => {
    expect(parseMacApps('Safari.app\nVisual Studio Code.app\nnotes.txt\n').map(a => a.name)).toEqual(['Safari', 'Visual Studio Code']);
    const win = parseWindowsStartApps('"Notepad","Microsoft.WindowsNotepad_8wekyb3d8bbwe!App"\n"Visual Studio Code","Microsoft.VisualStudioCode"\n');
    expect(win[0]).toMatchObject({ name: 'Notepad', launch: { kind: 'appid' } });
  });
});

describe('resolveApp', () => {
  it('"vs code" finds Visual Studio Code', () => {
    const r = resolveApp('vs code', apps);
    expect(r.type).toBe('found');
    if (r.type === 'found') expect(r.app.name).toBe('Visual Studio Code');
  });
  it('"vscode" works through the keywords and aliases too', () => {
    expect(resolveApp('vscode', apps).type).toBe('found');
  });
  it('"the file manager" finds Files', () => {
    const r = resolveApp('file manager', apps);
    expect(r.type).toBe('found');
    if (r.type === 'found') expect(r.app.name).toBe('Files');
  });
  it('a typo asks', () => {
    const r = resolveApp('crome', apps);
    expect(r.type).toBe('choose');
    if (r.type === 'choose') expect(r.candidates[0].app.name).toMatch(/Chromium/);
  });
  it('the same app from two sources asks which', () => {
    const r = resolveApp('firefox', apps);
    expect(r.type).toBe('choose');
    if (r.type === 'choose') expect(r.reason).toBe('several');
  });
  it('an app that is not installed is missing, never guessed', () => {
    expect(resolveApp('nonexistentapp', apps).type).toBe('missing');
  });
});

describe('launchCommand', () => {
  const code = apps.find(a => a.name === 'Visual Studio Code')!;
  it('uses the right launcher for each OS', () => {
    expect(launchCommand(code, 'linux')).toContain("gtk-launch 'code'");
    expect(launchCommand(code, 'linux')).toContain('setsid -f /usr/share/code/code --unity-launch');
    expect(launchCommand({ ...code, launch: { kind: 'bundle', value: 'x' } }, 'macos')).toBe("open -a 'Visual Studio Code'");
    expect(launchCommand({ name: 'Notepad', aliases: [], source: 's', launch: { kind: 'appid', value: 'Microsoft.Notepad!App' } }, 'windows')).toBe("Start-Process 'shell:AppsFolder\\Microsoft.Notepad!App'");
  });
});

describe('loadCatalog', () => {
  beforeEach(() => clearCatalogCache());
  it('lists once and reuses the answer for five minutes', async () => {
    let calls = 0;
    const run = async () => { calls++; return sample; };
    const a = await loadCatalog('linux', run, 1000);
    const callsAfterFirst = calls;
    const b = await loadCatalog('linux', run, 1000 + 60_000);
    expect(b).toBe(a);
    expect(calls).toBe(callsAfterFirst);
    await loadCatalog('linux', run, 1000 + 6 * 60_000);
    expect(calls).toBeGreaterThan(callsAfterFirst);
  });
  it('a failing listing gives an empty list instead of throwing', async () => {
    expect(await loadCatalog('linux', async () => { throw new Error('no'); })).toEqual([]);
  });
});
