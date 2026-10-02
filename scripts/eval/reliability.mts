#!/usr/bin/env tsx
/**
 * reliability.mts — Repeatable Reliability Evaluation for Sentinel AI Models
 *
 * Runs the real decision path against an active engine, measuring pass@1 and flip rate.
 * Run with: npm run eval:model
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDecisionCall } from '../../src/ai/agent/DecisionCall.js';
import { wireSampling } from '../../src/ai/provider/DecisionRequest.js';
import { formatComparison } from '../../src/ai/eval/compareReports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestCase {
  id: string;
  prompt: string;
  expect: {
    tool?: string;
    must_include?: string[];
    must_not_include?: string[];
  };
}

interface RunResult {
  caseId: string;
  prompt: string;
  runs: number;
  passes: number;
  passRate: number;
  distinctAnswers: string[];
  flipped: boolean;
  sampleAnswer: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let url = 'http://127.0.0.1:8847';
  let runs = 10;
  let casesPath = resolve(__dirname, 'cases.json');
  let provider: 'embedded' | 'ollama' | 'cloud' = 'embedded';
  let yes = false;
  let compare: [string, string] | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' && args[i + 1]) provider = args[++i] as typeof provider;
    if (args[i] === '--yes') yes = true;
    if (args[i] === '--compare' && args[i + 2]) compare = [resolve(process.cwd(), args[++i]), resolve(process.cwd(), args[++i])];
    if (args[i] === '--url' && args[i + 1]) url = args[++i];
    if (args[i] === '--runs' && args[i + 1]) runs = parseInt(args[++i], 10);
    if (args[i] === '--cases' && args[i + 1]) casesPath = resolve(process.cwd(), args[++i]);
  }
  return { url, runs, casesPath, provider, yes, compare };
}

async function checkEngineRunning(baseUrl: string, kind: string = 'embedded'): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}${kind === 'ollama' ? '/api/tags' : '/health'}`, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

async function getLoadedModel(baseUrl: string): Promise<string> {
  try {
    const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json() as any;
      if (data?.data?.[0]?.id) return data.data[0].id;
    }
  } catch {}
  return 'qwen2.5-coder-3b';
}

function evaluateResult(raw: string, expectRule: TestCase['expect']): { pass: boolean; answer: string; reason?: string } {
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch {}
    }
  }

  const answer = (parsed?.command || parsed?.summary || parsed?.question || raw.trim().replace(/\s+/g, ' ')).slice(0, 120);

  if (expectRule.must_not_include) {
    for (const forbidden of expectRule.must_not_include) {
      if (raw.toLowerCase().includes(forbidden.toLowerCase())) {
        return { pass: false, answer, reason: `Forbidden token: "${forbidden}"` };
      }
    }
  }

  if (expectRule.tool) {
    if (expectRule.tool === 'execute') {
      if (parsed?.action !== 'execute' || !parsed?.command) {
        return { pass: false, answer, reason: `Expected execute action, got ${parsed?.action || 'unknown'}` };
      }
    } else if (expectRule.tool === 'done' || expectRule.tool === 'chat') {
      if (parsed?.action && parsed.action !== 'done' && parsed.action !== 'chat') {
        return { pass: false, answer, reason: `Expected done/chat, got ${parsed?.action}` };
      }
    }
  }

  if (expectRule.must_include) {
    for (const required of expectRule.must_include) {
      if (!raw.toLowerCase().includes(required.toLowerCase())) {
        return { pass: false, answer, reason: `Missing required: "${required}"` };
      }
    }
  }

  return { pass: true, answer };
}

interface ProviderConfig { kind: 'embedded' | 'ollama' | 'cloud'; url: string; apiUrl?: string; apiKey?: string; apiModel?: string }

async function queryEngine(cfg: ProviderConfig, prompt: string, options: any): Promise<string> {
  const sampling = wireSampling(cfg.kind, options);
  if (cfg.kind === 'cloud' || cfg.kind === 'ollama') {
    // OpenAI-compatible chat completions; the same sampling the app sends
    const target = cfg.kind === 'cloud' ? cfg.apiUrl! : `${cfg.url}/v1/chat/completions`;
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({
        model: cfg.kind === 'cloud' ? cfg.apiModel : 'default',
        messages: options.messages,
        stream: false,
        response_format: { type: 'json_object' },
        ...wireSampling('cloud', options),
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`${cfg.kind} returned HTTP ${res.status}`);
    const data = await res.json() as any;
    return data?.choices?.[0]?.message?.content || '';
  }

  // The built-in engine: chat completions with the grammar, then the raw completion endpoint
  try {
    const res = await fetch(`${cfg.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: options.messages, stream: false, grammar: options.grammar, ...sampling }),
      signal: AbortSignal.timeout(30000)
    });
    if (res.ok) {
      const data = await res.json() as any;
      return data?.choices?.[0]?.message?.content || '';
    }
  } catch {}

  const res = await fetch(`${cfg.url}/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, n_predict: sampling.max_tokens, temperature: sampling.temperature, top_k: sampling.top_k, top_p: sampling.top_p, grammar: options.grammar, cache_prompt: false, seed: sampling.seed }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`Engine returned HTTP ${res.status}`);
  const data = await res.json() as any;
  return data?.content || '';
}

async function main() {
  const { url, runs, casesPath, provider, yes, compare } = parseArgs();

  if (compare) {
    const [a, b] = compare.map(f => JSON.parse(readFileSync(f, 'utf-8')));
    console.log(formatComparison({ model: a.model, results: a.results }, { model: b.model, results: b.results }));
    return;
  }

  const cfg: ProviderConfig = { kind: provider, url };
  let modelName: string;
  if (provider === 'cloud') {
    // Keys come from the environment only and are never written to the report
    cfg.apiUrl = process.env.SENTINEL_EVAL_API_URL;
    cfg.apiKey = process.env.SENTINEL_EVAL_API_KEY;
    cfg.apiModel = process.env.SENTINEL_EVAL_API_MODEL;
    if (!cfg.apiUrl || !cfg.apiKey || !cfg.apiModel) {
      console.error('Set SENTINEL_EVAL_API_URL (the full chat completions URL), SENTINEL_EVAL_API_KEY and SENTINEL_EVAL_API_MODEL.');
      process.exit(2);
    }
    if (!yes) {
      console.error(`This sends every case to ${new URL(cfg.apiUrl).host} and may cost money. Add --yes to continue.`);
      process.exit(2);
    }
    modelName = cfg.apiModel;
  } else {
    const isRunning = await checkEngineRunning(url, provider);
    if (!isRunning) {
      console.error(provider === 'ollama' ? 'Start Ollama first and pass --url http://127.0.0.1:11434' : 'Start Sentinel first (the built-in engine must be running)');
      process.exit(2);
    }
    modelName = await getLoadedModel(url);
  }
  console.log(`Sentinel Model Reliability Evaluation`);
  console.log(`Engine: ${url} | Model: ${modelName} | Runs per case: ${runs}`);

  const casesRaw = readFileSync(casesPath, 'utf-8');
  const cases: TestCase[] = JSON.parse(casesRaw);
  console.log(`Loaded ${cases.length} cases from ${casesPath}\n`);

  const results: RunResult[] = [];
  let totalSinglePasses = 0;
  let totalSingleRuns = 0;
  let flippedCasesCount = 0;
  const latencies: number[] = [];

  for (let cIdx = 0; cIdx < cases.length; cIdx++) {
    const c = cases[cIdx];
    process.stdout.write(`[${cIdx + 1}/${cases.length}] Evaluating ${c.id}... `);

    // Build the real agent decision call
    const decision = buildDecisionCall(c.prompt, { os: 'linux', cwd: '/test' });

    let passes = 0;
    const answersSet = new Set<string>();
    let sampleAnswer = '';

    for (let r = 0; r < runs; r++) {
      const startMs = performance.now();
      try {
        const rawContent = await queryEngine(cfg, decision.fullPrompt, decision.options);
        const elapsed = performance.now() - startMs;
        latencies.push(elapsed);

        const evalRes = evaluateResult(rawContent, c.expect);
        if (evalRes.pass) {
          passes++;
          totalSinglePasses++;
        }
        totalSingleRuns++;

        answersSet.add(evalRes.answer);
        if (!sampleAnswer) sampleAnswer = evalRes.answer;
      } catch (err: any) {
        answersSet.add(`Error: ${err.message}`);
        totalSingleRuns++;
      }
    }

    const flipped = answersSet.size > 1;
    if (flipped) flippedCasesCount++;

    const passRate = (passes / runs) * 100;
    results.push({
      caseId: c.id,
      prompt: c.prompt,
      runs,
      passes,
      passRate,
      distinctAnswers: Array.from(answersSet),
      flipped,
      sampleAnswer
    });

    console.log(`${passes}/${runs} pass ${flipped ? '(FLIPPED)' : '(STABLE)'}`);
  }

  latencies.sort((a, b) => a - b);
  const medianMs = latencies.length ? Math.round(latencies[Math.floor(latencies.length / 2)]) : 0;
  const passAt1 = totalSingleRuns > 0 ? (totalSinglePasses / totalSingleRuns) * 100 : 0;
  const flipRate = cases.length > 0 ? (flippedCasesCount / cases.length) * 100 : 0;

  console.log('\n======================================================');
  console.log('                 EVALUATION SUMMARY                   ');
  console.log('======================================================');
  console.log(`Model:      ${modelName}`);
  console.log(`Cases:      ${cases.length}`);
  console.log(`Total runs: ${totalSingleRuns}`);
  console.log(`pass@1:     ${passAt1.toFixed(1)}%`);
  console.log(`flip rate:  ${flipRate.toFixed(1)}%`);
  console.log(`median ms:  ${medianMs} ms`);
  console.log('======================================================\n');

  // Print worst cases first
  results.sort((a, b) => a.passRate - b.passRate || (b.flipped ? 1 : 0) - (a.flipped ? 1 : 0));

  console.log('Lowest performing cases:');
  console.log('Case ID               Pass Rate   Flipped?   Sample Answer / Failure');
  console.log('--------------------------------------------------------------------------------');
  for (const r of results.slice(0, 15)) {
    const id = r.caseId.padEnd(20, ' ');
    const rate = `${r.passes}/${r.runs} (${r.passRate.toFixed(0)}%)`.padEnd(12, ' ');
    const flip = (r.flipped ? 'YES' : 'no').padEnd(10, ' ');
    const ans = r.sampleAnswer.slice(0, 36);
    console.log(`${id} ${rate} ${flip} ${ans}`);
  }

  // Save JSON report
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const outDir = resolve(__dirname, 'out');
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `${dateStr}-${provider}-${modelName.replace(/[^\w.-]+/g, '_')}.json`);

  const reportData = {
    date: dateStr,
    timestamp: now.toISOString(),
    model: modelName,
    provider,
    summary: {
      cases: cases.length,
      totalRuns: totalSingleRuns,
      passAt1: Number(passAt1.toFixed(2)),
      flipRate: Number(flipRate.toFixed(2)),
      medianMs
    },
    results
  };

  writeFileSync(outFile, JSON.stringify(reportData, null, 2), 'utf-8');
  console.log(`\nDetailed report written to: ${outFile}`);
}

main().catch((err) => {
  console.error('Fatal error during evaluation:', err);
  process.exit(1);
});
