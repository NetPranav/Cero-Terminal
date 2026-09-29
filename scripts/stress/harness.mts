/**
 * Headless stress harness: runs requests through the real AgentLoop with the app's context
 * (os 'macos', a pane id, the terminal registry) against the local llama-server on :8847.
 * Other terminals are real pseudo-terminals (script + zsh), so tabs, busy state, prompts and
 * Ctrl+C behave like the app. Every confirmation is recorded; risky commands are denied unless
 * a test allows them. Results go to results.jsonl, one line per request.
 */
import { spawn, ChildProcess, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.join(T, '.runs');
const WORK = path.join(RUNS, 'work');
fs.mkdirSync(RUNS, { recursive: true });
const OUT = path.join(RUNS, process.env.OUT || 'results.jsonl');

const { NodeTauriBridge } = await import(`${ROOT}/src/infrastructure/execution/NodeTauriBridge.ts`);
NodeTauriBridge.install();
const { ToolLoader } = await import(`${ROOT}/src/tools/loader/ToolLoader.ts`);
const { AgentLoop } = await import(`${ROOT}/src/ai/agent/AgentLoop.ts`);
const { ModelManager } = await import(`${ROOT}/src/ai/management/ModelManager.ts`);
const { TerminalWorkspace } = await import(`${ROOT}/src/domain/terminal/TerminalWorkspace.ts`);
const { tests } = await import(path.join(T, process.env.TESTS || 'tests.ts'));

// ---- simulated terminals -------------------------------------------------------------------
const ws = TerminalWorkspace.getInstance();
const ptys = new Map<string, ChildProcess>();
const tabs: { tabId: string; index: number; title: string; paneIds: string[] }[] = [
  { tabId: 't1', index: 1, title: 'work', paneIds: ['me'] },
];
const spawns: any[] = [];
// zsh prints a PROMPT_SP marker (% and spaces) before the prompt on the same line
const PROMPT_END = /sim [^\n%#]*[%#] ?$/;
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[=>]|\r/g, '');

function openPty(paneId: string, cwd: string) {
  const child = spawn('python3', [path.join(T, 'ptyrelay.py'), '/bin/zsh', '-f'], { cwd, env: { ...process.env, PS1: 'sim %1~ %# ', TERM: 'dumb' } });
  ptys.set(paneId, child);
  let started = false;
  let acc = '';
  child.stdout!.on('data', (buf: Buffer) => {
    const text = strip(buf.toString());
    ws.appendOutput(paneId, text);
    acc = (acc + text).slice(-400);
    if (PROMPT_END.test(acc)) {
      if (!started) {
        started = true;
        const pending = ws.takePendingCommand(paneId);
        if (pending?.command) {
          child.stdin!.write(`${pending.command}\r`);
          ws.update(paneId, { busy: true, runningCommand: pending.command });
          acc = '';
          return;
        }
      }
      ws.update(paneId, { busy: false, runningCommand: undefined });
    }
  });
  child.stdin!.write(`PS1='sim %1~ %# '; cd ${JSON.stringify(cwd)}\r`);
}

ws.register('me', { sessionId: 's-me', cwd: WORK, outputTail: ['sim work % '] });
ws.setSpawner((req: any) => {
  const paneId = `p${spawns.length + 2}`;
  spawns.push({ paneId, ...req });
  if (req.placement === 'tab') tabs.push({ tabId: `t${tabs.length + 1}`, index: tabs.length + 1, title: req.title || 'shell', paneIds: [paneId] });
  else (tabs.find(t => t.paneIds.includes(req.requesterPaneId)) || tabs[0]).paneIds.push(paneId);
  ws.update(paneId, {});
  setTimeout(() => {
    ws.update(paneId, { sessionId: `s-${paneId}` });
    openPty(paneId, req.cwd || WORK);
  }, 0);
  setTimeout(() => ws.setLayout(tabs), 0);
  return paneId;
});
ws.setWriter((sessionId: string, data: string) => {
  const paneId = sessionId.replace(/^s-/, '');
  const child = ptys.get(paneId);
  if (!child) return;
  child.stdin!.write(data);
  if (data.endsWith('\r') && data.trim()) ws.update(paneId, { busy: true, runningCommand: data.trim() });
});
ws.setLayout(tabs);

// ---- agent ---------------------------------------------------------------------------------
const loader = new ToolLoader();
loader.loadAll(true);
const models = new ModelManager();
try { await models.initialize(); } catch {}
const provider: any = models.getActiveProvider();
let modelCalls = 0;
let modelMs = 0;
const generate = provider.generate.bind(provider);
provider.generate = async (...args: any[]) => {
  modelCalls++;
  const t0 = performance.now();
  try { return await generate(...args); } finally { modelMs += performance.now() - t0; }
};
const agent = new AgentLoop(loader.getState(), models);

const RISKY = /(?:^|[\s;&|(`$"'])(rm|rmdir|mv|chmod|chown|kill|pkill|killall|sudo|dd|mkfs|shutdown|reboot|defaults|osascript|open|launchctl|diskutil|brew|xattr|crontab)(?=\s|$)|curl[^|;]*\|\s*(?:sudo\s+)?(?:ba|z)?sh/;

let current: any = null;
agent.setAuthorizationHandler(async (plan: any) => {
  const text = JSON.stringify(plan.parameters ?? {});
  const m = text.match(RISKY);
  const word = m ? (m[1] || 'curl|sh') : null;
  const allowed = current.approve !== false && (!word || (current.allow || []).includes(word));
  current.plans.push({ cap: plan.capabilityId, risk: plan.riskLevel, params: text.slice(0, 400), approved: allowed, deniedFor: allowed ? undefined : (word || 'test denies') });
  return allowed;
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
fs.writeFileSync(OUT, '');
console.log(`provider: ${provider?.name} model: ${models.getActiveModel?.()?.modelId ?? '?'}`);

for (const test of tests) {
  if (only && !only.has(test.id)) continue;
  current = { ...test, plans: [] };
  const before = NodeTauriBridge.getHistory(false).length;
  modelCalls = 0; modelMs = 0;
  const cwd = test.cwd ? path.join(WORK, test.cwd) : WORK;
  ws.update('me', { cwd });
  const t0 = performance.now();
  let result: any;
  try {
    result = await Promise.race([
      agent.run(test.prompt, { os: 'macos', cwd, paneId: 'me' }),
      sleep(240_000).then(() => ({ success: false, summary: 'HARNESS TIMEOUT (240 s)', steps: [] })),
    ]);
  } catch (e: any) {
    result = { success: false, summary: `THREW: ${e?.stack || e}`, steps: [] };
  }
  const ms = Math.round(performance.now() - t0);
  if (test.waitAfter) await sleep(test.waitAfter);
  const cmds = NodeTauriBridge.getHistory(false).slice(before).map((c: any) => ({
    cmd: (c.args?.[1] ?? c.fullCommand).slice(0, 300), code: c.code,
    out: (c.stdout + (c.stderr ? `\n[stderr] ${c.stderr}` : '')).trim().slice(0, 300),
  }));
  let check: string | null = null;
  try {
    check = test.check ? await test.check({ result, cmds, plans: current.plans, work: WORK, ws, spawns, sh: (c: string) => { try { return execSync(c, { cwd: WORK, encoding: 'utf8', shell: '/bin/sh' }); } catch (e: any) { return `ERR ${e.status}: ${e.stdout || ''}${e.stderr || ''}`; } } }) : null;
  } catch (e: any) {
    check = `check threw: ${e?.message}`;
  }
  const row = {
    id: test.id, prompt: test.prompt, pass: check === null, check, ms, modelCalls, modelMs: Math.round(modelMs),
    success: result.success, declined: result.declined, summary: String(result.summary || '').slice(0, 1200),
    cmds, plans: current.plans, cdPath: result.cdPath,
  };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  if (process.env.DEBUG_PANES) for (const p of ws.list()) console.log(`   pane ${p.paneId} busy=${p.busy} cmd=${p.runningCommand ?? '-'} tail=${JSON.stringify(p.outputTail.slice(-3))}`);
  console.log(`${row.pass ? 'PASS' : 'FAIL'} ${test.id.padEnd(22)} ${String(ms).padStart(6)}ms model:${modelCalls} ${row.pass ? '' : '- ' + check}`);
}

for (const child of ptys.values()) { try { child.stdin!.write('\x03exit\r'); child.kill(); } catch {} }
process.exit(0);
