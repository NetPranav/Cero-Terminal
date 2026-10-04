/**
 * Preference: may the Right arrow accept the grey suggestion at the end of the line?
 *
 * On unless the user turns it off in Settings. Right goes through the same accept as Tab, which
 * only types a suggestion that still matches the live line, and only when the cursor is at the
 * end, so moving through a prompt still never commits suggested text.
 */
export const GHOST_ACCEPT_RIGHT_KEY = 'cero_ghost_accept_right';

export function readGhostAcceptRight(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    return s?.getItem(GHOST_ACCEPT_RIGHT_KEY) !== 'false';
  } catch {
    return true;
  }
}
