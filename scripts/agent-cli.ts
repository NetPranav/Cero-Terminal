#!/usr/bin/env node
/**
 * scripts/agent-cli.ts — Direct CLI Agent Runner & Inspection Harness
 * 
 * Allows running Cero AI Terminal prompts directly from terminal / scripts,
 * with full visibility into:
 * - ReAct thinking process & LLM reasoning
 * - Selected tools & parameters
 * - Exact macOS / shell commands executed under the hood
 * - Command stdout, stderr, exit codes, and execution duration
 * - Structured tool output data
 * - Final AI summary & result status
 * 
 * Usage:
 *   npx tsx scripts/agent-cli.ts "your prompt here"
 *   npm run agent -- "your prompt here"
 *   npm run agent -- --verbose "what is my battery level"
 *   npm run agent -- --json "list files in ."
 *   npm run agent (launches interactive REPL)
 */

import * as readline from 'node:readline';
import { NodeTauriBridge, CommandExecutionRecord } from '../src/infrastructure/execution/NodeTauriBridge';
import { ToolLoader } from '../src/tools/loader/ToolLoader';
import { AgentLoop, AgentEvent, AgentResult } from '../src/ai/agent/AgentLoop';
import { ModelManager } from '../src/ai/management/ModelManager';

// ANSI Color Helpers
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  bgDark: '\x1b[40m'
};

// Install the Tauri IPC polyfill so all drivers execute native OS commands via Node
NodeTauriBridge.install();

export interface CliOptions {
  prompt?: string;
  verbose: boolean;
  json: boolean;
  cwd: string;
  dryRun: boolean;
  autoApprove: boolean;
  silent?: boolean;
}

export function parseArgs(customArgs?: string[]): CliOptions {
  const args = customArgs !== undefined ? customArgs : process.argv.slice(2);
  let verbose = false;
  let json = false;
  let dryRun = false;
  let autoApprove = false;
  let cwd = process.cwd();
  const promptParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--auto-approve' || arg === '--ci') {
      autoApprove = true;
    } else if (arg === '--cwd') {
      cwd = args[++i] || cwd;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    } else {
      promptParts.push(arg);
    }
  }

  return {
    prompt: promptParts.length > 0 ? promptParts.join(' ') : undefined,
    verbose,
    json,
    cwd,
    dryRun,
    autoApprove
  };
}

function showHelp(): void {
  console.log(`
${colors.bold}${colors.cyan}Cero AI Terminal — CLI Agent Runner & Inspection Harness${colors.reset}

${colors.bold}USAGE:${colors.reset}
  npm run agent -- "<prompt>" [options]
  npx tsx scripts/agent-cli.ts "<prompt>" [options]

${colors.bold}OPTIONS:${colors.reset}
  -v, --verbose     Show detailed system command executions, raw output, and LLM payloads
  --json            Output final result as structured JSON (ideal for automated test harnesses)
  --dry-run         Simulate tool selection without executing actions
  --cwd <path>      Set execution directory (defaults to current working directory)
  -h, --help        Show this help message

${colors.bold}EXAMPLES:${colors.reset}
  npm run agent -- "show me files in ."
  npm run agent -- "what is my battery level"
  npm run agent -- "turn on bluetooth"
  npm run agent -- --verbose "find all typescript files in src"
  npm run agent (starts interactive session)
`);
}

function formatData(data: any): string {
  if (!data) return '';
  if (Array.isArray(data)) {
    if (data.length === 0) return '    (empty list)';
    if (typeof data[0] === 'string') {
      return data.slice(0, 20).map(item => `    • ${item}`).join('\n') + (data.length > 20 ? `\n    ... and ${data.length - 20} more items` : '');
    }
    return data.slice(0, 10).map(item => `    • ${JSON.stringify(item)}`).join('\n') + (data.length > 10 ? `\n    ... and ${data.length - 10} more items` : '');
  }
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([k, v]) => `    • ${colors.cyan}${k}${colors.reset}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n');
  }
  return `    ${String(data)}`;
}

async function runPrompt(
  agentLoop: AgentLoop, 
  prompt: string, 
  options: CliOptions
): Promise<AgentResult> {
  const executedCommands: CommandExecutionRecord[] = [];
  
  // Track OS command executions for this prompt
  const unlistenCommand = NodeTauriBridge.onCommand((record) => {
    executedCommands.push(record);
    if (!options.json && !options.silent) {
      console.log(`  ${colors.gray}⚡ [OS Command]${colors.reset} ${colors.yellow}${record.fullCommand}${colors.reset}`);
      if (options.verbose) {
        if (record.stdout && record.stdout.trim()) {
          const lines = record.stdout.trim().split('\n');
          const preview = lines.slice(0, 8).join('\n');
          console.log(`    ${colors.gray}stdout:${colors.reset}\n${preview.split('\n').map(l => `      ${l}`).join('\n')}${lines.length > 8 ? `\n      ... (${lines.length - 8} more lines)` : ''}`);
        }
        if (record.stderr && record.stderr.trim()) {
          console.log(`    ${colors.red}stderr:${colors.reset} ${record.stderr.trim()}`);
        }
        console.log(`    ${colors.gray}exit code: ${record.code} (${record.durationMs.toFixed(1)}ms)${colors.reset}`);
      }
    }
  });

  if (!options.json && !options.silent) {
    console.log(`\n${colors.bold}${colors.cyan}► Prompt:${colors.reset} "${colors.bold}${prompt}${colors.reset}"`);
  }

  // Set up event streaming
  agentLoop.onEvent((event: AgentEvent) => {
    if (options.json || options.silent) return;

    switch (event.type) {
      case 'thinking':
        console.log(`  ${colors.blue}🧠 ${event.message}${colors.reset}`);
        break;
      case 'plan':
        console.log(`  ${colors.magenta}📋 [Execution Plan] ${event.message}${colors.reset}`);
        if (event.data?.steps && Array.isArray(event.data.steps)) {
          event.data.steps.forEach((s: string, i: number) => {
            console.log(`     ${colors.cyan}${i + 1}.${colors.reset} ${s}`);
          });
        }
        break;
      case 'question':
        console.log(`\n  ${colors.bold}${colors.yellow}❓ Clarification Needed:${colors.reset} ${colors.bold}${event.message}${colors.reset}`);
        console.log(`  ${colors.gray}(Enter your response to continue this workflow, or /cancel to abort)${colors.reset}\n`);
        break;
      case 'tool_start':
        console.log(`  ${colors.magenta}🔧 ${event.message}${colors.reset}`);
        break;
      case 'step_output':
        console.log(`  ${colors.cyan}  ▶ ${event.message}${colors.reset}`);
        break;
      case 'tool_done':
        console.log(`  ${colors.green}  ✓ ${event.message}${colors.reset}`);
        if (event.data && options.verbose) {
          console.log(formatData(event.data));
        }
        break;
      case 'error':
        console.log(`  ${colors.red}✗ ${event.message}${colors.reset}`);
        break;
      case 'done':
        console.log(`  ${colors.green}🎉 ${event.message}${colors.reset}`);
        break;
    }
  });

  const detectedOs = process.platform === 'darwin' ? 'macos' : (process.platform === 'win32' ? 'windows' : 'linux');

  // Auto-approve or handle authorization for CLI/headless runs
  agentLoop.setAuthorizationHandler(async (plan) => {
    if (options.autoApprove || options.json) {
      if (options.verbose) {
        console.log(`  ${colors.yellow}🛡 [Auto-Approved Plan] ${plan.capabilityId} (Risk: ${plan.riskLevel}/${plan.riskScore})${colors.reset}`);
      }
      return true;
    }
    return true;
  });

  const startTime = performance.now();
  let result: AgentResult;

  try {
    result = await agentLoop.run(prompt, { os: detectedOs, cwd: options.cwd });
  } catch (err: any) {
    result = {
      success: false,
      summary: `Execution error: ${err?.message || err}`,
      steps: []
    };
  } finally {
    unlistenCommand();
  }

  const duration = (performance.now() - startTime).toFixed(1);

  if (!options.silent) {
    if (options.json) {
      console.log(JSON.stringify({
        prompt,
        success: result.success,
        summary: result.summary,
        steps: result.steps,
        cdPath: result.cdPath,
        executedCommands: executedCommands.map(c => ({
          command: c.fullCommand,
          code: c.code,
          durationMs: c.durationMs,
          stdout: c.stdout,
          stderr: c.stderr
        })),
        durationMs: parseFloat(duration)
      }, null, 2));
    } else {
      console.log(`\n${colors.bold}${result.success ? colors.green + '✓ SUCCESS' : colors.red + '✗ FAILED'}${colors.reset} ${colors.gray}(${duration}ms)${colors.reset}`);
      console.log(`${colors.bold}Summary:${colors.reset} ${result.summary}`);
    if (result.steps.length > 0) {
      console.log(`\n${colors.bold}Steps Executed (${result.steps.length}):${colors.reset}`);
      result.steps.forEach((step, idx) => {
        const icon = step.result.success ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
        console.log(`  ${idx + 1}. [${step.tool}] ${icon} ${step.result.commandExecuted ? `(${step.result.commandExecuted})` : ''}`);
        if (step.result.data) {
          console.log(formatData(step.result.data));
        }
      });
    }
    if (result.cdPath) {
      console.log(`${colors.cyan}Directory change:${colors.reset} ${result.cdPath}`);
    }
    console.log('');
    }
  }

  return result;
}

async function startInteractiveRepl(agentLoop: AgentLoop, options: CliOptions): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`
${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════════${colors.reset}
${colors.bold}${colors.cyan}  Cero AI Terminal — Interactive Inspection REPL${colors.reset}
${colors.gray}  Type your natural language goal or command. Type 'exit' or 'quit' to end.${colors.reset}
${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════════${colors.reset}
`);

  const updatePrompt = () => {
    if (agentLoop.hasPendingQuestion()) {
      rl.setPrompt(`${colors.bold}${colors.yellow}cero (clarify)>${colors.reset} `);
    } else {
      rl.setPrompt(`${colors.bold}${colors.cyan}cero>${colors.reset} `);
    }
    rl.prompt();
  };

  updatePrompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      updatePrompt();
      return;
    }

    if (input === 'exit' || input === 'quit' || input === ':q') {
      rl.close();
      return;
    }

    if (input === '/cancel') {
      if (agentLoop.hasPendingQuestion()) {
        agentLoop.cancelPendingQuestion();
        console.log(`\n  ${colors.yellow}Workflow cancelled.${colors.reset}\n`);
      } else {
        console.log(`\n  ${colors.gray}No active question to cancel.${colors.reset}\n`);
      }
      updatePrompt();
      return;
    }

    if (input === 'clear') {
      console.clear();
      updatePrompt();
      return;
    }

    await runPrompt(agentLoop, input, options);
    updatePrompt();
  });

  rl.on('close', () => {
    console.log(`\n${colors.gray}Exiting Cero REPL session. Goodbye!${colors.reset}\n`);
    process.exit(0);
  });
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Load tools registry
  const loader = new ToolLoader();
  const loadResult = loader.loadAll(options.json || !options.verbose);

  if (!options.json && options.verbose) {
    console.log(`${colors.gray}[ToolLoader] Loaded ${loadResult.toolsLoaded} tools into registry.${colors.reset}`);
  }

  const modelManager = new ModelManager();
  try {
    await modelManager.initialize();
  } catch {}

  const agentLoop = new AgentLoop(loader.getState(), modelManager);
  agentLoop.setAuthorizationHandler(async (plan) => {
    if (!options.json) {
      console.log(`  ${colors.yellow}⚡ [Authorized action]${colors.reset} ${plan.capabilityId} (${plan.riskLevel})`);
    }
    return true;
  });

  if (options.prompt) {
    const result = await runPrompt(agentLoop, options.prompt, options);
    process.exit(result.success ? 0 : 1);
  } else {
    await startInteractiveRepl(agentLoop, options);
  }
}

export { formatData, runPrompt, showHelp };

const isDirectRun = process.argv[1] && process.argv[1].includes('agent-cli');

if (isDirectRun) {
  main().catch((err) => {
    console.error(`${colors.red}[Cero CLI Fatal Error]${colors.reset}`, err);
    process.exit(1);
  });
}
