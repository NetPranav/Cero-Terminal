/**
 * AppAliasRegistry.ts — Persistent Application Registry & Alias Resolution
 * 
 * Manages Windows desktop application naming mappings and aliases.
 * Solves common naming discrepancies (e.g., "chrome" -> "Google Chrome")
 * and enables runtime user customization via the /app or /alias slash command.
 */

import { readCeroFile, writeCeroFile } from '../../infrastructure/storage/CeroFiles';

export class AppAliasRegistry {
  private static instance?: AppAliasRegistry;
  private aliases: Map<string, string> = new Map();

  private defaultAliases: Record<string, string> = {
    'chrome': 'Google Chrome',
    'google chrome': 'Google Chrome',
    'googlechrome': 'Google Chrome',
    'vscode': 'Visual Studio Code',
    'code': 'Visual Studio Code',
    'vs code': 'Visual Studio Code',
    'word': 'Microsoft Word',
    'excel': 'Microsoft Excel',
    'powerpoint': 'Microsoft PowerPoint',
    'edge': 'Microsoft Edge',
    'microsoft edge': 'Microsoft Edge',
    'firefox': 'Firefox',
    'brave': 'Brave Browser',
    'zen': 'zen-browser',
    'zen browser': 'zen-browser',
    'zen-browser': 'zen-browser',
    'sublime': 'Sublime Text',
    'pycharm': 'PyCharm',
    'intellij': 'IntelliJ IDEA',
    'webstorm': 'WebStorm',
    'spotify': 'Spotify',
    'discord': 'Discord',
    'slack': 'Slack',
    'zoom': 'Zoom',
    'calculator': 'Calculator',
    'notepad': 'Notepad',
    'explorer': 'File Explorer',
    'file explorer': 'File Explorer',
    'files': 'File Explorer',
    'terminal': 'Windows Terminal',
    'windows terminal': 'Windows Terminal',
    'task manager': 'Task Manager',
    'settings': 'Settings',
    'cero': 'Cero',
    'cero terminal': 'Cero',
    'antigravity': 'Antigravity IDE',
    'antigravity ide': 'Antigravity IDE',
    'cursor': 'Cursor',
    'cursor ai': 'Cursor'
  };

  /** winget package ids for the apps people ask to install, update or remove */
  private defaultPackages: Record<string, string> = {
    'brave': 'Brave.Brave',
    'brave browser': 'Brave.Brave',
    'chrome': 'Google.Chrome',
    'google chrome': 'Google.Chrome',
    'googlechrome': 'Google.Chrome',
    'vscode': 'Microsoft.VisualStudioCode',
    'vs code': 'Microsoft.VisualStudioCode',
    'code': 'Microsoft.VisualStudioCode',
    'visual studio code': 'Microsoft.VisualStudioCode',
    'sublime': 'SublimeHQ.SublimeText.4',
    'sublime text': 'SublimeHQ.SublimeText.4',
    'firefox': 'Mozilla.Firefox',
    'edge': 'Microsoft.Edge',
    'microsoft edge': 'Microsoft.Edge',
    'pycharm': 'JetBrains.PyCharm.Community',
    'intellij': 'JetBrains.IntelliJIDEA.Community',
    'intellij idea': 'JetBrains.IntelliJIDEA.Community',
    'webstorm': 'JetBrains.WebStorm',
    'spotify': 'Spotify.Spotify',
    'discord': 'Discord.Discord',
    'slack': 'SlackTechnologies.Slack',
    'zoom': 'Zoom.Zoom',
    'cursor': 'Anysphere.Cursor',
    'cursor ai': 'Anysphere.Cursor',
    'vlc': 'VideoLAN.VLC',
    'postman': 'Postman.Postman',
    'notion': 'Notion.Notion',
    'obs': 'OBSProject.OBSStudio',
    'obs studio': 'OBSProject.OBSStudio',
    'docker': 'Docker.DockerDesktop',
    'docker desktop': 'Docker.DockerDesktop',
    'alacritty': 'Alacritty.Alacritty',
    'windows terminal': 'Microsoft.WindowsTerminal',
    'terminal': 'Microsoft.WindowsTerminal',
    'powershell': 'Microsoft.PowerShell',
    'git': 'Git.Git',
    'node': 'OpenJS.NodeJS.LTS',
    'nodejs': 'OpenJS.NodeJS.LTS',
    'python': 'Python.Python.3.13',
    'telegram': 'Telegram.TelegramDesktop',
    'zen': 'Zen-Team.Zen-Browser',
    'zen browser': 'Zen-Team.Zen-Browser'
  };

  private constructor() {
    this.resetToDefaults();
    this.initStorage();
  }

  public static getInstance(): AppAliasRegistry {
    if (!AppAliasRegistry.instance) {
      AppAliasRegistry.instance = new AppAliasRegistry();
    }
    return AppAliasRegistry.instance;
  }

  private resetToDefaults(): void {
    this.aliases.clear();
    for (const [alias, actual] of Object.entries(this.defaultAliases)) {
      this.aliases.set(alias.toLowerCase().trim(), actual);
    }
  }

  private discoveredApps: Map<string, string> = new Map();

  private initStorage(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('cero_app_aliases');
        if (saved) {
          const custom = JSON.parse(saved);
          for (const [key, val] of Object.entries(custom)) {
            this.aliases.set(key.toLowerCase().trim(), String(val));
          }
        }
      } catch (e) {
        console.warn('[AppAliasRegistry] Could not read from localStorage:', e);
      }
    }

    // ~/.cero/app_aliases.json through the native store (the desktop app has no `process`,
    // so the old `process.env` check meant this never ran there)
    const underTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
    if (!underTest) {
      try {
        const saved = readCeroFile('app_aliases.json');
        if (saved?.trim()) {
          for (const [key, val] of Object.entries(JSON.parse(saved))) {
            this.aliases.set(key.toLowerCase().trim(), String(val));
          }
        }
      } catch { /* unreadable file: keep the defaults */ }
    }
  }

  /**
   * Installed applications found on this PC, by lower-case name.
   * TODO(3.7): fill from the Start menu (.lnk files and Get-StartApps), as AppCatalog does.
   */
  public async scanInstalledApplications(): Promise<Map<string, string>> {
    return this.discoveredApps;
  }

  private saveState(): void {
    const data: Record<string, string> = {};
    for (const [k, v] of this.aliases.entries()) {
      data[k] = v;
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('cero_app_aliases', JSON.stringify(data));
      } catch (e) {
        console.warn('[AppAliasRegistry] Failed saving to localStorage:', e);
      }
    }

    if (!(typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')) {
      writeCeroFile('app_aliases.json', JSON.stringify(data, null, 2));
    }
  }

  /**
   * Resolve an application name or alias to its actual native system desktop application name.
   */
  public resolve(appNameOrAlias: string): string {
    if (!appNameOrAlias) return '';
    const clean = appNameOrAlias.trim()
      .replace(/^["']|["']$/g, '')
      .replace(/^(?:the|my|a|an)\s+/i, '')
      .replace(/\s+(?:application|app|process)$/i, '')
      .trim();
    const lower = clean.toLowerCase();

    // 1. Direct explicit alias lookup
    if (this.aliases.has(lower)) {
      return this.aliases.get(lower)!;
    }

    // 2. Check if stripping the .exe suffix matches
    const noApp = lower.replace(/\.exe$/i, '').trim();
    if (this.aliases.has(noApp)) {
      return this.aliases.get(noApp)!;
    }

    // 3. Dynamically discovered desktop applications
    if (this.discoveredApps.has(lower)) {
      return this.discoveredApps.get(lower)!;
    }
    if (this.discoveredApps.has(noApp)) {
      return this.discoveredApps.get(noApp)!;
    }

    // 4. Fuzzy match in discovered applications
    for (const [key, executable] of this.discoveredApps.entries()) {
      if (key === lower || key.startsWith(`${lower} `) || key.endsWith(` ${lower}`) || key.includes(` ${lower} `)) {
        return executable;
      }
    }

    // Otherwise return original trimmed name
    return clean;
  }

  /**
   * Resolves an application name to its winget package id.
   * e.g., "Brave Browser" -> { id: "Brave.Brave", known: true }; an unknown name is passed on as the search term.
   */
  public resolvePackage(appNameOrAlias: string): { id: string; known: boolean } {
    if (!appNameOrAlias) return { id: '', known: false };
    const clean = appNameOrAlias.trim().replace(/^(?:the|my|a|an)\s+/i, '');
    const lower = clean.toLowerCase().replace(/\.exe$/i, '').trim();

    if (this.defaultPackages[lower]) {
      return { id: this.defaultPackages[lower], known: true };
    }

    // Check if the canonical resolved desktop name matches a known package
    const resolvedLower = this.resolve(appNameOrAlias).toLowerCase().replace(/\.exe$/i, '').trim();
    if (this.defaultPackages[resolvedLower]) {
      return { id: this.defaultPackages[resolvedLower], known: true };
    }

    return { id: clean, known: false };
  }

  /**
   * Set or update an application alias mapping and save to storage.
   */
  public setAlias(alias: string, actualAppName: string): void {
    if (!alias || !actualAppName) return;
    this.aliases.set(alias.toLowerCase().trim(), actualAppName.trim());
    this.saveState();
  }

  /**
   * Remove a custom alias from the registry.
   */
  public removeAlias(alias: string): boolean {
    const res = this.aliases.delete(alias.toLowerCase().trim());
    if (res) this.saveState();
    return res;
  }

  /**
   * Get all currently registered application aliases.
   */
  public getAll(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.aliases.entries()) {
      out[k] = v;
    }
    return out;
  }

  /**
   * For test resetting
   */
  public reset(): void {
    this.resetToDefaults();
  }
}
