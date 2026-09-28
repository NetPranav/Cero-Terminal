/**
 * CommandCapabilityClassifier.ts
 *
 * Implements Phase 0.5, Item 5:
 * Classifies shell commands into three distinct simulation execution paths:
 * 1. real_dry_run: Command supports verified dry-run flags (--dry-run, -n, cargo check, etc.)
 * 2. ast_only: Mutating command without dry-run support (rm, docker run, network calls) -> skips shadow execution
 * 3. full_shadow: Provably read-only command (ps, df, cat, ls, grep) -> executed safely in ephemeral shadow PTY
 */

import { ShellAstParser } from '../security/ShellAstParser';
import { isReadOnlyCommandLine } from '../security/ReadOnlyCommandPolicy';

export type SimulationStrategy = 'full_shadow' | 'real_dry_run' | 'ast_only';

export interface CommandCapability {
  strategy: SimulationStrategy;
  dryRunCommand?: string;
  reason: string;
  isReadOnly: boolean;
}

export class CommandCapabilityClassifier {
  /**
   * Generates a safe dry-run or verification equivalent if the command/tool supports one.
   */
  public static getDryRunCommand(command: string): string | null {
    const trimmed = command.trim();

    // Already explicitly contains dry-run flag
    if (/\b(--dry-run|-n|--check|--no-run)\b/.test(trimmed)) {
      return trimmed;
    }

    // 1. rsync: append --dry-run
    if (/^\s*rsync\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*rsync\b/i, 'rsync --dry-run');
    }

    // 2. cargo build / run / test:
    // cargo build -> cargo check
    // cargo test -> cargo test --no-run
    // cargo run -> cargo check
    if (/^\s*cargo\s+build\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*cargo\s+build\b/i, 'cargo check');
    }
    if (/^\s*cargo\s+test\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*cargo\s+test\b/i, 'cargo test --no-run');
    }
    if (/^\s*cargo\s+run\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*cargo\s+run\b/i, 'cargo check');
    }

    // 3. pip: append --dry-run
    if (/^\s*pip\s+install\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*pip\s+install\b/i, 'pip install --dry-run');
    }

    // 4. npm / pnpm / yarn publish: append --dry-run
    if (/^\s*(?:npm|pnpm|yarn)\s+publish\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*(npm|pnpm|yarn)\s+publish\b/i, '$1 publish --dry-run');
    }

    // 5. make: make -n
    if (/^\s*make\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*make\b/i, 'make -n');
    }

    // 6. ansible-playbook: --check
    if (/^\s*ansible-playbook\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*ansible-playbook\b/i, 'ansible-playbook --check');
    }

    // 7. terraform apply: terraform plan
    if (/^\s*terraform\s+apply\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*terraform\s+apply\b/i, 'terraform plan');
    }

    // 8. kubectl apply/delete/create: --dry-run=client
    if (/^\s*kubectl\s+(apply|delete|create)\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*kubectl\s+(apply|delete|create)\b/i, 'kubectl $1 --dry-run=client');
    }

    // 9. git clean: git clean -n
    if (/^\s*git\s+clean\b/i.test(trimmed)) {
      return trimmed.replace(/^\s*git\s+clean\b/i, 'git clean -n');
    }


    // 10. Process signal inspection: kill -<sig> <pid> -> kill -0 <pid>
    const killMatch = trimmed.match(/^\s*kill\s+(?:-[a-zA-Z0-9]+\s+)*(\d+)\s*$/i);
    if (killMatch) {
      return `kill -0 ${killMatch[1]}`;
    }

    return null;
  }

  /**
   * Classifies the command into full_shadow, real_dry_run, or ast_only.
   */
  public static classify(commandLine: string): CommandCapability {
    const trimmed = commandLine.trim();
    if (!trimmed) {
      return {
        strategy: 'ast_only',
        reason: 'Empty command line',
        isReadOnly: true
      };
    }

    // Check syntax and parse AST
    let ast;
    try {
      ast = ShellAstParser.parse(trimmed);
    } catch (err: any) {
      return {
        strategy: 'ast_only',
        reason: `AST Parse error: ${err.message}`,
        isReadOnly: false
      };
    }

    const simpleCmds = ShellAstParser.getAllSimpleCommands(ast);
    if (simpleCmds.length === 0) {
      return {
        strategy: 'ast_only',
        reason: 'No commands extracted from AST',
        isReadOnly: false
      };
    }

    // If any command has file write redirection (> or >>), it mutates the disk!
    const hasWriteRedirection = simpleCmds.some(c =>
      c.redirects && c.redirects.some(r =>
        (r.op === '>' || r.op === '>>' || r.op === '&>' || r.op === '2>') && r.target !== '/dev/null')
    );
    if (hasWriteRedirection) {
      return {
        strategy: 'ast_only',
        reason: 'Command contains file write redirection (> or >>), bypassing shadow execution for safety',
        isReadOnly: false
      };
    }

    // Check for catastrophic / high-risk destructive operations
    const destructiveCheck = ShellAstParser.isDestructiveOperation(ast);
    if (destructiveCheck.isDestructive) {
      return {
        strategy: 'ast_only',
        reason: `Catastrophic destructive operation detected: ${destructiveCheck.reasons.join('; ')}`,
        isReadOnly: false
      };
    }

    // Check if the command matches a known dry-run capability
    const dryRunCmd = this.getDryRunCommand(trimmed);
    if (dryRunCmd) {
      return {
        strategy: 'real_dry_run',
        dryRunCommand: dryRunCmd,
        reason: `Command supports verified dry-run execution (${dryRunCmd})`,
        isReadOnly: false
      };
    }

    // Read-only only when every command in the line is a read-only form (ReadOnlyCommandPolicy)
    const readOnly = isReadOnlyCommandLine(trimmed);
    if (readOnly.readOnly) {
      return {
        strategy: 'full_shadow',
        reason: 'All commands in pipeline are provably read-only diagnostics',
        isReadOnly: true
      };
    }

    // Mutating command without dry-run support (rm, docker run, curl mutating, apt, etc.)
    return {
      strategy: 'ast_only',
      reason: 'Mutating command has no dry-run flag support, skipping shadow execution for safety',
      isReadOnly: false
    };
  }
}
