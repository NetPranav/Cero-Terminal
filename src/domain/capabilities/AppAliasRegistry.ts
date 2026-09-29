/**
 * AppAliasRegistry.ts — Persistent Application Registry & Alias Resolution
 * 
 * Manages native OS desktop application naming mappings and aliases.
 * Solves common macOS naming discrepancies (e.g., "chrome" -> "Google Chrome")
 * and enables runtime user customization via the /app or /alias slash command.
 */

import { readSentinelFile, writeSentinelFile } from '../../infrastructure/storage/SentinelFiles';

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
    'messages': 'Messages',
    'notes': 'Notes',
    'mail': 'Mail',
    'calendar': 'Calendar',
    'calculator': 'Calculator',
    'safari': 'Safari',
    'terminal': 'Terminal',
    'sentinel': 'Sentinel Terminal',
    'sentinel terminal': 'Sentinel Terminal',
    'antigravity': 'Antigravity IDE',
    'antigravity ide': 'Antigravity IDE',
    'cursor': 'Cursor',
    'cursor ai': 'Cursor',
    'finder': 'Finder',
    'music': 'Music',
    'apple music': 'Music'
  };

  private defaultCasks: Record<string, string> = {
    'brave': 'brave-browser',
    'brave browser': 'brave-browser',
    'chrome': 'google-chrome',
    'google chrome': 'google-chrome',
    'googlechrome': 'google-chrome',
    'vscode': 'visual-studio-code',
    'vs code': 'visual-studio-code',
    'code': 'visual-studio-code',
    'visual studio code': 'visual-studio-code',
    'sublime': 'sublime-text',
    'sublime text': 'sublime-text',
    'firefox': 'firefox',
    'edge': 'microsoft-edge',
    'microsoft edge': 'microsoft-edge',
    'pycharm': 'pycharm',
    'intellij': 'intellij-idea',
    'intellij idea': 'intellij-idea',
    'webstorm': 'webstorm',
    'spotify': 'spotify',
    'discord': 'discord',
    'slack': 'slack',
    'zoom': 'zoom',
    'cursor': 'cursor',
    'cursor ai': 'cursor',
    'vlc': 'vlc',
    'postman': 'postman',
    'notion': 'notion',
    'obs': 'obs',
    'obs studio': 'obs',
    'docker': 'docker',
    'raycast': 'raycast',
    'alacritty': 'alacritty',
    'kitty': 'kitty',
    'iterm': 'iterm2',
    'iterm2': 'iterm2',
    'arc': 'arc',
    'arc browser': 'arc',
    'telegram': 'telegram',
    'whatsapp': 'whatsapp'
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
  private isScanningApps = false;

  private initStorage(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('sentinel_app_aliases');
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

    // ~/.sentinel/app_aliases.json through the native store (the desktop app has no `process`,
    // so the old `process.env` check meant this never ran there)
    const underTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
    if (!underTest) {
      try {
        const saved = readSentinelFile('app_aliases.json');
        if (saved?.trim()) {
          for (const [key, val] of Object.entries(JSON.parse(saved))) {
            this.aliases.set(key.toLowerCase().trim(), String(val));
          }
        }
      } catch { /* unreadable file: keep the defaults */ }
    }
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {

      // Scan installed desktop applications dynamically
      this.scanInstalledApplications().catch(() => { /* Ignore */ });
    }
  }

  /**
   * Dynamically scan native desktop application entry files (.desktop on Linux, /Applications on macOS)
   * into executable application mappings.
   */
  public async scanInstalledApplications(): Promise<Map<string, string>> {
    if (this.discoveredApps.size > 0 && !this.isScanningApps) {
      return this.discoveredApps;
    }
    this.isScanningApps = true;

    try {
      if (typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)) {
        const { invoke: nativeInvoke } = await import('@tauri-apps/api/core');

        const pyScanner = `python3 -c "
import os, glob, re, shutil, json

apps = {}
dirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    os.path.expanduser('~/.local/share/applications'),
    '/var/lib/flatpak/exports/share/applications',
    os.path.expanduser('~/.local/share/flatpak/exports/share/applications'),
    '/var/lib/snapd/desktop/applications'
]

for d in dirs:
    if not os.path.isdir(d): continue
    for f in glob.glob(os.path.join(d, '*.desktop')):
        try:
            with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
                name, exec_cmd = None, None
                for line in fp:
                    line = line.strip()
                    if line.startswith('Name=') and not name:
                        name = line[5:].strip()
                    elif line.startswith('Exec=') and not exec_cmd:
                        raw = line[5:].strip()
                        clean = re.sub(r'%[a-zA-Z]', '', raw).strip()
                        exec_cmd = clean.split()[0] if clean else None
                    if name and exec_cmd: break
                if name and exec_cmd:
                    base = os.path.splitext(os.path.basename(f))[0].lower()
                    executable = None
                    for cand in [f'{base}-browser', base, os.path.basename(exec_cmd), exec_cmd]:
                        if cand and shutil.which(cand):
                            executable = cand
                            break
                    if not executable and os.path.isabs(exec_cmd) and os.path.exists(exec_cmd):
                        executable = exec_cmd
                    if executable:
                        apps[name.lower()] = executable
                        apps[base] = executable
                        clean_name = re.sub(r'\\s+(browser|editor|terminal|client|player)$', '', name.lower())
                        apps[clean_name] = executable
        except: pass

print(json.dumps(apps))
" 2>/dev/null`;

        const res = await nativeInvoke<{ stdout: string }>('execute_command', {
          command: 'sh',
          args: ['-c', pyScanner]
        });
        const stdout = (res?.stdout || '').trim();
        if (stdout.startsWith('{')) {
          const parsed = JSON.parse(stdout) as Record<string, string>;
          for (const [k, v] of Object.entries(parsed)) {
            if (k && v) this.discoveredApps.set(k.toLowerCase().trim(), v);
          }
        }
      }
    } catch (e) {
      console.warn('[AppAliasRegistry] Desktop application scan failed:', e);
    } finally {
      this.isScanningApps = false;
    }

    return this.discoveredApps;
  }

  private saveState(): void {
    const data: Record<string, string> = {};
    for (const [k, v] of this.aliases.entries()) {
      data[k] = v;
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('sentinel_app_aliases', JSON.stringify(data));
      } catch (e) {
        console.warn('[AppAliasRegistry] Failed saving to localStorage:', e);
      }
    }

    if (!(typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')) {
      writeSentinelFile('app_aliases.json', JSON.stringify(data, null, 2));
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

    // 2. Check if stripping .app suffix matches
    const noApp = lower.replace(/\.app$/i, '').trim();
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
   * Resolves an application name or alias to its actual executable binary command.
   */
  public resolveBinary(appNameOrAlias: string): string {
    const resolved = this.resolve(appNameOrAlias);
    const lower = resolved.toLowerCase();

    const binaryMap: Record<string, string> = {
      'visual studio code': 'code',
      'vscode': 'code',
      'google chrome': 'google-chrome-stable',
      'chrome': 'google-chrome-stable',
      'brave browser': 'brave',
      'sublime text': 'subl',
      'intellij idea': 'idea',
      'zen browser': 'zen-browser',
      'zen': 'zen-browser'
    };

    if (binaryMap[lower]) {
      return binaryMap[lower];
    }

    return resolved;
  }

  /**
   * Resolves an application name to its Homebrew package/cask identifier on macOS.
   * e.g., "Brave Browser" -> { name: "brave-browser", isCask: true }
   */
  public resolvePackage(appNameOrAlias: string): { name: string; isCask: boolean } {
    if (!appNameOrAlias) return { name: '', isCask: false };
    const clean = appNameOrAlias.trim().replace(/^(?:the|my|a|an)\s+/i, '');
    const lower = clean.toLowerCase().replace(/\.app$/i, '').trim();

    if (this.defaultCasks[lower]) {
      return { name: this.defaultCasks[lower], isCask: true };
    }

    // Check if the canonical resolved desktop name matches a known cask
    const resolvedLower = this.resolve(appNameOrAlias).toLowerCase().replace(/\.app$/i, '').trim();
    if (this.defaultCasks[resolvedLower]) {
      return { name: this.defaultCasks[resolvedLower], isCask: true };
    }

    // Heuristic: If it has spaces or desktop app suffixes, normalize to kebab-case cask
    const isLikelyCask = clean.includes(' ') || lower.endsWith('browser') || lower.endsWith('app') || lower.endsWith('ide') || lower.endsWith('studio');
    const kebab = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return { name: kebab, isCask: isLikelyCask };
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
