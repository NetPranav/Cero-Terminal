/**
 * platform.ts — host platform helpers.
 *
 * This branch builds Cero for Windows only, so the platform is fixed.
 * TODO(3.1): replace with src/platform/os.ts (plugin-os `platform()` cached at startup, overridable in tests).
 */

export type Platform = 'windows';

/**
 * The host operating system.
 */
export function getPlatform(): Platform {
  return 'windows';
}

/**
 * Human-readable shortcut modifier.
 */
export function getShortcutModifier(): string {
  return 'Ctrl';
}

/**
 * Formatted shortcut string, e.g. 'Ctrl+T' or 'Ctrl+Shift+D'.
 */
export function formatShortcut(key: string, hasShift = false): string {
  return hasShift ? `Ctrl+Shift+${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}

/**
 * True only for Windows platform names. Substring checks are wrong here: "darwin" contains "win".
 */
export function isWindowsName(os: string | undefined | null): boolean {
  return /^win(?:32|64|dows)?$/.test((os || '').trim().toLowerCase());
}
