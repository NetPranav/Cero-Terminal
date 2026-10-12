/**
 * homeDir.ts: the user's home folder (C:\Users\<name>), without starting a shell.
 */

let cached: string | undefined;

/** The home folder without a trailing separator, or '' when it cannot be found */
export async function homeDirectory(): Promise<string> {
  if (cached) return cached;
  let home = '';
  try {
    const api = await import('@tauri-apps/api/path');
    home = await api.homeDir();
  } catch {
    // Outside the desktop app (command-line agent, tests)
    const env = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>);
    home = env.USERPROFILE || env.HOME || '';
  }
  home = home.replace(/[\\/]+$/, '');
  if (home) cached = home;
  return home;
}
