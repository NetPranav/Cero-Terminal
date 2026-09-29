/**
 * FixFile.ts — "fix buggy.py so it prints the right total".
 *
 * The headless run showed the agent `cd`-ing into the file and hunting for it in other folders;
 * it never read or edited the code. This flow is deterministic around one model call: run the
 * file, read it, ask for the complete corrected file, show the change for approval (the original
 * is kept as .bak), write it and run it again.
 */

export interface FixFileRequest {
  file: string;
  /** What "fixed" means to the user ("it runs and prints the correct total") */
  want?: string;
}

const EXT = 'py|js|mjs|cjs|sh|rb|pl|php|lua';

export function parseFixFileRequest(goal: string): FixFileRequest | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  const m = text.match(new RegExp(`^(?:please\\s+)?(?:fix|repair|debug|correct|make)\\s+(?:the\\s+)?(?:bugs?\\s+in\\s+|errors?\\s+in\\s+|script\\s+)?["'\`]?([\\w./~-]+\\.(?:${EXT}))["'\`]?(?:\\s+(?:work|run|pass))?(?:\\s*,?\\s*(?:so\\s+(?:that\\s+)?|to\\s+|and\\s+make\\s+)(?:it\\s+)?(.+))?$`, 'i'));
  if (!m) return null;
  return { file: m[1], want: m[2]?.trim() };
}

/** The command that runs a script, or null when it cannot be run directly on this OS. */
export function runCommandFor(file: string, os: string): string | null {
  const win = /^win/i.test(os);
  const q = win ? `'${file.replace(/'/g, "''")}'` : `'${file.replace(/'/g, `'\\''`)}'`;
  const ext = file.split('.').pop()!.toLowerCase();
  const interp: Record<string, string | null> = {
    py: win ? 'python' : 'python3', js: 'node', mjs: 'node', cjs: 'node', rb: 'ruby', pl: 'perl', php: 'php', lua: 'lua',
    sh: win ? null : 'sh',
  };
  const bin = interp[ext];
  return bin ? `${bin} ${q}` : null;
}

/** The first fenced code block, or the whole reply when it is plainly code. */
export function extractCodeBlock(reply: string): string | null {
  const fenced = reply.match(/```[\w+-]*[ \t]*\r?\n([\s\S]*?)```/);
  if (fenced) return fenced[1].replace(/\s+$/, '') + '\n';
  return null;
}

/** "Fix: ..." line from the reply, or the first sentence outside the code block. */
export function extractFixNote(reply: string): string {
  const note = reply.match(/^\s*(?:fix|fixed|change|explanation)\s*:\s*(.+)$/im)?.[1]
    ?? reply.replace(/```[\s\S]*?```/g, '').split('\n').map(l => l.trim()).find(l => l.length > 8);
  return (note || 'Corrected the code').replace(/\s+/g, ' ').slice(0, 200);
}

/** A compact line diff (LCS) for the confirmation dialog: "-" removed, "+" added, at most 30 lines. */
export function lineDiff(before: string, after: string): string {
  const a = before.replace(/\s+$/, '').split('\n');
  const b = after.replace(/\s+$/, '').split('\n');
  if (a.length * b.length > 250_000) return `(${a.length} -> ${b.length} lines)`;
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; continue; }
    if (i < a.length && (j >= b.length || lcs[i + 1][j] >= lcs[i][j + 1])) out.push(`- ${a[i++]}`);
    else out.push(`+ ${b[j++]}`);
  }
  return out.length > 30 ? [...out.slice(0, 30), `... ${out.length - 30} more changed lines`].join('\n') : out.join('\n');
}
