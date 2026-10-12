export type SupportedShell = 'zsh' | 'bash' | 'fish' | 'nushell' | 'powershell';

export interface ShellProfile {
  id: SupportedShell;
  name: string;
  defaultPath: string;
  loginFlag: string;
  interactiveFlag: string;
  configFilePath: string;
  supportsTrueColor: boolean;
}

import { isLinux } from '../../shared/platform';

export class ShellAdapter {
  private static instance: ShellAdapter;
  
  private profiles: Record<SupportedShell, ShellProfile> = {
    zsh: {
      id: 'zsh',
      name: 'Zsh',
      defaultPath: '/bin/zsh',
      loginFlag: '-l',
      interactiveFlag: '-i',
      configFilePath: '.zshrc',
      supportsTrueColor: true,
    },
    bash: {
      id: 'bash',
      name: 'Bash',
      defaultPath: '/bin/bash',
      loginFlag: '--login',
      interactiveFlag: '-i',
      configFilePath: '.bashrc',
      supportsTrueColor: true,
    },
    fish: {
      id: 'fish',
      name: 'Fish',
      defaultPath: '/usr/bin/fish',
      loginFlag: '--login',
      interactiveFlag: '-i',
      configFilePath: '.config/fish/config.fish',
      supportsTrueColor: true,
    },
    nushell: {
      id: 'nushell',
      name: 'Nushell',
      defaultPath: '/usr/bin/nu',
      loginFlag: '--login',
      interactiveFlag: '-i',
      configFilePath: '.config/nushell/config.nu',
      supportsTrueColor: true,
    },
    powershell: {
      id: 'powershell',
      name: 'PowerShell',
      defaultPath: 'pwsh',
      loginFlag: '-NoLogo',
      interactiveFlag: '-NoExit',
      configFilePath: '.config/powershell/Microsoft.PowerShell_profile.ps1',
      supportsTrueColor: true,
    }
  };

  private constructor() {}

  public static getInstance(): ShellAdapter {
    if (!ShellAdapter.instance) {
      ShellAdapter.instance = new ShellAdapter();
    }
    return ShellAdapter.instance;
  }

  /**
   * Detect the user's default login shell from environment variable or platform default.
   */
  public detectLoginShell(envShellPath?: string): ShellProfile {
    const linux = isLinux();
    const fallback = linux ? '/bin/bash' : '/bin/zsh';
    const targetPath = envShellPath || fallback;
    const lower = targetPath.toLowerCase();

    if (lower.includes('bash')) return this.profiles.bash;
    if (lower.includes('fish')) return this.profiles.fish;
    if (lower.includes('nu')) return this.profiles.nushell;
    if (lower.includes('pwsh') || lower.includes('powershell')) return this.profiles.powershell;
    if (lower.includes('zsh')) return this.profiles.zsh;

    return linux ? this.profiles.bash : this.profiles.zsh;
  }

  /**
   * Retrieve profile details by shell ID or binary name.
   */
  public getProfile(shellId: string): ShellProfile {
    const lower = shellId.toLowerCase();
    if (lower.includes('bash')) return this.profiles.bash;
    if (lower.includes('fish')) return this.profiles.fish;
    if (lower.includes('nu')) return this.profiles.nushell;
    if (lower.includes('pwsh') || lower.includes('powershell')) return this.profiles.powershell;
    return this.profiles.zsh;
  }

  /**
   * Build execution flags for spawning the shell inside PTY.
   */
  public buildSpawnArgs(profile: ShellProfile, isLogin: boolean, additionalArgs: string[] = []): string[] {
    const args: string[] = [];
    if (isLogin) {
      args.push(profile.loginFlag);
    }
    if (profile.id === 'zsh' || profile.id === 'bash' || profile.id === 'fish') {
      if (!args.includes(profile.interactiveFlag) && additionalArgs.length === 0) {
        args.push(profile.interactiveFlag);
      }
    }
    return [...args, ...additionalArgs];
  }

  /**
   * Generate required environment variables for first-class macOS terminal behavior.
   */
  public getTerminalEnvironment(customEnv: Record<string, string> = {}): Record<string, string> {
    return {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Cero',
      TERM_PROGRAM_VERSION: '0.1.0',
      CERO_TERMINAL: '1',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      ...customEnv,
    };
  }
}
