/**
 * Sentinel Terminal — Unified Cross-Platform System Service Manager
 *
 * Controls background daemons and services across Linux (systemd / systemctl),
 * macOS (launchctl / brew services), and Windows (PowerShell Service cmdlets).
 */

import { isWindowsName } from '../../shared/platform';

export type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable' | 'status';

export interface ServiceCommandOptions {
  os?: 'linux' | 'macos' | 'windows' | string;
  userScope?: boolean;
}

export interface ServiceCommand {
  command: string;
  args: string[];
  fullCommand: string;
  description: string;
  requiresSudo: boolean;
}

export interface ParsedServiceStatus {
  service: string;
  active: boolean;
  enabled: boolean;
  pid?: number;
  state: string;
  description?: string;
  raw?: string;
}

export class SystemServiceManager {
  /**
   * Generates the concrete CLI command to control a system service.
   */
  public static getCommand(
    action: ServiceAction,
    serviceName: string,
    options: ServiceCommandOptions = {}
  ): ServiceCommand {
    const rawOs = (options.os || process.platform).toLowerCase();
    const isWindows = isWindowsName(rawOs);
    const isMac = rawOs.includes('darwin') || rawOs.includes('mac');
    const isLinux = !isWindows && !isMac;
    const userScope = options.userScope ?? false;

    // Clean service name
    const cleanService = serviceName.trim().replace(/\.service$/, '');

    // 1. Linux (systemctl)
    if (isLinux) {
      const scopeFlag = userScope ? ['--user'] : [];
      const requiresSudo = !userScope && action !== 'status';
      const cmd = requiresSudo ? 'sudo' : 'systemctl';
      const args = requiresSudo
        ? ['systemctl', ...scopeFlag, action, cleanService]
        : [...scopeFlag, action, cleanService];

      return {
        command: cmd,
        args,
        fullCommand: `${cmd} ${args.join(' ')}`,
        description: `${action.toUpperCase()} service "${cleanService}" via systemctl${userScope ? ' (user scope)' : ''}`,
        requiresSudo
      };
    }

    // 2. macOS (brew services / launchctl)
    if (isMac) {
      // Homebrew services handles most common developer services (postgresql, redis, nginx, docker, etc.)
      const isBrewService = ['postgres', 'postgresql', 'redis', 'nginx', 'mysql', 'mariadb', 'mongodb', 'docker', 'tailscale'].includes(cleanService.toLowerCase());

      if (isBrewService) {
        return {
          command: 'brew',
          args: ['services', action, cleanService],
          fullCommand: `brew services ${action} ${cleanService}`,
          description: `${action.toUpperCase()} service "${cleanService}" via Homebrew Services`,
          requiresSudo: false
        };
      }

      // Native launchd commands
      let launchArgs: string[];
      switch (action) {
        case 'start':
          launchArgs = ['start', cleanService];
          break;
        case 'stop':
          launchArgs = ['stop', cleanService];
          break;
        case 'restart':
          launchArgs = ['stop', cleanService, '&&', 'launchctl', 'start', cleanService];
          break;
        case 'enable':
          launchArgs = ['load', '-w', `~/Library/LaunchAgents/${cleanService}.plist`];
          break;
        case 'disable':
          launchArgs = ['unload', '-w', `~/Library/LaunchAgents/${cleanService}.plist`];
          break;
        case 'status':
        default:
          launchArgs = ['list', cleanService];
          break;
      }

      return {
        command: 'launchctl',
        args: launchArgs,
        fullCommand: `launchctl ${launchArgs.join(' ')}`,
        description: `${action.toUpperCase()} service "${cleanService}" via launchctl`,
        requiresSudo: false
      };
    }

    // 3. Windows (PowerShell Service Cmdlets)
    let psCmd = '';
    switch (action) {
      case 'start':
        psCmd = `Start-Service -Name "${cleanService}"`;
        break;
      case 'stop':
        psCmd = `Stop-Service -Name "${cleanService}"`;
        break;
      case 'restart':
        psCmd = `Restart-Service -Name "${cleanService}"`;
        break;
      case 'enable':
        psCmd = `Set-Service -Name "${cleanService}" -StartupType Automatic; Start-Service -Name "${cleanService}"`;
        break;
      case 'disable':
        psCmd = `Set-Service -Name "${cleanService}" -StartupType Disabled; Stop-Service -Name "${cleanService}"`;
        break;
      case 'status':
      default:
        psCmd = `Get-Service -Name "${cleanService}" | Format-List`;
        break;
    }

    return {
      command: 'powershell',
      args: ['-Command', psCmd],
      fullCommand: `powershell -Command "${psCmd}"`,
      description: `${action.toUpperCase()} Windows service "${cleanService}"`,
      requiresSudo: action === 'enable' || action === 'disable'
    };
  }

  /**
   * Parses the raw terminal stdout/stderr of a service status inquiry.
   */
  public static parseStatus(rawOutput: string, os: string = process.platform, serviceName: string = 'service'): ParsedServiceStatus {
    const raw = rawOutput.trim();
    const lower = raw.toLowerCase();

    // 1. Linux systemctl status parsing
    if (lower.includes('active:') || lower.includes('loaded:')) {
      const activeMatch = raw.match(/Active:\s+([a-zA-Z]+)(?:\s+\(([^)]+)\))?/i);
      const state = activeMatch ? activeMatch[1] : (lower.includes('running') ? 'active' : 'inactive');
      const active = state.toLowerCase() === 'active';

      const pidMatch = raw.match(/Main PID:\s+(\d+)/i);
      const pid = pidMatch ? parseInt(pidMatch[1], 10) : undefined;

      const loadedMatch = raw.match(/Loaded:\s+loaded\s+\([^;]+;\s*([a-zA-Z]+)/i);
      const enabled = loadedMatch ? loadedMatch[1].toLowerCase() === 'enabled' : false;

      const descMatch = raw.match(/(?:[●○*•]|\*)\s+[\w.-]+\.service\s+-\s+(.+)/i);
      const description = descMatch ? descMatch[1].trim() : undefined;

      return {
        service: serviceName,
        active,
        enabled,
        pid,
        state,
        description,
        raw
      };
    }

    // 2. macOS brew services list / launchctl list
    if (lower.includes('started') || lower.includes('stopped') || lower.includes('error')) {
      const active = lower.includes('started') || lower.includes('running');
      const pidMatch = raw.match(/\b(\d+)\b/);
      const pid = pidMatch && active ? parseInt(pidMatch[1], 10) : undefined;

      return {
        service: serviceName,
        active,
        enabled: active,
        pid,
        state: active ? 'started' : 'stopped',
        raw
      };
    }

    // 3. Windows Get-Service parsing
    if (lower.includes('status') || lower.includes('running') || lower.includes('stopped')) {
      const active = lower.includes('running');
      return {
        service: serviceName,
        active,
        enabled: !lower.includes('disabled'),
        state: active ? 'Running' : 'Stopped',
        raw
      };
    }

    // Generic fallback
    const active = lower.includes('running') || lower.includes('active') || lower.includes('started');
    return {
      service: serviceName,
      active,
      enabled: active,
      state: active ? 'active' : 'unknown',
      raw
    };
  }
}
