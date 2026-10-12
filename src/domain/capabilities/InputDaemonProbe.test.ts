import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputDaemonProbe } from './InputDaemonProbe';

describe('InputDaemonProbe — ydotool/wtype Capability Probe (0.5.8)', () => {
  let probe: InputDaemonProbe;

  beforeEach(() => {
    probe = InputDaemonProbe.getInstance();
    probe.clearCache();
  });

  it('detects Hyprland on Wayland and selects wtype as preferred injector', async () => {
    const origEnv = { ...process.env };
    process.env.WAYLAND_DISPLAY = 'wayland-1';
    process.env.HYPRLAND_INSTANCE_SIGNATURE = 'hypr_123';

    const mockExecutor = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd.includes('wtype')) return { stdout: '/usr/bin/wtype', stderr: '', code: 0 };
      if (cmd.includes('ydotool')) return { stdout: '/usr/bin/ydotool', stderr: '', code: 0 };
      if (cmd.includes('xdotool')) return { stdout: '', stderr: '', code: 1 };
      if (cmd.includes('groups')) return { stdout: 'user wheel input', stderr: '', code: 0 };
      if (cmd.includes('pgrep')) return { stdout: '1234', stderr: '', code: 0 };
      if (cmd.includes('test -r')) return { stdout: '', stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    const status = await probe.probe(mockExecutor, true);
    expect(status.displayServer).toBe('wayland');
    expect(status.compositor).toBe('hyprland');
    expect(status.hasWtype).toBe(true);
    expect(status.preferredInjector).toBe('wtype');
    expect(status.ready).toBe(true);

    process.env = origEnv;
  });

  it('detects GNOME on Wayland and selects ydotool with daemon verification', async () => {
    const origEnv = { ...process.env };
    process.env.WAYLAND_DISPLAY = 'wayland-0';
    delete process.env.HYPRLAND_INSTANCE_SIGNATURE;
    process.env.XDG_CURRENT_DESKTOP = 'GNOME';

    const mockExecutor = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd.includes('wtype')) return { stdout: '', stderr: '', code: 1 };
      if (cmd.includes('ydotool')) return { stdout: '/usr/bin/ydotool', stderr: '', code: 0 };
      if (cmd.includes('xdotool')) return { stdout: '', stderr: '', code: 1 };
      if (cmd.includes('groups')) return { stdout: 'user input', stderr: '', code: 0 };
      if (cmd.includes('pgrep')) return { stdout: '5678', stderr: '', code: 0 }; // daemon running
      if (cmd.includes('test -r')) return { stdout: '', stderr: '', code: 0 }; // uinput accessible
      return { stdout: '', stderr: '', code: 0 };
    });

    const status = await probe.probe(mockExecutor, true);
    expect(status.displayServer).toBe('wayland');
    expect(status.compositor).toBe('gnome');
    expect(status.hasYdotool).toBe(true);
    expect(status.ydotooldRunning).toBe(true);
    expect(status.userInInputGroup).toBe(true);
    expect(status.preferredInjector).toBe('ydotool');
    expect(status.ready).toBe(true);

    process.env = origEnv;
  });

  it('detects missing ydotoold daemon and builds remediation plan', async () => {
    const origEnv = { ...process.env };
    process.env.WAYLAND_DISPLAY = 'wayland-0';
    process.env.XDG_CURRENT_DESKTOP = 'GNOME';

    const mockExecutor = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd.includes('ydotoold') || cmd.includes('pgrep')) return { stdout: '', stderr: '', code: 1 }; // daemon NOT running
      if (cmd.includes('wtype')) return { stdout: '', stderr: '', code: 1 };
      if (cmd.includes('ydotool')) return { stdout: '/usr/bin/ydotool', stderr: '', code: 0 };
      if (cmd.includes('xdotool')) return { stdout: '', stderr: '', code: 1 };
      if (cmd.includes('groups')) return { stdout: 'user wheel', stderr: '', code: 0 }; // NOT in input group
      if (cmd.includes('test -r')) return { stdout: '', stderr: '', code: 1 }; // uinput NOT accessible
      return { stdout: '', stderr: '', code: 0 };
    });


    const status = await probe.probe(mockExecutor, true);
    expect(status.ready).toBe(false);
    expect(status.remediationPlan).toBeDefined();
    expect(status.remediationPlan?.requiresRoot).toBe(true);
    expect(status.remediationPlan?.commands.some(c => c.includes('usermod -aG input'))).toBe(true);
    expect(status.remediationPlan?.commands.some(c => c.includes('ydotoold'))).toBe(true);

    process.env = origEnv;
  });

  it('caches probe results unless forceRefresh is passed', async () => {
    const mockExecutor = vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    await probe.probe(mockExecutor, false);
    const callCountFirst = mockExecutor.mock.calls.length;
    expect(callCountFirst).toBeGreaterThan(0);

    // Second call without forceRefresh should use cache
    await probe.probe(mockExecutor, false);
    expect(mockExecutor.mock.calls.length).toBe(callCountFirst);

    // Call with forceRefresh should re-probe
    await probe.probe(mockExecutor, true);
    expect(mockExecutor.mock.calls.length).toBeGreaterThan(callCountFirst);
  });
});
