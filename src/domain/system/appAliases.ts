/**
 * appAliases.ts: what people type for an app, and the real names it goes by (all lower case keys).
 * Plain data. `resolveApp` scores a query against the alias values as well as the installed names.
 */
export const APP_ALIASES: Record<string, string[]> = {
  'vs code': ['Visual Studio Code', 'Code', 'VSCodium'],
  'vscode': ['Visual Studio Code', 'Code', 'VSCodium'],
  'code': ['Visual Studio Code', 'Code', 'VSCodium'],
  'visual studio code': ['Visual Studio Code', 'Code', 'VSCodium'],
  'vs': ['Visual Studio Code'],
  'chrome': ['Google Chrome', 'Chromium'],
  'google chrome': ['Google Chrome', 'Chromium'],
  'chromium': ['Chromium', 'Google Chrome'],
  'firefox': ['Firefox', 'Firefox Web Browser'],
  'ff': ['Firefox'],
  'terminal': ['Terminal', 'Console', 'GNOME Terminal', 'Konsole', 'Windows Terminal'],
  'console': ['Terminal', 'Console'],
  'files': ['Files', 'File Manager', 'Nautilus', 'Dolphin', 'Thunar', 'Finder'],
  'file manager': ['Files', 'File Manager', 'Nautilus', 'Dolphin', 'Thunar', 'Finder', 'Explorer'],
  'nautilus': ['Files', 'Nautilus'],
  'dolphin': ['Dolphin'],
  'thunar': ['Thunar'],
  'finder': ['Finder'],
  'settings': ['Settings', 'System Settings', 'Control Center'],
  'system settings': ['System Settings', 'Settings'],
  'control center': ['Control Center', 'Settings'],
  'cursor': ['Cursor'],
  'slack': ['Slack'],
  'discord': ['Discord'],
  'spotify': ['Spotify'],
  'obsidian': ['Obsidian'],
  'postman': ['Postman'],
  'docker desktop': ['Docker Desktop'],
  'gimp': ['GIMP', 'GNU Image Manipulation Program'],
  'vlc': ['VLC', 'VLC media player'],
};

/** The real names for what was typed, or none */
export function aliasTargets(query: string): string[] {
  return APP_ALIASES[query.trim().toLowerCase().replace(/\s+/g, ' ')] ?? [];
}
