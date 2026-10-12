import * as path from 'path';

export interface DirectoryCandidate {
  name: string;
  path: string;
  distance: number;
}

export type NavigationResolutionType = 'exact' | 'did_you_mean' | 'not_found' | 'none';

export interface NavigationResolutionResult {
  type: NavigationResolutionType;
  rawTarget?: string;
  cdPath?: string;
  candidate?: DirectoryCandidate;
  question?: string;
  summary?: string;
  createCommand?: string;
}

export interface DirectoryScanner {
  listSubdirectories: (dir: string) => Promise<string[]>;
  directoryExists: (p: string) => Promise<boolean>;
  mkdir: (p: string) => Promise<boolean>;
}

/**
 * Compute Levenshtein distance between two strings.
 */
export function calculateLevenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;

  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,      // deletion
        matrix[j][i - 1] + 1,      // insertion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }
  return matrix[bn][an];
}

export class DirectoryNavigationEngine {
  private static instance: DirectoryNavigationEngine;

  public static getInstance(): DirectoryNavigationEngine {
    if (!DirectoryNavigationEngine.instance) {
      DirectoryNavigationEngine.instance = new DirectoryNavigationEngine();
    }
    return DirectoryNavigationEngine.instance;
  }

  /**
   * Determine if user prompt is asking to navigate / switch working directory.
   */
  public parseIntent(prompt: string): { isNavigation: boolean; target?: string } {
    const p = prompt.trim();

    // 1. Direct cd or navigation pattern
    const cdMatch = p.match(/^(?:cd(?:\s+to|\s+into)?|navigate(?:\s+to|\s+into)?|switch(?:\s+pwd)?(?:\s+to|\s+into)?|go(?:\s+to|\s+into)?|change\s+directory(?:\s+to|\s+into)?)\s+(['"]?)(.+?)\1(?:\s+folder|\s+directory)?$/i);
    if (cdMatch && cdMatch[2]) {
      const target = cdMatch[2].trim();
      // Exclude non-path phrases like 'visual mode' or 'zen mode'
      if (/^(?:visual\s+mode|zen\s+mode|tab|pane|window|split)$/i.test(target)) {
        return { isNavigation: false };
      }
      return { isNavigation: true, target };
    }

    // 2. "open <folder> in terminal"
    const openMatch = p.match(/^open\s+(['"]?)(.+?)\1\s+in\s+terminal$/i);
    if (openMatch && openMatch[2]) {
      return { isNavigation: true, target: openMatch[2].trim() };
    }

    return { isNavigation: false };
  }

  /**
   * Resolve directory target with exact matching, fuzzy typo correction ("Did you mean?"),
   * and non-existent folder creation questions.
   */
  public async resolve(
    prompt: string,
    cwd: string,
    scanner?: DirectoryScanner
  ): Promise<NavigationResolutionResult> {
    const intent = this.parseIntent(prompt);
    if (!intent.isNavigation || !intent.target) {
      return { type: 'none' };
    }

    const rawTarget = intent.target;
    const home = typeof process !== 'undefined' && process.env.HOME ? process.env.HOME : '/home/user';
    
    // Expand tilde ~
    let resolvedPath = rawTarget;
    if (resolvedPath === '~' || resolvedPath.startsWith('~/')) {
      resolvedPath = resolvedPath === '~' ? home : path.join(home, resolvedPath.slice(2));
    } else if (!path.isAbsolute(resolvedPath)) {
      resolvedPath = path.resolve(cwd, resolvedPath);
    }

    // Standard fallback scanner if not provided
    const fsScanner: DirectoryScanner = scanner || {
      listSubdirectories: async (dir: string) => {
        try {
          if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
            return [];
          }
          const fs = await import('fs');
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          return entries.filter(e => e.isDirectory()).map(e => e.name);
        } catch {
          return [];
        }
      },
      directoryExists: async (p: string) => {
        try {
          if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
            return false;
          }
          const fs = await import('fs');
          const stat = await fs.promises.stat(p);
          return stat.isDirectory();
        } catch {
          return false;
        }
      },
      mkdir: async (p: string) => {
        try {
          const fs = await import('fs');
          await fs.promises.mkdir(p, { recursive: true });
          return true;
        } catch {
          return false;
        }
      }
    };

    // 1. Check Exact Match
    const exists = await fsScanner.directoryExists(resolvedPath);
    if (exists) {
      return {
        type: 'exact',
        rawTarget,
        cdPath: resolvedPath,
        summary: `Switched working directory to ${resolvedPath}`
      };
    }

    // 2. Scan Candidate Directories for Typo Matching
    // Check cwd direct subdirectories and parent siblings
    const candidates: DirectoryCandidate[] = [];
    const targetBase = path.basename(rawTarget);

    try {
      const cwdSubs = await fsScanner.listSubdirectories(cwd);
      for (const sub of cwdSubs) {
        const full = path.join(cwd, sub);
        const dist = calculateLevenshteinDistance(targetBase, sub);
        candidates.push({ name: sub, path: full, distance: dist });
      }

      // Check parent directory
      const parentDir = path.dirname(cwd);
      if (parentDir && parentDir !== cwd) {
        const parentSubs = await fsScanner.listSubdirectories(parentDir);
        for (const sub of parentSubs) {
          const full = path.join(parentDir, sub);
          if (full !== cwd) {
            const dist = calculateLevenshteinDistance(targetBase, sub);
            candidates.push({ name: sub, path: full, distance: dist });
          }
        }
      }

      // Check common workspace folders under user home if target was not an absolute path
      if (!path.isAbsolute(rawTarget)) {
        const commonDirs = [path.join(home, 'Projects'), path.join(home, 'workspace'), path.join(home, 'Documents')];
        for (const cDir of commonDirs) {
          if (await fsScanner.directoryExists(cDir)) {
            const subs = await fsScanner.listSubdirectories(cDir);
            for (const sub of subs) {
              const full = path.join(cDir, sub);
              const dist = calculateLevenshteinDistance(targetBase, sub);
              candidates.push({ name: sub, path: full, distance: dist });
            }
          }
        }
      }
    } catch {
      // Ignore scan failures
    }

    // Filter candidates by similarity:
    // Distance <= 2 (for typos like sentinal -> cero, doc -> docs, backnd -> backend)
    // or case-insensitive exact match
    const validMatches = candidates
      .filter(c => c.distance <= 2 || c.name.toLowerCase() === targetBase.toLowerCase())
      .sort((a, b) => a.distance - b.distance);

    if (validMatches.length > 0) {
      const best = validMatches[0];
      return {
        type: 'did_you_mean',
        rawTarget,
        candidate: best,
        cdPath: best.path,
        question: `Directory '${rawTarget}' not found. Did you mean '${best.name}' (${best.path})?`,
        summary: `Did you mean '${best.name}'?`
      };
    }

    // 3. Not Found -> Ask to Create
    return {
      type: 'not_found',
      rawTarget,
      cdPath: resolvedPath,
      question: `Directory '${rawTarget}' does not exist. Would you like me to create it (mkdir -p ${rawTarget}) and switch to it?`,
      createCommand: `mkdir -p "${resolvedPath}"`,
      summary: `Directory '${rawTarget}' does not exist.`
    };
  }
}
