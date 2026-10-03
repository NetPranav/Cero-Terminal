/**
 * FailureClassifier.ts — Failure Classification Before Retry (Phase 0.5, Item 10)
 *
 * Categorizes command and tool execution failures before embarking on retries:
 * - MISSING_BINARY: unrecoverable via retry; skip retry, suggest package install or alternative binary
 * - WRONG_FLAG: recoverable; feed flag error back to ReAct loop for self-healing
 * - PERMISSION_DENIED: unrecoverable without elevation; skip retry, suggest sudo via consent flow
 * - TRANSIENT: recoverable; retry allowed with backoff or network retry
 * - SYNTAX_ERROR: recoverable; retry with parse error feedback
 * - TIMEOUT: recoverable; the command was killed for running too long, so retry with a narrower scope
 * - UNKNOWN: general failure; allowed up to retry budget
 */

export type FailureClass =
  | 'MISSING_BINARY'
  | 'WRONG_FLAG'
  | 'PERMISSION_DENIED'
  | 'TRANSIENT'
  | 'SYNTAX_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface FailureClassification {
  category: FailureClass;
  recoverable: boolean;
  reason: string;
  suggestedAction?: string;
  missingBinary?: string;
  flag?: string;
}

export class FailureClassifier {
  public static classify(
    errorText: string,
    exitCode?: number,
    command?: string
  ): FailureClassification {
    const raw = (errorText || '').trim();
    const lower = raw.toLowerCase();

    // 0. Killed by Cero's execution timeout (exit 124, same convention as coreutils `timeout`)
    if (lower.includes('[cero] command timed out') || lower.includes('command timed out and was terminated')) {
      return {
        category: 'TIMEOUT',
        recoverable: true,
        reason: 'The command ran past its time limit and was terminated.',
        suggestedAction: 'Narrow the scope (search a specific directory instead of /, add -maxdepth, limit with head, add -c/--count to ping) or use a faster tool.'
      };
    }

    // 1. Missing Binary / Command Not Found
    // Exit code 127 is standard POSIX for "command not found"
    if (
      exitCode === 127 ||
      lower.includes('command not found') ||
      lower.includes('not recognized as an internal or external command') ||
      lower.includes('is not installed') ||
      (lower.includes('no such file or directory') && /exec:|spawn:|cannot run|cannot execute/i.test(lower)) ||
      /zsh: command not found: (\S+)/i.test(raw) ||
      /bash: (\S+): command not found/i.test(raw) ||
      /which: no (\S+) in/i.test(raw)
    ) {
      let missingBin: string | undefined;
      const zshMatch = raw.match(/command not found:\s*([a-zA-Z0-9_.-]+)/i);
      const bashMatch = raw.match(/([a-zA-Z0-9_.-]+):\s*command not found/i);
      const whichMatch = raw.match(/which: no\s+([a-zA-Z0-9_.-]+)/i);
      if (zshMatch) missingBin = zshMatch[1];
      else if (bashMatch) missingBin = bashMatch[1];
      else if (whichMatch) missingBin = whichMatch[1];
      else if (command) {
        missingBin = command.trim().split(/\s+/)[0];
      }

      return {
        category: 'MISSING_BINARY',
        recoverable: false,
        reason: `Binary or command "${missingBin || 'unknown'}" is not installed on this system.`,
        suggestedAction: missingBin 
          ? `Install "${missingBin}" via your package manager (e.g. apt, brew, pacman) or use an installed alternative tool.` 
          : 'Install the missing dependency or choose an alternative command.',
        missingBinary: missingBin
      };
    }

    // 2. Permission Denied / Root Required
    // Exit code 126 is POSIX for "command cannot execute (permission denied)"
    if (
      exitCode === 126 ||
      lower.includes('permission denied') ||
      lower.includes('operation not permitted') ||
      lower.includes('must be run as root') ||
      lower.includes('must be root') ||
      lower.includes('need to be root') ||
      lower.includes('requires superuser privileges') ||
      lower.includes('access denied') ||
      lower.includes('eacces') ||
      lower.includes('are you root?')
    ) {
      return {
        category: 'PERMISSION_DENIED',
        recoverable: false,
        reason: 'Operation failed due to insufficient permissions or access restrictions.',
        suggestedAction: 'Request elevation with sudo through the consent flow or verify file/directory ownership.'
      };
    }

    // 3. Wrong Flag / Invalid Option
    if (
      lower.includes('unknown option') ||
      lower.includes('unrecognized option') ||
      lower.includes('invalid option') ||
      lower.includes('illegal option') ||
      lower.includes('invalid argument') ||
      lower.includes('unrecognized flag') ||
      lower.includes('unknown flag') ||
      /option .* requires an argument/i.test(lower) ||
      (/usage: /i.test(lower) && exitCode !== 0 && exitCode !== undefined)
    ) {
      // Handles `--flag`, `-f`, and BSD-style `illegal option -- P`
      const flagMatch = raw.match(/(?:unknown|unrecognized|invalid|illegal)\s+(?:option|flag|argument)\s*[:=]?\s*['"`]?(?:--\s+([a-zA-Z0-9_.-]+)|(-{1,2}[a-zA-Z0-9_.-]+))['"`]?/i);
      const flag = flagMatch ? (flagMatch[1] ? `-${flagMatch[1]}` : flagMatch[2]) : undefined;

      return {
        category: 'WRONG_FLAG',
        recoverable: true,
        reason: `Command invoked with unsupported or unrecognized flag${flag ? ` (${flag})` : ''}.`,
        suggestedAction: 'Correct the command flags using POSIX standard or platform-specific syntax.',
        flag
      };
    }

    // 4. Shell Syntax Error
    if (
      lower.includes('syntax error') ||
      lower.includes('parse error') ||
      lower.includes('unexpected token') ||
      lower.includes('syntax error near unexpected token') ||
      lower.includes('unexpected eof') ||
      lower.includes('looking for matching') ||
      (lower.includes('unmatched') && (lower.includes('"') || lower.includes("'") || lower.includes('`')))
    ) {
      return {
        category: 'SYNTAX_ERROR',
        recoverable: true,
        reason: 'Shell syntax error detected (unbalanced quotes, broken pipes, or invalid tokens).',
        suggestedAction: 'Reformat the command with valid POSIX quoting and pipeline syntax.'
      };
    }

    // 5. Transient Network / Resource Glitches
    if (
      lower.includes('timed out') ||
      lower.includes('timeout') ||
      lower.includes('etimedout') ||
      lower.includes('connection reset') ||
      lower.includes('connection refused') ||
      lower.includes('network is unreachable') ||
      lower.includes('temporary failure in name resolution') ||
      lower.includes('resource temporarily unavailable') ||
      lower.includes('eagain') ||
      lower.includes('broken pipe')
    ) {
      return {
        category: 'TRANSIENT',
        recoverable: true,
        reason: 'Transient network, I/O, or timeout error encountered.',
        suggestedAction: 'Retry the command or inspect network connectivity.'
      };
    }

    // 6. Unknown general failure
    return {
      category: 'UNKNOWN',
      recoverable: true,
      reason: raw.length > 0 ? raw.split('\n')[0].slice(0, 150) : 'Command exited with non-zero exit code.',
      suggestedAction: 'Analyze the error output and adjust the command parameters.'
    };
  }
}
