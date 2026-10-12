/**
 * InstallerService.ts — desktop integrations: the `cero` command line launcher and IDE terminal profiles.
 *
 * TODO(3.8): implement on Windows. The launcher goes into a per-user folder that Cero adds to the user
 * PATH (with consent); VS Code and Cursor get a `terminal.integrated.profiles.windows` entry.
 * Until then every action reports that it is not available, and the status reads as not installed.
 */

export interface IntegrationStatus {
  cliInstalled: boolean;
  vscodeConfigured: boolean;
  cursorConfigured: boolean;
}

export const NOT_AVAILABLE_ON_WINDOWS = 'Not available on Windows yet.';

export class InstallerService {
  private static instance: InstallerService;

  private constructor() {}

  public static getInstance(): InstallerService {
    if (!InstallerService.instance) {
      InstallerService.instance = new InstallerService();
    }
    return InstallerService.instance;
  }

  public async installCli(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: NOT_AVAILABLE_ON_WINDOWS };
  }

  public async configureVsCodeIntegration(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: NOT_AVAILABLE_ON_WINDOWS };
  }

  public async configureCursorIntegration(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: NOT_AVAILABLE_ON_WINDOWS };
  }

  public async checkStatus(): Promise<IntegrationStatus> {
    return { cliInstalled: false, vscodeConfigured: false, cursorConfigured: false };
  }
}
