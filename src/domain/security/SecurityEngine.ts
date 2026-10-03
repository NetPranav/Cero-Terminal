import { ShellAstParser } from './ShellAstParser';
import { isReadOnlyCommandLine } from './ReadOnlyCommandPolicy';

export type RiskLevel = 'SAFE' | 'SENSITIVE' | 'ADMIN' | 'CRITICAL' | 'UNKNOWN';

export type PolicyCategory =
  | 'privacy-capture'
  | 'filesystem-read'
  | 'filesystem-write'
  | 'filesystem-delete'
  | 'process-inspect'
  | 'process-kill'
  | 'package-management'
  | 'network-egress'
  | 'network-config'
  | 'privilege-escalation'
  | 'ui-input'
  | 'git-mutation'
  | 'docker-lifecycle'
  | 'shell-generic'
  | 'system-settings';

export type PolicyPosture = 'allow' | 'ask' | 'deny';

export interface CategoryPolicy {
  category: PolicyCategory;
  defaultPosture: PolicyPosture;
  consentRequired: boolean;
  requiresPassword?: boolean;
}

export const DEFAULT_CATEGORY_POLICIES: Record<PolicyCategory, CategoryPolicy> = {
  'privacy-capture': { category: 'privacy-capture', defaultPosture: 'ask', consentRequired: true },
  'filesystem-read': { category: 'filesystem-read', defaultPosture: 'allow', consentRequired: false },
  'filesystem-write': { category: 'filesystem-write', defaultPosture: 'ask', consentRequired: true },
  'filesystem-delete': { category: 'filesystem-delete', defaultPosture: 'ask', consentRequired: true, requiresPassword: true },
  'process-inspect': { category: 'process-inspect', defaultPosture: 'allow', consentRequired: false },
  'process-kill': { category: 'process-kill', defaultPosture: 'ask', consentRequired: true, requiresPassword: true },
  'package-management': { category: 'package-management', defaultPosture: 'ask', consentRequired: true },
  'network-egress': { category: 'network-egress', defaultPosture: 'ask', consentRequired: true },
  'network-config': { category: 'network-config', defaultPosture: 'ask', consentRequired: true, requiresPassword: true },
  'privilege-escalation': { category: 'privilege-escalation', defaultPosture: 'ask', consentRequired: true, requiresPassword: true },
  'ui-input': { category: 'ui-input', defaultPosture: 'ask', consentRequired: true },
  'git-mutation': { category: 'git-mutation', defaultPosture: 'ask', consentRequired: true },
  'docker-lifecycle': { category: 'docker-lifecycle', defaultPosture: 'ask', consentRequired: true },
  'shell-generic': { category: 'shell-generic', defaultPosture: 'ask', consentRequired: true },
  'system-settings': { category: 'system-settings', defaultPosture: 'ask', consentRequired: true, requiresPassword: true },
};

export interface RiskAnalysisResult {
  score: number; // 0-100
  level: RiskLevel;
  explanation: string;
  requiresPassword?: boolean;
  requiresConsent?: boolean;
  categories?: PolicyCategory[];
}

export interface ISecurityEngine {
  analyzeCommand(command: string, args?: string[], explanation?: string): RiskAnalysisResult;
  analyzeWorkflow(actions: any[]): RiskAnalysisResult;
  calculateRisk(capabilityId: string, input: any): RiskAnalysisResult;
}

export class SecurityEngine implements ISecurityEngine {
  analyzeCommand(command: string, args: string[] = [], explanation?: string): RiskAnalysisResult {
    const fullCmd = [command, ...args].join(' ').trim();
    const lowerCmd = fullCmd.toLowerCase();

    // 0. Obfuscated Execution Detection (Phase 0.5, Item 20)
    const obfuscation = ShellAstParser.isObfuscatedExecution(fullCmd);
    if (obfuscation.isObfuscated) {
      return {
        score: 75,
        level: 'SENSITIVE',
        explanation: `Obfuscated shell execution detected (${obfuscation.reasons.join('; ')}). Explicit user consent required.`,
        requiresPassword: false,
        requiresConsent: true,
        categories: ['shell-generic']
      };
    }

    // Screen, camera and microphone capture: always asked, whatever the permission profile
    if (/(?:^|[\s;&|(])(?:screencapture|grim|scrot|spectacle|gnome-screenshot|imagesnap|flameshot)\b|\bimport\s+-window\b|\bffmpeg\b.*\b(?:avfoundation|x11grab|kmsgrab|v4l2|pulse|alsa)\b|\b(?:arecord|rec|parecord)\s/.test(lowerCmd)) {
      return {
        score: 70,
        level: 'SENSITIVE',
        explanation: 'Captures your screen, camera or microphone. Needs your approval every time.',
        requiresPassword: false,
        requiresConsent: true,
        categories: ['privacy-capture']
      };
    }

    // Strip leading environment variable assignments (e.g. "LC_ALL=C LANG=C ps ...", "VAR=val cmd")
    // to accurately classify the underlying binary while preventing evasion.
    const cleanCmd = lowerCmd.replace(/^(?:[a-z_][a-z0-9_]*=[^\s]*\s+)+/i, '').trim();

    // 1. Super-User / Administrator Commands
    if (cleanCmd.includes('sudo ') || cleanCmd.includes('su ') || cleanCmd.startsWith('sudo') || cleanCmd.includes('chown ') || cleanCmd.includes('chmod ') ||
        lowerCmd.includes('sudo ') || lowerCmd.includes('su ') || lowerCmd.startsWith('sudo') || lowerCmd.includes('chown ') || lowerCmd.includes('chmod ')) {
      if (cleanCmd.includes('rm ') || cleanCmd.includes('mkfs') || cleanCmd.includes('dd ') ||
          lowerCmd.includes('rm ') || lowerCmd.includes('mkfs') || lowerCmd.includes('dd ')) {
        return { 
          score: 100, 
          level: 'CRITICAL', 
          explanation: 'Destructive super-user system command detected. Mandatory explicit user approval required.',
          requiresPassword: true,
          requiresConsent: true,
          categories: ['privilege-escalation', 'filesystem-delete']
        };
      }
      return { 
        score: 90, 
        level: 'ADMIN', 
        explanation: 'Super-user / administrative privilege elevation detected. Explicit user approval required.',
        requiresPassword: true,
        requiresConsent: true,
        categories: ['privilege-escalation']
      };
    }

    // 2. Destructive Deletions (Filesystem, Rm, Trash, Rmdir, Unlink)
    if (cleanCmd.startsWith('rm ') || cleanCmd.includes(' rm ') || cleanCmd.startsWith('rmdir') || cleanCmd.includes('trash') || cleanCmd.includes('unlink') ||
        lowerCmd.startsWith('rm ') || lowerCmd.includes(' rm ') || lowerCmd.startsWith('rmdir') || lowerCmd.includes('trash') || lowerCmd.includes('unlink')) {
      return { 
        score: 95, 
        level: 'CRITICAL', 
        explanation: 'Filesystem deletion or trash operation detected. Deleting anything strictly requires explicit user approval.',
        requiresPassword: true,
        requiresConsent: true,
        categories: ['filesystem-delete']
      };
    }

    // 3. Safe read-only commands (checked before the substring rules below, so read-only forms
    // such as `systemctl is-active docker` or `ps aux | grep kill` do not demand a password). Every command in the line (pipelines, && / ; lists, loop
    // bodies, $(...) substitutions) must be a read-only form and nothing may be written to a
    // file; see ReadOnlyCommandPolicy. Judging only the first word let `ls && <anything>`,
    // `echo x >> ~/.bashrc` and `ip link set wlan0 down` run without consent.
    const parts = cleanCmd.split(/\s+/);
    const firstWord = parts[0] || '';
    const secondWord = parts[1] || '';
    const isSingleCommand = !/[;&|<>`$()]/.test(cleanCmd);
    const isDevCheck = isSingleCommand
      && ['npm', 'pnpm', 'yarn', 'bun', 'cargo', 'go', 'pytest', 'vitest'].includes(firstWord)
      && ['test', 'check', 'lint', 'audit', 'version', '--version', '-v'].includes(secondWord);

    if (isReadOnlyCommandLine(fullCmd).readOnly || isDevCheck) {
      return {
        score: 5,
        level: 'SAFE',
        explanation: 'Safe read-only or developer test command.',
        requiresPassword: false,
        requiresConsent: false,
        categories: ['filesystem-read', 'process-inspect']
      };
    }

    // 4. Mid-Level System Commands (Process termination, Network/Hardware toggles, Daemons)
    if (cleanCmd.startsWith('kill') || cleanCmd.includes(' kill ') || cleanCmd.startsWith('pkill') || cleanCmd.includes('pkill ') || cleanCmd.startsWith('killall') || cleanCmd.includes('ifconfig') || cleanCmd.includes('systemctl') || cleanCmd.includes('service ') ||
        lowerCmd.startsWith('kill') || lowerCmd.includes(' kill ') || lowerCmd.startsWith('pkill') || lowerCmd.includes('pkill ') || lowerCmd.startsWith('killall') || lowerCmd.includes('ifconfig') || lowerCmd.includes('systemctl') || lowerCmd.includes('service ')) {
      const isKill = cleanCmd.startsWith('kill') || cleanCmd.includes('kill') || cleanCmd.startsWith('pkill') ||
                     lowerCmd.startsWith('kill') || lowerCmd.includes('kill') || lowerCmd.startsWith('pkill');
      return { 
        score: 85, 
        level: 'ADMIN', 
        explanation: 'Mid-level operating system modification or process termination detected. Explicit user approval required.',
        requiresPassword: true,
        requiresConsent: true,
        categories: [isKill ? 'process-kill' : 'network-config']
      };
    }

    // 5. Session & Screen Lock Commands
    if (cleanCmd.includes('displaysleepnow') || cleanCmd.includes('lockworkstation') || cleanCmd.includes('lock-session') ||
        lowerCmd.includes('displaysleepnow') || lowerCmd.includes('lockworkstation') || lowerCmd.includes('lock-session')) {
      return {
        score: 65,
        level: 'SENSITIVE',
        explanation: 'Operating system screen lock command detected. User confirmation required before locking the display.',
        requiresPassword: false,
        requiresConsent: true,
        categories: ['system-settings']
      };
    }

    // 6. Generative Long-Tail Shell Command Execution
    // Requires explicit user consent and presents 1-line plain English explanation without requiring system password
    let genCategory: PolicyCategory = 'shell-generic';
    if (firstWord === 'git') genCategory = 'git-mutation';
    else if (firstWord === 'docker') genCategory = 'docker-lifecycle';
    else if (['npm', 'pnpm', 'yarn', 'bun', 'cargo', 'pip', 'pip3'].includes(firstWord)) genCategory = 'package-management';
    else if (['curl', 'wget', 'ssh', 'scp'].includes(firstWord)) genCategory = 'network-egress';

    return {
      score: 55,
      level: 'SENSITIVE',
      explanation: explanation || `Executes terminal command: "${fullCmd}". User confirmation required before execution.`,
      requiresPassword: false,
      requiresConsent: true,
      categories: [genCategory]
    };
  }

  analyzeWorkflow(actions: any[]): RiskAnalysisResult {
    let highestScore = 0;
    let requiresPassword = false;
    let requiresConsent = false;
    const categoriesSet = new Set<PolicyCategory>();

    for (const action of actions) {
      const id = action?.capabilityId || action?.tool || '';
      const risk = this.calculateRisk(id, action?.parameters || action?.entities || {});
      if (risk.categories) {
        for (const cat of risk.categories) categoriesSet.add(cat);
      }
      if (risk.score > highestScore) highestScore = risk.score;
      if (risk.requiresPassword) requiresPassword = true;
      if (risk.requiresConsent) requiresConsent = true;
    }
    
    if (actions.length > 5) highestScore += 10;

    return {
      score: highestScore > 100 ? 100 : highestScore,
      level: highestScore >= 80 ? 'CRITICAL' : highestScore > 50 ? 'SENSITIVE' : 'SAFE',
      explanation: requiresPassword ? 'Workflow contains deletion, super-user, or mid-level system commands requiring explicit approval.' : 'Workflow risk analyzed.',
      requiresPassword,
      requiresConsent,
      categories: Array.from(categoriesSet)
    };
  }

  calculateRisk(capabilityId: string, input: any): RiskAnalysisResult {
    if (capabilityId === 'shell.core' || capabilityId === 'shell.execute' || capabilityId === 'terminal.run') {
      return this.analyzeCommand(input?.command || input?.cmd || '', input?.args || [], input?.explanation);
    }
    
    // 1. Filesystem Deletions and Modifications
    if (capabilityId === 'fs.core' || capabilityId.startsWith('filesystem.')) {
      const op = (input?.operation || capabilityId.replace('filesystem.', '')).toLowerCase();
      const path = String(input?.path || input?.source || input?.target || '');
      if (op === 'delete' || op === 'trash' || op === 'remove' || op === 'rm' || op === 'rmdir') {
        return { 
          score: 100, 
          level: 'CRITICAL', 
          explanation: `Destructive filesystem deletion (${op}) on '${path}'. All deletion operations strictly require explicit user approvalentication.`,
          requiresPassword: true,
          requiresConsent: true,
          categories: ['filesystem-delete']
        };
      }
      if (op === 'permissions' || op === 'chmod' || op === 'chown' || op === 'move' || op === 'rename') {
        return {
          score: 80,
          level: 'ADMIN',
          explanation: `Filesystem alteration (${op}) on '${path}'. Mid-level file modifications require explicit user approval.`,
          requiresPassword: true,
          requiresConsent: true,
          categories: ['filesystem-write']
        };
      }
      if (op === 'read' || op === 'list' || op === 'mkdir' || op === 'create' || op === 'cd' || op === 'navigate' || op === 'search' || op === 'locate_files') {
        return {
          score: 5,
          level: 'SAFE',
          explanation: 'Safe non-destructive filesystem read/navigation operation.',
          requiresPassword: false,
          requiresConsent: false,
          categories: ['filesystem-read']
        };
      }
    }

    // 2. Mid-Level Process & Application Management
    if (capabilityId.startsWith('system.') || capabilityId.startsWith('application.') || capabilityId.startsWith('process.')) {
      const action = capabilityId.toLowerCase();
      if (action.includes('kill') || action.includes('stop') || action.includes('terminate') || action.includes('close') || action.includes('restart') || action.includes('shutdown') || input?.command?.includes('pkill')) {
        return {
          score: 85,
          level: 'ADMIN',
          explanation: `Mid-level process control or application termination (${capabilityId}) detected. Explicit user approval is strictly required.`,
          requiresPassword: true,
          requiresConsent: true,
          categories: ['process-kill']
        };
      }
      if (action.includes('lock') || action.includes('displaysleepnow')) {
        return {
          score: 65,
          level: 'SENSITIVE',
          explanation: `System display or session lock (${capabilityId}) detected. User confirmation required before locking screen.`,
          requiresPassword: false,
          requiresConsent: true,
          categories: ['system-settings']
        };
      }
    }

    // 3. Mid-Level Network & Hardware Controls
    if (capabilityId.startsWith('network.') || capabilityId.startsWith('bluetooth.') || capabilityId.startsWith('hardware.')) {
      const action = capabilityId.toLowerCase();
      // Exclude basic bluetooth toggles from ADMIN risk
      if (capabilityId.includes('bluetooth') && (action.includes('on') || action.includes('off') || action.includes('connect') || action.includes('disconnect'))) {
        return {
          score: 30,
          level: 'SAFE',
          explanation: 'Standard user-level Bluetooth control.',
          requiresPassword: false,
          requiresConsent: false,
          categories: ['system-settings']
        };
      }
      
      if (action.includes('toggle') || action.includes('off') || action.includes('on') || action.includes('disconnect') || action.includes('bind') || action.includes('config')) {
        return {
          score: 80,
          level: 'ADMIN',
          explanation: `Mid-level network/hardware system configuration (${capabilityId}) detected. Requires explicit user approval.`,
          requiresPassword: true,
          requiresConsent: true,
          categories: ['network-config']
        };
      }
    }

    // 4. Git, Docker, SSH & Software Package Operations
    if (capabilityId.startsWith('git.')) {
      const gitOp = capabilityId.replace('git.', '').toLowerCase();
      if (['push', 'commit', 'merge', 'checkout', 'clone', 'stash'].includes(gitOp)) {
        return {
          score: 55,
          level: 'SENSITIVE',
          explanation: `Git repository modification (${capabilityId}) detected. Requires user review.`,
          requiresPassword: false,
          requiresConsent: false,
          categories: ['git-mutation']
        };
      }
    }

    if (capabilityId.startsWith('docker.')) {
      const docOp = capabilityId.replace('docker.', '').toLowerCase();
      if (['stop', 'restart', 'compose_down', 'compose_up', 'exec'].includes(docOp)) {
        return {
          score: 65,
          level: 'SENSITIVE',
          explanation: `Docker container lifecycle modification (${capabilityId}) detected. Requires user review.`,
          requiresPassword: false,
          requiresConsent: false,
          categories: ['docker-lifecycle']
        };
      }
    }

    if (capabilityId === 'developer.ssh' || capabilityId.startsWith('ssh.')) {
      return {
        score: 60,
        level: 'SENSITIVE',
        explanation: 'Remote SSH connection detected. Requires user review.',
        requiresPassword: false,
        requiresConsent: false,
        categories: ['network-egress']
      };
    }

    if (capabilityId === 'application.install' || capabilityId === 'application.uninstall' || capabilityId === 'application.update') {
      return {
        score: 70,
        level: 'SENSITIVE',
        explanation: `Software package management operation (${capabilityId}) detected. Requires user review.`,
        requiresPassword: false,
        requiresConsent: false,
        categories: ['package-management']
      };
    }

    return {
      score: 20,
      level: 'SAFE',
      explanation: 'Standard read-only or low-risk capability execution.',
      requiresPassword: false,
      requiresConsent: false,
      categories: ['shell-generic']
    };
  }
}
