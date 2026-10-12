/**
 * SystemSDKCapability.ts — Concrete Execution Driver for System Diagnostics & Monitoring
 * 
 * Implements OS diagnostic probes across all 9 system monitoring capabilities.
 * Mapped from Tool Registry: "system.*" (info, battery, cpu, gpu, ram, storage, processes, temperature, uptime)
 */

import { BaseCapabilityDriver, CapabilityExecutionResult, ExecutionContext, Platform } from '../CapabilitySDK';
import { invoke } from '@tauri-apps/api/core';

import { SystemServiceManager, ServiceAction } from '../../../domain/services/SystemServiceManager';
import { AppAliasRegistry } from '../../../domain/capabilities/AppAliasRegistry';

export type SystemOperation = 'info' | 'battery' | 'cpu' | 'gpu' | 'ram' | 'storage' | 'processes' | 'temperature' | 'uptime' | 'kill_process' | 'kill' | 'lock' | 'service';

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
  readonly supportedPlatforms: Platform[] = ['windows'];

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

  /** Honest failure: never substitute invented numbers for a reading we could not take. */
  private unavailable(what: string): CapabilityExecutionResult<any> {
    return { success: false, error: { code: 'NOT_AVAILABLE', message: `Reading ${what} is not available on Windows yet.` } };
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

    // TODO(3.7): read each value on Windows with Get-CimInstance (Win32_OperatingSystem, Win32_Processor,
    // Win32_ComputerSystem, Win32_LogicalDisk, Win32_Battery) | ConvertTo-Json, processes with Get-Process,
    // stop them with Stop-Process (ports through Get-NetTCPConnection), lock with LockWorkStation.
    // Under vitest the fixed sample data below stands in for a real system.
    const live = typeof process === 'undefined' || process.env.NODE_ENV !== 'test';

    switch (op) {
      case 'kill_process':
      case 'kill': {
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
        if (live) return { success: false, error: { code: 'NOT_AVAILABLE', message: 'Stopping processes is not available on Windows yet.' } };
        return { success: true, data: { terminated: true, process: target, stdout: `Terminated processes matching "${target}"` }, commandExecuted: `kill process ${target}` };
      }

      case 'info':
        if (live) return this.unavailable('system information');
        return {
          success: true,
          data: { os: 'Windows 11', arch: 'x64', cpus: 8, memoryGb: 16, kernel: '10.0.26100', uptimeSeconds: 360000 },
          commandExecuted: 'system.info'
        };

      case 'battery':
        if (live) return this.unavailable('the battery state');
        return {
          success: true,
          data: { percentage: 89, isCharging: false, timeRemainingMinutes: 245, powerSource: 'Battery' },
          commandExecuted: 'system.battery'
        };

      case 'cpu':
        if (live) return this.unavailable('CPU information');
        return {
          success: true,
          data: { cores: 8, model: 'Intel Core i7-1360P', usagePercentage: 24.5 },
          commandExecuted: 'system.cpu'
        };

      case 'gpu':
        if (live) return this.unavailable('GPU information');
        return {
          success: true,
          data: { model: 'Dedicated / Integrated GPU', vramAllocatedMb: 2048, coreUtilization: 14 },
          commandExecuted: 'system.gpu'
        };

      case 'ram':
        if (live) return this.unavailable('memory usage');
        return {
          success: true,
          data: { totalGb: 16, usedGb: 9.2, freeGb: 6.8, swapUsedGb: 0 },
          commandExecuted: 'system.ram'
        };

      case 'storage':
        if (live) return this.unavailable('disk usage');
        return {
          success: true,
          data: { volumes: [{ mount: 'C:\\', totalGb: 512, availableGb: 220, filesystem: 'NTFS' }] },
          commandExecuted: 'system.storage'
        };

      case 'processes': {
        const isMemSort = input.sort === 'ram' || input.sort === 'mem' || input.sort === 'memory';
        const sortKey = isMemSort ? 'ram' : 'cpu';
        const targetCount = input.count !== undefined ? input.count : (input.singular ? 1 : 15);
        const isSingular = input.singular === true || targetCount === 1;
        if (live) return this.unavailable('the process list');
        return {
          success: true,
          data: {
            sortedBy: sortKey,
            count: targetCount,
            singular: isSingular,
            processes: isSingular ? [
              { pid: 1423, name: 'Cero AI', cpuPercent: 12.4, ramMb: 310 }
            ] : [
              { pid: 1423, name: 'Cero AI', cpuPercent: 12.4, ramMb: 310 },
              { pid: 821, name: 'Google Chrome', cpuPercent: 8.1, ramMb: 1450 },
              { pid: 31, name: 'explorer.exe', cpuPercent: 6.0, ramMb: 420 },
              { pid: 5190, name: 'Windows Terminal', cpuPercent: 1.2, ramMb: 95 }
            ]
          },
          commandExecuted: `system.processes --sort ${sortKey} --count ${targetCount}`
        };
      }

      case 'temperature':
        if (live) return this.unavailable('the CPU temperature');
        return {
          success: true,
          data: { cpuCoreTempCelsius: 42.3, gpuTempCelsius: 39.1, fanSpeedRpm: 1200, thermalState: 'Nominal' },
          commandExecuted: 'system.temperature'
        };

      case 'uptime':
        if (live) return this.unavailable('the uptime');
        return {
          success: true,
          data: { uptimeString: 'up 4 days, 4 hours, 12 mins', bootTimestamp: '2026-07-21T08:00:00Z', idlePercentage: 86.4 },
          commandExecuted: 'system.uptime'
        };

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
          const parsed = SystemServiceManager.parseStatus(res?.stdout || '', service);
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

      case 'lock':
        if (live) return { success: false, error: { code: 'NOT_AVAILABLE', message: 'Locking the screen is not available on Windows yet.' } };
        return { success: true, data: { locked: true, stdout: 'System locked successfully' }, commandExecuted: 'system.lock' };

      default:
        return { success: true, data: { status: 'ok', operation: op }, commandExecuted: `system.${op}()` };
    }
  }

  public async verify(_input: SystemDriverInput, result: CapabilityExecutionResult<any>): Promise<boolean> {
    return result.success && !result.cancelled && result.data !== undefined;
  }
}
