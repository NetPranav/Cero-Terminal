/**
 * FlowStore.ts — where a generated .flow file goes, and writing it without overwriting anything.
 *
 * The folders come from the operating system (Desktop is often redirected: OneDrive on Windows),
 * not from guessing $HOME/Desktop. Writing goes through the app's file commands; tests pass their own.
 */

import { flowFileName } from './FlowAuthoring';

export interface FlowIO {
  exists(path: string): Promise<boolean>;
  write(path: string, text: string): Promise<void>;
}

export interface FlowFolders {
  home: string;
  desktop: string;
  /** ~/.cero/workflows: the Workflow Manager lists the flows saved here */
  workflows: string;
}

const sepOf = (p: string) => (/\\/.test(p) && !/\//.test(p) ? '\\' : '/');
export const joinPath = (folder: string, name: string) => `${folder.replace(/[\\/]+$/, '')}${sepOf(folder)}${name}`;

/** The app's file commands (Tauri) */
export const appFlowIO: FlowIO = {
  async exists(path) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<boolean>('check_path_exists', { path });
  },
  async write(path, text) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_system_file', { path, contents: text });
  },
};

/** Home, Desktop and the workflows folder for this user */
export async function flowFolders(): Promise<FlowFolders> {
  let home = '';
  let desktop = '';
  try {
    const api = await import('@tauri-apps/api/path');
    home = (await api.homeDir()).replace(/[\\/]+$/, '');
    desktop = (await api.desktopDir()).replace(/[\\/]+$/, '');
  } catch {
    // Outside the desktop app (command-line agent, tests)
    const env = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>);
    home = (env.HOME || env.USERPROFILE || '').replace(/[\\/]+$/, '');
  }
  if (!home) throw new Error('Could not find your home folder');
  const sep = sepOf(home);
  return { home, desktop: desktop || `${home}${sep}Desktop`, workflows: `${home}${sep}.cero${sep}workflows` };
}

/** "~" and "~/x" as an absolute path; anything else unchanged */
export function expandHome(path: string, home: string): string {
  const p = path.trim().replace(/^["'`]|["'`]$/g, '');
  if (p === '~') return home;
  if (p.startsWith('~/') || p.startsWith('~\\')) return joinPath(home, p.slice(2));
  return p;
}

/** A path that is free: "name.flow", then "name-2.flow" ... (an existing file is never replaced) */
export async function freeFlowPath(folder: string, name: string, io: FlowIO): Promise<string> {
  const file = flowFileName(name);
  const base = file.replace(/\.flow$/, '');
  for (let n = 1; n < 100; n++) {
    const candidate = joinPath(folder, n === 1 ? file : `${base}-${n}.flow`);
    if (!(await io.exists(candidate))) return candidate;
  }
  throw new Error(`Too many files named ${file} in ${folder}`);
}

/** A custom answer is a folder, or a full path ending in .flow */
export async function resolveCustomTarget(text: string, name: string, folders: FlowFolders, cwd: string, io: FlowIO): Promise<string> {
  const p = expandHome(text, folders.home);
  const absolute = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(p);
  const full = absolute ? p : joinPath(cwd, p);
  if (/\.flow$/i.test(full)) {
    if (await io.exists(full)) {
      const dir = full.replace(/[\\/][^\\/]+$/, '');
      return freeFlowPath(dir, full.split(/[\\/]/).pop()!.replace(/\.flow$/i, ''), io);
    }
    return full;
  }
  return freeFlowPath(full, name, io);
}
