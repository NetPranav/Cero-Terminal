#!/usr/bin/env python3
"""Generate docs/CODEBASE_MAP.md from the import graph: python3 scripts/generate_codebase_map.py > docs/CODEBASE_MAP.md"""
import os, re, json, subprocess, collections
root='.'
tracked=set(subprocess.check_output(['git','ls-files'],text=True).split('\n'))
files={}
for base in ['src','scripts']:
    for dp,dn,fn in os.walk(base):
        for f in fn:
            if f.endswith(('.ts','.tsx')):
                p=os.path.normpath(os.path.join(dp,f)); files[p]=open(p,encoding='utf-8',errors='ignore').read()
imp=re.compile(r'''(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]''',re.S)
def res(frm,spec):
    if not spec.startswith('.'): return None
    b=os.path.normpath(os.path.join(os.path.dirname(frm),spec))
    for c in [b,b+'.ts',b+'.tsx',os.path.join(b,'index.ts'),os.path.join(b,'index.tsx')]:
        if c in files: return c
g={f:{r for m in imp.finditer(t) for r in [res(f,m.group(1) or m.group(2) or m.group(3))] if r} for f,t in files.items()}
def reach(st):
    seen=set();s=list(st)
    while s:
        x=s.pop()
        if x in seen: continue
        seen.add(x); s.extend(g.get(x,()))
    return seen
app=reach(['src/main.tsx'])
scripts_live=reach([f for f in files if f.startswith('scripts/')])
def describe(text):
    # first sentence of the leading block comment / line comments
    m=re.search(r'/\*\*?(.*?)\*/', text[:3000], re.S)
    lines=[]
    if m and text[:m.start()].strip()=='' or (m and m.start()<200):
        for l in m.group(1).split('\n'):
            l=re.sub(r'^\s*\*\s?','',l).strip()
            if l: lines.append(l)
    else:
        for l in text.split('\n')[:8]:
            if l.strip().startswith('//'): lines.append(l.strip().lstrip('/').strip())
    d=' '.join(lines[:3])
    d=re.sub(r'^[\w.\-]+\.(?:tsx?|rs)\s*[—–-]+\s*','',d)
    d=re.sub(r'[\U0001F000-\U0001FAFF\u2600-\u27BF]','',d)
    d=re.sub(r'\s+',' ',d).strip()
    d=d.split('. ')[0].rstrip('.')
    return (d[:150]+'...') if len(d)>150 else d
rows=collections.defaultdict(list)
stats=collections.Counter()
for f in sorted(files):
    if not f.startswith('src/') or '.test.' in f or '__tests__' in f or '/tests/' in f or f.endswith('.d.ts') or f.startswith('src/test/'): continue
    if f not in tracked: continue
    status='app' if f in app else ('cli' if f in scripts_live else 'unreachable')
    stats[status]+=1
    parts=f.split('/')
    group='/'.join(parts[:2]) if len(parts)>2 else 'src'
    rows[group].append((f,len(files[f].splitlines()),status,describe(files[f])))
out=['# Codebase map','',
'Every TypeScript source file under `src/`, grouped by directory, with its line count, whether the',
'application can reach it, and the first line of its own header comment. Generated from the import',
'graph (entry points: `src/main.tsx` for the app, `scripts/*.ts` for the CLI and benchmark tools).',
'Regenerate after large refactors; see "Regenerating" at the end.','',
'Status: **app** = loaded by the desktop app; **cli** = only used by scripts; **unreachable** = imported by',
'nothing that runs (candidates for removal).','',
f"Totals: {stats['app']} app, {stats['cli']} cli-only, {stats['unreachable']} unreachable.",'']
for group in sorted(rows):
    items=rows[group]
    live=sum(1 for i in items if i[2]!='unreachable')
    out.append(f'## `{group}/` ({live}/{len(items)} used)')
    out.append('')
    out.append('| File | Lines | Status | Purpose |')
    out.append('|---|---:|---|---|')
    for f,n,st,d in items:
        rel=f[len(group)+1:]
        out.append(f"| `{rel}` | {n} | {st} | {d.replace('|','/') or '-'} |")
    out.append('')
# Rust
out += ['## `src-tauri/src/` (Rust backend)','','| File | Lines | Purpose |','|---|---:|---|']
rust_desc={
 'main.rs':'Binary entry point; calls the library run().',
 'lib.rs':'Tauri setup: plugins, managed state, command registration, window and exit handling.',
 'pty.rs':'Pseudo-terminal sessions (portable-pty): spawn the user shell, stream output, resize, kill.',
 'process_cmds.rs':'execute_command (timeout, process-group kill, closed stdin, output cap), process list/kill, system stats, file helpers, ~/.cero store commands.',
 'embedded_server.rs':'llama-server lifecycle: binary/model discovery, launch flags, stderr log, status, inference slot bookkeeping, SHA-256 verification.',
 'watcher.rs':'Error watcher backend: file tailing (rotation/truncation aware) and journalctl streaming, emitted as cero-watch-lines events.',
 'logger.rs':'Diagnostic logging to file for release builds.',
}
for f in sorted(os.listdir('src-tauri/src')):
    if f.endswith('.rs'):
        out.append(f"| `{f}` | {len(open('src-tauri/src/'+f).read().splitlines())} | {rust_desc.get(f,'-')} |")
out.append('')
# scripts
SCRIPT_DESC = {
    'build_all_packages.sh': 'Build the Linux release bundles (deb, rpm, AppImage, pacman) from src-tauri.',
    'build_all_test_cases.js': 'Generate tests/tool_test_cases.json from a tool spec dump (one-off generator).',
    'sync-shared.sh': 'Pull only the OS-agnostic shared core from another branch (bash).',
    'sync-shared.ps1': 'Pull only the OS-agnostic shared core from another branch (PowerShell).',
}
out += ['## `scripts/`','','| File | Purpose |','|---|---|']
for f in sorted(os.listdir('scripts')):
    p='scripts/'+f
    t=open(p,encoding='utf-8',errors='ignore').read()
    d=SCRIPT_DESC.get(f) or (describe(t) if f.endswith('.ts') else '')
    if not d:
        m=re.search(r'"""(.*?)"""',t[:2000],re.S) or re.search(r'^#\s*([^!\s].+)$',t,re.M) or re.search(r'^\s*(?://|\*)\s*([A-Za-z].+)$',t,re.M)
        d=re.sub(r'\s+',' ',(m.group(1) if m else '')).strip().split('. ')[0][:150]
    out.append(f'| `{f}` | {d.replace("|","/") or "-"} |')
out.append('')
# tools
tools=collections.Counter(p.split('/')[1] for p in tracked if p.startswith('tools/') and p.endswith('/tool.json'))
out += ['## `tools/` (tool definitions)','',
'One folder per tool with `tool.json`, `workflow.json`, `knowledge.json`, `examples.json`, `tests.json`,',
'validated by `src/tools/loader/ToolLoader.ts`. The model does not see these specs (its grammar only allows',
'`execute`/`done`); they feed parameter validation, the offline fast paths and tests.','',
'| Domain | Tools |','|---|---:|']
for k,v in sorted(tools.items()): out.append(f'| `{k}` | {v} |')
out += ['',
'## Regenerating','',
'```bash','python3 scripts/generate_codebase_map.py > docs/CODEBASE_MAP.md','```','']
print('\n'.join(out))
