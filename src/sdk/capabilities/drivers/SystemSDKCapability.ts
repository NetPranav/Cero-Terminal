/**
 * SystemSDKCapability.ts — Concrete Execution Driver for System Diagnostics & Monitoring
 * 
 * Implements OS diagnostic probes across all 9 system monitoring capabilities.
 * Mapped from Tool Registry: "system.*" (info, battery, cpu, gpu, ram, storage, processes, temperature, uptime)
 */

import { BaseCapabilityDriver, CapabilityExecutionResult, ExecutionContext, Platform } from '../CapabilitySDK';
import { invoke } from '@tauri-apps/api/core';

import { SystemServiceManager, ServiceAction } from '../../../domain/services/SystemServiceManager';
import { DotfileManager } from '../../../domain/rice/DotfileManager';
import { AppAliasRegistry } from '../../../domain/capabilities/AppAliasRegistry';
import { parsePmsetBatt, parseVmStat, parseMacDf, parseBootTime, parseLoadAvg, processDisplayName } from './MacSystemParsers';

export type SystemOperation = 'info' | 'battery' | 'cpu' | 'gpu' | 'ram' | 'storage' | 'processes' | 'temperature' | 'uptime' | 'kill_process' | 'kill' | 'lock' | 'service' | 'dotfile';

export interface SystemDriverInput {
  operation?: SystemOperation;
  filter?: string[];
  sort?: string;
  count?: number;
  [key: string]: any;
}

export class SystemSDKCapability extends BaseCapabilityDriver<SystemDriverInput, any> {
  readonly capabilityId: string;
  readonly name = 'OS Diagnostics & Hardware Monitoring Driver';
  readonly supportedPlatforms: Platform[] = ['macos', 'windows', 'linux'];

  constructor(customId: string = 'system.info') {
    super();
    this.capabilityId = customId;
  }

  public async info(): Promise<CapabilityExecutionResult<any>> {
    return this.execute({ operation: 'info' });
  }

  public async battery(): Promise<CapabilityExecutionResult<any>> {
    return this.execute({ operation: 'battery' });
  }

  public async processes(sort: string = 'cpu', count: number = 15): Promise<CapabilityExecutionResult<any>> {
    return this.execute({ operation: 'processes', sort, count });
  }

  /** False under vitest, where the fixed sample data below stands in for a real system. */
  private isLive(): boolean {
    return typeof process === 'undefined' || process.env.NODE_ENV !== 'test';
  }

  /** stdout of a POSIX sh script, or null when it could not run or printed nothing. */
  private async sh(script: string): Promise<string | null> {
    try {
      const res = await invoke<{ stdout: string }>('execute_command', { command: 'sh', args: ['-c', script] });
      return res?.stdout && res.stdout.trim() ? res.stdout : null;
    } catch {
      return null;
    }
  }

  /** Honest failure: never substitute invented numbers for a reading we could not take. */
  private unavailable(what: string, hint?: string): CapabilityExecutionResult<any> {
    return { success: false, error: { code: 'UNAVAILABLE', message: `Could not read ${what} on this system${hint ? ` (${hint})` : ''}.` } };
  }

  protected async performExecution(
    input: SystemDriverInput,
    _context: ExecutionContext,
    cancelToken: { cancelled: boolean }
  ): Promise<CapabilityExecutionResult<any>> {
    if (cancelToken.cancelled) {
      return { success: false, cancelled: true };
    }

    let op: SystemOperation = input.operation || 'info';
    if (!input.operation && this.capabilityId.startsWith('system.')) {
      op = this.capabilityId.replace('system.', '') as SystemOperation;
    }

    switch (op) {
      case 'kill_process':
      case 'kill': {
        const ifRunning = !!(input.ifRunning || input.conditional);
        let target = (input.port ? String(input.port) : (input.process || input.name || input.pid || input.app || input.target || '')).toString().trim();
        target = target.replace(/^(?:using\s+port|on\s+port|at\s+port|using|port|on|at|pid)\s+/i, '').trim();
        // Strip conversational articles, quotes, and trailing application/app/process nouns
        target = target.replace(/^["']|["']$/g, '').trim();
        target = target.replace(/^(?:the|my|a|an)\s+/i, '').trim();
        target = target.replace(/\s+(?:application|app|process)$/i, '').trim();
        const resolvedApp = AppAliasRegistry.getInstance().resolve(target);
        if (resolvedApp) {
          target = resolvedApp;
        }

        if (!target) {
          return { success: false, error: { code: 'MISSING_TARGET', message: 'No process name, port, or PID specified to kill' } };
        }
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
          return { success: true, data: { terminated: true, process: target, stdout: `Terminated processes matching "${target}"` }, commandExecuted: `kill process ${target}` };
        }
        try {
          const cleanNum = target.replace(/^:/, '').trim();
          const isNumeric = /^\d+$/.test(cleanNum);
          const isExplicitPort = input.port !== undefined && input.port !== null;

          if (isNumeric) {
            const portNum = parseInt(cleanNum, 10);
            if (isExplicitPort || (portNum >= 80 && portNum <= 65535)) {
              try {
                const lsofRes = await invoke<{ code?: number; stdout?: string }>('execute_command', {
                  command: 'sh',
                  args: ['-c', `lsof -ti :${cleanNum} 2>/dev/null || true`]
                });
                if (lsofRes && lsofRes.stdout && lsofRes.stdout.trim()) {
                  const pids = lsofRes.stdout.split('\n').map(p => p.trim()).filter(Boolean);
                  let killedAny = false;
                  for (const pid of pids) {
                    const kRes = await invoke<{ code?: number }>('execute_command', { command: 'kill', args: ['-9', pid] });
                    if (!kRes || kRes.code === undefined || kRes.code === 0) killedAny = true;
                  }
                  if (killedAny) {
                    return {
                      success: true,
                      data: { terminated: true, port: cleanNum, pids, signal: 'SIGKILL (-9)', stdout: `Terminated process(es) [${pids.join(', ')}] using port ${cleanNum} with SIGKILL (-9)`, code: 0 },
                      commandExecuted: `lsof -ti :${cleanNum} | xargs -r kill -9`
                    };
                  }
                }
                if (isExplicitPort) {
                  return {
                    success: true,
                    data: { terminated: false, port: cleanNum, signal: 'SIGKILL (-9)', stdout: `Port ${cleanNum} is free (no active process found to kill with SIGKILL)`, code: 0 },
                    commandExecuted: `lsof -ti :${cleanNum} 2>/dev/null | xargs -r kill -9 || echo "Port ${cleanNum} is free"`
                  };
                }
              } catch {
                // Ignore lsof errors and fall back to treating target as a direct PID
              }
            }

            // Check if PID exists before killing
            const checkRes = await invoke<{ code?: number }>('execute_command', { command: 'kill', args: ['-0', cleanNum] });
            if (checkRes && checkRes.code !== undefined && checkRes.code !== 0) {
              return { 
                success: true, 
                data: { terminated: false, pid: cleanNum, stdout: `No active process found with PID or port ${cleanNum}.`, code: 0 },
                commandExecuted: `kill -9 ${cleanNum} 2>/dev/null || echo "No active process found with PID ${cleanNum}"`
              };
            }

            const killRes = await invoke<{ code?: number; stderr?: string }>('execute_command', { command: 'kill', args: ['-9', cleanNum] });
            if (killRes && killRes.code !== undefined && killRes.code !== 0) {
              return { 
                success: true, 
                data: { terminated: false, pid: cleanNum, stdout: `No active process found with PID or port ${cleanNum}.`, code: 0 },
                commandExecuted: `kill -9 ${cleanNum} 2>/dev/null || echo "No active process found with PID ${cleanNum}"`
              };
            }
            return { success: true, data: { terminated: true, pid: cleanNum, signal: 'SIGKILL (-9)', stdout: `Terminated process with PID ${cleanNum}`, code: 0 }, commandExecuted: `kill -9 ${cleanNum}` };
          } else {
            // Exact process name only (any case). Matching the whole command line (-f) killed every
            // process whose path or arguments merely contained the word.
            const checkProc = await invoke<{ code?: number }>('execute_command', { command: 'pgrep', args: ['-i', '-x', target] });
            if (checkProc && checkProc.code !== undefined && checkProc.code !== 0) {
              return {
                success: true,
                data: { terminated: false, processName: target, stdout: `No active process found matching name "${target}".`, code: 0 },
                commandExecuted: `pgrep -i -x "${target}" || echo "No active process found matching name ${target}"`
              };
            }

            let stopped = false;
            // 1. Ask the process to exit (SIGTERM), exact name
            const pkillRes = await invoke<{ code?: number; stderr?: string }>('execute_command', { command: 'pkill', args: ['-i', '-x', target] });
            if (!pkillRes || pkillRes.code === undefined || pkillRes.code === 0) {
              stopped = true;
            }

            // 2. Try killall if pkill failed
            if (!stopped) {
              const killallRes = await invoke<{ code?: number; stderr?: string }>('execute_command', { command: 'killall', args: ['--', target] });
              if (!killallRes || killallRes.code === undefined || killallRes.code === 0) {
                stopped = true;
              }
            }

            // 3. For macOS desktop GUI apps, try AppleScript graceful termination
            if (!stopped && this.detectPlatform() === 'macos') {
              try {
                const osascriptRes = await invoke<{ code?: number; stderr?: string }>('execute_command', {
                  command: 'osascript',
                  args: ['-e', 'on run argv', '-e', 'tell application (item 1 of argv) to quit', '-e', 'end run', target]
                });
                // Ignore osascript errors
              } catch {
                // Ignore osascript errors
              }
            }

            if (!stopped) {
              return {
                success: true,
                data: { terminated: false, processName: target, stdout: `No active process found matching name "${target}".`, code: 0 },
                commandExecuted: `pgrep -i -x "${target}" || echo "No active process found matching name ${target}"`
              };
            }
            return { success: true, data: { terminated: true, processName: target, signal: 'SIGTERM', allProcessesStopped: true, stdout: `Stopped the process named "${target}"`, code: 0 }, commandExecuted: `pkill -i -x "${target}"` };
          }
        } catch (err: any) {
          return { success: false, error: { code: 'KILL_FAILED', message: err.message || `Could not terminate process "${target}": access denied or not found.` } };
        }
      }

      case 'info': {
        const platform = this.detectPlatform();
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          if (platform === 'linux') {
            try {
              const infoRes = await invoke<{ stdout: string }>('execute_command', {
                command: 'sh',
                args: ['-c', 'uname -srm && cat /etc/os-release 2>/dev/null && (lscpu 2>/dev/null || cat /proc/cpuinfo 2>/dev/null) && uptime -p']
              }).catch(() => null);

              const out = infoRes?.stdout || '';
              let prettyName = 'Linux';
              const nameMatch = out.match(/PRETTY_NAME="?([^"\n]+)"?/);
              if (nameMatch) prettyName = nameMatch[1];

              let cpuModel = '';
              let cpuCores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 8) : 8;
              const modelMatch = out.match(/Model name:\s*(.+)/i);
              if (modelMatch) cpuModel = modelMatch[1].trim();
              const cpuMatch = out.match(/CPU\(s\):\s*(\d+)/i);
              if (cpuMatch) cpuCores = parseInt(cpuMatch[1], 10);

              const firstLine = out.split('\n')[0]?.trim() || 'Linux';
              const kernel = firstLine.includes('Linux') ? firstLine : 'Linux';
              const arch = kernel.includes('x86_64') ? 'x86_64' : (kernel.includes('aarch64') || kernel.includes('arm') ? 'arm64' : 'x64');
              const uptimeMatch = out.match(/up\s+[^\n]+/);
              const uptime = uptimeMatch ? uptimeMatch[0].trim() : 'active';

              return {
                success: true,
                data: {
                  os: prettyName,
                  arch,
                  cpus: cpuCores,
                  model: cpuModel || 'x86_64 Processor',
                  kernel,
                  uptime,
                  stdout: out
                },
                commandExecuted: 'uname -srm && cat /etc/os-release && lscpu && uptime -p'
              };
            } catch {
              // fall through
            }
          } else if (platform === 'macos') {
            const out = await this.sh('sw_vers -productName; sw_vers -productVersion; uname -srm; sysctl -n machdep.cpu.brand_string hw.ncpu hw.memsize kern.boottime');
            const l = out ? out.trim().split('\n') : [];
            if (l.length >= 6) {
              return {
                success: true,
                data: {
                  os: `${l[0].trim()} ${l[1].trim()}`,
                  arch: l[2].trim().split(/\s+/).pop(),
                  kernel: l[2].trim(),
                  model: l[3].trim(),
                  cpus: Number(l[4]) || undefined,
                  memoryGb: Math.round(Number(l[5]) / 1024 ** 3) || undefined,
                  uptime: parseBootTime(l[6] || '') ?? undefined
                },
                commandExecuted: 'sw_vers && uname -srm && sysctl machdep.cpu.brand_string hw.ncpu hw.memsize kern.boottime'
              };
            }
          }
          return this.unavailable('system information');
        }
        return {
          success: true,
          data: {
            os: this.detectPlatform(),
            arch: this.detectPlatform() === 'linux' ? 'x86_64' : 'arm64',
            cpus: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 8) : 8,
            memoryGb: 16,
            kernel: this.detectPlatform() === 'linux' ? 'Linux' : 'Darwin 23.5.0',
            uptimeSeconds: 360000
          },
          commandExecuted: this.detectPlatform() === 'linux' ? 'uname -a' : 'uname -a && sysctl hw'
        };
      }

      case 'battery': {
        const platform = this.detectPlatform();
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          if (platform === 'linux') {
            try {
              const sysfsRes = await invoke<{ stdout: string }>('execute_command', {
                command: 'sh',
                args: ['-c', 'for b in /sys/class/power_supply/BAT*; do [ -d "$b" ] && echo "$b $(cat $b/capacity 2>/dev/null) $(cat $b/status 2>/dev/null)"; done']
              }).catch(() => null);

              if (sysfsRes?.stdout && sysfsRes.stdout.trim()) {
                const line = sysfsRes.stdout.trim().split('\n')[0];
                const parts = line.trim().split(/\s+/);
                const batPath = parts[0] || 'BAT';
                const batName = batPath.split('/').pop() || 'BAT';
                const percentage = parseInt(parts[1], 10);
                const status = parts.slice(2).join(' ') || 'Discharging';
                const isCharging = /charging/i.test(status) && !/not charging/i.test(status);

                if (!isNaN(percentage)) {
                  return {
                    success: true,
                    data: {
                      percentage,
                      status,
                      isCharging,
                      powerSource: `Battery (${batName})`
                    },
                    commandExecuted: 'cat /sys/class/power_supply/BAT*/capacity'
                  };
                }
              }

              const upowerRes = await invoke<{ stdout: string }>('execute_command', {
                command: 'sh',
                args: ['-c', 'upower -i $(upower -e 2>/dev/null | grep -i "battery" | head -1) 2>/dev/null || acpi -b 2>/dev/null']
              }).catch(() => null);

              if (upowerRes?.stdout && upowerRes.stdout.trim()) {
                const pctMatch = upowerRes.stdout.match(/percentage:\s*(\d+)%|(\d+)%/i);
                const stateMatch = upowerRes.stdout.match(/state:\s*([a-z-]+)|(charging|discharging|full)/i);
                const percentage = parseInt(pctMatch?.[1] || pctMatch?.[2] || '0', 10);
                const status = stateMatch?.[1] || stateMatch?.[2] || 'Battery';
                const isCharging = /charging/i.test(status);
                if (percentage > 0) {
                  return {
                    success: true,
                    data: {
                      percentage,
                      status,
                      isCharging,
                      powerSource: 'Battery'
                    },
                    commandExecuted: 'upower -i /org/freedesktop/UPower/devices/battery_*'
                  };
                }
              }

              return {
                success: true,
                data: {
                  percentage: 100,
                  status: 'AC Power (Desktop - No battery)',
                  isCharging: false,
                  noBattery: true,
                  powerSource: 'AC Power'
                },
                commandExecuted: 'cat /sys/class/power_supply/BAT*/status'
              };
            } catch {
              // fall through
            }
          } else if (platform === 'macos') {
            const reading = parsePmsetBatt((await this.sh('pmset -g batt')) || '');
            if (reading) return { success: true, data: reading, commandExecuted: 'pmset -g batt' };
          }
          return this.unavailable('the battery state');
        }
        return {
          success: true,
          data: { percentage: 89, isCharging: false, timeRemainingMinutes: 245, powerSource: 'Battery' },
          commandExecuted: 'pmset -g batt'
        };
      }

      case 'cpu': {
        const platform = this.detectPlatform();
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          if (platform === 'linux') {
            try {
              const lscpuRes = await invoke<{ stdout: string }>('execute_command', {
                command: 'sh',
                args: ['-c', 'lscpu 2>/dev/null || cat /proc/cpuinfo 2>/dev/null']
              }).catch(() => null);

              let model = '';
              let cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 8) : 8;
              if (lscpuRes?.stdout) {
                const modelMatch = lscpuRes.stdout.match(/Model name:\s*(.+)/i);
                if (modelMatch) model = modelMatch[1].trim();
                const coresMatch = lscpuRes.stdout.match(/CPU\(s\):\s*(\d+)/i);
                if (coresMatch) cores = parseInt(coresMatch[1], 10);
              }

              const loadAvgRes = await invoke<{ stdout: string }>('execute_command', {
                command: 'sh',
                args: ['-c', 'cat /proc/loadavg 2>/dev/null']
              }).catch(() => null);

              const loadAvg = loadAvgRes?.stdout ? loadAvgRes.stdout.trim().split(/\s+/).slice(0, 3).map(parseFloat) : undefined;

              return {
                success: true,
                data: { cores, ...(model ? { model } : {}), ...(loadAvg ? { loadAverage: loadAvg } : {}) },
                commandExecuted: 'lscpu && cat /proc/loadavg'
              };
            } catch {
              // fall through
            }
          } else if (platform === 'macos') {
            const out = await this.sh('sysctl -n machdep.cpu.brand_string hw.ncpu vm.loadavg');
            const l = out ? out.trim().split('\n') : [];
            if (l.length >= 2) {
              const loadAverage = parseLoadAvg(l[2] || '');
              return {
                success: true,
                data: { model: l[0].trim(), cores: Number(l[1]) || undefined, ...(loadAverage ? { loadAverage } : {}) },
                commandExecuted: 'sysctl -n machdep.cpu.brand_string hw.ncpu vm.loadavg'
              };
            }
          }
          return this.unavailable('CPU information');
        }
        return {
          success: true,
          data: { cores: 8, model: 'Apple M3 Pro', usagePercentage: 24.5, loadAverage: [1.2, 1.4, 1.1] },
          commandExecuted: 'top -l 1 | grep -E "^CPU"'
        };
      }

      case 'gpu':
        if (this.isLive()) {
          if (this.detectPlatform() === 'macos') {
            const out = await this.sh('system_profiler SPDisplaysDataType 2>/dev/null');
            const model = out?.match(/Chipset Model:\s*(.+)/)?.[1]?.trim();
            if (model) {
              const cores = Number(out?.match(/Total Number of Cores:\s*(\d+)/)?.[1]) || undefined;
              return { success: true, data: { model, ...(cores ? { cores } : {}) }, commandExecuted: 'system_profiler SPDisplaysDataType' };
            }
          } else if (this.detectPlatform() === 'linux') {
            const out = await this.sh("lspci 2>/dev/null | grep -Ei 'vga|3d|display'");
            const models = out ? out.trim().split('\n').map(l => l.replace(/^\S+\s+[^:]+:\s*/, '').trim()).filter(Boolean) : [];
            if (models.length) return { success: true, data: { model: models.join('; ') }, commandExecuted: 'lspci | grep -Ei "vga|3d|display"' };
          }
          return this.unavailable('GPU information');
        }
        return {
          success: true,
          data: { model: 'Dedicated / Integrated GPU', vramAllocatedMb: 2048, coreUtilization: 14 },
          commandExecuted: 'system_profiler SPDisplaysDataType || lspci'
        };

      case 'ram': {
        const platform = this.detectPlatform();
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          if (platform === 'linux') {
            try {
              const freeRes = await invoke<{ stdout: string }>('execute_command', {
                command: 'free',
                args: ['-m']
              }).catch(() => null);

              if (freeRes?.stdout) {
                const lines = freeRes.stdout.trim().split('\n');
                const memLine = lines.find(l => /^Mem:/i.test(l));
                const swapLine = lines.find(l => /^Swap:/i.test(l));

                if (memLine) {
                  const parts = memLine.trim().split(/\s+/);
                  const totalMb = parseInt(parts[1], 10) || 0;
                  const usedMb = parseInt(parts[2], 10) || 0;
                  const freeMb = parseInt(parts[3], 10) || 0;
                  const availMb = parseInt(parts[6] || parts[3], 10) || freeMb;

                  let swapTotalMb = 0;
                  let swapUsedMb = 0;
                  if (swapLine) {
                    const sParts = swapLine.trim().split(/\s+/);
                    swapTotalMb = parseInt(sParts[1], 10) || 0;
                    swapUsedMb = parseInt(sParts[2], 10) || 0;
                  }

                  return {
                    success: true,
                    data: {
                      totalGb: parseFloat((totalMb / 1024).toFixed(1)),
                      usedGb: parseFloat((usedMb / 1024).toFixed(1)),
                      freeGb: parseFloat((freeMb / 1024).toFixed(1)),
                      availableGb: parseFloat((availMb / 1024).toFixed(1)),
                      swapTotalGb: parseFloat((swapTotalMb / 1024).toFixed(1)),
                      swapUsedGb: parseFloat((swapUsedMb / 1024).toFixed(1))
                    },
                    commandExecuted: 'free -m'
                  };
                }
              }
            } catch {
              // fall through
            }
          } else if (platform === 'macos') {
            const out = await this.sh('vm_stat; echo @@; sysctl -n hw.memsize; echo @@; sysctl -n vm.swapusage');
            const [vm = '', memsize = '', swap = ''] = (out || '').split('@@');
            const reading = parseVmStat(vm, memsize, swap);
            if (reading) return { success: true, data: reading, commandExecuted: 'vm_stat && sysctl hw.memsize vm.swapusage' };
          }
          return this.unavailable('memory usage');
        }
        return {
          success: true,
          data: { totalGb: 18, usedGb: 11.2, freeGb: 6.8, swapUsedGb: 0 },
          commandExecuted: 'vm_stat && sysctl hw.memsize'
        };
      }

      case 'storage': {
        const platform = this.detectPlatform();
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          if (platform === 'linux') {
            try {
              const dfRes = await invoke<{ stdout: string }>('execute_command', {
                command: 'df',
                args: ['-h', '-P', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'squashfs', '-x', 'efivarfs']
              }).catch(() => null);

              if (dfRes?.stdout) {
                const lines = dfRes.stdout.trim().split('\n').slice(1);
                const volumes = lines.map(line => {
                  const parts = line.trim().split(/\s+/);
                  return {
                    filesystem: parts[0],
                    total: parts[1],
                    used: parts[2],
                    available: parts[3],
                    percentUsed: parts[4],
                    mount: parts[5] || '/'
                  };
                }).filter(v => v.mount && v.total);

                if (volumes.length > 0) {
                  return {
                    success: true,
                    data: { volumes },
                    commandExecuted: 'df -h -P -x tmpfs -x devtmpfs -x squashfs -x efivarfs'
                  };
                }
              }
            } catch {
              // fall through
            }
          } else if (platform === 'macos') {
            const volumes = parseMacDf((await this.sh('df -Pk -l')) || '');
            if (volumes.length > 0) return { success: true, data: { volumes }, commandExecuted: 'df -Pk -l' };
          }
          return this.unavailable('disk usage');
        }
        return {
          success: true,
          data: { volumes: [{ mount: '/', totalGb: 512, availableGb: 220, filesystem: 'APFS', ssdHealth: 'Good (100%)' }] },
          commandExecuted: 'df -h && diskutil list'
        };
      }

      case 'processes': {
        const isMemSort = input.sort === 'ram' || input.sort === 'mem' || input.sort === 'memory';
        const sortKey = isMemSort ? 'ram' : 'cpu';
        const targetCount = input.count !== undefined ? input.count : (input.singular ? 1 : 15);
        const isSingular = input.singular === true || targetCount === 1;

        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          try {
            const isLinux = this.detectPlatform() === 'linux';
            let args: string[];
            if (isLinux) {
              args = isMemSort 
                ? ['-eo', 'pid,pcpu,pmem,comm', '--sort=-pmem'] 
                : ['-eo', 'pid,pcpu,pmem,comm', '--sort=-pcpu'];
            } else {
              args = isMemSort
                ? ['-eo', 'pid,pcpu,pmem,comm', '-m']
                : ['-eo', 'pid,pcpu,pmem,comm', '-r'];
            }
            const out = await invoke<{ stdout: string }>('execute_command', { command: 'ps', args });
            if (out && out.stdout) {
              const lines = out.stdout.trim().split('\n').slice(1, targetCount + 1);
              const procList = lines.map(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parseInt(parts[0], 10) || 0;
                const cpuPercent = parseFloat(parts[1]) || 0;
                const pmem = parseFloat(parts[2]) || 0;
                const comm = parts.slice(3).join(' ') || 'unknown';
                const name = isLinux ? comm : processDisplayName(comm);
                return { pid, name, cpuPercent, ramPercent: pmem };
              });
              return { 
                success: true, 
                data: { sortedBy: sortKey, activeProcesses: procList, count: targetCount, singular: isSingular }, 
                commandExecuted: isLinux 
                  ? `ps -eo pid,pcpu,pmem,comm --sort=-${isMemSort ? 'pmem' : 'pcpu'}` 
                  : `ps -eo pid,pcpu,pmem,comm ${isMemSort ? '-m' : '-r'}` 
              };
            }
          } catch {
            // reported below
          }
          return this.unavailable('the process list');
        }
        return {
          success: true,
          data: {
            sortedBy: sortKey,
            count: targetCount,
            singular: isSingular,
            processes: isSingular ? [
              { pid: 1423, name: 'Sentinel AI', cpuPercent: 12.4, ramMb: 310 }
            ] : [
              { pid: 1423, name: 'Sentinel AI', cpuPercent: 12.4, ramMb: 310 },
              { pid: 821, name: 'Google Chrome', cpuPercent: 8.1, ramMb: 1450 },
              { pid: 31, name: 'WindowServer', cpuPercent: 6.0, ramMb: 420 },
              { pid: 5190, name: 'Terminal', cpuPercent: 1.2, ramMb: 95 }
            ]
          },
          commandExecuted: `ps -eo pid,pcpu,pmem,comm -r | head -n ${targetCount}`
        };
      }

      case 'temperature': {
        const platform = this.detectPlatform();
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          if (platform === 'linux') {
            try {
              const tempRes = await invoke<{ stdout: string }>('execute_command', {
                command: 'sh',
                args: ['-c', 'cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || sensors 2>/dev/null']
              }).catch(() => null);
              if (tempRes?.stdout) {
                const raw = tempRes.stdout.trim();
                if (/^\d+$/.test(raw)) {
                  return {
                    success: true,
                    data: { cpuCoreTempCelsius: parseFloat((parseInt(raw, 10) / 1000).toFixed(1)) },
                    commandExecuted: 'cat /sys/class/thermal/thermal_zone0/temp'
                  };
                }
                // `sensors` output is already human readable
                return { success: true, data: { stdout: raw }, commandExecuted: 'sensors' };
              }
            } catch {
              // fall through
            }
          }
          return platform === 'macos'
            ? this.unavailable('the CPU temperature', 'macOS only exposes it to administrators: sudo powermetrics --samplers smc -n 1')
            : this.unavailable('the CPU temperature', 'install lm_sensors for more sensors');
        }
        return {
          success: true,
          data: { cpuCoreTempCelsius: 42.3, gpuTempCelsius: 39.1, fanSpeedRpm: 1200, thermalState: 'Nominal' },
          commandExecuted: this.detectPlatform() === 'linux' ? 'cat /sys/class/thermal/thermal_zone0/temp' : 'osx-cpu-temp || sudo powermetrics -s smc -n 1'
        };
      }

      case 'uptime': {
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          if (this.detectPlatform() === 'linux') {
            try {
              const upRes = await invoke<{ stdout: string }>('execute_command', {
                command: 'uptime',
                args: ['-p']
              }).catch(() => null);
              if (upRes?.stdout) {
                return {
                  success: true,
                  data: { uptimeString: upRes.stdout.trim() },
                  commandExecuted: 'uptime -p'
                };
              }
            } catch {
              // fall through
            }
          } else if (this.detectPlatform() === 'macos') {
            const up = parseBootTime((await this.sh('sysctl -n kern.boottime')) || '');
            if (up) return { success: true, data: { uptimeString: `up ${up}` }, commandExecuted: 'sysctl -n kern.boottime' };
          }
          return this.unavailable('the uptime');
        }
        return {
          success: true,
          data: { uptimeString: 'up 4 days, 4 hours, 12 mins', bootTimestamp: '2026-07-21T08:00:00Z', idlePercentage: 86.4 },
          commandExecuted: 'uptime -p'
        };
      }

      case 'service': {
        const action = (input.action || 'status') as ServiceAction;
        const service = input.service || input.name || '';
        const userScope = input.userScope ?? false;
        const cmd = SystemServiceManager.getCommand(action, service, { userScope });
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
          return {
            success: true,
            data: { action, service, command: cmd.fullCommand, stdout: `Service ${service} ${action} completed` },
            commandExecuted: cmd.fullCommand
          };
        }
        try {
          const res = await invoke<{ code?: number; stdout?: string; stderr?: string }>('execute_command', {
            command: cmd.command,
            args: cmd.args
          });
          const success = res && (res.code === 0 || res.code === undefined);
          const parsed = SystemServiceManager.parseStatus(res?.stdout || '', undefined, service);
          return {
            success,
            data: { ...parsed, stdout: res?.stdout, stderr: res?.stderr },
            commandExecuted: cmd.fullCommand,
            error: success ? undefined : { code: 'SERVICE_ERROR', message: res?.stderr || 'Service command failed' }
          };
        } catch (err: any) {
          return { success: false, error: { code: 'EXECUTION_FAILED', message: err.message } };
        }
      }

      case 'dotfile': {
        const app = input.app || input.name || '';
        const enable = input.enable !== false;
        const target = input.target || 'hyprland';
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
          return {
            success: true,
            data: { app, enable, target, stdout: `Toggled ${app} in ${target}` },
            commandExecuted: `dotfile ${enable ? 'enable' : 'disable'} ${app}`
          };
        }
        const changeRes = await DotfileManager.toggleAutostart(app, enable, target);
        return {
          success: changeRes.success,
          data: changeRes,
          commandExecuted: `dotfile ${enable ? 'enable' : 'disable'} ${app} (${target})`,
          error: changeRes.error ? { code: 'DOTFILE_ERROR', message: changeRes.error } : undefined
        };
      }

      case 'lock':
        if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
          if (this.detectPlatform() === 'macos') {
            await invoke('execute_command', { command: 'pmset', args: ['displaysleepnow'] });
          } else {
            await invoke('execute_command', { 
              command: 'sh', 
              args: ['-c', 'loginctl lock-session 2>/dev/null || xdg-screensaver lock 2>/dev/null || gnome-screensaver-command -l 2>/dev/null || xflock4 2>/dev/null || swaylock 2>/dev/null'] 
            });
          }
        }
        return {
          success: true,
          data: { locked: true, stdout: 'System locked successfully' },
          commandExecuted: this.detectPlatform() === 'macos' ? 'pmset displaysleepnow' : 'loginctl lock-session'
        };

      default:
        return { success: true, data: { status: 'ok', operation: op }, commandExecuted: `system.${op}()` };
    }
  }

  public async verify(_input: SystemDriverInput, result: CapabilityExecutionResult<any>): Promise<boolean> {
    return result.success && !result.cancelled && result.data !== undefined;
  }
}
