/**
 * engine_smoke.ts — live check of the self-hosted llama.cpp engine.
 *
 * Unit tests mock the model server, so they cannot tell whether a real llama-server accepts
 * Sentinel's launch flags and GBNF grammar, or whether prompt caching actually works. Run this
 * on a machine with an engine and a model installed:
 *
 *   npm run smoke:engine                               # auto-detect engine and model
 *   npm run smoke:engine -- --model ~/models/x.gguf --server /usr/bin/llama-server --ngl 0
 *
 * It downloads nothing. Exit code 0 means every check passed.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildSystemPrompt } from '../src/ai/agent/SystemPrompt';
import { GbnfGrammarManager } from '../src/ai/models/GbnfGrammarManager';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function findServer(): string | undefined {
  const candidates = [
    join(homedir(), '.sentinel', 'engine', 'current', 'llama-server'),
    join(homedir(), '.sentinel', 'bin', 'llama-server'),
    '/usr/bin/llama-server',
    '/usr/local/bin/llama-server',
    '/opt/homebrew/bin/llama-server',
    ...(process.env.PATH || '').split(':').map(dir => join(dir, 'llama-server')),
  ];
  return candidates.find(p => existsSync(p));
}

function findModel(): string | undefined {
  const dir = join(homedir(), '.sentinel', 'models');
  if (!existsSync(dir)) return undefined;
  const gguf = readdirSync(dir).filter(f => f.endsWith('.gguf') && !f.includes('lora'));
  return gguf.length ? join(dir, gguf[0]) : undefined;
}

const port = Number(arg('port') || 18847);
const server = arg('server') || findServer();
const model = arg('model') || findModel();
const ngl = arg('ngl') || '99';
const base = `http://127.0.0.1:${port}`;

let failures = 0;
function report(name: string, ok: boolean, detail: string): void {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

async function waitForHealth(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function ask(goal: string): Promise<{ status: number; body: any; ms: number }> {
  const started = performance.now();
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Same request shape as EmbeddedProvider.executeInference
    body: JSON.stringify({
      messages: [
        { role: 'system', content: buildSystemPrompt([], { os: 'linux', cwd: homedir() }, goal) },
        { role: 'user', content: goal },
      ],
      max_tokens: 512,
      temperature: 0.05,
      top_p: 0.9,
      top_k: 20,
      repeat_penalty: 1.0,
      cache_prompt: true,
      stream: false,
      grammar: GbnfGrammarManager.getGrammar('SENTINEL_ACTION'),
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, ms: Math.round(performance.now() - started) };
}

async function main(): Promise<void> {
  if (!server || !model) {
    console.error(`Missing ${!server ? 'llama-server binary' : 'GGUF model'}. Pass --server/--model or install via Sentinel.`);
    process.exit(2);
  }
  console.log(`engine: ${server}\nmodel:  ${model}\n`);

  // Keep in sync with build_server_args() in src-tauri/src/embedded_server.rs
  const args = ['--host', '127.0.0.1', '--port', String(port), '-m', model, '-ngl', ngl,
    '-c', '8192', '-np', '1', '--cache-reuse', '256'];
  const proc: ChildProcess = spawn(server, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderrTail = '';
  proc.stderr?.on('data', chunk => { stderrTail = (stderrTail + chunk.toString()).slice(-4000); });
  proc.on('error', err => { stderrTail += `\nfailed to spawn ${server}: ${err.message}`; });

  try {
    if (proc.pid === undefined) {
      report('server starts with Sentinel flags', false, `could not spawn ${server}`);
      return;
    }
    const healthy = await waitForHealth(180_000);
    report('server starts with Sentinel flags', healthy, healthy ? '' : `\n${stderrTail}`);
    if (!healthy) return;

    const first = await ask('check disk usage of my home partition');
    const content = first.body?.choices?.[0]?.message?.content || '';
    let parsed: any = null;
    try { parsed = JSON.parse(content); } catch { /* reported below */ }
    report('grammar accepted', first.status === 200, `HTTP ${first.status}`);
    report('output is a valid action', parsed?.action === 'execute' && typeof parsed.command === 'string',
      JSON.stringify(parsed ?? content).slice(0, 160));

    const second = await ask('which process is using the most memory');
    const t = second.body?.timings || {};
    const cached = Number(t.cache_n ?? 0);
    report('static prompt prefix reused from cache', cached > 500,
      `cache_n=${t.cache_n} prompt_n=${t.prompt_n} prompt_ms=${Math.round(t.prompt_ms ?? 0)}`);
    console.log(`\nlatency: first request ${first.ms} ms (cold prefix), second request ${second.ms} ms (warm prefix)`);
  } finally {
    // Never signal a child that failed to spawn: its pid is unset and kill() can end up
    // signalling our own process group.
    if (proc.pid !== undefined && proc.exitCode === null) proc.kill('SIGTERM');
  }
}

main()
  .then(() => process.exit(failures ? 1 : 0))
  .catch(err => { console.error(err); process.exit(1); });
