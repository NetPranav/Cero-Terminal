/**
 * InputDaemonProbe.ts — ydotool/wtype Capability Probe (Phase 0.5, Item 8)
 *
 * Probes Linux desktop input automation readiness:
 * - Detects display server (Wayland vs X11) and compositor (Hyprland, Sway, GNOME, KDE)
 * - Checks input injectors: wtype, ydotool, xdotool
 * - Checks ydotoold status, user input group membership, and /dev/uinput accessibility
 * - Provides guided remediation commands through consent flow if components are missing
 * - Caches probe results for the session
 */

export type DisplayServer = 'wayland' | 'x11' | 'unknown';
export type CompositorType = 'hyprland' | 'sway' | 'wlroots' | 'gnome' | 'kde' | 'other' | 'x11';
export type PreferredInjector = 'ydotool' | 'wtype' | 'xdotool' | 'none';

export interface InputDaemonStatus {
  displayServer: DisplayServer;
  compositor: CompositorType;
  ydotooldRunning: boolean;
  userInInputGroup: boolean;
  uinputAccessible: boolean;
  hasYdotool: boolean;
  hasWtype: boolean;
  hasXdotool: boolean;
  preferredInjector: PreferredInjector;
  ready: boolean;
  remediationPlan?: {
    commands: string[];
    explanation: string;
    requiresRoot: boolean;
  };
}

export class InputDaemonProbe {
  private static instance?: InputDaemonProbe;
  private cachedStatus?: InputDaemonStatus;

  public static getInstance(): InputDaemonProbe {
    if (!InputDaemonProbe.instance) {
      InputDaemonProbe.instance = new InputDaemonProbe();
    }
    return InputDaemonProbe.instance;
  }

  public clearCache(): void {
    this.cachedStatus = undefined;
  }

  public detectDisplayEnvironment(): { displayServer: DisplayServer; compositor: CompositorType } {
    const env = typeof process !== 'undefined' ? process.env : {};

    let displayServer: DisplayServer = 'unknown';
    if (env.WAYLAND_DISPLAY || env.XDG_SESSION_TYPE === 'wayland') {
      displayServer = 'wayland';
    } else if (env.DISPLAY || env.XDG_SESSION_TYPE === 'x11') {
      displayServer = 'x11';
    }

    let compositor: CompositorType = displayServer === 'x11' ? 'x11' : 'other';
    if (env.HYPRLAND_INSTANCE_SIGNATURE) {
      compositor = 'hyprland';
    } else if (env.SWAYSOCK) {
      compositor = 'sway';
    } else if (env.XDG_CURRENT_DESKTOP?.toLowerCase().includes('gnome')) {
      compositor = 'gnome';
    } else if (env.XDG_CURRENT_DESKTOP?.toLowerCase().includes('kde')) {
      compositor = 'kde';
    } else if (displayServer === 'wayland') {
      compositor = 'wlroots';
    }

    return { displayServer, compositor };
  }

  public async probe(
    executor?: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>,
    forceRefresh = false
  ): Promise<InputDaemonStatus> {
    if (this.cachedStatus && !forceRefresh) {
      return this.cachedStatus;
    }

    const { displayServer, compositor } = this.detectDisplayEnvironment();

    const run = executor || (async (cmd: string) => {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        const { spawnSync } = await import('node:child_process');
        const res = spawnSync('/bin/sh', ['-c', cmd], { encoding: 'utf-8', timeout: 2000 });
        return { stdout: res.stdout || '', stderr: res.stderr || '', code: res.status ?? 0 };
      }
      return { stdout: '', stderr: '', code: 1 };
    });

    // Check installed tools
    const [hasYdotoolRes, hasWtypeRes, hasXdotoolRes] = await Promise.all([
      run('command -v ydotool'),
      run('command -v wtype'),
      run('command -v xdotool')
    ]);

    const hasYdotool = hasYdotoolRes.code === 0;
    const hasWtype = hasWtypeRes.code === 0;
    const hasXdotool = hasXdotoolRes.code === 0;

    // Check daemon running
    const ydotoolRunningRes = await run('pgrep -x ydotoold || pgrep -f ydotoold');
    const ydotooldRunning = ydotoolRunningRes.code === 0;

    // Check group membership
    const groupRes = await run('groups');
    const userInInputGroup = /\binput\b/.test(groupRes.stdout);

    // Check /dev/uinput accessibility
    const uinputRes = await run('test -r /dev/uinput && test -w /dev/uinput');
    const uinputAccessible = uinputRes.code === 0;

    // Select preferred injector
    let preferredInjector: PreferredInjector = 'none';
    if (displayServer === 'wayland') {
      if ((compositor === 'hyprland' || compositor === 'sway' || compositor === 'wlroots') && hasWtype) {
        preferredInjector = 'wtype';
      } else if (hasYdotool) {
        preferredInjector = 'ydotool';
      } else if (hasWtype) {
        preferredInjector = 'wtype';
      }
    } else if (displayServer === 'x11') {
      if (hasXdotool) {
        preferredInjector = 'xdotool';
      } else if (hasYdotool) {
        preferredInjector = 'ydotool';
      }
    } else {
      if (hasWtype) preferredInjector = 'wtype';
      else if (hasYdotool) preferredInjector = 'ydotool';
      else if (hasXdotool) preferredInjector = 'xdotool';
    }

    // Determine readiness
    let ready = false;
    if (preferredInjector === 'wtype' || preferredInjector === 'xdotool') {
      ready = true;
    } else if (preferredInjector === 'ydotool') {
      ready = ydotooldRunning && uinputAccessible;
    }

    // Build remediation plan if not ready
    let remediationPlan: InputDaemonStatus['remediationPlan'];
    if (!ready) {
      const commands: string[] = [];
      let explanation = '';
      let requiresRoot = false;

      if (!hasYdotool && !hasWtype && !hasXdotool) {
        requiresRoot = true;
        commands.push('sudo apt install -y ydotool wtype || sudo pacman -S --noconfirm ydotool wtype');
        explanation = 'Install input automation tools (ydotool and wtype).';
      }

      if (!userInInputGroup) {
        requiresRoot = true;
        commands.push('sudo usermod -aG input $USER');
        explanation += ' Add user to the input group for /dev/uinput access.';
      }

      if (!uinputAccessible) {
        requiresRoot = true;
        commands.push('echo \'KERNEL=="uinput", GROUP="input", MODE="0660"\' | sudo tee /etc/udev/rules.d/99-uinput.rules && sudo udevadm trigger');
        explanation += ' Configure udev rule to grant input group permissions to /dev/uinput.';
      }

      if (hasYdotool && !ydotooldRunning) {
        commands.push('systemctl --user enable --now ydotool || (nohup ydotoold >/dev/null 2>&1 &)');
        explanation += ' Start the background ydotoold daemon.';
      }

      remediationPlan = {
        commands,
        explanation: explanation.trim() || 'Configure input daemon and permissions for UI automation.',
        requiresRoot
      };
    }

    const status: InputDaemonStatus = {
      displayServer,
      compositor,
      ydotooldRunning,
      userInInputGroup,
      uinputAccessible,
      hasYdotool,
      hasWtype,
      hasXdotool,
      preferredInjector,
      ready,
      remediationPlan
    };

    this.cachedStatus = status;
    return status;
  }
}
