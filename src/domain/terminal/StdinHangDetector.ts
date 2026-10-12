/**
 * StdinHangDetector.ts — Interactive Stdin Hang Detection & Non-Interactive Mitigation
 * 
 * Part of Phase 0.5 (Roadmap item 0.5.18):
 * Detects when spawned agent shell commands hang waiting for interactive user stdin
 * (e.g. apt without -y, [Y/n] confirmations, sudo password prompts).
 * Suggests or injects non-interactive flags (e.g. -y, DEBIAN_FRONTEND=noninteractive).
 */

export const INTERACTIVE_PROMPT_PATTERNS = [
  /\[[Yy]\/[Nn]\]/i,                                  // [y/N], [Y/n]
  /\(yes\/no(?:\/cancel)?\)/i,                       // (yes/no)
  /do you want to continue\?/i,                       // apt/dnf continue prompt
  /press (?:enter|any key) to continue/i,             // Press enter to continue
  /(?:password|passphrase)(?:\s+for\s+[^:\r\n]+)?:\s*$/i, // sudo password prompt or ssh key passphrase
  /enter passphrase/i,
  /select an option:\s*$/i,                           // interactive choice menu
  /are you sure you want to continue connecting/i     // ssh host key confirmation
];

export interface NonInteractiveSuggestion {
  flag: string;
  env?: Record<string, string>;
  rewrittenCommand?: string;
}

export class StdinHangDetector {
  /**
   * Checks if an output string contains an interactive prompt waiting for stdin.
   */
  public static isPromptingForInput(output: string): boolean {
    if (!output) return false;
    const lines = output.split(/\r?\n/).filter(Boolean);
    const lastLines = lines.slice(-5).join('\n');
    return INTERACTIVE_PROMPT_PATTERNS.some(pattern => pattern.test(lastLines));
  }

  /**
   * Suggests non-interactive arguments or env vars for common interactive CLI commands.
   */
  public static suggestNonInteractiveFix(command: string): NonInteractiveSuggestion | null {
    if (!command || typeof command !== 'string') return null;
    const trimmed = command.trim();

    // Debian / Ubuntu: apt / apt-get
    if (/\b(?:apt|apt-get)\s+(?:install|remove|purge|upgrade|dist-upgrade)\b/.test(trimmed)) {
      if (!trimmed.includes('-y') && !trimmed.includes('--yes')) {
        return {
          flag: '-y',
          env: { DEBIAN_FRONTEND: 'noninteractive' },
          rewrittenCommand: `DEBIAN_FRONTEND=noninteractive ${trimmed.replace(/\b(apt|apt-get)\b/, '$1 -y')}`
        };
      }
    }

    // Fedora / RHEL / CentOS: dnf / yum
    if (/\b(?:dnf|yum)\s+(?:install|remove|upgrade|groupinstall)\b/.test(trimmed)) {
      if (!trimmed.includes('-y') && !trimmed.includes('--assumeyes')) {
        return {
          flag: '-y',
          rewrittenCommand: trimmed.replace(/\b(dnf|yum)\b/, '$1 -y')
        };
      }
    }

    // Arch Linux: pacman
    if (/\bpacman\s+-[SRU]/.test(trimmed)) {
      if (!trimmed.includes('--noconfirm')) {
        return {
          flag: '--noconfirm',
          rewrittenCommand: `${trimmed} --noconfirm`
        };
      }
    }

    // Alpine: apk
    if (/\bapk\s+add\b/.test(trimmed)) {
      if (!trimmed.includes('-q') && !trimmed.includes('--no-interactive')) {
        return {
          flag: '-q',
          rewrittenCommand: trimmed.replace(/\bapk add\b/, 'apk add -q')
        };
      }
    }

    // Homebrew: brew
    if (/\bbrew\s+(?:install|upgrade)\b/.test(trimmed)) {
      if (!trimmed.includes('NONINTERACTIVE=1')) {
        return {
          flag: 'NONINTERACTIVE=1',
          env: { NONINTERACTIVE: '1' },
          rewrittenCommand: `NONINTERACTIVE=1 ${trimmed}`
        };
      }
    }

    // npm init
    if (/\bnpm\s+init\b/.test(trimmed) && !trimmed.includes('-y') && !trimmed.includes('--yes')) {
      return {
        flag: '-y',
        rewrittenCommand: trimmed.replace(/\bnpm init\b/, 'npm init -y')
      };
    }

    // pip
    if (/\bpip\s+install\b/.test(trimmed) && !trimmed.includes('--no-input')) {
      return {
        flag: '--no-input',
        rewrittenCommand: `${trimmed} --no-input`
      };
    }

    return null;
  }
}
