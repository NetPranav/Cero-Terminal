/**
 * TaskRecipes.ts — tested commands for tricky, common requests.
 *
 * A 50-request headless run against the 3B local model showed where it writes plausible but
 * wrong commands: an awk column total that printed nothing (then an invented number), bash-only
 * `${f,,}` under zsh, a moved-then-edited sed backup, `du -sh` output misread. For these requests
 * the command comes from here instead: quoted safely, portable (POSIX shell on macOS/Linux,
 * PowerShell on Windows), and the answer is read from the output, not from the model. When a
 * recipe's command fails, the request goes to the model as before.
 */

export interface Recipe {
  /** What the confirmation dialog and the progress line say */
  explanation: string;
  command: string;
  /** Changes files: always confirmed */
  mutates: boolean;
  /** The answer, from the command's output */
  summarize: (stdout: string) => string;
}

type Os = 'macos' | 'linux' | 'windows';
const osOf = (os: string): Os => (/^win/i.test(os) ? 'windows' : /^(?:mac|darwin)/i.test(os) ? 'macos' : 'linux');

/** POSIX single quotes */
const sq = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
/** PowerShell single quotes */
const pq = (v: string) => `'${v.replace(/'/g, "''")}'`;
const py = (os: Os) => (os === 'windows' ? 'python' : 'python3');
const trimOut = (s: string) => s.replace(/\s+$/, '');

// ---- CSV column arithmetic -------------------------------------------------------------------

const AGG: Record<string, { expr: string; word: string }> = {
  total: { expr: 'sum(v)', word: 'total' }, sum: { expr: 'sum(v)', word: 'sum' },
  average: { expr: 'sum(v)/len(v)', word: 'average' }, mean: { expr: 'sum(v)/len(v)', word: 'average' },
  max: { expr: 'max(v)', word: 'maximum' }, maximum: { expr: 'max(v)', word: 'maximum' }, highest: { expr: 'max(v)', word: 'maximum' },
  min: { expr: 'min(v)', word: 'minimum' }, minimum: { expr: 'min(v)', word: 'minimum' }, lowest: { expr: 'min(v)', word: 'minimum' },
};

/**
 * A program run with `python3 -c "..."` / `node -e "..."`. Written with single quotes only and no
 * $, backtick or backslash, so the same double-quoted argument works in sh, zsh and PowerShell.
 */
const inline = (program: string) => {
  if (/["$`\\]/.test(program)) throw new Error('inline program must not contain " $ ` or \\');
  return `"${program}"`;
};

function csvAggregate(goal: string, os: Os): Recipe | null {
  const m = goal.match(/\b(total|sum|average|mean|max(?:imum)?|min(?:imum)?|highest|lowest)\s+(?:value\s+)?(?:of\s+|in\s+)?(?:the\s+)?["'`]?([\w .%-]{1,40}?)["'`]?\s+column\s+(?:in|of|from)\s+["'`]?([^\s"'`]+\.(?:csv|tsv))["'`]?/i);
  if (!m) return null;
  const agg = AGG[m[1].toLowerCase()];
  const column = m[2].trim();
  const file = m[3];
  const program = [
    'import csv,sys',
    `r=list(csv.DictReader(open(sys.argv[1],newline='',encoding='utf-8-sig'),delimiter=${/\.tsv$/i.test(file) ? 'chr(9)' : "','"}))`,
    "k=[c for c in (r[0].keys() if r else []) if c and c.strip().lower()==sys.argv[2].strip().lower()]",
    "k or sys.exit('no column named '+sys.argv[2]+'; columns: '+', '.join(r[0].keys() if r else []))",
    "v=[float(x[k[0]]) for x in r if (x[k[0]] or '').strip().lstrip('-').replace('.','',1).isdigit()]",
    "v or sys.exit('no numeric values in '+k[0])",
    `t=${agg.expr}`,
    "print((int(t) if float(t).is_integer() else round(t,6)), len(v))",
  ].join('; ');
  const quote = os === 'windows' ? pq : sq;
  return {
    explanation: `${agg.word[0].toUpperCase()}${agg.word.slice(1)} of the ${column} column in ${file}`,
    command: `${py(os)} -c ${inline(program)} ${quote(file)} ${quote(column)}`,
    mutates: false,
    summarize: out => {
      const [value, rows] = trimOut(out).split(/\s+/);
      return `The ${agg.word} of the ${column} column in ${file} is ${value} (${rows} row${rows === '1' ? '' : 's'}).`;
    },
  };
}

// ---- Syntax checks ---------------------------------------------------------------------------

const SKIP = ['.git', 'node_modules', 'venv', '.venv', '__pycache__', 'dist', 'build', 'target'];

function syntaxCheck(goal: string, os: Os): Recipe | null {
  if (!/\bsyntax\s+errors?\b|\bvalid\s+(?:python|json|javascript)\b/i.test(goal)) return null;
  // A question about one named file ("is package.json valid JSON? print its scripts") is not a scan
  if (/[\w./-]+\.(?:py|json|[cm]?js)\b/i.test(goal)) return null;
  const lang = /\bpython\b|\.py\b/i.test(goal) ? 'python' : /\bjson\b/i.test(goal) ? 'json' : /\bjavascript\b|\bjs\b|\bnode\b/i.test(goal) ? 'js' : null;
  if (!lang) return null;
  const named = [...goal.matchAll(/\b(?:in|under|inside)\s+(?:the\s+)?(?:folder\s+|directory\s+)?["'`]?([\w./~-]+)["'`]?/gi)]
    .map(x => x[1]).find(w => !/^(?:my|the|this|here|it|them|there|all|any)$/i.test(w));
  const dir = named ?? '.';
  const quote = os === 'windows' ? pq : sq;
  if (lang === 'js') {
    const program = [
      "const fs=require('fs'),path=require('path'),cp=require('child_process');let bad=0;",
      `const skip=new Set([${SKIP.map(d => `'${d}'`).join(',')}]);`,
      "const isJs=n=>n.endsWith('.js')||n.endsWith('.mjs')||n.endsWith('.cjs');",
      "const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);",
      "if(e.isDirectory()){if(!skip.has(e.name))walk(p)}else if(isJs(e.name)){",
      "const r=cp.spawnSync(process.execPath,['--check',p],{encoding:'utf8'});",
      "if(r.status!==0){bad++;console.log(p+': '+((r.stderr||'').split(String.fromCharCode(10)).find(l=>l.includes('Error'))||'syntax error'))}}}};",
      "walk(process.argv[1]);console.log(bad?bad+' file(s) with syntax errors':'No syntax errors found')",
    ].join('');
    return { explanation: `Check every JavaScript file under ${dir} with node --check`, command: `node -e ${inline(program)} ${quote(dir)}`, mutates: false, summarize: out => trimOut(out) };
  }
  const ext = lang === 'python' ? '.py' : '.json';
  const program = [
    'import ast,json,os,sys',
    'bad=0',
    'for d,ds,fs in os.walk(sys.argv[1]):',
    `    ds[:]=[x for x in ds if x not in (${SKIP.map(d => `'${d}'`).join(',')})]`,
    '    for f in sorted(fs):',
    `        if f.endswith('${ext}')${lang === 'json' ? " and not f.startswith(('tsconfig','jsconfig','devcontainer')) and '.vscode' not in d" : ''}:`,
    '            p=os.path.join(d,f)',
    '            try:',
    lang === 'python'
      ? "                ast.parse(open(p,encoding='utf-8',errors='replace').read(),p)"
      : "                json.load(open(p,encoding='utf-8-sig'))",
    `            except ${lang === 'python' ? 'SyntaxError' : 'ValueError'} as e:`,
    '                bad+=1',
    lang === 'python'
      ? "                print(p+':'+str(e.lineno)+': '+str(e.msg))"
      : "                print(p+': '+str(e))",
    "print(str(bad)+' file(s) with syntax errors' if bad else 'No syntax errors found')",
  ].join(String.fromCharCode(10));
  return {
    explanation: `Check every ${ext} file under ${dir} for syntax errors`,
    command: `${py(os)} -c ${inline(program)} ${quote(dir)}`,
    mutates: false,
    summarize: out => trimOut(out),
  };
}

function csvToJson(goal: string, os: Os): Recipe | null {
  const m = goal.match(/\bconvert\s+["'`]?([^\s"'`]+\.(?:csv|tsv))["'`]?\s+(?:to|into)\s+(?:a\s+)?json\b.*?(?:\b(?:save|write)\s+(?:it\s+)?(?:as|to|into|in)\s+["'`]?([^\s"'`]+\.json)["'`]?)?\s*$/i);
  if (!m) return null;
  const input = m[1];
  const output = m[2] || input.replace(/\.(?:csv|tsv)$/i, '.json');
  const program = [
    'import csv,json,sys',
    `rows=list(csv.DictReader(open(sys.argv[1],newline='',encoding='utf-8-sig'),delimiter=${/\.tsv$/i.test(input) ? 'chr(9)' : "','"}))`,
    "json.dump(rows,open(sys.argv[2],'w',encoding='utf-8'),indent=2)",
    'print(len(rows),sys.argv[2])',
  ].join('; ');
  const quote = os === 'windows' ? pq : sq;
  return {
    explanation: `Convert ${input} to a JSON array of objects in ${output}`,
    command: `${py(os)} -c ${inline(program)} ${quote(input)} ${quote(output)}`,
    mutates: true,
    summarize: out => {
      const [count] = trimOut(out).split(/\s+/);
      return `Wrote ${output}: a JSON array of ${count} object${count === '1' ? '' : 's'} (one per row of ${input}).`;
    },
  };
}

function gitStatus(goal: string, os: Os): Recipe | null {
  if (!/\b(?:what|which)\s+branch\b|\buncommitted\b|\bgit\s+status\b|\b(?:changed|modified|unstaged|staged)\s+files\b|\bis\s+[\w./-]+\s+(?:clean|dirty)\b/i.test(goal)) return null;
  if (/\b(?:and|then)\s+(?:commit|push|pull|stash|checkout|switch|reset|add)\b/i.test(goal)) return null;
  const folder = goal.match(/\bbranch\s+is\s+(?:the\s+)?["'`]?([\w./~-]+)["'`]?\s+(?:repo\s+)?on\b/i)?.[1]
    ?? goal.match(/\b(?:does|is)\s+(?:the\s+)?["'`]?([\w./~-]+)["'`]?\s+(?:repo\s+)?(?:have|has|clean|dirty)\b/i)?.[1]
    ?? goal.match(/\b(?:in|of|for)\s+(?:the\s+)?["'`]?([\w./~-]+)["'`]?(?:\s+repo(?:sitory)?)?\b/i)?.[1];
  const dir = folder && !/^(?:it|this|here|the|my|git|current|repo|repository|there)$/i.test(folder) ? folder : '.';
  const quote = os === 'windows' ? pq : sq;
  return {
    explanation: `Branch and uncommitted changes${dir === '.' ? '' : ` in ${dir}`}`,
    command: `git -C ${quote(dir)} status --short --branch`,
    mutates: false,
    summarize: out => {
      const lines = trimOut(out).split('\n').filter(Boolean);
      const head = (lines.shift() || '').replace(/^##\s*/, '');
      const branch = head.startsWith('No commits yet on ') ? `${head.slice(18)} (no commits yet)` : head.split('...')[0];
      const tracking = head.match(/\[(.+)\]/)?.[1];
      const kinds: Record<string, string> = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', '?': 'untracked', U: 'conflicted' };
      const changes = lines.map(l => `${l.slice(3)} (${kinds[(l[0] !== ' ' ? l[0] : l[1])] ?? 'changed'})`);
      const where = dir === '.' ? 'This repository' : dir;
      return `${where} is on branch ${branch}${tracking ? ` (${tracking})` : ''}. ${changes.length ? `Uncommitted changes: ${changes.join(', ')}.` : 'No uncommitted changes.'}`;
    },
  };
}

// ---- Reading files ---------------------------------------------------------------------------

const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const toNumber = (w: string) => ORDINAL[w.toLowerCase()] ?? Number(w.replace(/(?:st|nd|rd|th)$/i, ''));

function countLines(goal: string, os: Os): Recipe | null {
  const m = goal.match(/\b(?:count|how\s+many)\s+(?:the\s+)?lines(?:\s+of\s+code)?\s+(?:are\s+(?:there\s+)?)?(?:in|across)\s+(?:all\s+(?:the\s+)?|every\s+)?\*?\.?(\w{1,6})\s+files?(?:\s+(?:under|in|inside)\s+["'`]?([\w./~-]+)["'`]?)?/i);
  if (!m) return null;
  const ext = m[1];
  const dir = m[2] && !/^(?:here|this|my|the)$/i.test(m[2]) ? m[2] : '.';
  const command = os === 'windows'
    ? `$f = @(Get-ChildItem -Path ${pq(dir)} -Recurse -File -Filter ${pq(`*.${ext}`)} | Where-Object { $_.FullName -notmatch 'node_modules|\\.git' }); $n = if ($f.Count) { ($f | Get-Content | Measure-Object -Line).Lines } else { 0 }; "$n $($f.Count)"`
    : `printf '%s %s\\n' "$(find ${sq(dir)} -type f -name ${sq(`*.${ext}`)} -not -path '*/node_modules/*' -not -path '*/.git/*' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')" "$(find ${sq(dir)} -type f -name ${sq(`*.${ext}`)} -not -path '*/node_modules/*' -not -path '*/.git/*' | wc -l | tr -d ' ')"`;
  return {
    explanation: `Count the lines in every .${ext} file under ${dir}`,
    command, mutates: false,
    summarize: out => {
      const [lines, files] = trimOut(out).split(/\s+/);
      return files === '0' ? `No .${ext} files under ${dir}.` : `${lines} lines in ${files} .${ext} file${files === '1' ? '' : 's'} under ${dir} (every line, including blank lines and comments).`;
    },
  };
}

function filesContaining(goal: string, os: Os): Recipe | null {
  const m = goal.match(/^(?:which|what|list|find|show(?:\s+me)?)\s+(?:the\s+)?files\s+(?:in|under|inside)\s+["'`]?([\w./~-]+)["'`]?\s+(?:contain|mention|include|have|use)s?\s+(?:the\s+(?:word|text|string)\s+)?["'`]?(.+?)["'`]?\s*\??$/i);
  const n = m ? null : goal.match(/^(?:which|what|list|find|show(?:\s+me)?)\s+(?:the\s+)?files\s+(?:contain|mention|include|use)s?\s+(?:the\s+(?:word|text|string)\s+)?["'`]?(.+?)["'`]?(?:\s+(?:in|under)\s+["'`]?([\w./~-]+)["'`]?)?\s*\??$/i);
  if (!m && !n) return null;
  const dir = m ? m[1] : (n![2] ?? '.');
  const text = m ? m[2] : n![1];
  if (!text || text.length > 80) return null;
  const command = os === 'windows'
    ? `Get-ChildItem -Path ${pq(dir)} -Recurse -File | Select-String -SimpleMatch -Pattern ${pq(text)} -List | ForEach-Object { Resolve-Path -Relative $_.Path }`
    : `grep -rlF --exclude-dir=.git --exclude-dir=node_modules -- ${sq(text)} ${sq(dir)}`;
  return {
    explanation: `Files under ${dir} that contain "${text}"`,
    command, mutates: false,
    summarize: out => {
      const files = trimOut(out).split('\n').map(l => l.trim()).filter(l => l && l !== '(nothing matched)');
      return files.length ? `${files.length} file${files.length === 1 ? '' : 's'} under ${dir} contain "${text}":\n${files.join('\n')}` : `No file under ${dir} contains "${text}".`;
    },
  };
}

function specificLines(goal: string, os: Os): Recipe | null {
  const file = goal.match(/\blines?\b[^?]*?\b(?:of|in|from)\s+["'`]?([\w./~-]+\.\w{1,8})["'`]?/i)?.[1];
  if (!file || !/^(?:print|show|display|give\s+me|get|read|what\s+(?:are|is))\b/i.test(goal)) return null;
  let which: number[] | null = null;
  let range: [number, number] | null = null;
  let edge: { kind: 'head' | 'tail'; n: number } | null = null;
  let m = goal.match(/\b(first|last)\s+(\d{1,4})\s+lines?\b/i);
  if (m) edge = { kind: m[1].toLowerCase() === 'first' ? 'head' : 'tail', n: Number(m[2]) };
  m = edge ? null : goal.match(/\blines?\s+(\d{1,6})\s*(?:-|to|through|until)\s*(\d{1,6})\b/i);
  if (m) range = [Number(m[1]), Number(m[2])];
  if (!edge && !range) {
    m = goal.match(/\b((?:\d{1,6}(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:\s*(?:,|and|&)\s*(?:the\s+)?(?:\d{1,6}(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth))*)\s+lines?\b/i)
      || goal.match(/\blines?\s+((?:\d{1,6})(?:\s*(?:,|and|&)\s*\d{1,6})*)\b/i);
    if (m) which = m[1].split(/\s*(?:,|and|&)\s*(?:the\s+)?/i).map(toNumber).filter(x => Number.isInteger(x) && x > 0);
  }
  if (!edge && !range && !which?.length) return null;
  let command: string;
  if (os === 'windows') {
    command = edge
      ? `Get-Content -LiteralPath ${pq(file)} ${edge.kind === 'head' ? '-TotalCount' : '-Tail'} ${edge.n}`
      : `Get-Content -LiteralPath ${pq(file)} | Select-Object -Index ${range ? `(${range[0] - 1}..${range[1] - 1})` : which!.map(x => x - 1).join(',')}`;
  } else {
    command = edge
      ? `${edge.kind} -n ${edge.n} -- ${sq(file)}`
      : `sed -n ${sq(range ? `${range[0]},${range[1]}p` : which!.map(x => `${x}p`).join(';'))} ${sq(file)}`;
  }
  const label = edge ? `${edge.kind === 'head' ? 'First' : 'Last'} ${edge.n} lines` : range ? `Lines ${range[0]}-${range[1]}` : `Line${which!.length > 1 ? 's' : ''} ${which!.join(' and ')}`;
  return {
    explanation: `${label} of ${file}`,
    command, mutates: false,
    summarize: out => (trimOut(out) ? `${label} of ${file}:\n${trimOut(out)}` : `${file} has no such line${which && which.length > 1 ? 's' : ''}.`),
  };
}

function lastMatches(goal: string, os: Os): Recipe | null {
  const m = goal.match(/\b(last|latest|most\s+recent|first|earliest)\s+(\d{1,4})\s+(errors?|warnings?|exceptions?|failures?)\b.*?\b(?:in|from)\s+["'`]?([\w./~-]+\.\w{1,8})["'`]?/i);
  if (!m) return null;
  const fromEnd = !/first|earliest/i.test(m[1]);
  const n = Number(m[2]);
  const kind = m[3].toLowerCase();
  const pattern = /warn/.test(kind) ? 'warn' : /exception/.test(kind) ? 'exception|traceback' : /fail/.test(kind) ? 'fail' : 'error|fatal|exception';
  const command = os === 'windows'
    ? `Select-String -LiteralPath ${pq(m[4])} -Pattern ${pq(pattern)} | Select-Object ${fromEnd ? '-Last' : '-First'} ${n} | ForEach-Object { $_.Line }`
    : `grep -iE -- ${sq(pattern)} ${sq(m[4])} | ${fromEnd ? 'tail' : 'head'} -n ${n}`;
  return {
    explanation: `The ${fromEnd ? 'last' : 'first'} ${n} ${kind} in ${m[4]}`,
    command, mutates: false,
    summarize: out => {
      const lines = trimOut(out).split('\n').filter(l => l && l !== '(nothing matched)');
      return lines.length ? `The ${fromEnd ? 'last' : 'first'} ${lines.length} ${kind.replace(/s$/, '')}${lines.length === 1 ? '' : 's'} in ${m[4]}:\n${lines.join('\n')}` : `No ${kind} in ${m[4]}.`;
    },
  };
}

// ---- Installed tools -------------------------------------------------------------------------

const TOOLS = ['python3', 'python', 'node', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'deno', 'git', 'docker', 'go', 'rustc', 'cargo', 'java', 'gcc', 'clang', 'make', 'cmake', 'ruby', 'perl', 'php', 'pip3', 'pip', 'kubectl', 'terraform', 'ffmpeg', 'ollama', 'llama-server', 'code', 'ros2'];

function toolVersions(goal: string, os: Os): Recipe | null {
  if (!/\binstalled\b|\bversions?\b/i.test(goal) || !/^(?:is|are|do\s+i\s+have|which|what|show|check|tell)\b/i.test(goal.trim())) return null;
  const words = goal.toLowerCase().replace(/node\.?js/g, 'node').replace(/\bpython\b(?!3)/g, os === 'windows' ? 'python' : 'python3').split(/[^a-z0-9.+-]+/);
  const tools = [...new Set(words.filter(w => TOOLS.includes(w)))].slice(0, 8);
  if (!tools.length) return null;
  const flag = (t: string) => (t === 'go' ? 'version' : t === 'java' ? '-version' : '--version');
  const command = os === 'windows'
    ? `foreach ($c in @(${tools.map(pq).join(',')})) { if (Get-Command $c -ErrorAction SilentlyContinue) { $v = (& $c $(if ($c -eq 'go') { 'version' } elseif ($c -eq 'java') { '-version' } else { '--version' }) 2>&1 | Select-Object -First 1); $c + ': ' + $v } else { $c + ': not installed' } }`
    : tools.map(t => `if command -v ${t} >/dev/null 2>&1; then printf '%s: %s\\n' ${t} "$(${t} ${flag(t)} 2>&1 | head -1)"; else echo '${t}: not installed'; fi`).join('; ');
  return {
    explanation: `Check whether ${tools.join(', ')} ${tools.length === 1 ? 'is' : 'are'} installed, and the version`,
    command, mutates: false,
    summarize: out => trimOut(out),
  };
}

// ---- Disk usage ------------------------------------------------------------------------------

function folderSizes(goal: string, os: Os): Recipe | null {
  if (!/\b(?:space|size|disk\s+usage|how\s+big)\b.*\b(?:each|every|per|all\s+(?:the\s+)?)\s*(?:sub)?(?:folders?|director(?:y|ies)|dirs?)\b|\b(?:largest|biggest)\s+(?:sub)?(?:folders|directories)\b|\b(?:sub)?(?:folders?|director(?:y|ies))\s+(?:by|sorted\s+by)\s+size\b/i.test(goal)) return null;
  const command = os === 'windows'
    ? "Get-ChildItem -Directory -Force | ForEach-Object { [pscustomobject]@{ MB = [math]::Round(((Get-ChildItem -LiteralPath $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB), 1); Folder = $_.Name } } | Sort-Object MB -Descending | Select-Object -First 20 | Format-Table -AutoSize | Out-String -Width 200"
    // find, not a */ glob: zsh aborts the whole command when a glob matches nothing
    : `find . -mindepth 1 -maxdepth 1 -type d -exec du -sk {} + 2>/dev/null | sort -rn | head -20 | awk '{ s=$1; u="K"; if (s>=1048576) { s=s/1048576; u="G" } else if (s>=1024) { s=s/1024; u="M" }; n=$0; sub(/^[0-9]+[ \\t]+(\\.\\/)?/, "", n); printf "%7.1f%s  %s\\n", s, u, n }'`;
  return {
    explanation: 'Size of each subfolder, largest first',
    command, mutates: false,
    summarize: out => (trimOut(out) ? `Largest first:\n${trimOut(out)}` : 'There are no subfolders here.'),
  };
}

function largestFiles(goal: string, os: Os): Recipe | null {
  const m = goal.match(/\b(?:(\d{1,3})\s+)?(?:largest|biggest)\s+(?:(\d{1,3})\s+)?files?\b/i);
  if (!m || /\b(?:largest|biggest)\s+(?:\d+\s+)?(?:sub)?(?:folders|directories)\b/i.test(goal)) return null;
  const n = Number(m[1] || m[2] || 10);
  const command = os === 'windows'
    ? `Get-ChildItem -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\\\\\.git\\\\' } | Sort-Object Length -Descending | Select-Object -First ${n} @{n='MB';e={[math]::Round($_.Length/1MB,2)}}, FullName | Format-Table -AutoSize | Out-String -Width 200`
    : `find . -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -exec du -k {} + 2>/dev/null | sort -rn | head -${n} | awk '{ s=$1; u="K"; if (s>=1048576) { s=s/1048576; u="G" } else if (s>=1024) { s=s/1024; u="M" }; n=$0; sub(/^[0-9]+[ \\t]+(\\.\\/)?/, "", n); printf "%7.1f%s  %s\\n", s, u, n }'`;
  return {
    explanation: `The ${n} largest files under this folder`,
    command, mutates: false,
    summarize: out => (trimOut(out) ? `Largest first:\n${trimOut(out)}` : 'No files found here.'),
  };
}

// ---- Editing files ---------------------------------------------------------------------------

function replaceText(goal: string, os: Os): Recipe | null {
  const m = goal.match(/^(?:replace|change|substitute)\s+(?:every\s+|all\s+)?(?:occurrences?\s+of\s+|instances?\s+of\s+)?["'`]?(.+?)["'`]?\s+(?:with|by|to)\s+["'`]?(.+?)["'`]?\s+in\s+(?:all\s+(?:the\s+)?|every\s+)?(?:\*?\.?([\w]{1,8})\s+files?|["'`]?([^\s"'`]+\.\w{1,8})["'`]?)(?:\s+(?:under|in|inside)\s+["'`]?([\w./~-]+)["'`]?)?(.*)$/i);
  if (!m) return null;
  const [, from, to, ext, file, dir = '.', rest] = m;
  if (!from || /[\n\r]/.test(from + to)) return null;
  const backup = /\b(?:bak|backup|back\s+up|copy|copies)\b/i.test(rest || '') || /\bkeep(?:ing)?\b.*\b(?:bak|backup|original)/i.test(goal);
  const where = file ? file : `${dir}/*.${ext}`;
  let command: string;
  if (os === 'windows') {
    const target = file ? `Get-Item -LiteralPath ${pq(file)}` : `Get-ChildItem -Path ${pq(dir)} -Recurse -File -Filter ${pq(`*.${ext}`)}`;
    command = `${target} | Where-Object { (Get-Content -Raw -LiteralPath $_.FullName) -match [regex]::Escape(${pq(from)}) } | ForEach-Object { ${backup ? 'Copy-Item -LiteralPath $_.FullName -Destination ($_.FullName + \'.bak\'); ' : ''}(Get-Content -Raw -LiteralPath $_.FullName) -replace [regex]::Escape(${pq(from)}), ${pq(to.replace(/\$/g, '$$$$'))} | Set-Content -NoNewline -LiteralPath $_.FullName; $_.FullName }`;
  } else {
    // perl \Q...\E matches the text literally; -pi.bak keeps a backup (same flags on macOS and Linux)
    const perl = `perl -pi${backup ? '.bak' : ''} -e ${sq(`s/\\Q${from.replace(/([\\/])/g, '\\$1')}\\E/${to.replace(/([\\/$@])/g, '\\$1')}/g`)}`;
    command = file
      ? `grep -qF -- ${sq(from)} ${sq(file)} && ${perl} ${sq(file)} && echo ${sq(file)}`
      : `grep -rlF --include=${sq(`*.${ext}`)} -- ${sq(from)} ${sq(dir)} | while IFS= read -r f; do ${perl} "$f" && echo "$f"; done`;
  }
  return {
    explanation: `Replace "${from}" with "${to}" in ${where}${backup ? ', keeping a .bak copy of each changed file' : ''}`,
    command, mutates: true,
    summarize: out => {
      const files = trimOut(out).split('\n').filter(Boolean);
      return files.length
        ? `Replaced "${from}" with "${to}" in ${files.length} file${files.length === 1 ? '' : 's'}${backup ? ' (originals kept as .bak)' : ''}:\n${files.join('\n')}`
        : `No file under ${where} contains "${from}"; nothing changed.`;
    },
  };
}

function lowercaseNames(goal: string, os: Os): Recipe | null {
  if (!/\brename\b/i.test(goal) || !/\blower\s*-?case\b/i.test(goal)) return null;
  const glob = goal.match(/\b([\w.-]*\*[\w.*-]*)/)?.[1] ?? '*';
  const dir = goal.match(/\b(?:in|under|inside)\s+(?:the\s+)?["'`]?([\w./~-]+)["'`]?(?=\s|$)/i)?.[1];
  const folder = dir && !/^(?:it|here|this|the)$/i.test(dir) ? dir : '.';
  // Two renames through a temporary name: on case-insensitive disks (macOS, Windows) a direct
  // IMG.JPG -> img.jpg rename can be a no-op
  const command = os === 'windows'
    ? `Get-ChildItem -LiteralPath ${pq(folder)} -File -Filter ${pq(glob)} | Where-Object { $_.Name -cne $_.Name.ToLower() } | ForEach-Object { $n = $_.Name.ToLower(); $tmp = $n + '.renaming'; Rename-Item -LiteralPath $_.FullName -NewName $tmp; Rename-Item -LiteralPath (Join-Path $_.DirectoryName $tmp) -NewName $n; $_.Name + ' -> ' + $n }`
    // find instead of a glob loop: zsh aborts on a glob that matches nothing
    : `cd ${sq(folder)} && find . -maxdepth 1 -type f -name ${sq(glob)} | while IFS= read -r p; do f=\${p#./}; n=$(printf '%s' "$f" | tr '[:upper:]' '[:lower:]'); [ "$f" = "$n" ] && continue; [ -e "$n" ] && [ ! "$f" -ef "$n" ] && { echo "skipped $f: $n exists"; continue; }; mv -- "$f" "$n.renaming.$$" && mv -- "$n.renaming.$$" "$n" && echo "$f -> $n"; done`;
  return {
    explanation: `Rename ${glob} in ${folder} to lowercase names`,
    command, mutates: true,
    summarize: out => {
      const lines = trimOut(out).split('\n').filter(Boolean);
      return lines.length ? `Renamed ${lines.filter(l => l.includes('->')).length} file(s):\n${lines.join('\n')}` : `No ${glob} files with uppercase letters in ${folder}.`;
    },
  };
}

// ---- Ports -----------------------------------------------------------------------------------

function portOwner(goal: string, os: Os): Recipe | null {
  const m = goal.match(/\b(?:which|what)\s+(?:process|program|app(?:lication)?|service)\s+(?:is\s+)?(?:listening|running|using|bound|serving)\s+(?:on\s+|to\s+)?(?:port\s+|:)(\d{1,5})\b/i)
    || goal.match(/\b(?:who|what)\s+is\s+(?:using|on|listening\s+on)\s+port\s+(\d{1,5})\b/i)
    || goal.match(/\bis\s+(?:anything|something|any\s+process)\s+(?:listening|running)\s+on\s+port\s+(\d{1,5})\b/i)
    || goal.match(/\bport\s+(\d{1,5})\s+(?:in\s+use|taken|busy|free)\b/i);
  if (!m) return null;
  const port = m[1];
  const command = os === 'windows'
    ? `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; '{0} (PID {1}) on {2}:{3}' -f $p.ProcessName, $_.OwningProcess, $_.LocalAddress, $_.LocalPort } | Sort-Object -Unique`
    : os === 'macos'
      ? `lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null | awk 'NR>1 { print $1" (PID "$2") on "$9 }' | sort -u`
      : `(ss -ltnpH "sport = :${port}" 2>/dev/null | sed -n 's/.*users:((\\"\\([^"]*\\)\\",pid=\\([0-9]*\\).*/\\1 (PID \\2)/p'; lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null | awk 'NR>1 { print $1" (PID "$2")" }') | sort -u`;
  return {
    explanation: `Which process listens on port ${port}`,
    command, mutates: false,
    summarize: out => {
      const lines = trimOut(out).split('\n').filter(Boolean);
      return lines.length ? `Port ${port} is used by ${lines.join('; ')}.` : `Nothing is listening on port ${port}.`;
    },
  };
}

const RECIPES = [csvAggregate, csvToJson, syntaxCheck, gitStatus, countLines, filesContaining, specificLines, lastMatches, toolVersions, folderSizes, largestFiles, replaceText, lowercaseNames, portOwner];

export function planRecipe(goal: string, os: string): Recipe | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  for (const make of RECIPES) {
    const recipe = make(text, osOf(os));
    if (recipe) return recipe;
  }
  return null;
}
