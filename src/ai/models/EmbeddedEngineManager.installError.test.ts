import { describe, it, expect, vi, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { EmbeddedEngineManager } from './EmbeddedEngineManager';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-os', () => ({ arch: () => 'x86_64' }));

const originalEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  vi.clearAllMocks();
});

function manager() {
  const m = new EmbeddedEngineManager();
  return m;
}

describe('EmbeddedEngineManager engine install errors', () => {
  it('keeps the reason when the engine cannot be unpacked (for example antivirus removed it)', async () => {
    process.env.NODE_ENV = 'production';
    const m = manager();
    vi.spyOn(m as any, 'nativeDownload').mockResolvedValue(true);
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'check_path_exists') return true;
      throw 'Windows Security removed llama-server.exe. Add the folder to the Exclusions.';
    });
    expect(await m.installEngine()).toBe(false);
    expect(m.getLastInstallError()).toContain('Exclusions');
  });

  it('says the download failed when nothing was downloaded', async () => {
    process.env.NODE_ENV = 'production';
    const m = manager();
    vi.spyOn(m as any, 'nativeDownload').mockResolvedValue(false);
    vi.mocked(invoke).mockResolvedValue(true);
    expect(await m.installEngine()).toBe(false);
    expect(m.getLastInstallError()).toMatch(/download/i);
  });

  it('clears the reason after a successful install', async () => {
    process.env.NODE_ENV = 'production';
    const m = manager();
    vi.spyOn(m as any, 'nativeDownload').mockResolvedValue(true);
    vi.mocked(invoke).mockResolvedValue(true);
    expect(await m.installEngine()).toBe(true);
    expect(m.getLastInstallError()).toBeNull();
  });
});
