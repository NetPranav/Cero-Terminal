/**
 * AliasStore.ts: remember which folder or app a spoken name meant, so the same question is asked once.
 *
 * Stored in ~/.cero/aliases.json (capped at 200 entries, newest kept). Reads never throw:
 * a missing or damaged file is simply an empty list.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { compactName } from './NameMatch';

export interface AliasEntry {
  /** the name as typed, compacted: "gitbrains" */
  spoken: string;
  kind: 'folder' | 'file' | 'app';
  path: string;
  app?: string;
  chosenAt: number;
}

const MAX_ENTRIES = 200;

export class AliasStore {
  private static instance?: AliasStore;
  private customFile?: string;

  public static getInstance(): AliasStore {
    if (!AliasStore.instance) AliasStore.instance = new AliasStore();
    return AliasStore.instance;
  }

  /** Tests point the store at a temp file */
  public setFile(file?: string): void {
    this.customFile = file;
  }

  private file(): string {
    return this.customFile || path.join(os.homedir(), '.cero', 'aliases.json');
  }

  private load(): AliasEntry[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file(), 'utf8'));
      return Array.isArray(raw) ? raw.filter(e => e && typeof e.spoken === 'string' && typeof e.path === 'string') : [];
    } catch {
      return [];
    }
  }

  private save(entries: AliasEntry[]): void {
    try {
      fs.mkdirSync(path.dirname(this.file()), { recursive: true });
      fs.writeFileSync(this.file(), JSON.stringify(entries.slice(-MAX_ENTRIES), null, 2), { mode: 0o600 });
    } catch {
      // remembering is a convenience; never fail a request over it
    }
  }

  public lookup(spoken: string, kind: AliasEntry['kind']): AliasEntry | undefined {
    const key = compactName(spoken);
    return key ? this.load().find(e => e.spoken === key && e.kind === kind) : undefined;
  }

  public remember(spoken: string, kind: AliasEntry['kind'], target: string, app?: string): void {
    const key = compactName(spoken);
    if (!key || !target) return;
    const rest = this.load().filter(e => !(e.spoken === key && e.kind === kind));
    this.save([...rest, { spoken: key, kind, path: target, ...(app ? { app } : {}), chosenAt: Date.now() }]);
  }

  /** Returns how many entries were removed */
  public forget(spoken: string): number {
    const key = compactName(spoken);
    const all = this.load();
    const kept = all.filter(e => e.spoken !== key);
    if (kept.length !== all.length) this.save(kept);
    return all.length - kept.length;
  }

  public forgetAll(): number {
    const n = this.load().length;
    if (n) this.save([]);
    return n;
  }

  public list(): AliasEntry[] {
    return this.load();
  }

  /** What is remembered about a name, for "what do you remember about gitbrains" */
  public about(spoken: string): AliasEntry[] {
    const key = compactName(spoken);
    return this.load().filter(e => e.spoken === key);
  }
}
