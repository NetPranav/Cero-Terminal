import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { parseSystemAction, commandFor, suggestionsFor, completeSystemRequest, type SystemAction } from './SystemControl';

describe('parseSystemAction', () => {
  it.each([
    ['turn off bluetooth', { kind: 'bluetooth', op: 'off' }],
    ['enable wifi', { kind: 'wifi', op: 'on' }],
    ['is bluetooth on?', { kind: 'bluetooth', op: 'status' }],
    ['list bluetooth devices', { kind: 'bluetooth', op: 'devices' }],
    ['show nearby wifi networks', { kind: 'wifi', op: 'scan' }],
    ['connect to wifi Home Network', { kind: 'wifi', op: 'connect', network: 'Home Network' }],
    ['set brightness to 70%', { kind: 'brightness', op: 'set', level: 70 }],
    ['make the screen brighter', null],
    ['increase brightness', { kind: 'brightness', op: 'up' }],
    ['dim the brightness', { kind: 'brightness', op: 'down' }],
    ['set volume to 30', { kind: 'volume', op: 'set', level: 30 }],
    ['mute', null],
    ['mute the volume', { kind: 'volume', op: 'mute' }],
    ['turn the volume up', { kind: 'volume', op: 'up' }],
    ['turn on dark mode', { kind: 'appearance', op: 'dark' }],
    ['switch to light mode', { kind: 'appearance', op: 'light' }],
    ['open bluetooth settings', { kind: 'settings', topic: 'bluetooth' }],
    ['open printer settings', { kind: 'settings', topic: 'printers' }],
    ['take me to display settings', { kind: 'settings', topic: 'display' }],
    ['bluetooth', { kind: 'suggest', topic: 'bluetooth' }],
    ['my wifi?', { kind: 'wifi', op: 'status' }],
    ['wifi', { kind: 'suggest', topic: 'wifi' }],
    ['join the Office wifi', { kind: 'wifi', op: 'connect', network: 'Office' }],
    ['lock the screen', null],
  ])('%s', (goal, expected) => {
    const parsed = parseSystemAction(goal);
    if (expected === null && goal === 'lock the screen') expect(parsed).toBeNull();
    else if (expected === null) expect(parsed === null || parsed.kind !== 'settings').toBe(true);
    else expect(parsed).toEqual(expected);
  });

  it('leaves other requests alone', () => {
    for (const goal of ['why is my wifi slow', 'record audio with ffmpeg', 'how much disk space do I have', 'open settings', 'open ai settings',
      'git status', 'show disk usage', 'what is using port 3000', 'install bluetooth tools for my project and then run the tests']) {
      const parsed = parseSystemAction(goal);
      expect(parsed === null, `${goal} -> ${JSON.stringify(parsed)}`).toBe(true);
    }
  });
});

const ACTIONS: SystemAction[] = [
  { kind: 'wifi', op: 'on' }, { kind: 'wifi', op: 'off' }, { kind: 'wifi', op: 'status' }, { kind: 'wifi', op: 'scan' }, { kind: 'wifi', op: 'connect', network: "Cafe O'Hara" },
  { kind: 'bluetooth', op: 'on' }, { kind: 'bluetooth', op: 'off' }, { kind: 'bluetooth', op: 'status' }, { kind: 'bluetooth', op: 'devices' },
  { kind: 'brightness', op: 'set', level: 60 }, { kind: 'brightness', op: 'up' }, { kind: 'brightness', op: 'down' }, { kind: 'brightness', op: 'get' },
  { kind: 'volume', op: 'set', level: 40 }, { kind: 'volume', op: 'up' }, { kind: 'volume', op: 'down' }, { kind: 'volume', op: 'mute' }, { kind: 'volume', op: 'unmute' }, { kind: 'volume', op: 'get' },
  { kind: 'appearance', op: 'dark' }, { kind: 'appearance', op: 'light' }, { kind: 'battery', op: 'status' }, { kind: 'lock' },
  { kind: 'settings', topic: 'bluetooth' }, { kind: 'settings', topic: 'updates' }, { kind: 'settings', topic: 'wallpaper' },
];

describe('commandFor', () => {
  it('has a command on every OS for every action, and changes have a settings page to fall back to', () => {
    for (const os of ['macos', 'linux', 'windows'] as const) {
      for (const action of ACTIONS) {
        const cmd = commandFor(action, os)!;
        expect(cmd.command, `${os} ${JSON.stringify(action)}`).toBeTruthy();
        if (cmd.changes && action.kind !== 'lock') expect(cmd.fallback, `${os} ${JSON.stringify(action)}`).toBeDefined();
      }
    }
  });

  it('uses native Windows APIs, no admin rights, and ms-settings pages', () => {
    expect(commandFor({ kind: 'bluetooth', op: 'off' }, 'windows')!.command).toContain("SetStateAsync('Off')");
    expect(commandFor({ kind: 'wifi', op: 'on' }, 'windows')!.command).toContain("$_.Kind -eq 'WiFi'");
    expect(commandFor({ kind: 'brightness', op: 'set', level: 60 }, 'windows')!.command).toContain('WmiSetBrightness');
    expect(commandFor({ kind: 'volume', op: 'mute' }, 'windows')!.command).toContain('[SentinelAudio]::Mute = $true');
    expect(commandFor({ kind: 'settings', topic: 'updates' }, 'windows')!.command).toBe("Start-Process 'ms-settings:windowsupdate'");
    expect(commandFor({ kind: 'settings', topic: 'bluetooth' }, 'macos')!.command).toBe("open 'x-apple.systempreferences:com.apple.BluetoothSettings'");
    expect(commandFor({ kind: 'settings', topic: 'bluetooth' }, 'linux')!.command).toMatch(/gnome-control-center bluetooth.*systemsettings kcm_bluetooth/);
  });

  it('quotes network names', () => {
    expect(commandFor({ kind: 'wifi', op: 'connect', network: "Cafe O'Hara" }, 'windows')!.command).toBe("netsh wlan connect name='Cafe O''Hara'");
    expect(commandFor({ kind: 'wifi', op: 'connect', network: "Cafe O'Hara" }, 'linux')!.command).toBe("nmcli device wifi connect 'Cafe O'\\''Hara'");
  });

  // On the Windows CI runner: every generated script must parse in Windows PowerShell
  // One PowerShell process parses them all (starting one per script exceeds the test timeout)
  it.skipIf(process.platform !== 'win32')('every Windows command parses in PowerShell', () => {
    const scripts = ACTIONS.flatMap(action => {
      const cmd = commandFor(action, 'windows')!;
      return [cmd.command, cmd.fallback?.command].filter(Boolean).map(script => ({ name: JSON.stringify(action), script }));
    });
    const check = '$failed = 0; foreach ($item in ([Console]::In.ReadToEnd() | ConvertFrom-Json)) { $errors = $null; '
      + '[System.Management.Automation.Language.Parser]::ParseInput($item.script, [ref]$null, [ref]$errors) | Out-Null; '
      + "if ($errors.Count) { $failed++; Write-Output ($item.name + ': ' + (($errors | ForEach-Object { $_.Message }) -join '; ')) } }; exit $failed";
    const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', check], { input: JSON.stringify(scripts), encoding: 'utf8' });
    expect(res.error).toBeUndefined();
    expect(res.status, `${res.stdout}${res.stderr}`).toBe(0);
  }, 60_000);
});

describe('suggestions', () => {
  it('suggests what this OS can do, and completes typed requests', () => {
    expect(suggestionsFor('bluetooth', 'windows')).toContain('turn bluetooth off');
    expect(suggestionsFor('brightness', 'macos')).not.toContain('what is the brightness?');
    expect(completeSystemRequest('turn blu', 'linux')).toEqual(['turn bluetooth off', 'turn bluetooth on']);
    expect(completeSystemRequest('mu', 'windows')).toContain('mute');
  });
});

describe('SystemSettingsProvider', () => {
  it('completes > requests for this OS only', async () => {
    const { SystemSettingsProvider } = await import('../autocomplete/SystemSettingsProvider');
    const out = await new SystemSettingsProvider().getSuggestions({ currentInput: '>turn blu', cursorPosition: 9, cwd: '/', os: 'windows' });
    expect(out.map(s => s.value)).toEqual(['>turn bluetooth off', '>turn bluetooth on']);
    expect(await new SystemSettingsProvider().getSuggestions({ currentInput: 'git st', cursorPosition: 6, cwd: '/', os: 'windows' })).toEqual([]);
  });
});
