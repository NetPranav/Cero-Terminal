/**
 * CommandPortability.ts — small, deterministic corrections for commands a model writes.
 *
 * Headless stress runs showed the local model losing whole requests to environment details:
 * `python` does not exist on macOS or most Linux installs (only `python3`), bash-only expansions
 * such as `${file,,}` fail under zsh, and `lsof`/`grep` exit 1 when nothing matches, which the
 * agent then "repaired" five times. These helpers fix the command or explain the failure in one
 * line so the next attempt is a different, working command.
 */

/** Command-word position: start of line, after ; && || | ( or a shell keyword */
const WORD_START = String.raw`(^|[;&|(]\s*|\b(?:then|do|else|exec|time|sudo|env)\s+)`;

/**
 * `python3`/`pip3` -> `python`/`pip`: on Windows `python3` can open the Microsoft Store instead.
 */
export function portInterpreters(command: string, _os: string): string {
  if (!command) return command;
  return command
    .replace(new RegExp(`${WORD_START}python3(?=\\s|$)`, 'g'), '$1python')
    .replace(new RegExp(`${WORD_START}pip3(?=\\s|$)`, 'g'), '$1pip');
}

/** Programs whose exit status 1 with no output means "nothing matched", not an error */
const NO_MATCH_PROGRAMS = /^(?:grep|egrep|fgrep|rg|ag|pgrep|pidof|lsof|findstr|which|command)$/;

export function isNoMatchExit(command: string, code: number | undefined, stdout: string, stderr: string): boolean {
  if (code !== 1 || (stdout || '').trim() || (stderr || '').trim()) return false;
  // The exit status of a pipeline or list is its last command's
  const last = (command || '').split(/\|\||&&|[|;]/).pop() || '';
  const word = last.trim().replace(/^(?:sudo\s+|LC_ALL=\S+\s+|LANG=\S+\s+)+/, '').split(/\s+/)[0] || '';
  return NO_MATCH_PROGRAMS.test(word.split('/').pop() || '');
}

/** One-line causes for failures the model misreads, added to the repair prompt */
export function failureHints(errorText: string, command: string, _os: string): string[] {
  const e = errorText || '';
  const hints: string[] = [];
  if (/bad substitution/i.test(e) || /\$\{\w+(?:,,|\^\^)\}/.test(command)) {
    hints.push('Commands run in PowerShell: bash-only expansions such as ${var,,} or ${var^^} are not available. For lower/upper case use $var.ToLower() or $var.ToUpper().');
  }
  if (/command not found:?\s*python\b|python: command not found|'python' is not recognized/i.test(e)) {
    hints.push('Use `python` (or `py -3`).');
  }
  if (/not a git repository/i.test(e)) {
    hints.push('This folder is not inside a git repository. Run git in the repository folder (`cd <folder> && git ...` or `git -C <folder> ...`). Do not run `git init`.');
  }
  if (/not a directory/i.test(e) && /\bcd\s/.test(command)) {
    hints.push('`cd` was given a file, not a folder. Run the file directly instead of cd-ing into it.');
  }
  if (/can't open file|No such file or directory/i.test(e)) {
    hints.push('A path does not exist from the current folder. Check it with `ls` first instead of guessing another folder.');
  }
  if (/syntax error/i.test(e) && /python3? -c/.test(command)) {
    hints.push('`python3 -c` cannot contain a `with`/`for` block after `;`. Write the program with a heredoc: python3 - <<\'EOF\' ... EOF');
  }
  return hints;
}

/**
 * A failure hidden behind exit status 0: a trailing `; echo done` or `|| true` masks a Python
 * traceback or a missing command, and the model then reports success.
 */
export function hiddenFailure(stderr: string, stdout = ''): boolean {
  if (/Traceback \(most recent call last\)|^\s*SyntaxError:|: command not found|is not recognized as (?:an internal|the name)|No module named /m.test(stderr || '')) return true;
  // Nothing printed and the input could not be opened: `awk ... missing.log | sort | head` exits 0
  return !(stdout || '').trim() && /can't open (?:file|input)|cannot open|No such file or directory/i.test(stderr || '');
}

/**
 * The small model shortens paths from the request ("logs/access.log" becomes "access.log").
 * Put the full relative path back when the command uses only its file name.
 */
export function restoreGoalPaths(command: string, goal: string): string {
  let out = command;
  const paths = new Set((goal.match(/(?:\.{1,2}\/)?[\w@.-]+(?:\/[\w@.-]+)+/g) || []).filter(p => /\.[A-Za-z0-9]{1,8}$/.test(p) && !/^https?:/i.test(p)));
  for (const full of paths) {
    const base = full.split('/').pop()!;
    if (out.includes(full) || base === full) continue;
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Only a standalone word: not part of another path or name
    out = out.replace(new RegExp(`(^|[\\s'"=<>(])${escaped}(?=$|[\\s'";|&)<>])`, 'g'), `$1${full}`);
  }
  return out;
}

/** `python3 -c "import x; with open(...) as f: ..."` is a SyntaxError: blocks cannot follow `;` */
export function inlinePythonProblem(command: string, _os: string): string | null {
  const m = command.match(/\bpython3?\s+-c\s+(["'])([\s\S]*?)\1/);
  if (!m || !/;\s*(?:with|for|while|if|def|class|try)\b[^;]*:/.test(m[2])) return null;
  return '`python -c` cannot contain a `with`/`for`/`if` block after `;`. Use a comprehension on one line, or write a .py file and run it.';
}

/** gzip, xz and bzip2 remove the input file; add -k when the request says to keep the originals */
export function keepOriginals(command: string, goal: string): string {
  if (!/\bkeep(?:ing)?\s+(?:the\s+|all\s+)?(?:originals?|source\s+files?|uncompressed)/i.test(goal)) return command;
  return command.replace(/(^|[;&|(]\s*|\s)(gzip|xz|bzip2)(?![^;&|]*\s(?:-\w*k\w*|--keep)\b)(?=\s)/g, '$1$2 -k');
}

