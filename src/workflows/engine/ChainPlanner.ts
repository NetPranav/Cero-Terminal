/**
 * ChainPlanner.ts — "do this, then that" requests turned into concrete steps.
 *
 * "create a folder called demo here, go into it, initialize git, create a package.json and
 * open it in VS Code" becomes mkdir / (enter demo) / git init / npm init -y / code . with the
 * working folder carried from step to step. Clauses it does not recognise are left for the
 * model one at a time (`command: undefined`); English is never passed to the shell.
 */

import { isLongRunningCommand } from '../../domain/terminal/TerminalWorkspace';

export type ChainOs = 'linux' | 'macos' | 'windows';

export interface ChainStep {
  /** The clause as the user wrote it */
  clause: string;
  /** Shell command, or undefined when the model has to work it out */
  command?: string;
  /** Folder to switch to for the following steps (relative to the current one, or absolute) */
  enter?: string;
  /** Keeps running: opens in its own terminal pane */
  longRunning: boolean;
}

export interface ChainPlan {
  steps: ChainStep[];
}

const VERB = String.raw`(?:create|make|mkdir|go|cd|enter|move|switch|open|initiali[sz]e|init|set\s+up|setup|install|add|write|clone|download|fetch|pull|run|start|launch|build|test|list|show|display|print|delete|remove|copy|rename|touch|check|commit|push|activate|serve|watch|follow|tail|echo|subscribe)`;
const ACTION_START = new RegExp(`^(?:please\\s+|then\\s+|and\\s+|also\\s+|now\\s+|after\\s+that\\s+|finally\\s+|next\\s+)*${VERB}\\b`, 'i');

const quote = (value: string) => (/^[\w@%+=:,./~-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`);
/** PowerShell single-quoted string ('' escapes a quote) */
const psQuote = (value: string) => (/^[\w@%+=:,./\\~-]+$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`);

/** The same step on each OS: POSIX shell on macOS/Linux, PowerShell on Windows */
const forOs = (os: ChainOs, posix: string, windows: string) => (os === 'windows' ? windows : posix);

/** Split a request into ordered clauses; null when it is a single action. */
export function splitChainClauses(goal: string): string[] | null {
  const text = goal.trim().replace(/[.!]+$/, '');
  // Sequence markers first
  let parts = text
    .split(/\s*(?:;|,?\s*\b(?:and\s+then|after\s+that|afterwards|followed\s+by|then|finally|next)\b)\s*/i)
    .map(p => p.trim())
    .filter(Boolean);
  // Then commas and "and" that start a new action ("..., go into it, initialize git and open it")
  parts = parts.flatMap(part => {
    const pieces: string[] = [];
    let current = '';
    for (const token of part.split(/(\s*,\s*|\s+and\s+)/i)) {
      if (/^\s*,\s*$|^\s+and\s+$/i.test(token)) continue;
      if (current && ACTION_START.test(token.trim())) {
        pieces.push(current.trim());
        current = token;
      } else {
        current = current ? `${current}${current.endsWith(' ') ? '' : ' '}${token}` : token;
      }
    }
    if (current.trim()) pieces.push(current.trim());
    return pieces;
  });
  const clauses = parts.map(p => p.replace(/^(?:please|then|and|also|now|first|finally|next)\s+/i, '').trim()).filter(Boolean);
  return clauses.length >= 2 ? clauses : null;
}

const NAME = String.raw`["'\`]?([\w@.+~/-]+)["'\`]?`;

/** One clause to a step, given the folder most recently created or named ("it"). */
interface ClauseContext {
  /** Folder most recently created or named ("go into it") */
  folder?: string;
  /** Branch most recently created ("switch to it") */
  branch?: string;
  /** Virtual environment most recently created ("the python version inside it") */
  venv?: string;
}

function planClause(clause: string, os: ChainOs, ctx: ClauseContext): { step: ChainStep; folder?: string; branch?: string; venv?: string } {
  const lastFolder = ctx.folder;
  const q = os === 'windows' ? psQuote : quote;
  const c = clause.trim();
  const lower = c.toLowerCase();
  const step = (command?: string, extra: Partial<ChainStep> = {}): ChainStep => ({
    clause: c,
    command,
    longRunning: command ? isLongRunningCommand(command) : false,
    ...extra,
  });

  // A literal command in backticks or after "run": `npm test`, run "make build"
  const literal = c.match(/`([^`]+)`/) || c.match(/^(?:run|execute)\s+["']([^"']+)["']/i);
  if (literal) return { step: step(literal[1].trim()) };

  // "switch to it" right after creating a branch means the branch, not a folder
  if (ctx.branch && /^(?:switch|change|move)\s+to\s+(?:it|that(?:\s+branch)?|the\s+new\s+branch)$|^check\s*out\s+(?:it|that\s+branch)$|^checkout\s+it$/i.test(c)) {
    return { step: step(`git checkout ${q(ctx.branch)}`) };
  }

  // Folders with a quoted name that has spaces: make a folder named 'meeting notes'
  let m = c.match(/^(?:create|make)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:empty\s+)?(?:project\s+)?(?:folder|directory|dir)\s+(?:called\s+|named\s+)?["'`]([^"'`]+)["'`](?:\s+(?:here|in\s+here))?$/i);
  if (m) {
    return { step: step(forOs(os, `mkdir -p ${quote(m[1])}`, `New-Item -ItemType Directory -Force -Path ${psQuote(m[1])} | Out-Null`)), folder: m[1] };
  }

  // Several files at once, optionally inside the folder just made
  m = c.match(/^(?:create|make|add|touch)\s+(?:(?:\w+|\d+)\s+)?(?:new\s+|empty\s+)*files?\s+(?:called|named)\s+(.+?)(?:\s+(?:inside|in)\s+(it|there|that(?:\s+folder)?))?$/i);
  if (m) {
    // The clause splitter has already dropped the commas and "and": "a.txt b.txt c.txt"
    const names = m[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s+/).map(n => n.trim().replace(/^["'`]|["'`]$/g, '')).filter(n => /^[\w@.+~-]+\.[A-Za-z0-9]{1,8}$/.test(n));
    if (names.length) {
      const base = m[2] && lastFolder ? `${lastFolder}/` : '';
      const paths = names.map(n => `${base}${n}`);
      return { step: step(forOs(os, `touch -- ${paths.map(quote).join(' ')}`, `New-Item -ItemType File -Force -Path ${paths.map(psQuote).join(',')} | Out-Null`)) };
    }
  }

  // How many files the folder just made has
  if (lastFolder && /^(?:and\s+)?(?:tell\s+me\s+|show\s+(?:me\s+)?|count\s+)?how\s+many\s+files\s+(?:it|that\s+folder|there|the\s+folder)\s+(?:has|contains|have|holds)$|^count\s+(?:the\s+)?files\s+(?:in\s+)?(?:it|there|that\s+folder)$/i.test(c)) {
    return { step: step(forOs(os, `find ${quote(lastFolder)} -maxdepth 1 -type f | wc -l | tr -d ' '`, `(Get-ChildItem -File -LiteralPath ${psQuote(lastFolder)}).Count`)) };
  }

  // Folders
  m = c.match(new RegExp(`^(?:create|make)\\s+(?:a\\s+|an\\s+|the\\s+)?(?:new\\s+)?(?:empty\\s+)?(?:project\\s+)?(?:folder|directory|dir)\\s+(?:called\\s+|named\\s+)?${NAME}(?:\\s+(?:here|in\\s+here|in\\s+the\\s+current\\s+(?:folder|directory)))?$`, 'i'));
  const mkdir = (name: string) => forOs(os, `mkdir -p ${quote(name)}`, `New-Item -ItemType Directory -Force -Path ${psQuote(name)} | Out-Null`);
  if (m) return { step: step(mkdir(m[1])), folder: m[1] };
  m = c.match(/^mkdir\s+(?:-p\s+)?(\S+)$/i);
  if (m) return { step: step(mkdir(m[1])), folder: m[1] };

  // Entering a folder
  if (/^(?:go|move|switch|cd|step)\s+(?:in)?to\s+(?:it|that(?:\s+(?:folder|directory))?|there)$|^(?:enter|open)\s+(?:it|that\s+folder)(?:\s+in\s+(?:the\s+)?terminal)?$|^cd\s+(?:into\s+)?it$/i.test(c)) {
    return lastFolder ? { step: step(undefined, { enter: lastFolder }) } : { step: step() };
  }
  m = c.match(new RegExp(`^(?:go|move|switch|cd|navigate)\\s+(?:in)?to\\s+(?:the\\s+)?(?:folder\\s+|directory\\s+)?${NAME}(?:\\s+(?:folder|directory))?$`, 'i'))
    || c.match(new RegExp(`^cd\\s+${NAME}$`, 'i'));
  if (m && !/^(?:it|there)$/i.test(m[1])) return { step: step(undefined, { enter: m[1] }), folder: m[1] };

  // git
  if (/^(?:initiali[sz]e|init|create|set\s*up|start)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+|empty\s+)?git(?:\s+repo(?:sitory)?)?(?:\s+(?:here|in\s+it|there))?$|^git\s+init$/i.test(c)) {
    return { step: step('git init') };
  }
  m = c.match(/^(?:create|make|start|add)\s+(?:a\s+)?(?:new\s+)?(?:git\s+)?branch\s+(?:called\s+|named\s+)?["'`]?([\w./-]+)["'`]?(?:\s+and\s+switch\s+to\s+it)?$/i);
  if (m) return { step: step(`git checkout -b ${q(m[1])}`), branch: m[1] };
  m = c.match(/^(?:switch|change|go)\s+to\s+(?:the\s+)?(?:branch\s+)?["'`]?([\w./-]+)["'`]?(?:\s+branch)?$|^check\s*out\s+(?:the\s+)?(?:branch\s+)?["'`]?([\w./-]+)["'`]?$/i);
  if (m && !/^(?:it|that|there|main\s+folder)$/i.test(m[1] || m[2])) {
    // "switch to src" (a folder) is handled above as entering a folder; this is a branch name
    return { step: step(`git checkout ${q(m[1] || m[2])}`), branch: m[1] || m[2] };
  }
  m = c.match(/^(?:make|create|add|do)\s+(?:an\s+|a\s+)?empty\s+commit(?:\s+with\s+(?:the\s+)?(?:message|msg)\s+["'`]([^"'`]+)["'`])?$/i);
  if (m) return { step: step(`git commit --allow-empty -m ${q(m[1] || 'empty commit')}`) };
  m = c.match(/^commit\s+(?:all\s+|everything\s+|the\s+changes\s+|all\s+(?:the\s+)?changes\s+|it\s+)?(?:with\s+(?:the\s+)?(?:message|msg)\s+)["'`]([^"'`]+)["'`]$/i);
  if (m) return { step: step(`git add -A && git commit -m ${q(m[1])}`) };
  m = c.match(/^(?:show|list|display|print)\s+(?:me\s+)?(?:the\s+)?(?:last|latest|recent)\s+(\d{1,2})?\s*commits?(?:\s+in\s+one\s+line)?$/i);
  if (m) return { step: step(`git log --oneline -${m[1] || '1'}`) };
  if (/^(?:show|check|display)\s+(?:me\s+)?(?:the\s+)?(?:git\s+)?status$|^git\s+status$/i.test(c)) {
    return { step: step('git status --short --branch') };
  }
  m = c.match(/^(?:clone|download|fetch|get)\s+(?:the\s+)?(?:repo(?:sitory)?\s+)?(https?:\/\/\S+?|git@\S+?)(?:\.git)?(?:\s+(?:into|as|to)\s+(\S+))?$/i);
  if (m) {
    const url = m[1];
    const target = m[2] || url.replace(/\.git$/, '').split(/[/:]/).pop() || 'project';
    if (/github\.com|gitlab\.com|bitbucket\.org|\.git$|^git@/i.test(url)) {
      return { step: step(`git clone --depth 1 ${quote(url)} ${quote(target)}`), folder: target };
    }
    return { step: step(forOs(os, `curl -fLO ${quote(url)}`, `curl.exe -fLO ${psQuote(url)}`)) };
  }

  // Node / Python project set-up
  if (/\bpackage\.json\b|\bnpm\s+init\b|^(?:initiali[sz]e|init|create|set\s*up|start)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:node(?:\.?js)?|npm|javascript)\s+project/i.test(c)) {
    return { step: step('npm init -y') };
  }
  m = c.match(/(?:python\s+)?(?:virtual\s*env(?:ironment)?|venv)(?:\s+(?:called|named)\s+(\S+))?/i);
  if (m && /^(?:create|make|set\s*up|setup|add|initiali[sz]e)\b/i.test(c)) {
    const venv = m[1] || '.venv';
    return { step: step(forOs(os, `python3 -m venv ${quote(venv)}`, `python -m venv ${psQuote(venv)}`)), venv };
  }
  if (ctx.venv && /\bpython\b.*\bversion\b|\bversion\b.*\bpython\b/i.test(c) && /\b(?:inside|in|of|from)\s+(?:it|the\s+(?:venv|virtual\s*env(?:ironment)?))\b/i.test(c)) {
    return { step: step(forOs(os, `${quote(`${ctx.venv}/bin/python`)} --version`, `& ${psQuote(`${ctx.venv}\\Scripts\\python.exe`)} --version`)) };
  }
  if (/^install\s+(?:the\s+|all\s+)?(?:project\s+)?(?:dependencies|deps|packages|requirements)$/i.test(c)) {
    return { step: step(forOs(os,
      'if [ -f package.json ]; then npm install; elif [ -f requirements.txt ]; then python3 -m pip install -r requirements.txt; elif [ -f Cargo.toml ]; then cargo build; else echo "No package.json, requirements.txt or Cargo.toml here"; fi',
      "if (Test-Path package.json) { npm install } elseif (Test-Path requirements.txt) { python -m pip install -r requirements.txt } elseif (Test-Path Cargo.toml) { cargo build } else { 'No package.json, requirements.txt or Cargo.toml here' }")) };
  }

  // Files
  m = c.match(new RegExp(`^(?:create|make|add|touch)\\s+(?:a\\s+|an\\s+)?(?:new\\s+|empty\\s+)*(?:file\\s+)?(?:called\\s+|named\\s+)?${NAME}$`, 'i'));
  if (m && /\.[A-Za-z0-9]{1,8}$/.test(m[1])) return { step: step(forOs(os, `touch ${quote(m[1])}`, `New-Item -ItemType File -Force -Path ${psQuote(m[1])} | Out-Null`)) };
  if (/^(?:create|add|write)\s+(?:a\s+)?readme(?:\.md)?$/i.test(c)) {
    return { step: step(forOs(os,
      `[ -e README.md ] || printf '# %s\\n' "$(basename "$PWD")" > README.md`,
      "if (-not (Test-Path README.md)) { '# ' + (Split-Path -Leaf $PWD) | Out-File -Encoding utf8 README.md }")) };
  }

  // Looking around
  if (/^(?:list|show|display|print)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:files|contents|everything)(?:\s+(?:in\s+(?:it|here|there|the\s+folder)))?$|^ls$/i.test(c)) {
    return { step: step(forOs(os, 'ls -la', 'Get-ChildItem -Force')) };
  }

  // Opening things
  if (/^open\s+(?:it|this|that|the\s+(?:folder|project)|the\s+current\s+folder|here)?\s*(?:in|with)\s+(?:vs\s*code|vscode|visual\s+studio\s+code|code)$/i.test(c)) {
    return { step: step(os === 'macos' ? 'code . 2>/dev/null || open -a "Visual Studio Code" .' : 'code .') };
  }
  if (/^open\s+(?:it|this|that|the\s+(?:folder|project)|here)?\s*(?:in|with)\s+(?:finder|(?:the\s+)?file\s+(?:manager|browser)|files)$/i.test(c)) {
    return { step: step(os === 'macos' ? 'open .' : os === 'windows' ? 'explorer .' : 'xdg-open .') };
  }
  m = c.match(/^open\s+(https?:\/\/\S+)(?:\s+in\s+(?:the\s+)?(?:browser|safari|chrome|firefox))?$/i);
  if (m) return { step: step(os === 'windows' ? `Start-Process ${psQuote(m[1])}` : `${os === 'macos' ? 'open' : 'xdg-open'} ${quote(m[1])}`) };

  // Dev servers and watchers
  if (/^(?:start|run|launch)\s+(?:the\s+)?(?:dev(?:elopment)?\s+server|app\s+in\s+dev\s+mode)$/i.test(c)) {
    return { step: step('npm run dev') };
  }
  m = c.match(/^(?:follow|tail|watch)\s+(?:the\s+)?(?:log\s+(?:file\s+)?)?(\S+\.(?:log|txt|out))$/i);
  if (m) return { step: step(forOs(os, `tail -f ${quote(m[1])}`, `Get-Content -Wait -Tail 20 ${psQuote(m[1])}`)) };

  // Anything else: the model works this clause out, with the folder it will run in
  void lower;
  return { step: step() };
}

/** The command for one plain-English clause ("follow app.log"), or undefined when unknown. */
export function commandForSingleClause(clause: string, os: ChainOs): string | undefined {
  return planClause(clause, os, {}).step.command;
}

/**
 * A plan for a multi-step request, or null when the request is not a chain.
 * Steps without a command are for the model.
 */
export function planChain(goal: string, os: ChainOs): ChainPlan | null {
  // "in demo-repo, create a branch ... and show the last 3 commits": every step runs there
  const inFolder = goal.trim().match(/^in\s+(?:the\s+)?(?:folder\s+|directory\s+|repo(?:sitory)?\s+)?["'`]?([\w@.+~/\\-]+)["'`]?\s*,?\s+(?=\S)/i);
  const body = inFolder && !/^(?:it|here|there|this|the|a|an)$/i.test(inFolder[1]) ? goal.trim().slice(inFolder[0].length) : goal;
  const clauses = splitChainClauses(body);
  if (!clauses) return null;
  const ctx: ClauseContext = {};
  const steps: ChainStep[] = [];
  if (body !== goal && inFolder) {
    steps.push({ clause: `in ${inFolder[1]}`, enter: inFolder[1], longRunning: false });
    ctx.folder = inFolder[1];
  }
  for (const clause of clauses) {
    const { step, folder, branch, venv } = planClause(clause, os, ctx);
    if (folder) ctx.folder = folder;
    if (branch) ctx.branch = branch;
    if (venv) ctx.venv = venv;
    steps.push(step);
  }
  // A chain the planner understood nothing of is better handled by the model as a whole
  if (!steps.some(s => s.command || s.enter)) return null;
  return { steps };
}

/** Resolve a folder the chain enters against the current one (absolute, ~ or relative). */
export function resolveFolder(current: string, target: string): string {
  if (target.startsWith('/') || target.startsWith('~')) return target.replace(/\/+$/, '') || '/';
  const base = current.replace(/\/+$/, '');
  const parts = [...base.split('/'), ...target.split('/')];
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' && out.length === 0) { out.push(''); continue; }
    if (part === '' || part === '.') continue;
    if (part === '..') { if (out.length > 1 || (out.length === 1 && out[0] !== '')) out.pop(); continue; }
    out.push(part);
  }
  const joined = out.join('/');
  return joined === '' ? '/' : joined;
}
