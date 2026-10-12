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
  'terminal': ['Windows Terminal', 'Terminal', 'Windows PowerShell', 'Command Prompt'],
  'console': ['Windows Terminal', 'Command Prompt'],
  'powershell': ['PowerShell', 'Windows PowerShell'],
  'cmd': ['Command Prompt'],
  'command prompt': ['Command Prompt'],
  'files': ['File Explorer', 'Explorer'],
  'file manager': ['File Explorer', 'Explorer'],
  'file explorer': ['File Explorer', 'Explorer'],
  'explorer': ['File Explorer', 'Explorer'],
  'settings': ['Settings', 'Control Panel'],
  'system settings': ['Settings', 'Control Panel'],
  'control panel': ['Control Panel', 'Settings'],
  'edge': ['Microsoft Edge'],
  'microsoft edge': ['Microsoft Edge'],
  'notepad': ['Notepad'],
  'task manager': ['Task Manager'],
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
