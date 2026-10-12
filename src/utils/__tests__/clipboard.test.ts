import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readClipboardText, writeClipboardText, formatTerminalPastePayload } from '../clipboard';

describe('Clipboard Utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatTerminalPastePayload', () => {
    it('returns empty string if text is empty', () => {
      expect(formatTerminalPastePayload('')).toBe('');
    });

    it('returns plain text when bracketed paste is disabled and not in prompt mode', () => {
      const input = 'git status';
      expect(formatTerminalPastePayload(input, { isBracketedPaste: false })).toBe('git status');
    });

    it('wraps text in bracketed paste escape sequences when isBracketedPaste is true', () => {
      const input = 'echo "hello world"';
      expect(formatTerminalPastePayload(input, { isBracketedPaste: true })).toBe('\x1b[200~echo "hello world"\x1b[201~');
    });

    it('flattens newlines when isPromptDraft is true and bracketed paste is disabled', () => {
      const multilinePrompt = 'Create a workspace\nInside it:\n1. Create frontend\n2. Create backend';
      const formatted = formatTerminalPastePayload(multilinePrompt, { isBracketedPaste: false, isPromptDraft: true });
      expect(formatted).toBe('Create a workspace Inside it: 1. Create frontend 2. Create backend');
    });

    it('preserves newlines inside bracketed paste even when isPromptDraft is true', () => {
      const multilinePrompt = 'Create a workspace\nInside it:\n1. Create frontend';
      const formatted = formatTerminalPastePayload(multilinePrompt, { isBracketedPaste: true, isPromptDraft: true });
      expect(formatted).toBe('\x1b[200~Create a workspace\nInside it:\n1. Create frontend\x1b[201~');
    });
  });

  describe('readClipboardText and writeClipboardText', () => {
    it('falls back to navigator.clipboard if Tauri plugin is unavailable', async () => {
      const mockClipboard = {
        readText: vi.fn().mockResolvedValue('test prompt from clipboard'),
        writeText: vi.fn().mockResolvedValue(undefined),
      };
      vi.stubGlobal('navigator', { clipboard: mockClipboard });

      const text = await readClipboardText();
      expect(text).toBe('test prompt from clipboard');

      const success = await writeClipboardText('copied text');
      expect(success).toBe(true);
      expect(mockClipboard.writeText).toHaveBeenCalledWith('copied text');
    });
  });
});
