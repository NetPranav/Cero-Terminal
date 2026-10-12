/**
 * Cero — System Service Manager
 *
 * Controls Windows services through the PowerShell service cmdlets.
 * TODO(3.7): fixture tests from a real machine; `sc.exe query` as a fallback.
 * TODO(4.4): the service name is placed inside a double-quoted PowerShell string; validate or quote it safely.
 */

export type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable' | 'status';

export interface ServiceCommandOptions {
  /** Kept for callers; Windows services have no per-user scope */
  userScope?: boolean;
}

export interface ServiceCommand {
  command: string;
  args: string[];
  fullCommand: string;
  description: string;
  /** Needs administrator rights */
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
    _options: ServiceCommandOptions = {}
  ): ServiceCommand {
    const cleanService = serviceName.trim();

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
   * Parses the output of `Get-Service | Format-List`.
   */
  public static parseStatus(rawOutput: string, serviceName: string = 'service'): ParsedServiceStatus {
    const raw = rawOutput.trim();
    const lower = raw.toLowerCase();
    const active = /\bstatus\s*:\s*running\b/i.test(raw) || (!/\bstatus\s*:/i.test(raw) && lower.includes('running'));
    return {
      service: serviceName,
      active,
      enabled: !/\bstarttype\s*:\s*disabled\b/i.test(raw) && !lower.includes('disabled'),
      state: active ? 'Running' : (lower.includes('stopped') ? 'Stopped' : 'unknown'),
      raw
    };
  }
}
