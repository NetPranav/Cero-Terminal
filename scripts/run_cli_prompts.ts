#!/usr/bin/env node
/**
 * scripts/run_cli_prompts.ts — Cero CLI Prompt Test Runner & Telemetry Recorder
 *
 * Executes prompts through the Cero CLI (scripts/agent-cli.ts),
 * records every input, expected output, actual output, underlying OS commands,
 * exit codes, raw stdout/stderr, execution duration, and verification oracles.
 *
 * Outputs:
 * - cli_test_records.json
 * - cli_test_records.md
 *
 * Usage:
 *   npx tsx scripts/run_cli_prompts.ts --all
 *   npx tsx scripts/run_cli_prompts.ts --domain 1
 *   npx tsx scripts/run_cli_prompts.ts --prompts 1.1-1.10
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { NodeTauriBridge, CommandExecutionRecord } from '../src/infrastructure/execution/NodeTauriBridge';
import { ToolLoader } from '../src/tools/loader/ToolLoader';
import { AgentLoop } from '../src/ai/agent/AgentLoop';
import { ModelManager } from '../src/ai/management/ModelManager';
import { runPrompt } from './agent-cli';
import {
  BenchmarkPromptParser,
  BenchmarkPrompt,
  VerificationOracles,
  OracleResult
} from './benchmark_prompts';

// Initialize Tauri IPC polyfill
NodeTauriBridge.install();

export interface CliPromptRecord {
  id: string;
  domain: number;
  domainName: string;
  inputPrompt: string;
  cleanPrompt: string;
  cliCommand: string;
  targetTool: string;
  expectedOutput: string;
  verificationCriteria: string;
  actualOutput: string;
  success: boolean;
  passed: boolean;
  durationMs: number;
  executedCommands: Array<{
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
  }>;
  oracles: OracleResult[];
  failureReason?: string;
}

export interface CliTestingSummary {
  timestamp: string;
  platform: string;
  totalPrompts: number;
  totalPassed: number;
  totalFailed: number;
  overallPassRate: number;
  totalDurationSeconds: number;
  domainSummaries: Array<{
    domain: number;
    domainName: string;
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    averageDurationMs: number;
  }>;
  records: CliPromptRecord[];
}

async function main() {
  const args = process.argv.slice(2);
  let domainFilter: number | undefined;
  let rangeFilter: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--domain' && args[i + 1]) {
      domainFilter = parseInt(args[++i], 10);
    } else if (args[i] === '--prompts' && args[i + 1]) {
      rangeFilter = args[++i];
    }
  }

  const roadmapPath = path.resolve(process.cwd(), 'docs', 'benchmark', 'PROMPTS.md');
  const allPrompts = BenchmarkPromptParser.parseFromRoadmap(roadmapPath);
  let promptsToRun: BenchmarkPrompt[] = allPrompts;

  if (domainFilter) {
    promptsToRun = allPrompts.filter(p => p.domain === domainFilter);
  } else if (rangeFilter) {
    const [start, end] = rangeFilter.split('-').map(s => s.trim());
    const startIndex = allPrompts.findIndex(p => p.id === start);
    const endIndex = allPrompts.findIndex(p => p.id === end);
    if (startIndex !== -1 && endIndex !== -1) {
      promptsToRun = allPrompts.slice(startIndex, endIndex + 1);
    } else {
      promptsToRun = allPrompts.filter(p => p.id === start);
    }
  }

  console.log(`\n================================================================================`);
  console.log(`  Cero CLI Prompt Test & Telemetry Recorder`);
  console.log(`  Prompts Queued: ${promptsToRun.length} | Target Platform: ${process.platform}`);
  console.log(`================================================================================\n`);

  const toolLoader = new ToolLoader();
  const modelManager = new ModelManager();
  const agentLoop = new AgentLoop(toolLoader.getState(), modelManager);

  // Auto-approve headless CLI execution
  agentLoop.setAuthorizationHandler(async () => true);

  const records: CliPromptRecord[] = [];
  const startTime = Date.now();

  for (let i = 0; i < promptsToRun.length; i++) {
    const p = promptsToRun[i];
    process.stdout.write(`  [${i + 1}/${promptsToRun.length}] CLI -> ${p.id}: "${p.cleanPrompt}" ... `);

    NodeTauriBridge.clearHistory();
    const promptStart = performance.now();

    const cliResult = await runPrompt(agentLoop, p.cleanPrompt, {
      json: true,
      verbose: false,
      cwd: process.cwd(),
      dryRun: false,
      autoApprove: true,
      silent: true
    });

    const promptDuration = Math.round(performance.now() - promptStart);
    const executed = NodeTauriBridge.getHistory(false);
    const capCmds = NodeTauriBridge.getCapabilityCommands();
    const realExecuted = executed.filter(e => !e.fullCommand.includes('test -f') && !e.fullCommand.includes('learned_patterns'));
    const primaryCmd = capCmds[capCmds.length - 1] || realExecuted[realExecuted.length - 1];

    const stepDataCode = cliResult.steps?.[0]?.result?.data?.code;
    const primaryExitCode = (stepDataCode !== undefined)
      ? stepDataCode
      : (primaryCmd?.code ?? (cliResult.success ? 0 : 1));

    // Run verification oracles
    const oracles: OracleResult[] = [
      VerificationOracles.verifyNoOsError(cliResult, executed, primaryCmd, primaryExitCode),
      VerificationOracles.verifyNoPlatformMismatch(cliResult, executed),
      VerificationOracles.verifyFormatting(cliResult, p.expectedOutput),
      VerificationOracles.verifySingularPrecision(p, cliResult),
      VerificationOracles.verifyCriteria(p, cliResult, executed, primaryCmd)
    ];

    const failedOracle = oracles.find(o => !o.passed);
    const passed = cliResult.success && !failedOracle;

    const record: CliPromptRecord = {
      id: p.id,
      domain: p.domain,
      domainName: p.domainName,
      inputPrompt: p.prompt,
      cleanPrompt: p.cleanPrompt,
      cliCommand: `npm run cli -- "${p.cleanPrompt}" --json`,
      targetTool: p.targetTool,
      expectedOutput: p.expectedOutput,
      verificationCriteria: p.verificationCriteria,
      actualOutput: cliResult.summary,
      success: cliResult.success,
      passed,
      durationMs: promptDuration,
      executedCommands: executed.map(c => ({
        command: c.fullCommand,
        exitCode: c.code,
        stdout: c.stdout.trim().slice(0, 1000),
        stderr: c.stderr.trim().slice(0, 1000),
        durationMs: Math.round(c.durationMs)
      })),
      oracles,
      failureReason: failedOracle?.message
    };

    records.push(record);

    if (passed) {
      console.log(`✓ PASS (${promptDuration}ms)`);
    } else {
      console.log(`✗ FAIL [${failedOracle?.oracleName || 'UNKNOWN'}: ${failedOracle?.message || cliResult.summary}]`);
    }
  }

  const totalDurationSeconds = Math.round((Date.now() - startTime) / 1000);
  const totalPassed = records.filter(r => r.passed).length;
  const totalFailed = records.length - totalPassed;
  const overallPassRate = records.length > 0 ? Math.round((totalPassed / records.length) * 100) : 0;

  // Domain summaries
  const domainMap = new Map<number, { domainName: string; total: number; passed: number; durationSum: number }>();
  for (const r of records) {
    if (!domainMap.has(r.domain)) {
      domainMap.set(r.domain, { domainName: r.domainName, total: 0, passed: 0, durationSum: 0 });
    }
    const d = domainMap.get(r.domain)!;
    d.total++;
    if (r.passed) d.passed++;
    d.durationSum += r.durationMs;
  }

  const domainSummaries = Array.from(domainMap.entries()).map(([domain, d]) => ({
    domain,
    domainName: d.domainName,
    total: d.total,
    passed: d.passed,
    failed: d.total - d.passed,
    passRate: Math.round((d.passed / d.total) * 100),
    averageDurationMs: Math.round(d.durationSum / d.total)
  })).sort((a, b) => a.domain - b.domain);

  const summaryReport: CliTestingSummary = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    totalPrompts: records.length,
    totalPassed,
    totalFailed,
    overallPassRate,
    totalDurationSeconds,
    domainSummaries,
    records
  };

  // Write JSON report
  const jsonPath = path.resolve(process.cwd(), 'reports', 'cli_test_records.json');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(summaryReport, null, 2), 'utf-8');

  // Write Markdown summary
  const mdPath = path.resolve(process.cwd(), 'reports', 'cli_test_records.md');
  let md = `# Cero CLI Prompt Execution & Telemetry Report\n\n`;
  md += `> **Generated:** ${summaryReport.timestamp}  \n`;
  md += `> **Platform:** ${summaryReport.platform}  \n`;
  md += `> **Total Evaluated:** ${summaryReport.totalPrompts}  \n`;
  md += `> **Total Passed:** ${summaryReport.totalPassed} / ${summaryReport.totalPrompts} (${summaryReport.overallPassRate}%)  \n`;
  md += `> **Execution Duration:** ${summaryReport.totalDurationSeconds}s  \n\n`;

  md += `## Domain Breakdown\n\n`;
  md += `| Domain | Domain Name | Total | Passed | Failed | Pass Rate | Avg Duration |\n`;
  md += `|:---:|---|:---:|:---:|:---:|:---:|:---:|\n`;
  for (const d of domainSummaries) {
    md += `| **Domain ${d.domain}** | ${d.domainName} | ${d.total} | ${d.passed} | ${d.failed} | ${d.passRate}% | ${d.averageDurationMs}ms |\n`;
  }
  md += `| **TOTAL** | **All Evaluated Prompts** | **${summaryReport.totalPrompts}** | **${summaryReport.totalPassed}** | **${summaryReport.totalFailed}** | **${summaryReport.overallPassRate}%** | **${Math.round(records.reduce((acc, r) => acc + r.durationMs, 0) / (records.length || 1))}ms** |\n\n`;

  md += `## Sample Telemetry Records (First 10 Prompts)\n\n`;
  for (const r of records.slice(0, 10)) {
    md += `### Prompt ${r.id}: \`${r.inputPrompt}\`\n`;
    md += `- **Domain:** Domain ${r.domain} (${r.domainName})\n`;
    md += `- **CLI Command:** \`${r.cliCommand}\`\n`;
    md += `- **Target Tool / Capability:** \`${r.targetTool}\`\n`;
    md += `- **Expected Output:** ${r.expectedOutput}\n`;
    md += `- **Verification Criteria:** ${r.verificationCriteria}\n`;
    md += `- **Actual CLI Summary:** ${r.actualOutput}\n`;
    md += `- **Status:** ${r.passed ? '✅ PASS' : '❌ FAIL'}\n`;
    md += `- **Duration:** ${r.durationMs}ms\n`;
    if (r.executedCommands.length > 0) {
      md += `- **Underlying OS Commands Executed:**\n`;
      for (const cmd of r.executedCommands) {
        md += `  - \`${cmd.command}\` (Exit Code: ${cmd.exitCode}, ${cmd.durationMs}ms)\n`;
      }
    }
    md += `\n`;
  }

  fs.writeFileSync(mdPath, md, 'utf-8');

  console.log(`\n================================================================================`);
  console.log(`  CLI EXECUTION COMPLETE`);
  console.log(`  Passed: ${totalPassed}/${records.length} (${overallPassRate}%) in ${totalDurationSeconds}s`);
  console.log(`  📄 JSON Record: ${jsonPath}`);
  console.log(`  📋 Markdown Report: ${mdPath}`);
  console.log(`================================================================================\n`);
}

main().catch(err => {
  console.error('Fatal CLI runner error:', err);
  process.exit(1);
});
