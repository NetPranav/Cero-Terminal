import { describe, it, expect } from 'vitest';
import { ApplicationCapability } from './ApplicationCapability';

describe('ApplicationCapability — Multi-Distribution Linux Package Management', () => {
  it('instantiates the application driver properly', () => {
    const appCap = new ApplicationCapability('application.install');
    expect(appCap.name).toContain('Desktop Application Launch & Management Driver');
    expect(appCap.supportedPlatforms).toContain('linux');
  });

  it('handles mock execution for install operation in test environment', async () => {
    const appCap = new ApplicationCapability('application.install');
    const result = await appCap.execute({ operation: 'install', target: 'ripgrep' });
    expect(result.success).toBe(true);
    expect(result.data?.installed).toBe(true);
    expect(result.data?.package).toBe('ripgrep');
  });

  it('handles mock execution for open, close, and list_running operations', async () => {
    const appCap = new ApplicationCapability('application.open');
    const openRes = await appCap.open('firefox');
    expect(openRes.success).toBe(true);
    expect(openRes.data?.opened).toBe(true);

    const listRes = await appCap.listRunning();
    expect(listRes.success).toBe(true);
    expect(Array.isArray(listRes.data?.apps)).toBe(true);

    const closeRes = await appCap.close('firefox');
    expect(closeRes.success).toBe(true);
    expect(closeRes.data?.closed).toBe(true);
  });
});
