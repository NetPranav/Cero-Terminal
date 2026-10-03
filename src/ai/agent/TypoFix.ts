/**
 * TypoFix.ts: read "opne fldor docs in cod" as "open folder docs in code".
 *
 * Only for prompts that are clearly requests to do something (they start with a command word once typos are fixed),
 * and only for words one or two slips away from a known command word. Names, paths, numbers and anything with
 * punctuation or capitals are never touched, so a file called "lodsh" or "Main.rs" stays as typed.
 */
import { editDistance } from '../../domain/system/NameMatch';

const VERBS = ['open', 'launch', 'start', 'quit', 'close', 'kill', 'stop', 'find', 'list', 'show', 'make', 'create', 'install',
  'remove', 'delete', 'copy', 'move', 'rename', 'run', 'search', 'check', 'clone', 'switch', 'go', 'cd', 'mkdir', 'which', 'what', 'where', 'git'];
const WORDS = [...VERBS, 'status', 'branch', 'branches', 'diff', 'log', 'commit', 'push', 'pull', 'port', 'ports', 'folder', 'folders',
  'directory', 'file', 'files', 'all', 'and', 'then', 'into', 'with', 'from', 'project', 'projects', 'docs', 'code', 'vscode', 'terminal',
  'browser', 'current', 'using', 'process', 'running', 'name', 'named', 'called',
  'text', 'editor', 'window', 'tab', 'app', 'application', 'package', 'update', 'upgrade', 'build', 'test', 'tests', 'delete', 'listen', 'here'];
const VOCAB = new Set(WORDS);
// ordinary words that sit one letter from a command word; they are what they look like
const REAL = new Set(['watch', 'resume', 'pause', 'setup', 'failed', 'demo', 'it', 'is', 'in', 'on', 'to', 'of', 'at', 'as', 'or', 'an', 'be', 'by', 'do', 'if', 'me', 'my', 'no', 'so', 'up', 'us', 'we', 'he', 'am', 'i', 'id', 'ok', 'fine', 'fire', 'mine', 'line', 'lines', 'kind', 'mind', 'bind', 'wind', 'wine', 'lost', 'last', 'list', 'cope', 'cone', 'core',
  'more', 'mode', 'move', 'rose', 'rope', 'sort', 'port', 'post', 'poll', 'pool', 'pull', 'pass', 'path', 'main', 'mail', 'make', 'male', 'sake', 'take', 'tale', 'tile',
  'star', 'stay', 'step', 'stat', 'stem', 'stub', 'quiet', 'quite', 'quit', 'quota', 'show', 'shop', 'shot', 'shut', 'goes', 'gone', 'done', 'dome', 'one', 'two', 'any',
  'for', 'can', 'the', 'you', 'are', 'was', 'his', 'her', 'its', 'not', 'new', 'old', 'now', 'out', 'off', 'own', 'let', 'get', 'got', 'put', 'set', 'use', 'say', 'see',
  'did', 'has', 'had', 'how', 'who', 'why', 'yes', 'also', 'again', 'tell', 'ask', 'add', 'run', 'ran', 'bin', 'etc', 'usr', 'var', 'tmp', 'src', 'lib', 'app', 'apps', 'npm', 'pip']);

const plain = (w: string) => /^[a-z]{2,}$/.test(w);
const isSubsequence = (small: string, big: string) => { let i = 0; for (const ch of big) if (ch === small[i]) i++; return i === small.length; };

function nearest(word: string): string | null {
  if (VOCAB.has(word) || REAL.has(word)) return null;
  if (word.length < 2) return null;
  const limit = word.length <= 4 ? 1 : 2;
  if (/(?:s|ed|ing)$/.test(word) && VOCAB.has(word.replace(/(?:es|s|ed|ing)$/, ''))) return null;   // an ordinary ending, not a slip
  let best: string | null = null;
  let bestD = limit + 1;
  for (const v of WORDS) {
    if (Math.abs(v.length - word.length) > limit) continue;
    if (word.length < 3 && v.length > 4) continue;
    // same first letter, or one letter dropped from the front ("nd" for "and")
    if (v[0] !== word[0] && !(v.length - word.length === 1 && isSubsequence(word, v))) continue;
    if (word.length > v.length) continue;                          // a typo drops, swaps or changes letters; it does not add them
    const d = editDistance(word, v);
    if (d > limit || (d === 2 && word.length === v.length)) continue;
    // closer wins; on a tie the longer (more specific) word wins ("cod" is "code", not "cd")
    if (d < bestD || (d === bestD && best !== null && v.length > best.length)) { best = v; bestD = d; }
  }
  return best;
}

export function fixTypos(text: string): string {
  if (!text || text.length > 400) return text;
  const parts = text.split(/(\s+)/);                                   // keep the spacing as it was
  const words = parts.filter((_, i) => i % 2 === 0);
  const fixed = words.map(w => (plain(w) ? nearest(w) ?? w : w));
  // only requests: the first word must be a command word after fixing
  const first = fixed.find(w => w.length > 0)?.replace(/^>/, '') ?? '';
  if (!VERBS.includes(first)) return text;
  if (fixed.every((w, i) => w === words[i])) return text;
  let k = 0;
  return parts.map((p, i) => (i % 2 === 0 ? fixed[k++] : p)).join('');
}
