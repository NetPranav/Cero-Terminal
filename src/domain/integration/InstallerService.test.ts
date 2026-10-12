import { describe, it, expect } from 'vitest';
import { InstallerService, NOT_AVAILABLE_ON_WINDOWS } from './InstallerService';

describe('InstallerService (Windows, not implemented yet)', () => {
  const installer = InstallerService.getInstance();

  it('reports every integration as not installed', async () => {
    expect(await installer.checkStatus()).toEqual({ cliInstalled: false, vscodeConfigured: false, cursorConfigured: false });
  });

  it('refuses each action with a clear message instead of pretending to succeed', async () => {
    for (const result of [
      await installer.installCli(),
      await installer.configureVsCodeIntegration(),
      await installer.configureCursorIntegration(),
    ]) {
      expect(result).toEqual({ success: false, error: NOT_AVAILABLE_ON_WINDOWS });
    }
  });
});
