/**
 * escapeKey.ts — pure decision function for the Escape key and the Settings screen.
 *
 * Extracted from the App.tsx effect so the logic can be unit-tested without a DOM
 * or component rendering.  The effect calls this function; the function never
 * touches React or the DOM.
 */

export interface EscapeKeyInput {
  /** The keyboard event key value. */
  key: string;
  /** Whether `event.defaultPrevented` is true. */
  defaultPrevented: boolean;
  /** Whether the Settings screen is currently open. */
  settingsOpen: boolean;
  /** Whether a child control inside Settings that owns its own Esc handling is open. */
  escOwnerOpen: boolean;
}

/**
 * Returns `true` when Esc should close the Settings screen.
 *
 * False in every other case:
 * - Settings is not open
 * - The key is not Escape
 * - A child control inside Settings owns the Esc (an open dropdown, inline editor, etc.)
 * - The event was already handled (`defaultPrevented`)
 */
export function shouldCloseSettings(input: EscapeKeyInput): boolean {
  if (input.key !== 'Escape') return false;
  if (!input.settingsOpen) return false;
  if (input.defaultPrevented) return false;
  if (input.escOwnerOpen) return false;
  return true;
}

/**
 * Attaches the capture-phase Escape listener for the Settings screen and returns its remover.
 * Capture phase matters: it runs before xterm's own key handling, which would otherwise swallow
 * the key while the terminal textarea still holds focus underneath the full-frame Settings.
 */
export function installSettingsEscape(
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  deps: { hasEscOwnerOpen: () => boolean; close: () => void },
): () => void {
  const onKey = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (!shouldCloseSettings({
      key: ke.key,
      defaultPrevented: ke.defaultPrevented,
      settingsOpen: true,
      escOwnerOpen: deps.hasEscOwnerOpen(),
    })) return;
    ke.preventDefault();
    ke.stopPropagation();
    deps.close();
  };
  target.addEventListener('keydown', onKey, true);
  return () => target.removeEventListener('keydown', onKey, true);
}
