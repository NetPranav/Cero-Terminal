import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchAddon } from '@xterm/addon-search';
import { Terminal } from '@xterm/xterm';

describe('Terminal Buffer Regex Search (Phase 3)', () => {
  let term: Terminal;
  let searchAddon: SearchAddon;

  beforeEach(() => {
    term = new Terminal({
      rows: 24,
      cols: 80,
      allowProposedApi: true
    });
    // In headless test environments without DOM mounting, provide a stub selectionService
    (term as any)._core._selectionService = {
      hasSelection: false,
      selectionPosition: undefined,
      setSelection: () => {},
      clearSelection: () => {},
      getSelection: () => '',
      onSelectionChange: () => ({ dispose: () => {} })
    };
    searchAddon = new SearchAddon({
      highlightLimit: 1000
    });
    term.loadAddon(searchAddon);
  });

  it('loads SearchAddon onto Terminal instance cleanly', () => {
    expect(searchAddon).toBeDefined();
    expect(typeof searchAddon.findNext).toBe('function');
    expect(typeof searchAddon.findPrevious).toBe('function');
    expect(typeof searchAddon.clearDecorations).toBe('function');
  });

  it('finds exact matching text in buffer forwards and backwards', async () => {
    // Write sample logs into the terminal and wait for buffer flush
    await new Promise<void>((resolve) => term.write('2026-09-14 12:00:01 INFO Server running on port 3000\r\n', () => resolve()));
    await new Promise<void>((resolve) => term.write('2026-09-14 12:00:02 ERROR Connection refused to redis:6379\r\n', () => resolve()));
    await new Promise<void>((resolve) => term.write('2026-09-14 12:00:03 INFO Retry successful on port 3000\r\n', () => resolve()));

    // Search forward for "port 3000"
    const foundNext = searchAddon.findNext('port 3000', {
      caseSensitive: false,
      wholeWord: false,
      regex: false
    });
    expect(foundNext).toBe(true);

    // Search backward
    const foundPrev = searchAddon.findPrevious('port 3000', {
      caseSensitive: false,
      wholeWord: false,
      regex: false
    });
    expect(foundPrev).toBe(true);
  });

  it('supports regex search queries with patterns (e.g. port \\d+)', async () => {
    await new Promise<void>((resolve) => term.write('Worker PID 4128 listening on 127.0.0.1:8080\r\n', () => resolve()));
    await new Promise<void>((resolve) => term.write('Worker PID 4129 listening on 127.0.0.1:8081\r\n', () => resolve()));

    const foundRegex = searchAddon.findNext('127\\.0\\.0\\.1:\\d+', {
      regex: true
    });
    expect(foundRegex).toBe(true);
  });

  it('respects case-sensitivity flag when enabled', async () => {
    await new Promise<void>((resolve) => term.write('Fatal ERROR: Out of memory\r\n', () => resolve()));

    const foundUpper = searchAddon.findNext('ERROR', {
      caseSensitive: true
    });
    expect(foundUpper).toBe(true);

    const foundLower = searchAddon.findNext('error', {
      caseSensitive: true
    });
    // "error" in lowercase should not match "ERROR" when caseSensitive is true
    expect(foundLower).toBe(false);
  });

  it('respects whole-word matching flag', async () => {
    await new Promise<void>((resolve) => term.write('grep for log and logging\r\n', () => resolve()));

    const foundWhole = searchAddon.findNext('log', {
      wholeWord: true
    });
    expect(foundWhole).toBe(true);
  });

  it('clears decorations cleanly when dismissed', async () => {
    await new Promise<void>((resolve) => term.write('Highlight this test match\r\n', () => resolve()));
    searchAddon.findNext('Highlight', { incremental: true });

    expect(() => searchAddon.clearDecorations()).not.toThrow();
  });
});

