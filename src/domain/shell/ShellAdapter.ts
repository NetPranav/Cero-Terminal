// TODO(3.2): add the Windows profiles (pwsh, powershell, cmd, gitbash, wsl) with prompt patterns and quoting
export type SupportedShell = 'bash' | 'nushell' | 'powershell';

export interface ShellProfile {
  id: SupportedShell;
  name: string;
  defaultPath: string;
  loginFlag: string;
  interactiveFlag: string;
  configFilePath: string;
  supportsTrueColor: boolean;
}

export class ShellAdapter {
  private static instance: ShellAdapter;
  
  private profiles: Record<SupportedShell, ShellProfile> = {
    bash: {
      id: 'bash',
      name: 'Bash',
      defaultPath: 'bash.exe', // Git Bash
      loginFlag: '--login',
      interactiveFlag: '-i',
      configFilePath: '.bashrc',
      supportsTrueColor: true,
    },
    nushell: {
      id: 'nushell',
      name: 'Nushell',
      defaultPath: 'nu.exe',
      loginFlag: '--login',
      interactiveFlag: '-i',
      configFilePath: '.config/nushell/config.nu',
      supportsTrueColor: true,
    },
    powershell: {
      id: 'powershell',
      name: 'PowerShell',
      defaultPath: 'powershell.exe', // Windows PowerShell 5.1 is always installed
      loginFlag: '-NoLogo',
      interactiveFlag: '-NoExit',
      // TODO(3.2): resolve with `$PROFILE`, which follows a OneDrive-redirected Documents folder
      configFilePath: 'Documents/WindowsPowerShell/Microsoft.PowerShell_profile.ps1',
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
   * The profile for the user's default shell path; PowerShell when it is unknown.
   */
  public detectLoginShell(shellPath?: string): ShellProfile {
    return this.getProfile(shellPath || 'powershell.exe');
  }

  /**
   * Retrieve profile details by shell ID or binary name.
   */
  public getProfile(shellId: string): ShellProfile {
    const lower = shellId.toLowerCase();
    if (lower.includes('pwsh') || lower.includes('powershell')) return this.profiles.powershell;
    if (lower.includes('bash')) return this.profiles.bash;
    if (/(^|[\\/])nu(\.exe)?$/.test(lower) || lower === 'nushell') return this.profiles.nushell;
    return this.profiles.powershell;
  }

  /**
   * Build execution flags for spawning the shell inside PTY.
   */
  public buildSpawnArgs(profile: ShellProfile, isLogin: boolean, additionalArgs: string[] = []): string[] {
    const args: string[] = [];
    if (isLogin) {
      args.push(profile.loginFlag);
    }
    if (profile.id === 'bash') {
      if (!args.includes(profile.interactiveFlag) && additionalArgs.length === 0) {
        args.push(profile.interactiveFlag);
      }
    }
    return [...args, ...additionalArgs];
  }

  /**
   * Environment variables every Cero terminal gets.
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
