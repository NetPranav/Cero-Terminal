import { ExecutionPreviewPlan } from './ExecutionEngine';
import { ISecurityEngine, RiskAnalysisResult, SecurityEngine } from './SecurityEngine';
import { ShellAstParser } from './ShellAstParser';

export type ShellGuardAction = 'allow' | 'require_approval' | 'deny';

export interface ShellGuardResult {
  action: ShellGuardAction;
  command: string;
  risk: RiskAnalysisResult;
  previewPlan?: ExecutionPreviewPlan;
  blockReason?: string;
}

/**
 * Intercepts direct shell input before it reaches the PTY.
 * Routes dangerous commands through the same risk analysis as AI workflows.
 */
export class ShellCommandGuard {
  private static instance: ShellCommandGuard;

  static getInstance(securityEngine?: ISecurityEngine): ShellCommandGuard {
    if (!ShellCommandGuard.instance) {
      ShellCommandGuard.instance = new ShellCommandGuard(securityEngine ?? new SecurityEngine());
    }
    return ShellCommandGuard.instance;
  }

  constructor(private readonly securityEngine: ISecurityEngine) {}

  evaluate(commandLine: string): ShellGuardResult {
    const command = commandLine.trim();
    if (!command) {
      return {
        action: 'allow',
        command,
        risk: { score: 0, level: 'SAFE', explanation: 'Empty command.' }
      };
    }

    // 1. Syntactic AST Validation
    const syntax = ShellAstParser.validateSyntax(command);
    if (!syntax.valid) {
      return {
        action: 'deny',
        command,
        risk: {
          score: 95,
          level: 'CRITICAL',
          explanation: `Shell AST syntax error: ${syntax.error}`,
          requiresPassword: false,
          requiresConsent: false
        },
        blockReason: `Syntax validation failed: ${syntax.error}`
      };
    }

    // Check piped execution risk on the whole command line first (e.g. curl ... | bash)
    const wholePipeRisk = this.analyzePipedExecution(command);

    let highestRisk: RiskAnalysisResult = wholePipeRisk || {
      score: 0,
      level: 'SAFE',
      explanation: 'Safe command.',
      requiresPassword: false,
      requiresConsent: false
    };

    try {
      const ast = ShellAstParser.parse(command);

      // Check catastrophic destructive operations across AST (rm -rf /, dd overwrite, mkfs, etc.)
      const destructive = ShellAstParser.isDestructiveOperation(ast);

      const simpleCommands = ShellAstParser.getAllSimpleCommands(ast);

      for (const cmdNode of simpleCommands) {
        const fullCmdStr = cmdNode.rawText || `${cmdNode.name} ${cmdNode.args.join(' ')}`;
        const subProtectedPath = this.detectProtectedPathDeletion(fullCmdStr);
        if (subProtectedPath) {
          return {
            action: 'deny',
            command,
            risk: {
              score: 100,
              level: 'CRITICAL',
              explanation: `Hard block: destructive operation targeting protected path '${subProtectedPath}'.`,
              requiresPassword: true,
              requiresConsent: true
            },
            blockReason: `Cannot delete or modify protected system path: ${subProtectedPath}`
          };
        }

        const binary = cmdNode.name;
        const args = cmdNode.args;
        let subRisk = this.securityEngine.analyzeCommand(binary, args);

        // Catch single-token destructive binaries missed by spaced patterns
        subRisk = this.enhanceRiskForEdgeCases(fullCmdStr, binary, subRisk);

        const pipeRisk = this.analyzePipedExecution(fullCmdStr);
        if (pipeRisk && pipeRisk.score > subRisk.score) {
          subRisk = pipeRisk;
        }

        if (subRisk.score > highestRisk.score) {
          highestRisk = {
            ...subRisk,
            requiresPassword: highestRisk.requiresPassword || subRisk.requiresPassword,
            requiresConsent: highestRisk.requiresConsent || subRisk.requiresConsent
          };
        } else {
          highestRisk = {
            ...highestRisk,
            requiresPassword: highestRisk.requiresPassword || subRisk.requiresPassword,
            requiresConsent: highestRisk.requiresConsent || subRisk.requiresConsent
          };
        }
      }

      if (destructive.isDestructive) {
        highestRisk = {
          score: Math.max(highestRisk.score, 98),
          level: 'CRITICAL',
          explanation: destructive.reasons.join('; '),
          requiresPassword: true,
          requiresConsent: true
        };
      }
    } catch {
      // Fallback to splitting if AST parse encountered edge case
      const subCommands = this.splitCompoundCommands(command);
      for (const subCmd of subCommands) {
        const subProtectedPath = this.detectProtectedPathDeletion(subCmd);
        if (subProtectedPath) {
          return {
            action: 'deny',
            command,
            risk: {
              score: 100,
              level: 'CRITICAL',
              explanation: `Hard block: destructive operation targeting protected path '${subProtectedPath}'.`,
              requiresPassword: true,
              requiresConsent: true
            },
            blockReason: `Cannot delete or modify protected system path: ${subProtectedPath}`
          };
        }
        const parts = subCmd.split(/\s+/);
        const binary = parts[0];
        const args = parts.slice(1);
        let subRisk = this.securityEngine.analyzeCommand(binary, args);
        subRisk = this.enhanceRiskForEdgeCases(subCmd, binary, subRisk);
        if (subRisk.score > highestRisk.score) {
          highestRisk = subRisk;
        }
      }
    }

    if (this.shouldRequireApproval(highestRisk)) {
      return {
        action: 'require_approval',
        command,
        risk: highestRisk,
        previewPlan: this.toPreviewPlan(command, highestRisk)
      };
    }

    return { action: 'allow', command, risk: highestRisk };
  }

  /**
   * Splits compound commands on unquoted operators (;, &&, ||, |, &)
   */
  public splitCompoundCommands(commandLine: string): string[] {
    const subCommands: string[] = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let isEscaped = false;

    for (let i = 0; i < commandLine.length; i++) {
      const char = commandLine[i];

      if (isEscaped) {
        current += char;
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        current += char;
        continue;
      }

      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        current += char;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        current += char;
        continue;
      }

      if (!inSingleQuote && !inDoubleQuote) {
        // Check for && or ||
        if (
          (char === '&' && commandLine[i + 1] === '&') ||
          (char === '|' && commandLine[i + 1] === '|')
        ) {
          if (current.trim()) subCommands.push(current.trim());
          current = '';
          i++; // Skip second operator character
          continue;
        }

        // Check for ; or single | or &
        if (char === ';' || char === '|' || char === '&') {
          if (current.trim()) subCommands.push(current.trim());
          current = '';
          continue;
        }
      }

      current += char;
    }

    if (current.trim()) {
      subCommands.push(current.trim());
    }

    return subCommands.length > 0 ? subCommands : [commandLine.trim()];
  }

  private shouldRequireApproval(risk: RiskAnalysisResult): boolean {
    return (
      risk.level === 'CRITICAL' ||
      risk.level === 'ADMIN' ||
      risk.requiresConsent === true ||
      risk.requiresPassword === true
    );
  }

  private enhanceRiskForEdgeCases(
    command: string,
    binary: string,
    risk: RiskAnalysisResult
  ): RiskAnalysisResult {
    const lowerBinary = binary.toLowerCase();
    const lowerCmd = command.toLowerCase();

    const destructiveBinaries = ['rm', 'rmdir', 'unlink', 'shred', 'truncate'];
    if (destructiveBinaries.includes(lowerBinary)) {
      return {
        score: 95,
        level: 'CRITICAL',
        explanation: 'Filesystem deletion command detected. Explicit user consent required before execution.',
        requiresPassword: true,
        requiresConsent: true
      };
    }

    const adminBinaries = ['sudo', 'su', 'doas', 'chmod', 'chown', 'chgrp', 'kill', 'pkill', 'killall'];
    if (adminBinaries.includes(lowerBinary)) {
      return {
        score: 90,
        level: 'ADMIN',
        explanation: 'Administrative or process-control shell command detected. Explicit user consent required.',
        requiresPassword: true,
        requiresConsent: true
      };
    }

    if (/\b(mkfs|dd|diskutil\s+erase|format)\b/.test(lowerCmd)) {
      return {
        score: 100,
        level: 'CRITICAL',
        explanation: 'Disk formatting or destructive block-device command detected.',
        requiresPassword: true,
        requiresConsent: true
      };
    }

    return risk;
  }

  private analyzePipedExecution(command: string): RiskAnalysisResult | null {
    const lower = command.toLowerCase();
    if (/\|\s*(bash|sh|zsh|fish|dash|ksh|csh|tcsh)\b/.test(lower)) {
      return {
        score: 100,
        level: 'CRITICAL',
        explanation: 'Piping remote or untrusted content into a shell interpreter is blocked without explicit authorization.',
        requiresPassword: true,
        requiresConsent: true
      };
    }

    if (/\bcurl\b.*\|\s*(bash|sh)\b/.test(lower) || /\bwget\b.*\|\s*(bash|sh)\b/.test(lower)) {
      return {
        score: 100,
        level: 'CRITICAL',
        explanation: 'Remote script download piped to shell detected — high malware risk.',
        requiresPassword: true,
        requiresConsent: true
      };
    }

    return null;
  }

  private detectProtectedPathDeletion(command: string): string | null {
    const protectedPaths = ['/System', '/usr', '/bin', '/sbin', '/etc', '/var', '/Windows', '/Library'];
    const parts = command.trim().split(/\s+/);
    if (parts.length === 0) return null;

    let binary = parts[0].toLowerCase();
    let restParts = parts.slice(1);
    if (binary === 'sudo' || binary === 'doas') {
      binary = (restParts[0] || '').toLowerCase();
      restParts = restParts.slice(1);
    }

    const destructiveBinaries = ['rm', 'rmdir', 'unlink', 'shred', 'trash', 'mv'];
    if (!destructiveBinaries.includes(binary)) {
      return null;
    }

    const targets = restParts.filter((token) => !token.startsWith('-'));

    for (const target of targets) {
      const normalized = target.replace(/^['"]|['"]$/g, '');
      if (normalized === '/' || normalized === '~' || normalized === '$HOME' || normalized === '${HOME}') {
        return normalized;
      }
      for (const protectedPath of protectedPaths) {
        if (normalized === protectedPath || normalized.startsWith(`${protectedPath}/`)) {
          return protectedPath;
        }
      }
    }

    return null;
  }

  private toPreviewPlan(command: string, risk: RiskAnalysisResult): ExecutionPreviewPlan {
    return {
      capabilityId: 'shell.direct',
      parameters: { command },
      riskLevel: risk.level,
      riskScore: risk.score,
      permissionsRequired: ['ShellExecution', 'user_consent'],
      explanation: risk.explanation,
      requiresPassword: risk.requiresPassword ?? true,
      requiresConsent: risk.requiresConsent ?? true
    };
  }
}
