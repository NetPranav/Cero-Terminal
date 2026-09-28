/**
 * platform.ts — Unified Cross-Platform Detection Utilities
 *
 * Provides reliable host operating system detection and UI helper methods across
 * Tauri webview runtimes, browser testing environments, and Node.js vitest contexts.
 */

export type Platform = 'linux' | 'macos' | 'windows';

/**
 * Detect the current host operating system.
 */
export function getPlatform(): Platform {
  // 1. Check Node/Vitest process.platform if available
  if (typeof process !== 'undefined' && process.platform) {
    if (process.platform === 'darwin') return 'macos';
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'linux') return 'linux';
  }

  // 2. Check browser / webview navigator user agent or platform
  if (typeof navigator !== 'undefined') {
    const ua = (navigator.userAgent || '').toLowerCase();
    const plat = (navigator.platform || '').toLowerCase();

    if (plat.includes('mac') || ua.includes('macintosh') || ua.includes('mac os x')) {
      return 'macos';
    }
    if (plat.includes('win') || ua.includes('windows')) {
      return 'windows';
    }
    if (plat.includes('linux') || ua.includes('linux') || ua.includes('x11')) {
      return 'linux';
    }
  }

  // Default fallback to linux in this environment
  return 'linux';
}

export function isLinux(): boolean {
  return getPlatform() === 'linux';
}

export function isMacOS(): boolean {
  return getPlatform() === 'macos';
}

export function isWindows(): boolean {
  return getPlatform() === 'windows';
}

/**
 * Get human-readable shortcut modifier for the current platform.
 * Returns 'Ctrl' on Linux and Windows, or '⌘' on macOS.
 */
export function getShortcutModifier(): string {
  return isMacOS() ? '⌘' : 'Ctrl';
}

/**
 * Get formatted shortcut string (e.g. 'Ctrl+T' on Linux, '⌘T' on macOS).
 */
export function formatShortcut(key: string, hasShift = false): string {
  if (isMacOS()) {
    return hasShift ? `⇧⌘${key.toUpperCase()}` : `⌘${key.toUpperCase()}`;
  }
  return hasShift ? `Ctrl+Shift+${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}

/**
 * True only for Windows platform names. Substring checks are wrong here: "darwin" contains "win".
 */
export function isWindowsName(os: string | undefined | null): boolean {
  return /^win(?:32|64|dows)?$/.test((os || '').trim().toLowerCase());
}
