/**
 * Preference: may the Right arrow accept the grey suggestion at the end of the line?
 *
 * Off unless the user turns it on in Settings. Arrow keys only move the cursor by default, so
 * walking through a prompt can never commit suggested text; Tab is the explicit accept key.
 */
export const GHOST_ACCEPT_RIGHT_KEY = 'cero_ghost_accept_right';

export function readGhostAcceptRight(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    return s?.getItem(GHOST_ACCEPT_RIGHT_KEY) === 'true';
  } catch {
    return false;
  }
}
