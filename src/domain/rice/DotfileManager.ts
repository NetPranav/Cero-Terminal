/**
 * Cero — Safe Dotfile & Rice Configuration Manager
 *
 * Provides safe, non-destructive configuration editing for window managers
 * (Hyprland, i3, Sway), terminal emulators, shells, and autostart files.
 * Includes automatic backups and unified diff generation before committing edits.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DotfileTarget {
  id: string; // 'hyprland' | 'i3' | 'sway' | 'waybar' | 'bashrc' | 'zshrc' | 'autostart'
  name: string;
  relativePath: string;
  autostartSyntax: 'hyprland' | 'i3' | 'desktop' | 'shell';
}

export interface DotfileChangeResult {
  success: boolean;
  modifiedFile: string;
  backupPath?: string;
  diff: string;
  actionTaken: string;
  error?: string;
}

export interface FileSystemIO {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  copyFile: (src: string, dest: string) => Promise<void>;
  exists: (filePath: string) => Promise<boolean>;
}

export class DotfileManager {
  /** Known standard rice configuration targets */
  public static readonly TARGETS: Record<string, DotfileTarget> = {
    hyprland: {
      id: 'hyprland',
      name: 'Hyprland Compositor Config',
      relativePath: '.config/hypr/hyprland.conf',
      autostartSyntax: 'hyprland'
    },
    i3: {
      id: 'i3',
      name: 'i3 Window Manager Config',
      relativePath: '.config/i3/config',
      autostartSyntax: 'i3'
    },
    sway: {
      id: 'sway',
      name: 'Sway Window Manager Config',
      relativePath: '.config/sway/config',
      autostartSyntax: 'i3'
    },
    autostart: {
      id: 'autostart',
      name: 'XDG Desktop Autostart Directory',
      relativePath: '.config/autostart',
      autostartSyntax: 'desktop'
    },
    bashrc: {
      id: 'bashrc',
      name: 'Bash Shell Configuration',
      relativePath: '.bashrc',
      autostartSyntax: 'shell'
    },
    zshrc: {
      id: 'zshrc',
      name: 'Zsh Shell Configuration',
      relativePath: '.zshrc',
      autostartSyntax: 'shell'
    }
  };

  private static defaultIO: FileSystemIO = {
    readFile: async (p) => fs.promises.readFile(p, 'utf-8'),
    writeFile: async (p, c) => fs.promises.writeFile(p, c, 'utf-8'),
    copyFile: async (s, d) => fs.promises.copyFile(s, d),
    exists: async (p) => fs.existsSync(p)
  };

  /**
   * Resolves the absolute path for a dotfile target.
   */
  public static resolvePath(targetKey: string, customHome?: string, appName?: string): string {
    const home = customHome || process.env.HOME || process.env.USERPROFILE || '';
    const target = this.TARGETS[targetKey.toLowerCase()];
    if (target) {
      if (target.id === 'autostart' && appName) {
        return path.join(home, target.relativePath, `${appName.toLowerCase().replace(/[^a-z0-9_-]/g, '')}.desktop`);
      }
      return path.join(home, target.relativePath);
    }
    // If passed directly as a relative or absolute path
    if (targetKey.startsWith('~')) {
      return path.join(home, targetKey.slice(1));
    }
    return path.isAbsolute(targetKey) ? targetKey : path.join(home, targetKey);
  }

  /**
   * Safely toggle (enable/disable) an application or script in autostart / rice configuration.
   */
  public static async toggleAutostart(
    appName: string,
    enable: boolean,
    targetKey: string = 'hyprland',
    io: FileSystemIO = this.defaultIO,
    customHome?: string
  ): Promise<DotfileChangeResult> {
    const filePath = this.resolvePath(targetKey, customHome, appName);
    const target = this.TARGETS[targetKey.toLowerCase()] || this.TARGETS.hyprland;

    const fileExists = await io.exists(filePath);
    if (!fileExists) {
      if (target.autostartSyntax === 'desktop' && enable) {
        const cleanApp = appName.trim();
        const desktopContent = `[Desktop Entry]\nType=Application\nName=${cleanApp}\nExec=${cleanApp}\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n`;
        await io.writeFile(filePath, desktopContent);
        return {
          success: true,
          modifiedFile: filePath,
          diff: `+ ${desktopContent.trim()}`,
          actionTaken: `Created XDG autostart entry for "${cleanApp}" at ${filePath}`
        };
      }
      return {
        success: false,
        modifiedFile: filePath,
        diff: '',
        actionTaken: 'none',
        error: `Configuration file does not exist at: ${filePath}`
      };
    }

    const originalContent = await io.readFile(filePath);
    const lines = originalContent.split('\n');
    let modified = false;
    let actionTaken = '';

    const cleanApp = appName.trim();
    const appRegex = new RegExp(`\\b${cleanApp}\\b`, 'i');

    const newLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check if line relates to our target app
      if (appRegex.test(line)) {
        if (!enable) {
          // DISABLING: Comment out if currently active
          if (!trimmed.startsWith('#')) {
            newLines.push(`# ${line} # Disabled by Cero`);
            modified = true;
            actionTaken = `Commented out autostart for "${cleanApp}"`;
            continue;
          }
        } else {
          // ENABLING: Uncomment if commented
          if (trimmed.startsWith('#')) {
            const uncommented = line.replace(/^\s*#\s*/, '').replace(/\s*#\s*Disabled by Cero.*$/, '');
            newLines.push(uncommented);
            modified = true;
            actionTaken = `Uncommented autostart for "${cleanApp}"`;
            continue;
          }
        }
      }
      newLines.push(line);
    }

    // If enabling and line was never present in the file, append new directive
    if (enable && !modified) {
      let directive = '';
      if (target.autostartSyntax === 'hyprland') {
        directive = `exec-once = ${cleanApp}`;
      } else if (target.autostartSyntax === 'i3') {
        directive = `exec --no-startup-id ${cleanApp}`;
      } else {
        directive = `${cleanApp} &`;
      }
      newLines.push('');
      newLines.push(`# Added by Cero`);
      newLines.push(directive);
      modified = true;
      actionTaken = `Added new autostart directive: "${directive}"`;
    }

    if (!modified) {
      return {
        success: true,
        modifiedFile: filePath,
        diff: '',
        actionTaken: `No change required; "${cleanApp}" already in desired state.`
      };
    }

    const newContent = newLines.join('\n');
    const diff = this.generateDiff(originalContent, newContent, path.basename(filePath));

    // Create safe timestamped backup before writing
    const backupPath = `${filePath}.bak_${Date.now()}`;
    await io.writeFile(backupPath, originalContent);
    await io.writeFile(filePath, newContent);

    return {
      success: true,
      modifiedFile: filePath,
      backupPath,
      diff,
      actionTaken
    };
  }

  /**
   * Generates a clean unified diff between two text strings.
   */
  public static generateDiff(oldText: string, newText: string, fileName: string = 'config'): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const diffLines: string[] = [`--- a/${fileName}`, `+++ b/${fileName}`];

    const maxLines = Math.max(oldLines.length, newLines.length);
    let diffCount = 0;

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine !== newLine) {
        if (oldLine !== undefined) diffLines.push(`- ${oldLine}`);
        if (newLine !== undefined) diffLines.push(`+ ${newLine}`);
        diffCount++;
      }
    }

    return diffCount > 0 ? diffLines.join('\n') : '';
  }
}
