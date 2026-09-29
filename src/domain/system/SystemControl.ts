/**
 * SystemControl.ts — system settings by request, on macOS, Windows and Linux.
 *
 * "turn off bluetooth", "set brightness to 60", "mute", "dark mode on", "connect to wifi Home",
 * "open display settings", "lock the screen". Parsed without the model and turned into the native
 * command for this OS. Windows uses the Windows Radio API for Wi-Fi and Bluetooth (no admin rights
 * needed), WMI for brightness, the Core Audio API for volume, the registry for dark mode and
 * ms-settings: pages. When a change is not possible (an external monitor has no brightness control,
 * a desktop has no Wi-Fi radio), the matching settings page opens instead.
 *
 * A request that names a setting but not what to do with it ("bluetooth", "my display") gets
 * "Did you mean ...?" suggestions, built only from what this OS can actually do.
 */

export type SystemOs = 'macos' | 'linux' | 'windows';

export type SystemTopic =
  | 'wifi' | 'bluetooth' | 'brightness' | 'volume' | 'appearance' | 'battery' | 'lock'
  | 'display' | 'sound' | 'network' | 'notifications' | 'keyboard' | 'mouse' | 'printers'
  | 'privacy' | 'datetime' | 'users' | 'updates' | 'storage' | 'wallpaper' | 'power' | 'accessibility';

export type SystemAction =
  | { kind: 'wifi'; op: 'on' | 'off' | 'status' | 'scan' }
  | { kind: 'wifi'; op: 'connect'; network: string }
  | { kind: 'bluetooth'; op: 'on' | 'off' | 'status' | 'devices' }
  | { kind: 'brightness'; op: 'set'; level: number }
  | { kind: 'brightness'; op: 'up' | 'down' | 'get' }
  | { kind: 'volume'; op: 'set'; level: number }
  | { kind: 'volume'; op: 'up' | 'down' | 'mute' | 'unmute' | 'get' }
  | { kind: 'appearance'; op: 'dark' | 'light' }
  | { kind: 'battery'; op: 'status' }
  | { kind: 'lock' }
  | { kind: 'settings'; topic: SystemTopic }
  | { kind: 'suggest'; topic: SystemTopic };

export interface SystemCommand {
  /** What the user sees in progress and in the confirmation */
  title: string;
  /** Shell command for this OS (PowerShell on Windows) */
  command: string;
  /** Changes something (goes through the confirmation policy); reads and page opens do not */
  changes: boolean;
  /** Opened when the change cannot be made, so the user can do it by hand */
  fallback?: SystemCommand;
  /** One line after success */
  done: (stdout: string) => string;
}

// ---- understanding requests -----------------------------------------------------------------

const TOPIC_WORDS: [SystemTopic, RegExp][] = [
  ['wifi', /\b(?:wi-?fi|wlan|wireless)\b/i],
  ['bluetooth', /\bblue\s?tooth\b/i],
  ['brightness', /\b(?:brightness|screen\s+brightness|backlight)\b/i],
  ['volume', /\b(?:volume|loudness)\b/i],
  ['appearance', /\b(?:dark\s+mode|light\s+mode|dark\s+theme|light\s+theme|appearance)\b/i],
  ['battery', /\bbattery\b/i],
  ['display', /\b(?:display|monitor|screen\s+resolution|resolution|night\s+light|night\s+shift)\b/i],
  ['sound', /\b(?:sound|speakers?|microphone|mic|audio(?:\s+output)?)\b/i],
  ['network', /\b(?:network|ethernet|vpn|proxy|internet)\b/i],
  ['notifications', /\b(?:notifications?|do\s+not\s+disturb|focus\s+mode)\b/i],
  ['keyboard', /\bkeyboard\b/i],
  ['mouse', /\b(?:mouse|trackpad|touchpad)\b/i],
  ['printers', /\b(?:printers?|scanners?)\b/i],
  ['privacy', /\b(?:privacy|security|permissions?)\b/i],
  ['datetime', /\b(?:date\s*(?:&|and)?\s*time|time\s*zone|clock)\b/i],
  ['users', /\b(?:user\s+accounts?|users|accounts)\b/i],
  ['updates', /\b(?:software\s+updates?|system\s+updates?|windows\s+update|updates)\b/i],
  ['storage', /\b(?:storage|disk\s+space)\b/i],
  ['wallpaper', /\b(?:wallpaper|desktop\s+background|background\s+image)\b/i],
  ['power', /\b(?:power\s+(?:settings|mode|plan)|sleep\s+settings|energy)\b/i],
  ['accessibility', /\baccessibility\b/i],
];

export function topicOf(text: string): SystemTopic | null {
  for (const [topic, re] of TOPIC_WORDS) if (re.test(text)) return topic;
  return null;
}

/** Only the setting's name and filler words ("bluetooth", "my wifi", "display stuff"): ask what to do */
function isBareMention(t: string, topic: SystemTopic): boolean {
  const re = TOPIC_WORDS.find(([k]) => k === topic)![1];
  const rest = t.replace(new RegExp(re.source, 'gi'), ' ')
    .replace(/\b(?:my|the|a|about|settings?|help|with|thing|stuff|options?|menu|please|\?)\b|\?/g, ' ')
    .trim();
  return rest === '';
}

const ON = /\b(?:turn\s+on|switch\s+on|enable|activate|start|power\s+on)\b|\bon\s*$/i;
const OFF = /\b(?:turn\s+off|switch\s+off|disable|deactivate|stop|power\s+off|kill)\b|\boff\s*$/i;
const PERCENT = /\b(\d{1,3})\s*%?(?:\s*percent)?\b/;

export function parseSystemAction(goal: string): SystemAction | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  const t = text.toLowerCase().replace(/^(?:please|can you|could you|hey)\s+/, '');
  if (t.length > 90) return null;
  const topic = topicOf(t);
  if (!topic) return null;
  const asks = /^(?:is|are|what|which|how|show|check|tell|get|list|display)\b|\?$/.test(t);

  // "open bluetooth settings", "take me to display settings", "show sound preferences"
  if (/\b(?:settings|preferences|prefs|control\s+panel|options)\b/.test(t) && /^(?:open|show|go\s+to|take\s+me\s+to|launch|bring\s+up|display)?\b/.test(t)
    && !/\bsentinel\b|\b(?:ai|model|terminal)\s+settings\b/.test(t)) {
    return { kind: 'settings', topic };
  }

  switch (topic) {
    case 'wifi': {
      // "connect to wifi Home Network" (name after "wifi": kept whole) or "join the Office network"
      const connect = text.match(/\b(?:connect|join)\s+(?:to\s+)?(?:the\s+)?(?:wi-?fi|wireless)\s+(?:network\s+)?["'`]?([^"'`]+?)["'`]?$/i)
        || text.match(/\b(?:connect|join)\s+(?:to\s+)?(?:the\s+)?["'`]?([^"'`]+?)["'`]?\s+(?:wi-?fi|network)$/i);
      if (connect && !/^(?:wi-?fi|the\s+wi-?fi|internet|network)$/i.test(connect[1].trim())) return { kind: 'wifi', op: 'connect', network: connect[1].trim() };
      if (/\b(?:networks|scan|available|nearby|list)\b/.test(t)) return { kind: 'wifi', op: 'scan' };
      if (OFF.test(t)) return { kind: 'wifi', op: 'off' };
      if (ON.test(t) && !asks) return { kind: 'wifi', op: 'on' };
      if (asks || /\bstatus\b|\bconnected\b/.test(t)) return { kind: 'wifi', op: 'status' };
      return isBareMention(t, topic) ? { kind: 'suggest', topic } : null;
    }
    case 'bluetooth': {
      if (/\b(?:devices|paired|connected\s+devices|list)\b/.test(t)) return { kind: 'bluetooth', op: 'devices' };
      if (OFF.test(t)) return { kind: 'bluetooth', op: 'off' };
      if (ON.test(t) && !asks) return { kind: 'bluetooth', op: 'on' };
      if (asks || /\bstatus\b/.test(t)) return { kind: 'bluetooth', op: 'status' };
      return isBareMention(t, topic) ? { kind: 'suggest', topic } : null;
    }
    case 'brightness': {
      const n = t.match(PERCENT);
      if (/\b(?:max(?:imum)?|full|100)\b/.test(t) && !n) return { kind: 'brightness', op: 'set', level: 100 };
      if (/\b(?:min(?:imum)?|lowest)\b/.test(t)) return { kind: 'brightness', op: 'set', level: 10 };
      if (n && /\b(?:set|make|change|to|at)\b|%|percent|^brightness\s+\d/.test(t)) return { kind: 'brightness', op: 'set', level: Math.max(0, Math.min(100, Number(n[1]))) };
      if (/\b(?:increase|raise|up|higher|brighter|more)\b/.test(t)) return { kind: 'brightness', op: 'up' };
      if (/\b(?:decrease|lower|down|reduce|dim|dimmer|less|darker)\b/.test(t)) return { kind: 'brightness', op: 'down' };
      if (asks) return { kind: 'brightness', op: 'get' };
      return isBareMention(t, topic) ? { kind: 'suggest', topic } : null;
    }
    case 'volume': {
      const n = t.match(PERCENT);
      if (/\bunmute\b/.test(t)) return { kind: 'volume', op: 'unmute' };
      if (/\bmute\b|\bsilence\b/.test(t)) return { kind: 'volume', op: 'mute' };
      if (/\b(?:max(?:imum)?|full)\b/.test(t) && !n) return { kind: 'volume', op: 'set', level: 100 };
      if (n && /\b(?:set|make|change|to|at)\b|%|percent|^volume\s+\d/.test(t)) return { kind: 'volume', op: 'set', level: Math.max(0, Math.min(100, Number(n[1]))) };
      if (/\b(?:increase|raise|up|louder|higher|more)\b/.test(t)) return { kind: 'volume', op: 'up' };
      if (/\b(?:decrease|lower|down|reduce|quieter|softer|less)\b/.test(t)) return { kind: 'volume', op: 'down' };
      if (asks) return { kind: 'volume', op: 'get' };
      return isBareMention(t, topic) ? { kind: 'suggest', topic } : null;
    }
    case 'appearance': {
      const dark = /\bdark\b/.test(t);
      const light = /\blight\b/.test(t);
      if (dark && !light) return { kind: 'appearance', op: OFF.test(t) ? 'light' : 'dark' };
      if (light && !dark) return { kind: 'appearance', op: OFF.test(t) ? 'dark' : 'light' };
      return isBareMention(t, topic) ? { kind: 'suggest', topic } : null;
    }
    case 'battery':
      return asks || /\b(?:status|level|percent|left|charge)\b/.test(t) || t === 'battery' ? { kind: 'battery', op: 'status' } : null;
    default:
      break;
  }
  if (/^lock\s+(?:the\s+|my\s+)?(?:screen|computer|pc|mac|laptop)$/.test(t)) return { kind: 'lock' };
  // Other topics are only handled as settings pages ("open printer settings", above), or when named alone
  return isBareMention(t, topic) ? { kind: 'suggest', topic } : null;
}

// ---- commands per OS ------------------------------------------------------------------------

const MAC_PAGES: Record<SystemTopic, string> = {
  wifi: 'com.apple.wifi-settings-extension', bluetooth: 'com.apple.BluetoothSettings', brightness: 'com.apple.Displays-Settings.extension',
  display: 'com.apple.Displays-Settings.extension', volume: 'com.apple.Sound-Settings.extension', sound: 'com.apple.Sound-Settings.extension',
  appearance: 'com.apple.Appearance-Settings.extension', battery: 'com.apple.Battery-Settings.extension', power: 'com.apple.Battery-Settings.extension',
  network: 'com.apple.Network-Settings.extension', notifications: 'com.apple.Notifications-Settings.extension', keyboard: 'com.apple.Keyboard-Settings.extension',
  mouse: 'com.apple.Trackpad-Settings.extension', printers: 'com.apple.Print-Scan-Settings.extension', privacy: 'com.apple.settings.PrivacySecurity.extension',
  datetime: 'com.apple.Date-Time-Settings.extension', users: 'com.apple.Users-Groups-Settings.extension', updates: 'com.apple.Software-Update-Settings.extension',
  storage: 'com.apple.settings.Storage', wallpaper: 'com.apple.Wallpaper-Settings.extension', accessibility: 'com.apple.Accessibility-Settings.extension',
  lock: 'com.apple.Lock-Screen-Settings.extension',
};
const WIN_PAGES: Record<SystemTopic, string> = {
  wifi: 'ms-settings:network-wifi', bluetooth: 'ms-settings:bluetooth', brightness: 'ms-settings:display', display: 'ms-settings:display',
  volume: 'ms-settings:sound', sound: 'ms-settings:sound', appearance: 'ms-settings:colors', battery: 'ms-settings:batterysaver',
  power: 'ms-settings:powersleep', network: 'ms-settings:network-status', notifications: 'ms-settings:notifications', keyboard: 'ms-settings:typing',
  mouse: 'ms-settings:mousetouchpad', printers: 'ms-settings:printers', privacy: 'ms-settings:privacy', datetime: 'ms-settings:dateandtime',
  users: 'ms-settings:otherusers', updates: 'ms-settings:windowsupdate', storage: 'ms-settings:storagesense', wallpaper: 'ms-settings:personalization-background',
  accessibility: 'ms-settings:easeofaccess', lock: 'ms-settings:lockscreen',
};
/** [GNOME panel, KDE module] */
const LINUX_PAGES: Record<SystemTopic, [string, string]> = {
  wifi: ['wifi', 'kcm_networkmanagement'], bluetooth: ['bluetooth', 'kcm_bluetooth'], brightness: ['display', 'kcm_kscreen'], display: ['display', 'kcm_kscreen'],
  volume: ['sound', 'kcm_pulseaudio'], sound: ['sound', 'kcm_pulseaudio'], appearance: ['background', 'kcm_colors'], battery: ['power', 'kcm_powerdevilprofilesconfig'],
  power: ['power', 'kcm_powerdevilprofilesconfig'], network: ['network', 'kcm_networkmanagement'], notifications: ['notifications', 'kcm_notifications'],
  keyboard: ['keyboard', 'kcm_keyboard'], mouse: ['mouse', 'kcm_mouse'], printers: ['printers', 'kcm_printer_manager'], privacy: ['privacy', 'kcm_access'],
  datetime: ['datetime', 'kcm_clock'], users: ['users', 'kcm_users'], updates: ['info-overview', 'kcm_about-distro'], storage: ['info-overview', 'kcm_about-distro'],
  wallpaper: ['background', 'kcm_wallpaper'], accessibility: ['universal-access', 'kcm_access'], lock: ['privacy', 'kcm_screenlocker'],
};

export const TOPIC_NAMES: Record<SystemTopic, string> = {
  wifi: 'Wi-Fi', bluetooth: 'Bluetooth', brightness: 'Display', display: 'Display', volume: 'Sound', sound: 'Sound', appearance: 'Appearance',
  battery: 'Battery', power: 'Power', network: 'Network', notifications: 'Notifications', keyboard: 'Keyboard', mouse: 'Mouse and trackpad',
  printers: 'Printers', privacy: 'Privacy', datetime: 'Date and time', users: 'Users', updates: 'Updates', storage: 'Storage',
  wallpaper: 'Wallpaper', accessibility: 'Accessibility', lock: 'Lock screen',
};

function settingsPage(topic: SystemTopic, os: SystemOs): SystemCommand {
  const name = TOPIC_NAMES[topic];
  const command = os === 'windows'
    ? `Start-Process '${WIN_PAGES[topic]}'`
    : os === 'macos'
      ? `open 'x-apple.systempreferences:${MAC_PAGES[topic]}'`
      : `(command -v gnome-control-center >/dev/null 2>&1 && setsid -f gnome-control-center ${LINUX_PAGES[topic][0]} >/dev/null 2>&1) || (command -v systemsettings >/dev/null 2>&1 && setsid -f systemsettings ${LINUX_PAGES[topic][1]} >/dev/null 2>&1) || (command -v kcmshell6 >/dev/null 2>&1 && setsid -f kcmshell6 ${LINUX_PAGES[topic][1]} >/dev/null 2>&1) || (command -v kcmshell5 >/dev/null 2>&1 && setsid -f kcmshell5 ${LINUX_PAGES[topic][1]} >/dev/null 2>&1)`;
  return { title: `Open ${name} settings`, command, changes: false, done: () => `Opened ${name} settings.` };
}

/** Windows Radio API (Wi-Fi / Bluetooth) from Windows PowerShell 5.1; no admin rights needed */
function winRadio(kind: 'WiFi' | 'Bluetooth', state?: 'On' | 'Off'): string {
  return [
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    "$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
    'function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }',
    '[Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null',
    '[Windows.Devices.Radios.RadioAccessStatus,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null',
    '$null = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])',
    '$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])',
    `$radio = $radios | Where-Object { $_.Kind -eq '${kind}' } | Select-Object -First 1`,
    `if (-not $radio) { Write-Error 'No ${kind === 'WiFi' ? 'Wi-Fi' : 'Bluetooth'} radio found on this PC'; exit 1 }`,
    state
      ? `$result = Await ($radio.SetStateAsync('${state}')) ([Windows.Devices.Radios.RadioAccessStatus]); if ("$result" -ne 'Allowed') { Write-Error "Windows did not allow the change: $result"; exit 1 }; 'State: ' + $radio.State`
      : "'State: ' + $radio.State",
  ].join('\n');
}

/** Core Audio (default output device) from PowerShell, via a small C# type */
const WIN_AUDIO = `if (-not ('SentinelAudio' -as [type])) { Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int h(); int i(); int SetMasterVolumeLevelScalar(float level, System.Guid ctx); int j(); int GetMasterVolumeLevelScalar(out float level); int k(); int l(); int m(); int n(); int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, System.Guid ctx); int GetMute(out bool mute); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid id, int ctx, int p, out IAudioEndpointVolume v); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class SentinelAudio {
  static IAudioEndpointVolume V() { var e = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator; IMMDevice d; Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out d)); var id = typeof(IAudioEndpointVolume).GUID; IAudioEndpointVolume v; Marshal.ThrowExceptionForHR(d.Activate(ref id, 23, 0, out v)); return v; }
  public static float Volume { get { float l; Marshal.ThrowExceptionForHR(V().GetMasterVolumeLevelScalar(out l)); return l; } set { Marshal.ThrowExceptionForHR(V().SetMasterVolumeLevelScalar(value, System.Guid.Empty)); } }
  public static bool Mute { get { bool m; Marshal.ThrowExceptionForHR(V().GetMute(out m)); return m; } set { Marshal.ThrowExceptionForHR(V().SetMute(value, System.Guid.Empty)); } }
}
'@ }`;

const WIN_BRIGHTNESS_GET = '$b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1; if (-not $b) { throw "This display does not support brightness control from Windows" }';
const winBrightnessSet = (expr: string) => `${WIN_BRIGHTNESS_GET}; $level = [int][Math]::Max(0, [Math]::Min(100, ${expr})); $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1; Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]$level } | Out-Null; "Brightness: $level%"`;

const LINUX_VOLUME = (wp: string, pa: string, am: string) => `if command -v wpctl >/dev/null 2>&1; then ${wp}; elif command -v pactl >/dev/null 2>&1; then ${pa}; elif command -v amixer >/dev/null 2>&1; then ${am}; else echo "No volume control found (wpctl, pactl or amixer)" >&2; false; fi`;
const LINUX_BRIGHT = (bctl: string, gnome: string) => `if command -v brightnessctl >/dev/null 2>&1; then ${bctl}; elif command -v gdbus >/dev/null 2>&1; then ${gnome}; else echo "No brightness control found (install brightnessctl)" >&2; false; fi`;
const GNOME_BRIGHT_SET = (n: string) => `gdbus call --session --dest org.gnome.SettingsDaemon.Power --object-path /org/gnome/SettingsDaemon/Power --method org.freedesktop.DBus.Properties.Set org.gnome.SettingsDaemon.Power.Screen Brightness "<int32 ${n}>" >/dev/null && echo "Brightness: ${n}%"`;

export function commandFor(action: SystemAction, os: SystemOs): SystemCommand | null {
  const page = (topic: SystemTopic) => settingsPage(topic, os);
  const win = os === 'windows';
  const mac = os === 'macos';
  switch (action.kind) {
    case 'settings':
      return page(action.topic);
    case 'suggest':
      return null;
    case 'lock':
      return {
        title: 'Lock the screen', changes: false, done: () => 'Screen locked.',
        command: win ? 'rundll32.exe user32.dll,LockWorkStation'
          : mac ? 'pmset displaysleepnow'
            : 'loginctl lock-session 2>/dev/null || xdg-screensaver lock',
      };
    case 'battery':
      return {
        title: 'Battery status', changes: false, done: (out) => out.trim() || 'No battery found (desktop or AC-only system).',
        command: win ? "Get-CimInstance Win32_Battery | ForEach-Object { 'Battery: ' + $_.EstimatedChargeRemaining + '% (' + $(if ($_.BatteryStatus -eq 2) { 'charging or plugged in' } else { 'on battery' }) + ')' }"
          : mac ? 'pmset -g batt'
            : 'for b in /sys/class/power_supply/BAT*; do [ -d "$b" ] && echo "$(basename "$b"): $(cat "$b/capacity")% ($(cat "$b/status"))"; done',
      };
    case 'appearance': {
      const dark = action.op === 'dark';
      const value = dark ? 0 : 1;
      return {
        title: `Switch to ${dark ? 'dark' : 'light'} mode`, changes: true, fallback: page('appearance'), done: () => `Switched to ${dark ? 'dark' : 'light'} mode.`,
        command: win ? `Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' -Name AppsUseLightTheme -Value ${value}; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' -Name SystemUsesLightTheme -Value ${value}`
          : mac ? `osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to ${dark}'`
            : `if command -v gsettings >/dev/null 2>&1 && gsettings list-keys org.gnome.desktop.interface | grep -q color-scheme; then gsettings set org.gnome.desktop.interface color-scheme ${dark ? "'prefer-dark'" : "'default'"}; gsettings set org.gnome.desktop.interface gtk-theme ${dark ? "'Adwaita-dark'" : "'Adwaita'"}; elif command -v plasma-apply-colorscheme >/dev/null 2>&1; then plasma-apply-colorscheme ${dark ? 'BreezeDark' : 'BreezeLight'}; else echo "No supported desktop for switching the theme" >&2; false; fi`,
      };
    }
    case 'wifi': {
      if (action.op === 'connect') {
        const ssid = action.network.replace(/["`$\\]/g, '');
        return {
          title: `Connect to Wi-Fi "${ssid}"`, changes: true, fallback: page('wifi'), done: (out) => out.trim() || `Connecting to "${ssid}".`,
          command: win ? `netsh wlan connect name='${ssid.replace(/'/g, "''")}'`
            : mac ? `networksetup -setairportnetwork "$(networksetup -listallhardwareports | awk '/Wi-Fi|AirPort/{getline; print $2; exit}')" '${ssid.replace(/'/g, `'\\''`)}'`
              : `nmcli device wifi connect '${ssid.replace(/'/g, `'\\''`)}'`,
        };
      }
      if (action.op === 'status') {
        return {
          title: 'Wi-Fi status', changes: false,
          done: (out) => out.trim().replace('<redacted>', 'hidden by macOS (allow Location Services for Sentinel Terminal to see it)'),
          command: win ? "netsh wlan show interfaces | Select-String -Pattern '^\\s+(State|SSID|Signal|Radio type)\\s' | ForEach-Object { $_.Line.Trim() }"
            : mac ? `dev=$(networksetup -listallhardwareports | awk '/Wi-Fi|AirPort/{getline; print $2; exit}'); networksetup -getairportpower "$dev"; ipconfig getsummary "$dev" 2>/dev/null | awk -F' : ' '/ SSID/{print "Network: " $2}'`
              : 'nmcli radio wifi | sed "s/^/Wi-Fi radio: /"; nmcli -t -f active,ssid,signal dev wifi | awk -F: \'$1=="yes"{print "Network: " $2 " (" $3 "%)"}\'',
        };
      }
      if (action.op === 'scan') {
        return {
          title: 'Nearby Wi-Fi networks', changes: false, done: (out) => out.trim() || 'No Wi-Fi networks found.',
          command: win ? "netsh wlan show networks mode=bssid | Select-String -Pattern '^SSID|Signal' | ForEach-Object { $_.Line.Trim() }"
            : mac ? `system_profiler SPAirPortDataType 2>/dev/null | awk '/Other Local Wi-Fi Networks:/{f=1; next} f && /^ {12}[^ ].*:$/{sub(/^ +/, ""); sub(/:$/, ""); print}' | head -20`
              : 'nmcli -f SSID,SIGNAL,SECURITY dev wifi list',
        };
      }
      const on = action.op === 'on';
      return {
        title: `Turn Wi-Fi ${action.op}`, changes: true, fallback: page('wifi'), done: () => `Wi-Fi is ${action.op}.`,
        command: win ? winRadio('WiFi', on ? 'On' : 'Off')
          : mac ? `networksetup -setairportpower "$(networksetup -listallhardwareports | awk '/Wi-Fi|AirPort/{getline; print $2; exit}')" ${action.op}`
            : `nmcli radio wifi ${action.op}`,
      };
    }
    case 'bluetooth': {
      if (action.op === 'devices') {
        return {
          title: 'Bluetooth devices', changes: false, done: (out) => out.trim() || 'No paired Bluetooth devices.',
          command: win ? "Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -and $_.FriendlyName -notmatch 'Enumerator|Adapter|Radio|Transport|Service|Protocol|RFCOMM|LE Generic|Wireless Bluetooth|Intel|Realtek|Qualcomm|MediaTek' } | ForEach-Object { $_.FriendlyName + ' (' + $_.Status + ')' }"
            : mac ? `system_profiler SPBluetoothDataType 2>/dev/null | awk '/^ {6}(Connected|Not Connected):/{s=$0; sub(/^ +/, "", s); sub(/:$/, "", s); next} /^ {6}[^ ]/{s=""} s != "" && /^ {10}[^ ].*:$/{n=$0; sub(/^ +/, "", n); sub(/:$/, "", n); if (!seen[n]++) print n " (" s ")"}'`
              : 'bluetoothctl devices Paired 2>/dev/null || bluetoothctl paired-devices',
        };
      }
      if (action.op === 'status') {
        return {
          title: 'Bluetooth status', changes: false, done: (out) => out.trim(),
          command: win ? winRadio('Bluetooth')
            : mac ? `system_profiler SPBluetoothDataType 2>/dev/null | awk -F': ' '/State:/{print "Bluetooth: " $2; exit}'`
              : "bluetoothctl show | awk -F': ' '/Powered/{print \"Bluetooth powered: \" $2}'",
        };
      }
      const on = action.op === 'on';
      return {
        title: `Turn Bluetooth ${action.op}`, changes: true, fallback: page('bluetooth'), done: () => `Bluetooth is ${action.op}.`,
        command: win ? winRadio('Bluetooth', on ? 'On' : 'Off')
          : mac ? `command -v blueutil >/dev/null 2>&1 && blueutil -p ${on ? 1 : 0} || { echo "blueutil is not installed (brew install blueutil)" >&2; false; }`
            : `bluetoothctl power ${action.op} | grep -q succeeded || rfkill ${on ? 'unblock' : 'block'} bluetooth`,
      };
    }
    case 'brightness': {
      if (action.op === 'get') {
        return {
          title: 'Screen brightness', changes: false, done: (out) => out.trim(),
          command: win ? `${WIN_BRIGHTNESS_GET}; "Brightness: $($b.CurrentBrightness)%"`
            : mac ? `command -v brightness >/dev/null 2>&1 && brightness -l | awk '/brightness/{printf "Brightness: %d%%\\n", $NF*100; exit}' || { echo "Install the brightness tool to read it: brew install brightness" >&2; false; }`
              : LINUX_BRIGHT(`echo "Brightness: $(( $(brightnessctl get) * 100 / $(brightnessctl max) ))%"`, `gdbus call --session --dest org.gnome.SettingsDaemon.Power --object-path /org/gnome/SettingsDaemon/Power --method org.freedesktop.DBus.Properties.Get org.gnome.SettingsDaemon.Power.Screen Brightness | tr -dc '0-9' | sed 's/^/Brightness: /; s/$/%/'`),
        };
      }
      const level = action.op === 'set' ? action.level : undefined;
      const step = action.op === 'up' ? 10 : -10;
      const title = level !== undefined ? `Set brightness to ${level}%` : `Turn brightness ${action.op}`;
      return {
        title, changes: true, fallback: page('display'), done: (out) => out.trim() || `${title}.`,
        command: win ? winBrightnessSet(level !== undefined ? String(level) : `$b.CurrentBrightness + (${step})`)
          : mac ? (level !== undefined
            ? `command -v brightness >/dev/null 2>&1 && brightness ${(level / 100).toFixed(2)} && echo "Brightness: ${level}%" || { echo "Install the brightness tool for exact levels: brew install brightness" >&2; false; }`
            : `osascript -e 'tell application "System Events" to key code ${step > 0 ? 144 : 145}' && osascript -e 'tell application "System Events" to key code ${step > 0 ? 144 : 145}'`)
            : LINUX_BRIGHT(
              level !== undefined ? `brightnessctl set ${level}% >/dev/null && echo "Brightness: ${level}%"` : `brightnessctl set ${Math.abs(step)}%${step > 0 ? '+' : '-'} >/dev/null && echo "Brightness: $(( $(brightnessctl get) * 100 / $(brightnessctl max) ))%"`,
              level !== undefined ? GNOME_BRIGHT_SET(String(level)) : `cur=$(gdbus call --session --dest org.gnome.SettingsDaemon.Power --object-path /org/gnome/SettingsDaemon/Power --method org.freedesktop.DBus.Properties.Get org.gnome.SettingsDaemon.Power.Screen Brightness | tr -dc '0-9'); new=$((cur ${step > 0 ? '+' : '-'} ${Math.abs(step)})); ${GNOME_BRIGHT_SET('$new')}`),
      };
    }
    case 'volume': {
      const op = action.op;
      if (op === 'get') {
        return {
          title: 'Volume', changes: false, done: (out) => out.trim(),
          command: win ? `${WIN_AUDIO}; 'Volume: ' + [int]([SentinelAudio]::Volume * 100) + '%' + $(if ([SentinelAudio]::Mute) { ' (muted)' } else { '' })`
            : mac ? `osascript -e 'set s to get volume settings' -e 'if output muted of s then return "Volume: " & (output volume of s) & "% (muted)"' -e 'return "Volume: " & (output volume of s) & "%"'`
              : LINUX_VOLUME('wpctl get-volume @DEFAULT_AUDIO_SINK@', 'pactl get-sink-volume @DEFAULT_SINK@ | head -1', "amixer get Master | grep -o '[0-9]*%' | head -1"),
        };
      }
      const level = op === 'set' ? action.level : undefined;
      const title = level !== undefined ? `Set volume to ${level}%` : op === 'mute' ? 'Mute sound' : op === 'unmute' ? 'Unmute sound' : `Turn volume ${op}`;
      const winCmd = level !== undefined ? `[SentinelAudio]::Mute = $false; [SentinelAudio]::Volume = ${(level / 100).toFixed(2)}`
        : op === 'mute' ? '[SentinelAudio]::Mute = $true'
          : op === 'unmute' ? '[SentinelAudio]::Mute = $false'
            : `[SentinelAudio]::Volume = [Math]::Max(0, [Math]::Min(1, [SentinelAudio]::Volume ${op === 'up' ? '+' : '-'} 0.1))`;
      const macCmd = level !== undefined ? `osascript -e 'set volume output volume ${level} without output muted'`
        : op === 'mute' ? `osascript -e 'set volume output muted true'`
          : op === 'unmute' ? `osascript -e 'set volume output muted false'`
            : `osascript -e 'set volume output volume ((output volume of (get volume settings)) ${op === 'up' ? '+' : '-'} 10)'`;
      const linuxCmd = level !== undefined
        ? LINUX_VOLUME(`wpctl set-mute @DEFAULT_AUDIO_SINK@ 0; wpctl set-volume @DEFAULT_AUDIO_SINK@ ${level}%`, `pactl set-sink-mute @DEFAULT_SINK@ 0; pactl set-sink-volume @DEFAULT_SINK@ ${level}%`, `amixer -q set Master ${level}% unmute`)
        : op === 'mute' ? LINUX_VOLUME('wpctl set-mute @DEFAULT_AUDIO_SINK@ 1', 'pactl set-sink-mute @DEFAULT_SINK@ 1', 'amixer -q set Master mute')
          : op === 'unmute' ? LINUX_VOLUME('wpctl set-mute @DEFAULT_AUDIO_SINK@ 0', 'pactl set-sink-mute @DEFAULT_SINK@ 0', 'amixer -q set Master unmute')
            : LINUX_VOLUME(`wpctl set-volume -l 1.0 @DEFAULT_AUDIO_SINK@ 10%${op === 'up' ? '+' : '-'}`, `pactl set-sink-volume @DEFAULT_SINK@ ${op === 'up' ? '+' : '-'}10%`, `amixer -q set Master 10%${op === 'up' ? '+' : '-'}`);
      return {
        title, changes: true, fallback: page('sound'), done: () => `${title.replace(/^Turn volume (up|down)$/, 'Volume turned $1')}.`,
        command: win ? `${WIN_AUDIO}; ${winCmd}` : mac ? macCmd : linuxCmd,
      };
    }
  }
}

// ---- "Did you mean ...?" ---------------------------------------------------------------------

/** Requests that work on this OS for a topic, as the user would type them */
export function suggestionsFor(topic: SystemTopic, os: SystemOs): string[] {
  const name = TOPIC_NAMES[topic];
  const open = `open ${name.toLowerCase()} settings`;
  switch (topic) {
    case 'wifi': return ['turn wifi off', 'turn wifi on', 'show wifi status', 'list nearby wifi networks', 'connect to wifi <network name>', open];
    case 'bluetooth': return ['turn bluetooth off', 'turn bluetooth on', 'is bluetooth on?', 'list bluetooth devices', open];
    case 'brightness': return ['set brightness to 70%', 'increase brightness', 'decrease brightness', ...(os === 'macos' ? [] : ['what is the brightness?']), 'open display settings'];
    case 'volume': case 'sound': return ['set volume to 50%', 'volume up', 'volume down', 'mute', 'unmute', 'what is the volume?', 'open sound settings'];
    case 'appearance': return ['turn on dark mode', 'switch to light mode', 'open appearance settings'];
    case 'battery': return ['battery status', 'open battery settings'];
    default: return [open];
  }
}

/** Autocomplete for a request being typed: matching suggestions for this OS */
export function completeSystemRequest(prefix: string, os: SystemOs): string[] {
  const p = prefix.trim().toLowerCase();
  if (p.length < 2) return [];
  const all = new Set<string>();
  for (const [topic] of TOPIC_WORDS) for (const s of suggestionsFor(topic, os)) all.add(s);
  all.add('lock the screen');
  return [...all].filter(s => s.startsWith(p) || s.split(' ').some(w => w.startsWith(p) && p.length >= 3)).slice(0, 6);
}
