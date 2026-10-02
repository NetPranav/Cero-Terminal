/**
 * NameMatch.ts: one way to compare the name a person typed with real folder, file and app names.
 *
 * "gitBrains", "git-brains", "git_brains" and "Git Brains" are the same name. A typo is close but
 * not the same. Pure functions, no file or app knowledge: the callers supply the candidates.
 */

export type NameWhy = 'exact' | 'same-letters' | 'prefix' | 'word' | 'contains' | 'typo' | 'none';
export interface NameScore { score: number; why: NameWhy }

/** lower case, camelCase split, - _ . and spaces alike, punctuation dropped, spaces collapsed */
export function normalizeName(s: string): string {
  return (s || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[-_.]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** normalizeName without any spaces: "gitbrains" */
export function compactName(s: string): string {
  return normalizeName(s).replace(/\s+/g, '');
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // swapped neighbours ("ia" for "ai") are one slip, not two
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const stripArticle = (s: string) => s.replace(/^the\s+/, '');
const singular = (s: string) => (s.length > 3 && s.endsWith('s') ? s.slice(0, -1) : s);

/** How well `candidate` is what `query` meant: 100 exact ... 0 unrelated */
export function scoreName(query: string, candidate: string): NameScore {
  if (!query || !candidate) return { score: 0, why: 'none' };
  if (query === candidate) return { score: 100, why: 'exact' };
  const qn = stripArticle(normalizeName(query));
  const cn = stripArticle(normalizeName(candidate));
  if (!qn || !cn) return { score: 0, why: 'none' };
  const q = qn.replace(/\s+/g, '');
  const c = cn.replace(/\s+/g, '');
  if (q === c || singular(q) === singular(c)) return { score: 95, why: 'same-letters' };
  if (c.startsWith(q) && q.length >= 2) return { score: 85, why: 'prefix' };
  const cWords = new Set(cn.split(' '));
  const qWords = qn.split(' ');
  if (qWords.length > 0 && qWords.every(w => cWords.has(w) || cWords.has(singular(w)))) return { score: 80, why: 'word' };
  if (q.length >= 3 && c.includes(q)) return { score: 70, why: 'contains' };
  const limit = q.length < 6 ? 1 : q.length <= 10 ? 2 : 3;
  const dist = editDistance(q, c);
  if (dist <= limit) return { score: 60 - 8 * dist, why: 'typo' };
  return { score: 0, why: 'none' };
}

export interface RankedName<T> { item: T; name: string; score: number; why: NameWhy }

/** The best matches first; ties broken alphabetically so the order never flips between runs */
export function rankNames<T>(
  query: string,
  items: T[],
  nameOf: (item: T) => string | string[],
  options: { min?: number; limit?: number } = {},
): RankedName<T>[] {
  const min = options.min ?? 40;
  const out: RankedName<T>[] = [];
  for (const item of items) {
    const names = ([] as string[]).concat(nameOf(item));
    let best: NameScore & { name: string } = { score: 0, why: 'none', name: names[0] ?? '' };
    for (const name of names) {
      const s = scoreName(query, name);
      if (s.score > best.score) best = { ...s, name };
    }
    if (best.score >= min) out.push({ item, name: best.name, score: best.score, why: best.why });
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return options.limit ? out.slice(0, options.limit) : out;
}
