import { AutocompleteSuggestion, AutocompleteContext, IAutocompleteProvider } from './types';

export interface HistoryEntry {
  command: string;
  count: number;
  lastUsed: number;
  cwd?: string;
}

/** Where the webview keeps the command history between launches */
const STORAGE_KEY = 'cero.commandHistory';
const MAX_ENTRIES = 500;

// Completions offered for common commands. They are never shown as history: the Ctrl+R search
// lists only commands the user actually ran.
const STARTERS: string[] = [
  'git status', 'git checkout main', 'git add -A', 'git commit -m ""', 'git pull', 'git push',
  'npm run dev', 'npm run build', 'npm test', 'ls -la', 'cd ~', 'clear', 'docker ps',
  'cat README.md', 'source venv/bin/activate',
  '>open safari', '>open vs code', '>open chrome', '>list running applications', '>what time is it',
  '>check wifi connection', '>check battery status', ">what's running in my terminals",
];

function loadHistory(): HistoryEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((h: any) => h && typeof h.command === 'string' && typeof h.count === 'number' && typeof h.lastUsed === 'number');
  } catch {
    return [];
  }
}

export class HistoryProvider implements IAutocompleteProvider {
  private static instance: HistoryProvider;
  id = 'provider.history';
  enabled = true;

  public static getInstance(): HistoryProvider {
    if (!HistoryProvider.instance) {
      HistoryProvider.instance = new HistoryProvider();
    }
    return HistoryProvider.instance;
  }

  /** Commands the user ran */
  private history: HistoryEntry[];
  private readonly persist: boolean;

  constructor(options: { persist?: boolean } = {}) {
    this.persist = options.persist ?? true;
    this.history = this.persist ? loadHistory() : [];
  }

  public getHistory(): HistoryEntry[] {
    return this.history;
  }

  async getSuggestions(context: AutocompleteContext): Promise<AutocompleteSuggestion[]> {
    const input = context.currentInput.trimStart();
    if (input.length === 0) return [];
    const prefix = input.toLowerCase();

    const matches = this.history.filter(h => h.command.toLowerCase().startsWith(prefix));

    // Ranking: frequency, recency, and commands used in this folder
    const now = Date.now();
    const score = (h: HistoryEntry) =>
      h.count * 10 - (now - h.lastUsed) / 10000 + (h.cwd && h.cwd === context.cwd ? 500 : 0);
    matches.sort((a, b) => score(b) - score(a));

    const suggestions: AutocompleteSuggestion[] = matches.map(m => ({
      id: `hist-${m.command}`,
      value: m.command,
      category: 'History',
      priority: 90,
      confidence: 0.95,
      sourceProvider: this.id
    }));
    const seen = new Set(matches.map(m => m.command));
    for (const command of STARTERS) {
      if (!seen.has(command) && command.toLowerCase().startsWith(prefix)) {
        suggestions.push({ id: `starter-${command}`, value: command, category: 'History', priority: 60, confidence: 0.6, sourceProvider: this.id });
      }
    }
    return suggestions;
  }

  public addHistory(command: string, cwd: string) {
    const existing = this.history.find(h => h.command === command);
    if (existing) {
      existing.count++;
      existing.lastUsed = Date.now();
      existing.cwd = cwd;
    } else {
      this.history.push({ command, count: 1, lastUsed: Date.now(), cwd });
    }
    if (this.history.length > MAX_ENTRIES) {
      this.history.sort((a, b) => a.lastUsed - b.lastUsed);
      this.history.splice(0, this.history.length - MAX_ENTRIES);
    }
    this.save();
  }

  private save() {
    if (!this.persist) return;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history));
    } catch {
      // Storage full or unavailable: history still works for this session
    }
  }
}
