/**
 * SentinelFiles.ts — read and write files under ~/.sentinel without a shell.
 *
 * Learning stores, app aliases and the audit log used `sh -c "echo '<json>' >> ~/.sentinel/..."`.
 * That does not exist on Windows, and JSON does not escape single quotes, so a logged command
 * containing `'` could break out of the quoting and run as a shell command. These helpers go
 * through `fs`: in the desktop app that is the fs polyfill backed by the native
 * sentinel_store_* commands (path-checked in Rust); in Node (CLI, tests) it is the real file system.
 */

import * as fs from 'fs';

function sentinelBase(): string {
  const env = typeof process !== 'undefined' && process.env ? process.env : undefined;
  const home = env?.HOME || env?.USERPROFILE;
  // The polyfill only needs the "/.sentinel/" marker; Node needs the real home
  return `${(home || '~').replace(/\\/g, '/')}/.sentinel`;
}

/** Absolute (Node) or marker (app) path of ~/.sentinel/<relative> */
export function sentinelPath(relative: string): string {
  return `${sentinelBase()}/${relative.replace(/^\/+/, '')}`;
}

function ensureParent(file: string): void {
  const dir = file.slice(0, file.lastIndexOf('/'));
  try {
    fs.mkdirSync?.(dir, { recursive: true });
  } catch {
    // the polyfill creates parents itself
  }
}

export function readSentinelFile(relative: string): string | null {
  try {
    const file = sentinelPath(relative);
    return fs.existsSync(file) ? String(fs.readFileSync(file, 'utf8')) : null;
  } catch {
    return null;
  }
}

export function writeSentinelFile(relative: string, contents: string): boolean {
  try {
    const file = sentinelPath(relative);
    ensureParent(file);
    fs.writeFileSync(file, contents, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function appendSentinelFile(relative: string, contents: string): boolean {
  try {
    const file = sentinelPath(relative);
    ensureParent(file);
    fs.appendFileSync(file, contents, 'utf8');
    return true;
  } catch {
    return false;
  }
}
