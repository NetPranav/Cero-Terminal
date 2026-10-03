import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstallerService } from './InstallerService';

const mockStore: Record<string, string> = {};

// This suite verifies the Linux integration layout, so pin platform detection
// to Linux regardless of the host the tests run on (CI or a macOS dev box).
vi.mock('../../shared/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/platform')>();
  return {
    ...actual,
    getPlatform: () => 'linux',
    isLinux: () => true,
    isMacOS: () => false,
    isWindows: () => false,
  };
});

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(async (filePath: string, contents: string) => {
    mockStore[filePath] = contents;
  }),
  readTextFile: vi.fn(async (filePath: string) => {
    if (!mockStore[filePath]) throw new Error('File not found');
    return mockStore[filePath];
  }),
  mkdir: vi.fn(async () => undefined),
  exists: vi.fn(async (target: string) => {
    if (mockStore[target]) return true;
    return Object.keys(mockStore).some(k => k.startsWith(target));
  })
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === 'get_app_binary_path') return '/usr/bin/cero-terminal';
    if (cmd === 'execute_command' && args?.command === 'sh' && args?.args?.includes('echo $PATH')) {
      return { stdout: '/home/testuser/.local/bin:/usr/local/bin:/usr/bin:/bin' };
    }
    return { stdout: '/home/testuser' };
  })
}));

describe('InstallerService (Linux & Cross-Platform)', () => {
  const installer = InstallerService.getInstance();
  const cliTarget = '/home/testuser/.local/bin/cero';
  const servicesDir = '/home/testuser/.local/share/nautilus/scripts';
  const vscodeSettings = '/home/testuser/.config/Code/User/settings.json';
  const cursorSettings = '/home/testuser/.config/Cursor/User/settings.json';

  beforeEach(() => {
    for (const k in mockStore) delete mockStore[k];
  });

  it('installs the cero command line executable without recursive loops and registers desktop entries', async () => {
    const res = await installer.installCli(undefined, cliTarget);
    expect(res.success).toBe(true);

    const script = mockStore[cliTarget];
    expect(script).toBeDefined();
    // Verify recursion elimination: must not call cero on failure
    expect(script).not.toContain('|| cero "$resolved_path"');
    expect(script).toContain('APP_BIN');
    expect(script).toContain('--help');
    expect(script).toContain('--version');

    // Verify cero-shell wrapper is generated
    const shellWrapper = mockStore['/home/testuser/.local/bin/cero-shell'];
    expect(shellWrapper).toBeDefined();
    expect(shellWrapper).toContain('CERO_IDE_INTEGRATED=1');

    // Verify desktop entry with directory and scheme handler
    const desktopEntry = mockStore['/home/testuser/.local/share/applications/cero-terminal.desktop'];
    expect(desktopEntry).toBeDefined();
    expect(desktopEntry).toContain('MimeType=inode/directory;x-scheme-handler/cero;');
  });

  it('generates multi-file manager context actions for Nautilus, Dolphin, and Thunar', async () => {
    // Seed existing Thunar uca.xml
    mockStore['/home/testuser/.config/Thunar/uca.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<actions>\n</actions>';

    const res = await installer.enableFinderIntegration(servicesDir);
    expect(res.success).toBe(true);

    // 1. Nautilus script
    expect(mockStore[`${servicesDir}/Open in Cero`]).toBeDefined();
    expect(mockStore[`${servicesDir}/Open in Cero`]).toContain('cero');

    // 2. Dolphin KIO service menu
    const dolphinMenu = mockStore['/home/testuser/.local/share/kio/servicemenus/cero_open.desktop'];
    expect(dolphinMenu).toBeDefined();
    expect(dolphinMenu).toContain('ServiceTypes=KonqPopupMenu/Plugin,inode/directory');
    expect(dolphinMenu).toContain('Exec=cero "%f"');

    // 3. Thunar Custom Action
    const thunarXml = mockStore['/home/testuser/.config/Thunar/uca.xml'];
    expect(thunarXml).toBeDefined();
    expect(thunarXml).toContain('cero-open-terminal');
    expect(thunarXml).toContain('<command>cero %f</command>');
  });

  it('injects Cero Shell profile and external exec into VS Code settings.json cleanly for Linux', async () => {
    mockStore[vscodeSettings] = JSON.stringify({ "editor.fontSize": 14 });

    const res = await installer.configureVsCodeIntegration(vscodeSettings);
    expect(res.success).toBe(true);

    const saved = JSON.parse(mockStore[vscodeSettings]);
    expect(saved['editor.fontSize']).toBe(14);
    expect(saved['terminal.integrated.profiles.linux']['Cero Shell']).toBeDefined();
    expect(saved['terminal.integrated.profiles.linux']['Cero Shell'].path).toContain('cero-shell');
    expect(saved['terminal.external.linuxExec']).toBe('cero-terminal');
  });

  it('injects Cero Shell profile into Cursor IDE settings.json for Linux', async () => {
    const res = await installer.configureCursorIntegration(cursorSettings);
    expect(res.success).toBe(true);

    const saved = JSON.parse(mockStore[cursorSettings]);
    expect(saved['terminal.integrated.profiles.linux']['Cero Shell']).toBeDefined();
    expect(saved['terminal.integrated.profiles.linux']['Cero Shell'].path).toContain('cero-shell');
    expect(saved['terminal.external.linuxExec']).toBe('cero-terminal');
  });

  it('accurately verifies status of all desktop integration components including PATH', async () => {
    await installer.installCli(undefined, cliTarget);
    await installer.configureVsCodeIntegration(vscodeSettings);

    const status = await installer.checkStatus({
      cliPath: cliTarget,
      servicesDir: `${servicesDir}/Open in Cero`,
      vscodePath: vscodeSettings,
      cursorPath: cursorSettings
    });

    expect(status.cliInstalled).toBe(true);
    expect(status.finderEnabled).toBe(true);
    expect(status.vscodeConfigured).toBe(true);
    expect(status.cursorConfigured).toBe(false);
    expect(status.localBinInPath).toBe(true);
  });
});
