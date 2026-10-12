/**
 * clipboard.ts — Unified Native & Web Clipboard Management for Cero
 * 
 * Provides clipboard access through Tauri's native clipboard plugin, with fallback to the Web API
 * navigator.clipboard for test and browser environments.
 */

let cachedClipboardPlugin: typeof import('@tauri-apps/plugin-clipboard-manager') | null = null;
let clipboardPluginAttempted = false;

async function getClipboardPlugin(): Promise<typeof import('@tauri-apps/plugin-clipboard-manager') | null> {
  if (clipboardPluginAttempted) return cachedClipboardPlugin;
  try {
    cachedClipboardPlugin = await import('@tauri-apps/plugin-clipboard-manager');
  } catch {
    cachedClipboardPlugin = null;
  }
  clipboardPluginAttempted = true;
  return cachedClipboardPlugin;
}

/**
 * Reads plain text from the system clipboard.
 * Prioritizes the Tauri native clipboard plugin, which needs no WebView permission prompt.
 */
export async function readClipboardText(): Promise<string> {
  // 1. Try the native clipboard via the Tauri plugin
  try {
    const plugin = await getClipboardPlugin();
    if (plugin && typeof plugin.readText === 'function') {
      const text = await plugin.readText();
      if (typeof text === 'string' && text.length > 0) {
        return text;
      }
    }
  } catch {
    // Tauri native clipboard unavailable or threw, proceed to fallback
  }

  // 2. Fallback to Web API navigator.clipboard
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      const text = await navigator.clipboard.readText();
      if (typeof text === 'string' && text.length > 0) {
        return text;
      }
    }
  } catch {
    // navigator.clipboard access denied or failed
  }

  return '';
}

/**
 * Writes plain text to the system clipboard.
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  let written = false;

  // 1. Try native desktop clipboard via Tauri plugin
  try {
    const plugin = await getClipboardPlugin();
    if (plugin && typeof plugin.writeText === 'function') {
      await plugin.writeText(text);
      written = true;
      return true;
    }
  } catch {
    // Proceed to fallback
  }

  // 2. Fallback to Web API navigator.clipboard
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      written = true;
    }
  } catch {
    // navigator.clipboard write failed
  }

  return written;
}

/**
 * Formats clipboard text for writing to a PTY terminal buffer.
 * If bracketed paste mode is active in the terminal, wraps text in escape codes (\x1b[200~ ... \x1b[201~).
 * If bracketed paste is inactive and the user is drafting an AI prompt ('>'), flattens internal line breaks
 * to prevent the shell from executing partial commands prematurely.
 */
export function formatTerminalPastePayload(
  text: string,
  options: {
    isBracketedPaste?: boolean;
    isPromptDraft?: boolean;
  } = {}
): string {
  if (!text) return '';

  if (options.isBracketedPaste) {
    return `\x1b[200~${text}\x1b[201~`;
  }

  if (options.isPromptDraft && (text.includes('\n') || text.includes('\r'))) {
    // Flatten multiline prompts into single instruction to avoid shell line-by-line execution
    return text.replace(/\r?\n+/g, ' ').trim();
  }

  return text;
}
