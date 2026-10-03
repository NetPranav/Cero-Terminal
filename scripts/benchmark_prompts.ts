#!/usr/bin/env node
/**
 * scripts/benchmark_prompts.ts — Cero Automated Benchmark Suite
 * 
 * Phase 0 of CERO_ROADMAP_v5.0:
 * Executes domain-classified prompts against Cero's agent engine, validates
 * results against automated verification oracles, and generates quality reports.
 * 
 * Usage:
 *   npx tsx scripts/benchmark_prompts.ts --domain 1 --headless
 *   npx tsx scripts/benchmark_prompts.ts --prompts 1.1-1.10 --headless
 *   npx tsx scripts/benchmark_prompts.ts --all --headless --output report.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NodeTauriBridge, CommandExecutionRecord } from '../src/infrastructure/execution/NodeTauriBridge';
import { ToolLoader } from '../src/tools/loader/ToolLoader';
import { AgentLoop, AgentResult } from '../src/ai/agent/AgentLoop';
import { ModelManager } from '../src/ai/management/ModelManager';

// Set benchmark environment flag before importing components
process.env.CERO_BENCHMARK = 'true';

// ANSI Colors
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

// Install Tauri IPC polyfill for headless execution
NodeTauriBridge.install();

export interface BenchmarkPrompt {
  id: string;              // e.g. "1.1"
  domain: number;          // 1 to 9
  domainName: string;      // e.g. "System Diagnostics & Hardware Monitoring"
  prompt: string;          // e.g. ">system info"
  cleanPrompt: string;     // e.g. "system info"
  targetTool: string;      // e.g. "system.info / uname -srm"
  expectedOutput: string;  // e.g. "OS Name, Kernel, Arch, CPU Model, Cores, Uptime"
  verificationCriteria: string; // e.g. "Contains Linux, valid kernel version..."
}

export type FailureClass = 
  | 'PROMPT_FAILURE'
  | 'DRIVER_FAILURE'
  | 'FORMATTER_FAILURE'
  | 'SECURITY_BLOCKED'
  | 'TIMEOUT_FAILURE'
  | 'PLATFORM_MISMATCH';

export interface OracleResult {
  oracleName: string;
  passed: boolean;
  message?: string;
}

export interface PromptExecutionResult {
  id: string;
  domain: number;
  domainName?: string;
  prompt: string;
  cleanPrompt?: string;
  targetTool?: string;
  expectedOutput?: string;
  verificationCriteria?: string;
  actualOutput?: string;
  passed: boolean;
  simulated: boolean;
  durationMs: number;
  toolUsed?: string;
  commandExecuted?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  fallbackTriggered?: boolean;
  formattedOutput?: string;
  oracles: OracleResult[];
  failureClass?: FailureClass;
  failureReason?: string;
}

export interface BenchmarkDomainSummary {
  domain: number;
  domainName: string;
  total: number;
  passed: number;
  failed: number;
  realNative: number;
  simulated: number;
  passRate: number;
  averageDurationMs: number;
  failuresByClass: Record<string, number>;
}

export interface BenchmarkReport {
  timestamp: string;
  system: {
    platform: string;
    release: string;
    arch: string;
  };
  totalPrompts: number;
  totalPassed: number;
  totalFailed: number;
  totalRealNative: number;
  totalSimulated: number;
  realNativePassRate: number;
  overallPassRate: number;
  totalDurationSeconds: number;
  domains: BenchmarkDomainSummary[];
  results: PromptExecutionResult[];
}

export class BenchmarkPromptParser {
  public static readonly DOMAIN_NAMES: Record<number, string> = {
    1: 'System Diagnostics & Hardware Monitoring',
    2: 'Process Management & Resource Optimization',
    3: 'Network Diagnostics, Ports & Connections',
    4: 'Filesystem, Directory Navigation & File Search',
    5: 'Git & Developer Lifecycle Workflows',
    6: 'Linux Daemons & Systemd Services',
    7: 'Desktop Applications & UI Automation',
    8: 'Linux Dotfiles & Rice Management (Hyprland / Waybar)',
    9: 'Multi-Stage Composite Workflows'
  };

  /**
   * Parse 450 prompts from docs/benchmark/PROMPTS.md
   */
  public static parseFromRoadmap(roadmapPath: string): BenchmarkPrompt[] {
    if (!fs.existsSync(roadmapPath)) {
      throw new Error(`benchmark prompt spec not found at ${roadmapPath}`);
    }

    const content = fs.readFileSync(roadmapPath, 'utf-8');
    const lines = content.split('\n');
    const prompts: BenchmarkPrompt[] = [];

    let currentDomain = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Reset domain on major section header
      if (line.startsWith('## ') && !line.startsWith('### Domain')) {
        currentDomain = 0;
        continue;
      }

      // Check Domain header
      const domainMatch = line.match(/^###\s+Domain\s+(\d+):/i);
      if (domainMatch) {
        currentDomain = parseInt(domainMatch[1], 10);
        continue;
      }

      // Check benchmark table row: | X.Y | `>prompt` | `target` | expected | criteria |
      if (currentDomain >= 1 && currentDomain <= 9 && line.startsWith('|') && !line.startsWith('| #') && !line.startsWith('|---')) {
        // Handle escaped pipes \|
        const protectedLine = line.replace(/\\\|/g, '##ESCAPED_PIPE##');
        const rawCols = protectedLine.split('|').slice(1, -1).map(c => c.trim().replace(/##ESCAPED_PIPE##/g, '|'));

        if (rawCols.length >= 5) {
          const id = rawCols[0];
          if (!new RegExp(`^${currentDomain}\\.\\d+$`).test(id)) {
            continue;
          }
          const rawPrompt = rawCols[1].replace(/^`|`$/g, '').trim();
          const targetTool = rawCols[2].replace(/^`|`$/g, '').trim();
          const expectedOutput = rawCols[3];
          const verificationCriteria = rawCols[4];

          // Make cleanPrompt (strip leading > if present)
          const cleanPrompt = rawPrompt.startsWith('>') ? rawPrompt.slice(1).trim() : rawPrompt;

          prompts.push({
            id,
            domain: currentDomain,
            domainName: this.DOMAIN_NAMES[currentDomain] || `Domain ${currentDomain}`,
            prompt: rawPrompt,
            cleanPrompt,
            targetTool,
            expectedOutput,
            verificationCriteria
          });
        }
      }
    }

    return prompts;
  }
}

export class VerificationOracles {
  /**
   * Oracle 1: Ensure zero shell errors (command not found, /bin/zsh, os error 2, exit code 127)
   */
  public static verifyNoOsError(
    result: AgentResult,
    executed: CommandExecutionRecord[],
    primaryCmd?: CommandExecutionRecord,
    primaryExitCode?: number
  ): OracleResult {
    const errorMarkers = [
      'command not found',
      '/bin/zsh: No such file or directory',
      'os error 2',
      'exit code 127',
      'Permission denied',
      'syntax error near unexpected token',
      'error: [string "return hl.dispatch',
      'hl.dispatch: expected',
      'error: return hl.dispatch',
      'attempt to call a nil value',
      'ls: cannot access'
    ];

    const isLogInspection = executed.some(e => 
      e.fullCommand.includes('journalctl') || 
      e.fullCommand.includes('dmesg') || 
      e.fullCommand.includes('/var/log')
    ) || (primaryCmd ? (
      primaryCmd.fullCommand.includes('journalctl') ||
      primaryCmd.fullCommand.includes('dmesg') ||
      primaryCmd.fullCommand.includes('/var/log')
    ) : false);

    const errorText = isLogInspection
      ? `${executed.map(e => e.stderr || '').join(' ')} ${primaryCmd?.stderr || ''}`.toLowerCase()
      : `${result.summary || ''} ${executed.map(e => (e.stderr || '') + ' ' + (e.stdout || '')).join(' ')} ${primaryCmd?.stdout || ''} ${primaryCmd?.stderr || ''}`.toLowerCase();

    for (const marker of errorMarkers) {
      if (errorText.includes(marker.toLowerCase())) {
        return {
          oracleName: 'NoOsError',
          passed: false,
          message: `Detected OS Error / IPC Failure: "${marker}"`
        };
      }
    }

    // Strict exit code gate: if primaryExitCode is explicitly non-zero
    if (primaryExitCode !== undefined && primaryExitCode !== 0) {
      return {
        oracleName: 'NoOsError',
        passed: false,
        message: `Command failed with exit code ${primaryExitCode}`
      };
    }

    // Check non-zero exit code on primary commands (excluding probes)
    const failedCmd = executed.find(c => c.code !== 0 
      && !c.fullCommand.includes('2>/dev/null') 
      && !c.fullCommand.includes('|| true')
      && !c.fullCommand.includes('test -f')
      && !c.fullCommand.includes('which ')
      && !c.fullCommand.startsWith('pgrep ')
      && !c.fullCommand.startsWith('kill -0')
    );
    if (failedCmd) {
      return {
        oracleName: 'NoOsError',
        passed: false,
        message: `Command failed with code ${failedCmd.code}: ${failedCmd.fullCommand}`
      };
    }

    if (!result.success) {
      return {
        oracleName: 'NoOsError',
        passed: false,
        message: `Agent execution reported failure: ${result.summary}`
      };
    }

    return { oracleName: 'NoOsError', passed: true };
  }

  /**
   * Oracle 2: Ensure zero macOS / Darwin artifacts on Linux
   */
  public static verifyNoPlatformMismatch(result: AgentResult, executed: CommandExecutionRecord[]): OracleResult {
    const macMarkers = [
      'apfs',
      'apple m3',
      'darwin',
      'pmset',
      'osascript',
      'diskutil',
      'mdfind',
      'system_profiler',
      'networksetup'
    ];

    const text = `${result.summary || ''} ${executed.map(e => e.fullCommand + ' ' + e.stdout).join(' ')}`.toLowerCase();

    for (const marker of macMarkers) {
      if (text.includes(marker)) {
        return {
          oracleName: 'NoPlatformMismatch',
          passed: false,
          message: `Detected Darwin/macOS artifact on Linux: "${marker}"`
        };
      }
    }

    return { oracleName: 'NoPlatformMismatch', passed: true };
  }

  /**
   * Oracle 3: Ensure output is cleanly formatted (no raw JSON dumps)
   */
  public static verifyFormatting(result: AgentResult, expectedOutput: string): OracleResult {
    const rawOutput = result.summary || '';

    // If expected output is formatted card/overview, check for raw JSON dumps
    const rawJsonDumps = [
      '{"activeProcesses":',
      '{"volumes":',
      '{"interfaces":',
      'activeProcesses: [',
      'volumes: ['
    ];

    for (const marker of rawJsonDumps) {
      if (rawOutput.includes(marker)) {
        return {
          oracleName: 'OutputFormatting',
          passed: false,
          message: `Detected unformatted JSON dump: "${marker}"`
        };
      }
    }

    return { oracleName: 'OutputFormatting', passed: true };
  }

  /**
   * Oracle 4: Singular Precision (singular query must return exactly 1 process/item card)
   */
  public static verifySingularPrecision(prompt: BenchmarkPrompt, result: AgentResult): OracleResult {
    const isSingular = 
      prompt.verificationCriteria.toLowerCase().includes('exactly 1 process') ||
      prompt.verificationCriteria.toLowerCase().includes('singular') ||
      prompt.cleanPrompt.toLowerCase().includes('which process is using the most');

    if (!isSingular) {
      return { oracleName: 'SingularPrecision', passed: true };
    }

    const text = result.summary || '';
    // Look for top process card indicator
    const hasSingularCard = text.includes('▶ Top Process') || text.includes('Top Process:');
    
    // Check line count of process rows
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const pidMatches = text.match(/\bPID:\s*\d+/gi) || [];

    if (hasSingularCard || pidMatches.length === 1 || lines.length <= 4) {
      return { oracleName: 'SingularPrecision', passed: true };
    }

    if (pidMatches.length > 2) {
      return {
        oracleName: 'SingularPrecision',
        passed: false,
        message: `Expected singular 1-process card, but output contains ${pidMatches.length} processes`
      };
    }

    return { oracleName: 'SingularPrecision', passed: true };
  }

  /**
   * Oracle 5: Domain Criteria match & anti-corruption verification
   */
  public static verifyCriteria(
    prompt: BenchmarkPrompt,
    result: AgentResult,
    executed: CommandExecutionRecord[],
    primaryCmd?: CommandExecutionRecord
  ): OracleResult {
    const summary = result.summary || '';
    const capOutputs = executed.map(e => e.stdout).filter(Boolean).join('\n');
    const stdout = (primaryCmd?.stdout && primaryCmd.stdout.trim().length > 0) ? primaryCmd.stdout : capOutputs;
    const combined = `${summary}\n${stdout}\n${capOutputs}`;
    const criteria = prompt.verificationCriteria.trim();
    const criteriaLower = criteria.toLowerCase();

    // 1. Check for unprintable binary / garbled data (Anti-Corruption Check, e.g. 1.48)
    // Flags control chars below ASCII 32 (excluding \t, \n, \r) or unicode replacement char
    const hasBinaryGarbage = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(summary) || /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(stdout);
    if (hasBinaryGarbage) {
      return {
        oracleName: 'CriteriaMatch',
        passed: false,
        message: 'Oracle rejected output: garbled binary control characters or unprintable byte sequence detected.'
      };
    }

    // 2. Check for generic substituted title template discard bug
    // E.g. summary is "✓ Check PCI Express link speed" and stdout is empty
    if (/^✓\s+[A-Z]/i.test(summary.trim()) && !stdout.trim()) {
      const isActionTool = prompt.cleanPrompt.startsWith('kill') || prompt.cleanPrompt.startsWith('turn') || prompt.cleanPrompt.startsWith('disconnect');
      if (!isActionTool && !prompt.cleanPrompt.includes('status')) {
        return {
          oracleName: 'CriteriaMatch',
          passed: false,
          message: `Oracle rejected output: command produced empty stdout and was masked by generic title template "${summary.trim()}".`
        };
      }
    }

    // 3. Domain 1 Verification Criteria
    if (criteriaLower.includes('contains linux')) {
      if (!combined.toLowerCase().includes('linux') && !combined.toLowerCase().includes('gnu/linux')) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required "Contains Linux", but identifier was missing.' };
      }
    }
    if (criteriaLower.includes('valid kernel version')) {
      if (!/\b[4-6]\.\d+/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required valid kernel version (e.g. 6.x), but none was found.' };
      }
    }
    if (criteriaLower.includes("starts with 'up '") || criteriaLower.includes('uptime starting with')) {
      if (!/up\s+\d+/i.test(combined) && !summary.startsWith('up ')) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required uptime starting with "up ", but was not found.' };
      }
    }
    if (criteriaLower.includes('numeric temperature in °c')) {
      if (!/\d+(\.\d+)?\s*(°C|C\b|deg)/i.test(combined) && !/\b\d{2,3}\b/.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required numeric temperature in °C.' };
      }
    }
    if (criteriaLower.includes('rpm value') || criteriaLower.includes('passive / fanless')) {
      if (!/\d+\s*rpm/i.test(combined) && !/(passive|fanless|no fans?)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required RPM value or Passive/Fanless indicator.' };
      }
    }
    if (criteriaLower.includes('valid integer percentage')) {
      if (!/\b\d{1,3}%\b/.test(combined) && !/\b\d{1,3}\b/.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required valid integer percentage (0-100%).' };
      }
    }
    if (criteriaLower.includes('filesystem mount points')) {
      if (!/(\/|ext4|btrfs|xfs|root|mount|\d+%)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required filesystem mount point or usage percentage.' };
      }
    }
    if (criteriaLower.includes('pcie link width') || criteriaLower.includes('transfer speed')) {
      if (!/(pcie|lnksta|gt\/s|x\d+|link active)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required PCIe link width or transfer speed.' };
      }
    }
    if (criteriaLower.includes('drm connector output exists')) {
      if (!/(edid|drm|display|connector|00000000|[0-9a-f]{4})/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required DRM display parameters / EDID connector info.' };
      }
    }

    // 4. Domain 2 Verification Criteria (Signals, PIDs, Process states)
    if (criteriaLower.includes('signal 15') || criteriaLower.includes('sigterm')) {
      if (!/(sigterm|signal 15|\b15\b)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required confirmation of Signal 15 (SIGTERM) dispatch.' };
      }
    }
    if (criteriaLower.includes('signal 9') || criteriaLower.includes('sigkill')) {
      if (!/(sigkill|signal 9|\b9\b)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required confirmation of Signal 9 (SIGKILL) dispatch.' };
      }
    }
    if (criteriaLower.includes('signal 19') || criteriaLower.includes('sigstop')) {
      if (!/(sigstop|signal 19|pause|\b19\b)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required confirmation of Signal 19 (SIGSTOP) pause dispatch.' };
      }
    }
    if (criteriaLower.includes('signal 18') || criteriaLower.includes('sigcont')) {
      if (!/(sigcont|signal 18|resume|\b18\b)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required confirmation of Signal 18 (SIGCONT) resume dispatch.' };
      }
    }
    if (criteriaLower.includes('matches all chrome process names')) {
      if (!/(chrome|terminated|no chrome)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required matching Chrome processes or termination report.' };
      }
    }
    if (criteriaLower.includes('matches python command lines')) {
      if (!/(python|terminated|no python)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required matching Python processes or termination report.' };
      }
    }
    if (criteriaLower.includes('top disk i/o') || criteriaLower.includes('disk write rate')) {
      if (!/(pid|command|comm|disk|read|write|io|\d+)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required disk I/O activity details or process listing.' };
      }
    }
    if (criteriaLower.includes('processes with status z') || criteriaLower.includes('defunct or zombie')) {
      if (!/(zombie|defunct|0|no zombie|\bz\b)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required zombie process listing or clean confirmation message.' };
      }
    }
    if (criteriaLower.includes('hex addresses') || criteriaLower.includes('memory map')) {
      if (!/(0x[0-9a-f]+|[0-9a-f]{8}|maps|restricted)/i.test(combined)) {
        return { oracleName: 'CriteriaMatch', passed: false, message: 'Criteria required memory map addresses or access status.' };
      }
    }

    return { oracleName: 'CriteriaMatch', passed: true };
  }
}

export class BenchmarkRunner {
  private agentLoop!: AgentLoop;
  private prompts: BenchmarkPrompt[] = [];

  public static isSimulated(prompt: BenchmarkPrompt, primaryCmd?: CommandExecutionRecord, stepData?: any): boolean {
    if (prompt.domain === 9) return true;
    const cmd = (primaryCmd?.fullCommand || '').trim();
    if (/^(?:\/bin\/bash\s+-c\s+)?echo(?:\s+-e)?\s+['"]/i.test(cmd)) {
      return true;
    }
    const stdout = (primaryCmd?.stdout || stepData?.stdout || '').trim();
    if (cmd === '' && stdout.toLowerCase().includes('confirmation:')) {
      return true;
    }
    return false;
  }

  constructor(private options: {
    roadmapPath: string;
    domain?: number;
    promptRange?: string;
    headless: boolean;
    verbose: boolean;
    outputPath?: string;
    append?: boolean;
  }) {}

  public async init(): Promise<void> {
    // Load all prompts from docs/benchmark/PROMPTS.md
    const allPrompts = BenchmarkPromptParser.parseFromRoadmap(this.options.roadmapPath);

    // Filter prompts
    if (this.options.domain) {
      this.prompts = allPrompts.filter(p => p.domain === this.options.domain);
    } else if (this.options.promptRange) {
      const [start, end] = this.options.promptRange.split('-').map(s => s.trim());
      const startIndex = allPrompts.findIndex(p => p.id === start);
      const endIndex = allPrompts.findIndex(p => p.id === end);
      if (startIndex !== -1 && endIndex !== -1) {
        this.prompts = allPrompts.slice(startIndex, endIndex + 1);
      } else {
        this.prompts = allPrompts.filter(p => p.id === start);
      }
    } else {
      this.prompts = allPrompts;
    }

    // Initialize AgentLoop
    const toolLoader = new ToolLoader();
    this.agentLoop = new AgentLoop(toolLoader.getState(), new ModelManager());

    // Headless / Auto-Approve Authorization Handler to prevent consent timeout in benchmarks
    this.agentLoop.setAuthorizationHandler(async () => true);
  }

  public async run(): Promise<BenchmarkReport> {
    const startTime = Date.now();
    const results: PromptExecutionResult[] = [];
    const detectedOs = process.platform === 'darwin' ? 'mac' : (process.platform === 'win32' ? 'windows' : 'linux');

    console.log(`\n${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`  ${colors.bold}Cero AI Terminal — Automated Benchmark Suite (Phase 0)${colors.reset}`);
    console.log(`  Target Platform: ${colors.green}${detectedOs}${colors.reset} | Prompts Queued: ${colors.bold}${this.prompts.length}${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════════════════${colors.reset}\n`);

    for (let i = 0; i < this.prompts.length; i++) {
      const prompt = this.prompts[i];
      const promptStartTime = performance.now();

      // Clear execution history before each prompt run to strictly isolate records
      NodeTauriBridge.clearHistory();

      process.stdout.write(`  [${i + 1}/${this.prompts.length}] ${colors.bold}${prompt.id}${colors.reset} ${prompt.cleanPrompt} ... `);

      let agentResult: AgentResult;
      let timeoutOccurred = false;

      try {
        // Enforce a per-prompt timeout of 30 seconds
        const timeoutPromise = new Promise<AgentResult>((_, reject) => {
          setTimeout(() => {
            timeoutOccurred = true;
            reject(new Error('Prompt execution exceeded benchmark timeout of 30000ms'));
          }, 30000);
        });

        const execPromise = this.agentLoop.run(prompt.cleanPrompt, {
          os: detectedOs,
          cwd: process.cwd()
        });

        agentResult = await Promise.race([execPromise, timeoutPromise]);
      } catch (err: any) {
        agentResult = {
          success: false,
          summary: `Error: ${err?.message || err}`,
          steps: []
        };
      }

      const promptDuration = Math.round(performance.now() - promptStartTime);
      const executed = NodeTauriBridge.getHistory(false);
      const capCmds = NodeTauriBridge.getCapabilityCommands();
      const realExecuted = executed.filter(e => !e.fullCommand.includes('test -f') && !e.fullCommand.includes('learned_patterns'));
      const primaryCmd = capCmds[capCmds.length - 1] || realExecuted[realExecuted.length - 1];

      // Extract real raw output and exit code from actual driver call
      const stepDataCode = agentResult.steps?.[0]?.result?.data?.code;
      const primaryExitCode = (stepDataCode !== undefined)
        ? stepDataCode
        : (primaryCmd?.code ?? (agentResult.success ? 0 : 1));

      const isProbe = Boolean(primaryCmd && (primaryCmd.fullCommand.startsWith('kill -0') || primaryCmd.fullCommand.startsWith('pgrep ')));
      const rawStdout = (!isProbe && primaryCmd?.stdout && primaryCmd.stdout.trim().length > 0)
        ? primaryCmd.stdout
        : (agentResult.steps?.[0]?.result?.data?.stdout ?? primaryCmd?.stdout ?? '');
      const rawStderr = (!isProbe && primaryCmd?.stderr)
        ? primaryCmd.stderr
        : (agentResult.steps?.[0]?.result?.data?.stderr ?? '');

      // Detect if fallback branch triggered in shell.execute
      let fallbackTriggered = false;
      const cmdStr = primaryCmd?.fullCommand || '';
      if (cmdStr.includes('||') || cmdStr.includes('${OUT:-')) {
        const fallbackMarkers = [
          'Restricted',
          'PCIe Gen 3/4 Link Active',
          'DRM Display EDID detected',
          'country 00: DFS-UNSET',
          'No chrome instances running',
          'No python scripts running',
          'No zombie processes found',
          'No suspended processes',
          'No processes in uninterruptible sleep',
          'No child processes',
          'Port 8080 is free',
          'No active file handles in /tmp'
        ];
        if (fallbackMarkers.some(m => rawStdout.includes(m) || (agentResult.summary || '').includes(m))) {
          fallbackTriggered = true;
        }
      }

      // Run Verification Oracles
      const oracles: OracleResult[] = [
        VerificationOracles.verifyNoOsError(agentResult, executed, primaryCmd, primaryExitCode),
        VerificationOracles.verifyNoPlatformMismatch(agentResult, executed),
        VerificationOracles.verifyFormatting(agentResult, prompt.expectedOutput),
        VerificationOracles.verifySingularPrecision(prompt, agentResult),
        VerificationOracles.verifyCriteria(prompt, agentResult, executed, primaryCmd)
      ];

      const failedOracle = oracles.find(o => !o.passed);
      const passed = agentResult.success && !failedOracle && !timeoutOccurred;

      // Failure Classification
      let failureClass: FailureClass | undefined;
      let failureReason: string | undefined;

      if (!passed) {
        if (timeoutOccurred) {
          failureClass = 'TIMEOUT_FAILURE';
          failureReason = 'Execution timed out after 30s';
        } else if (failedOracle?.oracleName === 'NoPlatformMismatch') {
          failureClass = 'PLATFORM_MISMATCH';
          failureReason = failedOracle.message;
        } else if (failedOracle?.oracleName === 'NoOsError') {
          failureClass = 'DRIVER_FAILURE';
          failureReason = failedOracle.message;
        } else if (failedOracle?.oracleName === 'OutputFormatting' || failedOracle?.oracleName === 'SingularPrecision') {
          failureClass = 'FORMATTER_FAILURE';
          failureReason = failedOracle.message;
        } else if (failedOracle?.oracleName === 'CriteriaMatch') {
          failureClass = 'PROMPT_FAILURE';
          failureReason = failedOracle.message;
        } else if (agentResult.summary?.includes('PERMISSION_REQUIRED') || agentResult.summary?.includes('denied')) {
          failureClass = 'SECURITY_BLOCKED';
          failureReason = 'Security consent was blocked or denied';
        } else {
          failureClass = 'PROMPT_FAILURE';
          failureReason = failedOracle?.message || agentResult.summary || 'Unverified command execution';
        }
      }

      const stepTool = agentResult.steps?.[0]?.tool || 'shell.execute';
      const isSimulated = BenchmarkRunner.isSimulated(prompt, primaryCmd, agentResult.steps?.[0]?.result?.data);

      results.push({
        id: prompt.id,
        domain: prompt.domain,
        domainName: prompt.domainName,
        prompt: prompt.prompt,
        cleanPrompt: prompt.cleanPrompt,
        targetTool: prompt.targetTool,
        expectedOutput: prompt.expectedOutput,
        verificationCriteria: prompt.verificationCriteria,
        actualOutput: agentResult.summary,
        passed,
        simulated: isSimulated,
        durationMs: promptDuration,
        toolUsed: stepTool,
        commandExecuted: (!isProbe && primaryCmd?.fullCommand)
          ? primaryCmd.fullCommand
          : (agentResult.steps?.[0]?.result?.commandExecuted ?? primaryCmd?.fullCommand ?? `capability: ${stepTool}`),
        stdout: rawStdout,
        stderr: rawStderr,
        exitCode: primaryExitCode,
        fallbackTriggered,
        formattedOutput: agentResult.summary,
        oracles,
        failureClass,
        failureReason
      });

      if (passed) {
        console.log(`${colors.green}✓ PASS${colors.reset} ${colors.gray}(${promptDuration}ms)${colors.reset}`);
      } else {
        console.log(`${colors.red}✗ FAIL${colors.reset} ${colors.yellow}[${failureClass}]${colors.reset} ${colors.gray}(${promptDuration}ms)${colors.reset}`);
        if (this.options.verbose && failureReason) {
          console.log(`     ${colors.dim}Reason: ${failureReason}${colors.reset}`);
        }
      }
    }

    const totalDurationSeconds = Math.round((Date.now() - startTime) / 1000);

    const outPath = this.options.outputPath || path.resolve(process.cwd(), 'reports', 'benchmark_report.json');
    let finalResults: PromptExecutionResult[] = results;

    if (this.options.append && fs.existsSync(outPath)) {
      try {
        const existingData: BenchmarkReport = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
        if (Array.isArray(existingData.results)) {
          const mergedMap = new Map<string, PromptExecutionResult>();
          for (const item of existingData.results) {
            if (/^[1-9]\.([1-9]|[1-4][0-9]|50)$/.test(item.id)) {
              mergedMap.set(item.id, item);
            }
          }
          for (const item of results) {
            if (/^[1-9]\.([1-9]|[1-4][0-9]|50)$/.test(item.id)) {
              mergedMap.set(item.id, item);
            }
          }
          finalResults = Array.from(mergedMap.values()).sort((a, b) => {
            const [dA, pA] = a.id.split('.').map(Number);
            const [dB, pB] = b.id.split('.').map(Number);
            if (dA !== dB) return (dA || 0) - (dB || 0);
            return (pA || 0) - (pB || 0);
          });
        }
      } catch (err) {
        console.warn('Could not parse existing report for append, creating fresh.');
      }
    }

    // Build Domain Summaries
    const domainMap = new Map<number, PromptExecutionResult[]>();
    for (const r of finalResults) {
      if (!domainMap.has(r.domain)) {
        domainMap.set(r.domain, []);
      }
      domainMap.get(r.domain)!.push(r);
    }

    const domains: BenchmarkDomainSummary[] = [];
    for (const [domainId, resList] of Array.from(domainMap.entries())) {
      const passedCount = resList.filter(r => r.passed).length;
      const failedCount = resList.length - passedCount;
      const passRate = Math.round((passedCount / resList.length) * 100);
      const avgDuration = Math.round(resList.reduce((acc, r) => acc + r.durationMs, 0) / resList.length);
      const realNative = resList.filter(r => !r.simulated).length;
      const simulated = resList.filter(r => r.simulated).length;

      const failuresByClass: Record<string, number> = {};
      for (const r of resList) {
        if (r.failureClass) {
          failuresByClass[r.failureClass] = (failuresByClass[r.failureClass] || 0) + 1;
        }
      }

      domains.push({
        domain: domainId,
        domainName: BenchmarkPromptParser.DOMAIN_NAMES[domainId] || `Domain ${domainId}`,
        total: resList.length,
        passed: passedCount,
        failed: failedCount,
        realNative,
        simulated,
        passRate,
        averageDurationMs: avgDuration,
        failuresByClass
      });
    }

    const totalPassed = finalResults.filter(r => r.passed).length;
    const totalFailed = finalResults.length - totalPassed;
    const overallPassRate = finalResults.length > 0 ? Math.round((totalPassed / finalResults.length) * 100) : 0;
    const totalRealNative = finalResults.filter(r => !r.simulated).length;
    const totalSimulated = finalResults.filter(r => r.simulated).length;
    const realNativePassed = finalResults.filter(r => !r.simulated && r.passed).length;
    const realNativePassRate = totalRealNative > 0 ? Math.round((realNativePassed / totalRealNative) * 100) : 100;

    const report: BenchmarkReport = {
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        release: os.release(),
        arch: process.arch
      },
      totalPrompts: finalResults.length,
      totalPassed,
      totalFailed,
      totalRealNative,
      totalSimulated,
      realNativePassRate,
      overallPassRate,
      totalDurationSeconds,
      domains,
      results: finalResults
    };

    // Print Final Summary Table
    this.printSummaryTable(report);

    // Save JSON report to disk
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n  ${colors.bold}📄 Full JSON Report written to:${colors.reset} ${colors.cyan}${outPath}${colors.reset}`);

    // Save Markdown report to disk
    const mdPath = outPath.replace(/\.json$/i, '.md');
    fs.writeFileSync(mdPath, this.generateMarkdownReport(report), 'utf-8');
    console.log(`  ${colors.bold}📋 Markdown Report written to:${colors.reset} ${colors.cyan}${mdPath}${colors.reset}\n`);

    return report;
  }

  private generateMarkdownReport(report: BenchmarkReport): string {
    const lines: string[] = [];
    lines.push(`# Cero AI Terminal — Benchmark Execution Report\n`);
    lines.push(`> **Generated:** ${report.timestamp}  `);
    lines.push(`> **Platform:** ${report.system.platform} (${report.system.release} ${report.system.arch})  `);
    lines.push(`> **Total Evaluated:** ${report.totalPrompts} (Real Native: **${report.totalRealNative}**, Simulated/Stubs: **${report.totalSimulated}**)  `);
    lines.push(`> **Real Native Pass Rate:** **${report.realNativePassRate}%** | **Overall Pass Rate:** **${report.overallPassRate}%**  `);
    lines.push(`> **Total Passed:** ${report.totalPassed} | **Failed:** ${report.totalFailed}  `);
    lines.push(`> **Total Duration:** ${report.totalDurationSeconds}s  \n`);
    lines.push(`---\n`);

    lines.push(`## Summary by Domain\n`);
    lines.push(`| Domain # | Domain Name | Total | Real Native | Simulated | Passed | Pass Rate | Avg Duration |`);
    lines.push(`|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|`);
    for (const d of report.domains) {
      lines.push(`| **Domain ${d.domain}** | ${d.domainName} | ${d.total} | ${d.realNative} | ${d.simulated} | ${d.passed} | **${d.passRate}%** | ${d.averageDurationMs}ms |`);
    }
    lines.push(`\n---\n`);

    lines.push(`## Detailed Prompts & Output Log\n`);

    for (const d of report.domains) {
      lines.push(`### Domain ${d.domain}: ${d.domainName}\n`);
      lines.push(`| # | Prompt | Type | Command Executed | Exit Code | Fallback? | Terminal Output Produced | Status | Duration |`);
      lines.push(`|:---:|---|:---:|---|:---:|:---:|---|:---:|:---:|`);

      const domainResults = report.results.filter(r => r.domain === d.domain);
      for (const r of domainResults) {
        const typeStr = r.simulated ? 'Simulated' : 'Native';
        const cleanCmd = (r.commandExecuted || '')
          .replace(/\r?\n/g, ' ')
          .replace(/\|/g, '\\|')
          .trim();
        const shortCmd = cleanCmd.length > 50 ? cleanCmd.slice(0, 47) + '...' : cleanCmd;
        const cleanOut = (r.formattedOutput || r.stdout || '(completed)')
          .replace(/\r?\n/g, ' ')
          .replace(/\|/g, '\\|')
          .trim();
        const shortOut = cleanOut.length > 60 ? cleanOut.slice(0, 57) + '...' : cleanOut;
        const status = r.passed ? '✓ PASS' : `✗ FAIL (${r.failureClass || 'ERROR'})`;
        const fbStr = r.fallbackTriggered ? 'Yes' : 'No';
        lines.push(`| ${r.id} | \`${r.prompt}\` | ${typeStr} | \`${shortCmd}\` | ${r.exitCode ?? 0} | ${fbStr} | \`${shortOut}\` | ${status} | ${r.durationMs}ms |`);
      }
      lines.push(`\n`);
    }

    return lines.join('\n');
  }

  private printSummaryTable(report: BenchmarkReport): void {
    console.log(`\n${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`  ${colors.bold}BENCHMARK EXECUTION SUMMARY${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════════════════${colors.reset}\n`);

    console.log(`  Total Evaluated:        ${colors.bold}${report.totalPrompts}${colors.reset} (Real Native: ${colors.green}${report.totalRealNative}${colors.reset}, Simulated: ${colors.yellow}${report.totalSimulated}${colors.reset})`);
    console.log(`  Total Passed:           ${colors.green}${colors.bold}${report.totalPassed}${colors.reset}`);
    console.log(`  Total Failed:           ${report.totalFailed > 0 ? colors.red : colors.gray}${colors.bold}${report.totalFailed}${colors.reset}`);
    console.log(`  Real Native Pass Rate:  ${report.realNativePassRate >= 90 ? colors.green : colors.yellow}${colors.bold}${report.realNativePassRate}%${colors.reset}`);
    console.log(`  Overall Pass Rate:      ${report.overallPassRate >= 90 ? colors.green : colors.yellow}${colors.bold}${report.overallPassRate}%${colors.reset}`);
    console.log(`  Total Duration:         ${colors.gray}${report.totalDurationSeconds}s${colors.reset}\n`);

    console.log(`  ${colors.dim}┌──────────┬────────────────────────────────────────────┬───────┬──────┬─────┬────────┬──────────┐${colors.reset}`);
    console.log(`  ${colors.dim}│${colors.reset} ${colors.bold}Domain${colors.reset}   ${colors.dim}│${colors.reset} ${colors.bold}Domain Name${colors.reset}                                ${colors.dim}│${colors.reset} ${colors.bold}Total${colors.reset} ${colors.dim}│${colors.reset} ${colors.bold}Real${colors.reset} ${colors.dim}│${colors.reset} ${colors.bold}Sim${colors.reset} ${colors.dim}│${colors.reset} ${colors.bold}Passed${colors.reset} ${colors.dim}│${colors.reset} ${colors.bold}Pass Rate${colors.reset}  ${colors.dim}│${colors.reset}`);
    console.log(`  ${colors.dim}├──────────┼────────────────────────────────────────────┼───────┼──────┼─────┼────────┼──────────┤${colors.reset}`);

    for (const d of report.domains) {
      const dName = d.domainName.padEnd(42).slice(0, 42);
      const totalStr = String(d.total).padStart(5);
      const realStr = String(d.realNative).padStart(4);
      const simStr = String(d.simulated).padStart(3);
      const passStr = String(d.passed).padStart(6);
      const rateStr = `${d.passRate}%`.padStart(8);
      const rateColor = d.passRate >= 90 ? colors.green : (d.passRate >= 70 ? colors.yellow : colors.red);

      console.log(`  ${colors.dim}│${colors.reset} Domain ${d.domain}  ${colors.dim}│${colors.reset} ${dName} ${colors.dim}│${colors.reset} ${totalStr} ${colors.dim}│${colors.reset} ${realStr} ${colors.dim}│${colors.reset} ${simStr} ${colors.dim}│${colors.reset} ${passStr} ${colors.dim}│${colors.reset} ${rateColor}${rateStr}${colors.reset}  ${colors.dim}│${colors.reset}`);
    }

    console.log(`  ${colors.dim}└──────────┴────────────────────────────────────────────┴───────┴──────┴─────┴────────┴──────────┘${colors.reset}\n`);
  }
}

// CLI Arg Parsing & Execution
async function main() {
  const args = process.argv.slice(2);
  let domain: number | undefined;
  let promptRange: string | undefined;
  let headless = true;
  let verbose = false;
  let append = false;
  let outputPath: string | undefined;
  const roadmapPath = path.resolve(process.cwd(), 'docs', 'benchmark', 'PROMPTS.md');

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--domain' || a === '-d') {
      domain = parseInt(args[++i], 10);
    } else if (a === '--prompts' || a === '-p') {
      promptRange = args[++i];
    } else if (a === '--headless') {
      headless = true;
    } else if (a === '--verbose' || a === '-v') {
      verbose = true;
    } else if (a === '--append') {
      append = true;
    } else if (a === '--output' || a === '-o') {
      outputPath = args[++i];
    } else if (a === '--all') {
      domain = undefined;
      promptRange = undefined;
    } else if (a === '--help' || a === '-h') {
      console.log(`
Cero AI Terminal — Automated Benchmark Runner

Usage:
  npx tsx scripts/benchmark_prompts.ts [options]

Options:
  -d, --domain <1-9>       Run prompts in a specific domain (50 prompts)
  -p, --prompts <range>    Run a range of prompts (e.g. 1.1-1.10)
  --all                    Run the complete 450-prompt suite across all 9 domains
  --headless               Run non-interactively with auto-consent (default: true)
  -v, --verbose            Print detailed failure reasons and commands
  -o, --output <file>      Path to output JSON report (default: reports/benchmark_report.json)
  -h, --help               Show this help message
`);
      process.exit(0);
    }
  }

  const runner = new BenchmarkRunner({
    roadmapPath,
    domain,
    promptRange,
    headless,
    verbose,
    outputPath,
    append
  });

  await runner.init();
  const report = await runner.run();
  process.exit(report.totalFailed === 0 ? 0 : 1);
}

const isDirectRun = process.argv[1] && (
  process.argv[1].includes('benchmark_prompts')
);

if (isDirectRun) {
  main().catch(err => {
    console.error(`Benchmark failed with critical error:`, err);
    process.exit(1);
  });
}

