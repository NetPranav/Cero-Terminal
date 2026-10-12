import { describe, it, expect } from 'vitest';
import { SystemKnowledgeScanner, emptyProfile, type SystemProfile } from './SystemKnowledgeScanner';

function sampleProfile(): SystemProfile {
  const p = emptyProfile(1000);
  p.os = { ...p.os, name: 'Windows 11 Pro', version: '24H2', kernel: '10.0.26100' };
  p.hardware = { cpuModel: 'Intel Core i7-1360P', cpuCores: 16, ramTotalGb: 32, isGpuAvailable: true, gpuVendors: ['intel'] };
  p.developer = { packageManagers: ['winget', 'scoop'], preferredPackageManager: 'winget', node: '22.19.0', python: '3.13.7' };
  p.apps = { totalCount: 2, items: [{ name: 'Visual Studio Code', binary: 'code' }, { name: 'Zen Browser', binary: 'zen' }] };
  p.network = { hasInternet: true, localIp: '192.168.1.42' };
  return p;
}

describe('SystemKnowledgeScanner', () => {
  it('starts from an empty Windows profile that invents nothing', () => {
    const p = emptyProfile(5);
    expect(p.os.name).toBe('Windows');
    expect(p.hardware).toEqual({ isGpuAvailable: false });
    expect(p.apps.items).toEqual([]);
  });

  it('summarises stable facts for the prompt and omits volatile ones', () => {
    const scanner = SystemKnowledgeScanner.getInstance();
    scanner.setProfile(sampleProfile());
    const summary = scanner.getQuickSummary();
    expect(summary).toContain('SYSTEM KNOWLEDGE PROFILE:');
    expect(summary).toContain('Windows 11 Pro');
    expect(summary).toContain('Package manager: winget');
    expect(summary).toContain('Visual Studio Code (code)');
    // The IP changes between scans; the model should query it live
    expect(summary).not.toContain('192.168.1.42');
  });

  it('finds applications by exact name or binary before partial matches', () => {
    const scanner = SystemKnowledgeScanner.getInstance();
    scanner.setProfile(sampleProfile());
    expect(scanner.findApplication('code')?.name).toBe('Visual Studio Code');
    expect(scanner.findApplication('zen')?.name).toBe('Zen Browser');
    expect(scanner.findApplication('non_existent_super_rare_app_xyz_123')).toBeUndefined();
  });

  it('keeps the stored profile when no scan can run', async () => {
    const scanner = SystemKnowledgeScanner.getInstance();
    scanner.setProfile(sampleProfile());
    expect((await scanner.scan(true)).os.name).toBe('Windows 11 Pro');
  });
});
