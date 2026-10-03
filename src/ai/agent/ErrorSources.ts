/**
 * ErrorSources.ts — which source files an error points at.
 *
 * "why is npm test failing?" used to stop at the assertion message: the model never saw the code
 * (`add` subtracts). The failing command's output names files (stack frames, "File x, line n");
 * those files, and the local modules they import, are what an explanation needs.
 */

const SOURCE_EXT = 'js|mjs|cjs|jsx|ts|tsx|py|rb|go|rs|java|kt|php|sh|c|cc|cpp|h|hpp|cs|swift';

/** Paths named in error output, most relevant first (user code, not node internals or site-packages). */
export function pathsInError(output: string, cwd: string): string[] {
  const found: string[] = [];
  const add = (p: string) => {
    const clean = p.replace(/^file:\/\//, '').replace(/[),:]+$/, '');
    if (/node_modules|site-packages|dist-packages|node:internal|^internal\/|\/lib\/python\d|<string>|<stdin>/.test(clean)) return;
    const rel = cwd && clean.startsWith(`${cwd.replace(/\/+$/, '')}/`) ? clean.slice(cwd.replace(/\/+$/, '').length + 1) : clean;
    if (!found.includes(rel)) found.push(rel);
  };
  // Absolute paths with spaces ("/Users/me/Project Folder/app/test.js:3"): taken whole, then blanked out so the
  // plain pattern below does not also pick up the piece after the space
  const spaced = new RegExp(`((?:/|[A-Za-z]:[\\\\/])[^\\n:()'"]*?\\.(?:${SOURCE_EXT}))(?=[:(]\\d)`, 'g');
  output = output.replace(spaced, (whole, p1: string) => {
    if (/\s/.test(p1)) { add(p1.trim()); return ' '.repeat(whole.length); }
    return whole;
  });
  // Python: File "/x/app.py", line 3
  for (const m of output.matchAll(/File "([^"]+\.py)", line \d+/g)) add(m[1]);
  // Stack frames and compiler errors: /x/test.js:3:8, src/app.ts(12,5), ./main.go:10
  for (const m of output.matchAll(new RegExp(`((?:[A-Za-z]:)?[\\w./@~-]*[\\w-]\\.(?:${SOURCE_EXT}))(?=[:(]\\d)`, 'g'))) add(m[1]);
  return found.slice(0, 3);
}

/** Local modules a source file imports ("./math", "from utils import x"), as file paths to try. */
export function localImports(file: string, text: string): string[] {
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  const out: string[] = [];
  if (/\.(?:[mc]?js|jsx|tsx?)$/.test(file)) {
    for (const m of text.matchAll(/(?:require\(\s*|from\s+|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const base = `${dir}${m[1]}`.replace(/\/\.\//g, '/');
      out.push(/\.\w+$/.test(base) ? base : `${base}${file.match(/\.[mc]?[jt]sx?$/)?.[0] ?? '.js'}`);
    }
  } else if (file.endsWith('.py')) {
    for (const m of text.matchAll(/^\s*(?:from\s+(\.?[\w.]+)\s+import|import\s+([\w.]+))/gm)) {
      const mod = (m[1] || m[2]).replace(/^\./, '');
      if (mod && !/^(?:os|sys|re|json|math|time|typing|collections|pathlib|subprocess|itertools|functools|dataclasses|datetime|random|logging|unittest|argparse)$/.test(mod)) {
        out.push(`${dir}${mod.replace(/\./g, '/')}.py`);
      }
    }
  }
  return [...new Set(out)].slice(0, 3);
}

export interface DiagnoseRequest {
  command: string;
  folder?: string;
}

/**
 * "why is npm test failing in node-app?", "why does `cargo build` crash?". Only when the thing
 * failing is a command; "why is my wifi slow" stays with the general agent.
 */
export function parseDiagnoseRequest(goal: string, isCommand: (text: string) => boolean): DiagnoseRequest | null {
  const m = goal.trim().replace(/\s+/g, ' ').match(/^why\s+(?:is|does|did|do|are)\s+(?:my\s+|the\s+)?["'`]?(.+?)["'`]?\s+(?:keep\s+)?(?:fail(?:ing|s|ed)?|break(?:ing|s)?|crash(?:ing|es)?|erroring|error(?:s|ing)?\s+out|not\s+work(?:ing)?|throw(?:ing|s)?\s+(?:an?\s+)?errors?)(?:\s+(?:in|inside|for)\s+(?:the\s+)?["'`]?([\w./~-]+)["'`]?(?:\s+(?:folder|directory|project|repo))?)?\s*\??$/i);
  if (!m || !isCommand(m[1])) return null;
  return { command: m[1].trim(), folder: m[2] };
}
