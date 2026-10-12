/**
 * StdinHangDetector.ts — Interactive Stdin Hang Detection & Non-Interactive Mitigation
 * 
 * Part of Phase 0.5 (Roadmap item 0.5.18):
 * Detects when spawned agent shell commands hang waiting for interactive user stdin
 * (e.g. winget agreement prompts, [Y/n] confirmations, password prompts).
 * Suggests or injects non-interactive flags (e.g. --accept-package-agreements, choco -y, npm init -y).
 */

export const INTERACTIVE_PROMPT_PATTERNS = [
  /\[[Yy]\/[Nn]\]/i,                                  // [y/N], [Y/n]
  /\(yes\/no(?:\/cancel)?\)/i,                       // (yes/no)
  /do you want to continue\?/i,                       // package manager continue prompt
  /do you agree to all the source agreements terms\?/i, // winget first run
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

    // winget asks to accept the source and package agreements the first time
    if (/^winget\s+(?:install|upgrade|uninstall)\b/i.test(trimmed) && !/--accept-source-agreements/i.test(trimmed)) {
      const accept = /^winget\s+uninstall\b/i.test(trimmed) ? '--accept-source-agreements' : '--accept-source-agreements --accept-package-agreements';
      return {
        flag: accept,
        rewrittenCommand: `${trimmed} ${accept}`
      };
    }

    // Chocolatey: choco
    if (/^choco\s+(?:install|upgrade|uninstall)\b/i.test(trimmed) && !/(?:^|\s)(?:-y|--yes|--confirm)\b/i.test(trimmed)) {
      return {
        flag: '-y',
        rewrittenCommand: `${trimmed} -y`
      };
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
