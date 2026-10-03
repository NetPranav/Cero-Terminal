import { writeTextFile, readTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { isLinux } from '../../shared/platform';

export interface IntegrationStatus {
  cliInstalled: boolean;
  finderEnabled: boolean;
  vscodeConfigured: boolean;
  cursorConfigured: boolean;
  localBinInPath?: boolean;
}

const joinPath = (...parts: string[]): string => {
  return parts
    .filter(p => !!p)
    .map((p, idx) => {
      if (idx === 0) return p.replace(/\/+$/, '');
      return p.replace(/^\/+|\/+$/g, '');
    })
    .join('/') || '/';
};

const getDirname = (p: string): string => {
  const parts = p.replace(/\/+$/, '').split('/');
  parts.pop();
  return parts.join('/') || '/';
};

export const getHomeDir = (): string => {
  if (typeof process !== 'undefined' && process.env?.HOME) {
    return process.env.HOME;
  }
  return '/home/user';
};

export const safeExists = async (p: string): Promise<boolean> => {
  try {
    return await exists(p);
  } catch {
    try {
      return await invoke<boolean>('check_path_exists', { path: p });
    } catch {
      return false;
    }
  }
};

export const safeMkdir = async (p: string, options?: { recursive?: boolean }): Promise<void> => {
  try {
    await mkdir(p, options);
  } catch (e: any) {
    try {
      await invoke('create_system_dir', { path: p });
    } catch (err2: any) {
      throw new Error(e?.message || err2?.message || String(err2));
    }
  }
};

export const safeWriteTextFile = async (p: string, contents: string): Promise<void> => {
  try {
    await writeTextFile(p, contents);
  } catch (e: any) {
    try {
      await invoke('write_system_file', { path: p, contents });
    } catch (err2: any) {
      throw new Error(e?.message || err2?.message || String(err2));
    }
  }
};

export const safeReadTextFile = async (p: string): Promise<string> => {
  try {
    return await readTextFile(p);
  } catch (e: any) {
    try {
      return await invoke<string>('read_system_file', { path: p });
    } catch (err2: any) {
      throw new Error(e?.message || err2?.message || String(err2));
    }
  }
};

export class InstallerService {
  private static instance: InstallerService;

  private constructor() {}

  public static getInstance(): InstallerService {
    if (!InstallerService.instance) {
      InstallerService.instance = new InstallerService();
    }
    return InstallerService.instance;
  }

  /**
   * Helper to safely get the current user's home directory across Tauri and Node/Vitest runtimes.
   */
  public async getResolvedHomeDir(): Promise<string> {
    try {
      const res = await invoke<{ stdout: string }>('execute_command', {
        command: 'sh',
        args: ['-c', 'echo $HOME']
      });
      if (res?.stdout?.trim()) return res.stdout.trim();
    } catch {
      // Fallback
    }
    if (typeof process !== 'undefined' && process.env?.HOME) {
      return process.env.HOME;
    }
    return getHomeDir();
  }

  /**
   * Discover real executable path for Cero.
   */
  public async getAppBinaryPath(): Promise<string> {
    try {
      const res = await invoke<string>('get_app_binary_path');
      if (res && res.trim()) return res.trim();
    } catch {}
    return 'cero-terminal';
  }

  /**
   * Check whether ~/.local/bin is present in the current process environment PATH.
   */
  public async isLocalBinInPath(): Promise<boolean> {
    const home = await this.getResolvedHomeDir();
    const localBin = joinPath(home, '.local', 'bin');
    if (typeof process !== 'undefined' && process.env?.PATH) {
      const paths = process.env.PATH.split(':');
      if (paths.includes(localBin) || paths.includes('~/.local/bin')) return true;
    }
    try {
      const res = await invoke<{ stdout: string }>('execute_command', {
        command: 'sh',
        args: ['-c', 'echo $PATH']
      });
      if (res?.stdout) {
        const paths = res.stdout.trim().split(':');
        return paths.includes(localBin) || paths.includes('~/.local/bin');
      }
    } catch {}
    return false;
  }

  /**
   * Generate and install the cero-shell PTY wrapper for IDE integrated terminals.
   */
  public async ensureCeroShellWrapper(home: string): Promise<string> {
    const shellWrapperPath = joinPath(home, '.local', 'bin', 'cero-shell');
    try {
      const binDir = getDirname(shellWrapperPath);
      if (!(await safeExists(binDir))) {
        await safeMkdir(binDir, { recursive: true });
      }

      const script = `#!/usr/bin/env bash
# Cero IDE Integrated Shell Profile
# Runs within VS Code / Cursor integrated terminal (node-pty)

if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  export PATH="$HOME/.local/bin:$PATH"
fi

export CERO_IDE_INTEGRATED=1
export TERMINAL_EMULATOR="CeroTerminal"

if [ -f "$HOME/.cero/env" ]; then
  source "$HOME/.cero/env" 2>/dev/null || true
fi

USER_SHELL="\${SHELL:-/bin/bash}"
if [ "$USER_SHELL" = "$0" ] || [ ! -x "$USER_SHELL" ]; then
  USER_SHELL="/bin/bash"
fi

exec "$USER_SHELL" "$@"
`;
      await safeWriteTextFile(shellWrapperPath, script);
      try {
        await invoke('execute_command', {
          command: 'chmod',
          args: ['+x', shellWrapperPath]
        });
      } catch {}
    } catch {}
    return shellWrapperPath;
  }

  /**
   * Install FreeDesktop application entry with directory and URL scheme handlers.
   */
  public async ensureDesktopEntry(home: string): Promise<string> {
    const desktopPath = joinPath(home, '.local', 'share', 'applications', 'cero-terminal.desktop');
    try {
      const appsDir = getDirname(desktopPath);
      if (!(await safeExists(appsDir))) {
        await safeMkdir(appsDir, { recursive: true });
      }

      const desktopContent = `[Desktop Entry]
Name=Cero
Comment=Autonomous AI-Native Linux Terminal Copilot
GenericName=Terminal Emulator
Exec=cero-terminal %U
Icon=cero-terminal
Type=Application
Terminal=false
StartupNotify=true
StartupWMClass=cero-terminal
Categories=System;TerminalEmulator;Development;Utility;
Keywords=terminal;shell;ai;copilot;bash;pty;llama;
MimeType=inode/directory;x-scheme-handler/cero;
Actions=NewWindow;

[Desktop Action NewWindow]
Name=Open New Window
Exec=cero-terminal
`;
      await safeWriteTextFile(desktopPath, desktopContent);

      // Register MIME handlers if tools are present
      try {
        await invoke('execute_command', {
          command: 'update-desktop-database',
          args: [appsDir]
        });
      } catch {}
      try {
        await invoke('execute_command', {
          command: 'xdg-mime',
          args: ['default', 'cero-terminal.desktop', 'x-scheme-handler/cero']
        });
      } catch {}
    } catch {}
    return desktopPath;
  }

  /**
   * Install the 'cero' command line executable to target binary folder.
   * On Linux, defaults to rootless `~/.local/bin/cero` with fallback to `/usr/local/bin/cero`.
   */
  public async installCli(cliSourceContent?: string, targetPath?: string): Promise<{ success: boolean; error?: string }> {
    const home = await this.getResolvedHomeDir();
    const finalTargetPath = targetPath || (isLinux()
      ? joinPath(home, '.local', 'bin', 'cero')
      : '/usr/local/bin/cero');

    try {
      const dir = getDirname(finalTargetPath);
      const dirExists = await safeExists(dir);
      if (!dirExists) {
        await safeMkdir(dir, { recursive: true });
      }

      let detectedAppBin = 'cero-terminal';
      if (isLinux()) {
        detectedAppBin = await this.getAppBinaryPath();
      }

      const scriptContent = cliSourceContent || (isLinux()
        ? `#!/usr/bin/env bash
# Cero CLI Launcher (Linux)
set -e

# Multi-tier binary resolution
CANDIDATE_BIN="${detectedAppBin}"
if [ -n "$CANDIDATE_BIN" ] && [ -x "$CANDIDATE_BIN" ] && [ "$CANDIDATE_BIN" != "cero-terminal" ]; then
  APP_BIN="$CANDIDATE_BIN"
elif command -v cero-terminal >/dev/null 2>&1; then
  APP_BIN="$(command -v cero-terminal)"
elif [ -x "/usr/bin/cero-terminal" ]; then
  APP_BIN="/usr/bin/cero-terminal"
elif [ -x "/usr/local/bin/cero-terminal" ]; then
  APP_BIN="/usr/local/bin/cero-terminal"
elif [ -x "$HOME/.local/bin/cero-terminal" ]; then
  APP_BIN="$HOME/.local/bin/cero-terminal"
elif [ -n "$APPIMAGE" ] && [ -x "$APPIMAGE" ]; then
  APP_BIN="$APPIMAGE"
elif [ -x "$(dirname "$0")/cero-terminal" ]; then
  APP_BIN="$(dirname "$0")/cero-terminal"
else
  APP_BIN=""
fi

# Foreground diagnostic / live logging mode:
for arg in "$@"; do
  if [ "$arg" = "--debug" ] || [ "$arg" = "-d" ] || [ "$arg" = "--verbose" ] || [ "$arg" = "-v" ]; then
    if [ -n "$APP_BIN" ]; then
      exec "$APP_BIN" "$@"
    fi
  fi
done

if [ -n "$CERO_DEBUG" ]; then
  if [ -n "$APP_BIN" ]; then
    exec "$APP_BIN" "$@"
  fi
fi

target="$1"
if [ -z "$target" ]; then target="."; fi

# Direct pass-through for help and version queries
if [ "$target" = "--help" ] || [ "$target" = "-h" ] || [ "$target" = "--version" ]; then
  if [ -n "$APP_BIN" ]; then
    exec "$APP_BIN" "$@"
  fi
fi

if [ "$target" = "--new-tab" ]; then
  if [ -n "$APP_BIN" ]; then
    "$APP_BIN" --new-tab >/dev/null 2>&1 &
    exit 0
  fi
fi

if [ "$target" = "--split" ]; then
  if [ -n "$APP_BIN" ]; then
    "$APP_BIN" --split >/dev/null 2>&1 &
    exit 0
  fi
fi

# If target is a file, open terminal in containing folder
if [ -f "$target" ]; then
  target="$(dirname "$target")"
fi

resolved_path=$(cd "$target" 2>/dev/null && pwd || echo "$target")

if [ -n "$APP_BIN" ]; then
  "$APP_BIN" "$resolved_path" >/dev/null 2>&1 &
  exit 0
fi

# Fallback to desktop URL handler if binary was not found directly
if command -v xdg-open >/dev/null 2>&1; then
  if xdg-open "cero://open?path=$resolved_path" 2>/dev/null; then
    exit 0
  fi
fi

echo "cero: error: Cero binary ('cero-terminal') not found." >&2
echo "Please verify your installation or ensure cero-terminal is in PATH." >&2
exit 1
`
        : `#!/usr/bin/env bash
# Cero CLI Launcher (macOS)
APP_NAME="Cero"
target="$1"
if [ -z "$target" ]; then target="."; fi
if [ "$target" == "--new-tab" ]; then open "cero://new-tab?path=$(pwd)"; exit 0; fi
if [ "$target" == "--split" ]; then open "cero://split?path=$(pwd)"; exit 0; fi
open "cero://open?path=$(cd "$target" 2>/dev/null && pwd || echo "$target")" 2>/dev/null || open -a "$APP_NAME" "$target"
`);

      await safeWriteTextFile(finalTargetPath, scriptContent);

      // Apply executable permission on Linux
      if (isLinux()) {
        try {
          await invoke('execute_command', {
            command: 'chmod',
            args: ['+x', finalTargetPath]
          });
        } catch {
          // Non-fatal if running in mocked environment
        }

        // Also ensure shell wrapper and desktop entry exist
        await this.ensureCeroShellWrapper(home);
        await this.ensureDesktopEntry(home);
      }

      return { success: true };
    } catch (e: any) {
      if ((e?.code === 'EACCES' || String(e).includes('permission denied')) && finalTargetPath.startsWith('/usr/local/bin')) {
        const fallbackPath = joinPath(home, '.local', 'bin', 'cero');
        return this.installCli(cliSourceContent, fallbackPath);
      }
      return { success: false, error: e?.message || String(e) };
    }
  }

  /**
   * Enable Linux File Manager / macOS Finder context action ("Open in Cero").
   */
  public async enableFinderIntegration(targetServicesDir?: string): Promise<{ success: boolean; workflowPath: string; error?: string }> {
    const home = await this.getResolvedHomeDir();

    if (isLinux()) {
      const scriptDir = targetServicesDir || joinPath(home, '.local', 'share', 'nautilus', 'scripts');
      const scriptPath = joinPath(scriptDir, 'Open in Cero');
      try {
        if (!(await safeExists(scriptDir))) {
          await safeMkdir(scriptDir, { recursive: true });
        }
        const scriptContent = `#!/usr/bin/env bash
target="\${NAUTILUS_SCRIPT_SELECTED_FILE_PATHS:-\${NEMO_SCRIPT_SELECTED_FILE_PATHS:-\${CAJA_SCRIPT_SELECTED_FILE_PATHS:-\$PWD}}}"
target=\$(echo "\$target" | head -n 1)
if [ -z "\$target" ]; then target="\$PWD"; fi
if [ -f "\$target" ]; then target="\$(dirname "\$target")"; fi

if command -v cero >/dev/null 2>&1; then
  cero "\$target" &
elif [ -x "\$HOME/.local/bin/cero" ]; then
  "\$HOME/.local/bin/cero" "\$target" &
elif command -v cero-terminal >/dev/null 2>&1; then
  cero-terminal "\$target" &
elif [ -x "/usr/bin/cero-terminal" ]; then
  /usr/bin/cero-terminal "\$target" &
fi
`;
        await safeWriteTextFile(scriptPath, scriptContent);
        try {
          await invoke('execute_command', { command: 'chmod', args: ['+x', scriptPath] });
        } catch {}

        // 1. Cinnamon Nemo script
        const nemoDir = joinPath(home, '.local', 'share', 'nemo', 'scripts');
        try {
          if (!(await safeExists(nemoDir))) await safeMkdir(nemoDir, { recursive: true });
          await safeWriteTextFile(joinPath(nemoDir, 'Open in Cero'), scriptContent);
          try {
            await invoke('execute_command', { command: 'chmod', args: ['+x', joinPath(nemoDir, 'Open in Cero')] });
          } catch {}
        } catch {}

        // 2. MATE Caja script
        const cajaDir = joinPath(home, '.local', 'share', 'caja', 'scripts');
        try {
          if (!(await safeExists(cajaDir))) await safeMkdir(cajaDir, { recursive: true });
          await safeWriteTextFile(joinPath(cajaDir, 'Open in Cero'), scriptContent);
          try {
            await invoke('execute_command', { command: 'chmod', args: ['+x', joinPath(cajaDir, 'Open in Cero')] });
          } catch {}
        } catch {}

        // 3. KDE Dolphin KIO service menus (Plasma 6 & Plasma 5)
        const dolphinMenuContent = `[Desktop Entry]
Type=Service
ServiceTypes=KonqPopupMenu/Plugin,inode/directory
MimeType=inode/directory;
Actions=openInCero;
X-KDE-Priority=TopLevel

[Desktop Action openInCero]
Name=Open in Cero
Icon=cero-terminal
Exec=cero "%f"
`;
        const kioDir = joinPath(home, '.local', 'share', 'kio', 'servicemenus');
        try {
          if (!(await safeExists(kioDir))) await safeMkdir(kioDir, { recursive: true });
          await safeWriteTextFile(joinPath(kioDir, 'cero_open.desktop'), dolphinMenuContent);
        } catch {}

        const kservices5Dir = joinPath(home, '.local', 'share', 'kservices5', 'ServiceMenus');
        try {
          if (!(await safeExists(kservices5Dir))) await safeMkdir(kservices5Dir, { recursive: true });
          await safeWriteTextFile(joinPath(kservices5Dir, 'cero_open.desktop'), dolphinMenuContent);
        } catch {}

        // 4. XFCE Thunar Custom Actions (uca.xml)
        const thunarDir = joinPath(home, '.config', 'Thunar');
        const ucaPath = joinPath(thunarDir, 'uca.xml');
        try {
          if (!(await safeExists(thunarDir))) {
            await safeMkdir(thunarDir, { recursive: true });
          }
          let ucaXml = '';
          if (await safeExists(ucaPath)) {
            try {
              ucaXml = await safeReadTextFile(ucaPath);
            } catch {
              ucaXml = '';
            }
          }

          if (!ucaXml.includes('cero-open-terminal') && !ucaXml.includes('Open in Cero')) {
            const thunarAction = `\n<action>\n\t<icon>cero-terminal</icon>\n\t<name>Open in Cero</name>\n\t<submenu></submenu>\n\t<unique-id>cero-open-terminal</unique-id>\n\t<command>cero %f</command>\n\t<description>Open folder in Cero</description>\n\t<range></range>\n\t<patterns>*</patterns>\n\t<startup-notify/>\n\t<directories/>\n</action>\n`;
            if (ucaXml.includes('</actions>')) {
              ucaXml = ucaXml.replace('</actions>', `${thunarAction}</actions>`);
            } else {
              ucaXml = `<?xml version="1.0" encoding="UTF-8"?>\n<actions>${thunarAction}</actions>\n`;
            }
            await safeWriteTextFile(ucaPath, ucaXml);
          }
        } catch {}

        // 5. FreeDesktop desktop entry
        await this.ensureDesktopEntry(home);

        return { success: true, workflowPath: scriptPath };
      } catch (e: any) {
        return { success: false, workflowPath: scriptPath, error: e?.message || String(e) };
      }
    }

    // macOS Finder Quick Action Workflow
    const servicesDir = targetServicesDir || joinPath(home, 'Library', 'Services');
    const workflowPath = joinPath(servicesDir, 'Open in Cero.workflow');

    try {
      if (!(await safeExists(servicesDir))) {
        await safeMkdir(servicesDir, { recursive: true });
      }

      const contentsDir = joinPath(workflowPath, 'Contents');
      if (!(await safeExists(contentsDir))) {
        await safeMkdir(contentsDir, { recursive: true });
      }

      const infoPlistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Open in Cero</string>
  <key>CFBundleIdentifier</key>
  <string>com.cero.services.open</string>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict>
        <key>default</key>
        <string>Open in Cero</string>
      </dict>
      <key>NSMessage</key>
      <string>runWorkflowAsService</string>
      <key>NSSendTypes</key>
      <array>
        <string>public.folder</string>
      </array>
    </dict>
  </array>
</dict>
</plist>`;
      await safeWriteTextFile(joinPath(contentsDir, 'Info.plist'), infoPlistContent);

      const documentStub = `open "cero://open?path=$1"`;
      await safeWriteTextFile(joinPath(contentsDir, 'document.wflow'), documentStub);

      return { success: true, workflowPath };
    } catch (e: any) {
      return { success: false, workflowPath, error: e?.message || String(e) };
    }
  }

  /**
   * Helper method to inject custom profile into IDE settings.json cleanly.
   */
  private async updateIdeSettings(settingsPath: string, profileTitle: string, appPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const dir = getDirname(settingsPath);
      if (!(await safeExists(dir))) {
        await safeMkdir(dir, { recursive: true });
      }

      let config: any = {};
      if (await safeExists(settingsPath)) {
        try {
          const content = await safeReadTextFile(settingsPath);
          config = JSON.parse(content);
        } catch {
          config = {};
        }
      }

      const profileKey = isLinux() ? 'terminal.integrated.profiles.linux' : 'terminal.integrated.profiles.osx';

      if (!config[profileKey]) {
        config[profileKey] = {};
      }

      config[profileKey][profileTitle] = {
        path: appPath,
        icon: 'terminal',
        overrideName: true
      };

      // Also register external terminal launcher
      if (isLinux()) {
        config['terminal.external.linuxExec'] = 'cero-terminal';
      }

      await safeWriteTextFile(settingsPath, JSON.stringify(config, null, 2));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  /**
   * Configure VS Code integrated terminal profile.
   */
  public async configureVsCodeIntegration(mockSettingsPath?: string): Promise<{ success: boolean; error?: string }> {
    const home = await this.getResolvedHomeDir();
    const settingsPath = mockSettingsPath || (isLinux()
      ? joinPath(home, '.config', 'Code', 'User', 'settings.json')
      : joinPath(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json'));

    let binPath = '/Applications/Cero.app/Contents/MacOS/Cero';
    if (isLinux()) {
      if (mockSettingsPath) {
        binPath = joinPath(home, '.local', 'bin', 'cero-shell');
      } else {
        const sysWrapper = '/usr/bin/cero-shell';
        binPath = (await safeExists(sysWrapper)) ? sysWrapper : await this.ensureCeroShellWrapper(home);
      }
    }

    return this.updateIdeSettings(settingsPath, 'Cero Shell', binPath);
  }

  /**
   * Configure Cursor IDE integrated terminal profile.
   */
  public async configureCursorIntegration(mockSettingsPath?: string): Promise<{ success: boolean; error?: string }> {
    const home = await this.getResolvedHomeDir();
    const settingsPath = mockSettingsPath || (isLinux()
      ? joinPath(home, '.config', 'Cursor', 'User', 'settings.json')
      : joinPath(home, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json'));

    let binPath = '/Applications/Cero.app/Contents/MacOS/Cero';
    if (isLinux()) {
      if (mockSettingsPath) {
        binPath = joinPath(home, '.local', 'bin', 'cero-shell');
      } else {
        const sysWrapper = '/usr/bin/cero-shell';
        binPath = (await safeExists(sysWrapper)) ? sysWrapper : await this.ensureCeroShellWrapper(home);
      }
    }

    return this.updateIdeSettings(settingsPath, 'Cero Shell', binPath);
  }

  /**
   * Check status of all system integrations across Linux and macOS.
   */
  public async checkStatus(opts?: { cliPath?: string; servicesDir?: string; vscodePath?: string; cursorPath?: string }): Promise<IntegrationStatus> {
    const home = await this.getResolvedHomeDir();

    const cliPath = opts?.cliPath || (isLinux() ? joinPath(home, '.local', 'bin', 'cero') : '/usr/local/bin/cero');
    const servicesDir = opts?.servicesDir || (isLinux()
      ? joinPath(home, '.local', 'share', 'nautilus', 'scripts', 'Open in Cero')
      : joinPath(home, 'Library', 'Services', 'Open in Cero.workflow'));

    const vscodePath = opts?.vscodePath || (isLinux()
      ? joinPath(home, '.config', 'Code', 'User', 'settings.json')
      : joinPath(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json'));

    const cursorPath = opts?.cursorPath || (isLinux()
      ? joinPath(home, '.config', 'Cursor', 'User', 'settings.json')
      : joinPath(home, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json'));

    const cliInstalled = (await safeExists(cliPath))
      || (await safeExists(joinPath(home, '.local', 'bin', 'cero')))
      || (await safeExists('/usr/local/bin/cero'))
      || (await safeExists('/usr/bin/cero-terminal'))
      || (await safeExists('/usr/bin/cero'));

    const finderEnabled = (await safeExists(servicesDir))
      || (await safeExists(joinPath(home, '.local', 'share', 'kio', 'servicemenus', 'cero_open.desktop')))
      || (await safeExists(joinPath(home, '.local', 'share', 'applications', 'cero-terminal.desktop')))
      || (await safeExists(joinPath(home, '.local', 'share', 'applications', 'com.pranav.cero-terminal.desktop')));

    const profileKey = isLinux() ? 'terminal.integrated.profiles.linux' : 'terminal.integrated.profiles.osx';

    let vscodeConfigured = false;
    if (await safeExists(vscodePath)) {
      try {
        const data = JSON.parse(await safeReadTextFile(vscodePath));
        const profiles = data[profileKey] || data['terminal.integrated.profiles.linux'] || data['terminal.integrated.profiles.osx'] || {};
        vscodeConfigured = !!(profiles['Cero Shell'] || profiles['Cero']);
      } catch {}
    }

    let cursorConfigured = false;
    if (await safeExists(cursorPath)) {
      try {
        const data = JSON.parse(await safeReadTextFile(cursorPath));
        const profiles = data[profileKey] || data['terminal.integrated.profiles.linux'] || data['terminal.integrated.profiles.osx'] || {};
        cursorConfigured = !!(profiles['Cero Shell'] || profiles['Cero']);
      } catch {}
    }

    let localBinInPath: boolean | undefined = undefined;
    if (isLinux()) {
      localBinInPath = await this.isLocalBinInPath();
    }

    return { cliInstalled, finderEnabled, vscodeConfigured, cursorConfigured, localBinInPath };
  }
}
