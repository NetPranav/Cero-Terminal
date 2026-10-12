/**
 * Cero — Error Diagnostics Engine
 *
 * Inspects execution failures (stderr, non-zero exit codes, error payloads) and
 * determines whether an error is autonomously software-recoverable via self-healing
 * sub-phases, or requires physical user hardware intervention.
 */

import { DeterministicRuleOracle } from '../../domain/remediation/DeterministicRuleOracle';

export type ErrorCategory = 'SOFTWARE_RECOVERABLE' | 'PHYSICAL_ACTION_REQUIRED' | 'FATAL_UNKNOWN';

export interface RemediationAction {
  title: string;
  tool: string;
  params: Record<string, any>;
  description?: string;
}

export interface DiagnosticResult {
  category: ErrorCategory;
  cause: string;
  physicalPrompt?: string;
  remediation?: RemediationAction;
  canRetry: boolean;
}

export class ErrorDiagnosticsEngine {
  /**
   * Analyze an error string, exit code, and context to produce a structured diagnosis.
   */
  public static diagnose(
    errorMsg: string | undefined | null,
    toolId?: string,
    params?: Record<string, any>,
    cwd?: string,
    command?: string
  ): DiagnosticResult {
    const raw = (errorMsg || '').trim();
    const lower = raw.toLowerCase();

    // 1. Check for Physical / Hardware Action Requirements first
    const physicalDiagnosis = this.checkPhysicalAction(lower, raw, toolId, params);
    if (physicalDiagnosis) {
      return physicalDiagnosis;
    }

    // 2. Check for Domain Capability Software Recoverable Errors
    const softwareDiagnosis = this.checkSoftwareRecoverable(lower, raw, toolId, params, cwd);
    if (softwareDiagnosis) {
      return softwareDiagnosis;
    }

    // 3. Phase 5.2: Check DeterministicRuleOracle (thefuck architecture for Shell & Terminal)
    const execCmd = command || (params?.command as string) || '';
    const oracleResult = DeterministicRuleOracle.getInstance().diagnose({
      command: execCmd,
      output: raw,
      cwd,
      os: 'mac'
    });

    if (oracleResult) {
      return {
        category: 'SOFTWARE_RECOVERABLE',
        cause: oracleResult.explanation,
        remediation: {
          title: oracleResult.title,
          tool: 'shell.execute',
          params: { command: oracleResult.fixedCommand },
          description: `${oracleResult.explanation}: ${oracleResult.fixedCommand}`
        },
        canRetry: true
      };
    }

    // 4. Fallback: Unknown Fatal Error
    return {
      category: 'FATAL_UNKNOWN',
      cause: raw || 'Unknown execution failure',
      canRetry: false
    };
  }

  /**
   * Detect errors that require the user to perform a physical action (cable, power, hardware switch).
   */
  private static checkPhysicalAction(
    lower: string,
    raw: string,
    toolId?: string,
    params?: Record<string, any>
  ): DiagnosticResult | null {
    // Bluetooth peripheral disconnected / powered off
    if (
      lower.includes('device not found') ||
      lower.includes('not connected') ||
      lower.includes('device is offline') ||
      lower.includes('bluetooth is powered off') ||
      lower.includes('bluetooth not available') ||
      (toolId === 'network.bluetooth.connect' && (lower.includes('could not find') || lower.includes('timed out') || lower.includes('not available')))
    ) {
      const deviceName = params?.device || params?.name || 'device';
      return {
        category: 'PHYSICAL_ACTION_REQUIRED',
        cause: `Bluetooth peripheral "${deviceName}" is offline or out of range.`,
        physicalPrompt: `[!] [Physical Action Required] "${deviceName}" is powered off or disconnected.\n-> Power on or connect your device, then type "done" or press Enter to resume.`,
        canRetry: true
      };
    }

    // Physical USB / Serial / Hardware peripheral disconnected
    if (
      lower.includes('no such device') ||
      lower.includes('device disconnected') ||
      lower.includes('usb device not found') ||
      lower.includes('serial port not found') ||
      lower.includes('hardware not responding') ||
      lower.includes('plug in') ||
      lower.includes('insert usb')
    ) {
      return {
        category: 'PHYSICAL_ACTION_REQUIRED',
        cause: 'Hardware peripheral is disconnected or unplugged.',
        physicalPrompt: '[!] [Physical Action Required] Hardware device is disconnected.\n-> Please connect the hardware cable/USB, then type "done" or press Enter to resume.',
        canRetry: true
      };
    }

    // Wi-Fi hardware adapter powered off / airplane mode
    if (
      lower.includes('wifi adapter is disabled') ||
      lower.includes('wi-fi hardware is powered off') ||
      lower.includes('hardware rfkill') ||
      lower.includes('airplane mode is on')
    ) {
      return {
        category: 'PHYSICAL_ACTION_REQUIRED',
        cause: 'Wi-Fi hardware switch or adapter is disabled.',
        physicalPrompt: '[!] [Physical Action Required] Wi-Fi hardware adapter is switched off.\n-> Toggle your hardware Wi-Fi / airplane mode switch, then type "done" or press Enter to resume.',
        canRetry: true
      };
    }

    return null;
  }

  /**
   * Detect software-recoverable errors that Cero can automatically heal via sub-phases.
   */
  private static checkSoftwareRecoverable(
    lower: string,
    raw: string,
    toolId?: string,
    params?: Record<string, any>,
    cwd?: string
  ): DiagnosticResult | null {
    // 1. Port collision (EADDRINUSE / port occupied)
    const portMatch = raw.match(/(?:EADDRINUSE|address already in use|port\s+(\d+)\s+is\s+(?:in\s+use|already\s+bound|busy|occupied)|(?:occupied|bound).*?port\s+(\d+))/i);
    if (portMatch) {
      const port = portMatch[1] || portMatch[2] || params?.port || '3000';
      return {
        category: 'SOFTWARE_RECOVERABLE',
        cause: `Port ${port} is occupied by another process.`,
        remediation: {
          title: `Free port ${port}`,
          tool: 'system.kill_process',
          params: { port: parseInt(port, 10) || 3000 },
          description: `Identify and terminate process holding port ${port}`
        },
        canRetry: true
      };
    }

    // 2. Missing directory (ENOENT / no such file or directory)
    if (lower.includes('enoent') || lower.includes('no such file or directory') || lower.includes('directory does not exist')) {
      const targetPath = params?.path || params?.directory || params?.file || params?.destination;
      if (targetPath) {
        return {
          category: 'SOFTWARE_RECOVERABLE',
          cause: `Target directory or path "${targetPath}" does not exist.`,
          remediation: {
            title: `Create missing directory structure for ${targetPath}`,
            tool: 'filesystem.mkdir',
            params: { path: targetPath, recursive: true },
            description: `Automatically create missing directory: ${targetPath}`
          },
          canRetry: true
        };
      }
    }

    // 3. Stale Git or process lockfiles
    if (lower.includes('index.lock') || lower.includes('another git process is running') || lower.includes('lockfile already exists')) {
      return {
        category: 'SOFTWARE_RECOVERABLE',
        cause: 'Stale Git repository index lockfile detected.',
        remediation: {
          title: 'Remove stale .git/index.lock file',
          tool: 'filesystem.delete',
          params: { path: '.git/index.lock' },
          description: 'Delete stale lockfile to restore repository access'
        },
        canRetry: true
      };
    }

    // 4. Stale package-lock / npm locks
    if (lower.includes('npm err! code elocked') || lower.includes('package-lock.json held')) {
      return {
        category: 'SOFTWARE_RECOVERABLE',
        cause: 'Package manager lock contention detected.',
        remediation: {
          title: 'Clear package manager lock state',
          tool: 'shell.execute',
          params: { command: 'rm -f package-lock.json.lock' },
          description: 'Remove lock conflict'
        },
        canRetry: true
      };
    }

    // 5. Bluetooth service disabled (Software toggle on)
    if (toolId?.startsWith('network.bluetooth') && (lower.includes('bluetooth is off') || lower.includes('turned off'))) {
      return {
        category: 'SOFTWARE_RECOVERABLE',
        cause: 'Bluetooth system radio is currently turned off.',
        remediation: {
          title: 'Enable Bluetooth system radio',
          tool: 'network.bluetooth.on',
          params: {},
          description: 'Turn on system Bluetooth radio'
        },
        canRetry: true
      };
    }

    // 6. Wi-Fi service disabled (Software toggle on)
    if (toolId?.startsWith('network.wifi') && (lower.includes('wi-fi is off') || lower.includes('wifi power is off'))) {
      return {
        category: 'SOFTWARE_RECOVERABLE',
        cause: 'Wi-Fi system radio is currently turned off.',
        remediation: {
          title: 'Enable Wi-Fi system radio',
          tool: 'network.wifi.on',
          params: {},
          description: 'Turn on system Wi-Fi radio'
        },
        canRetry: true
      };
    }

    return null;
  }
}
