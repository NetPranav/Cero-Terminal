/**
 * Sentinel Terminal — Autonomous Demonstration & Pattern Learning Engine
 *
 * Enables Sentinel to learn new terminal workflows directly from human demonstrations
 * or explicit instruction. When an AI goal fails or is unknown, and the user executes
 * the manual solution in the terminal, this engine correlates the intent with the command,
 * extracts generalized variable placeholders, and persists the learned pattern across sessions.
 */

import { invoke } from '@tauri-apps/api/core';
import { isClearlyMutating } from '../security/ReadOnlyCommandPolicy';
import { safeBase64Encode } from '../../utils/encodingUtils';
import { SecretRedactor } from '../security/SecretRedactor';
import { ProjectFingerprint } from './ProjectFingerprint';

export interface LearnedPattern {
  id: string;
  triggerRegex: string;
  rawGoalTemplate: string;
  commandTemplate: string;
  explanation: string;
  source: 'autonomous_demonstration' | 'explicit_user_teach';
  originalGoal: string;
  demonstratedCommand: string;
  confidence: number;
  timesUsed: number;
  createdAt: number;
  lastUsedAt?: number;
  projectFingerprint?: string; // Phase 0.5, Item 4
  successCount?: number;       // Phase 0.5, Item 12
  failCount?: number;          // Phase 0.5, Item 12
  rollingSuccessRate?: number; // Phase 0.5, Item 12 (0.0 to 1.0)
  retired?: boolean;           // Phase 0.5, Item 12 (<0.2)
}

export interface MatchResult {
  matched: boolean;
  pattern?: LearnedPattern;
  interpolatedCommand?: string;
  explanation?: string;
}

export class DemonstrationLearningEngine {
  private static instance: DemonstrationLearningEngine;
  private patterns: Map<string, LearnedPattern> = new Map();
  private isLoaded: boolean = false;

  public static getInstance(): DemonstrationLearningEngine {
    if (!DemonstrationLearningEngine.instance) {
      DemonstrationLearningEngine.instance = new DemonstrationLearningEngine();
    }
    return DemonstrationLearningEngine.instance;
  }

  constructor() {
    this.loadPatterns();
  }

  /**
   * Correlates an unresolved AI goal with a demonstrated shell command.
   * Generalizes arguments into dynamic placeholders and persists the pattern.
   */
  public learnFromDemonstration(unresolvedGoal: string, demonstratedCommand: string, cwd?: string): LearnedPattern | null {
    const goalClean = SecretRedactor.redact(unresolvedGoal.trim());
    const cmdClean = SecretRedactor.redact(demonstratedCommand.trim());
    const projectFp = ProjectFingerprint.compute(cwd).fingerprint;

    if (!goalClean || !cmdClean) return null;
    // Don't learn from trivial single-token navigation/inspection commands
    if (['ls', 'pwd', 'clear', 'exit'].includes(cmdClean.toLowerCase())) return null;

    // 1. Identify dynamic arguments between goal and command (e.g. filenames, paths, ports, numbers)
    const reservedWords = new Set([
      'to', 'from', 'in', 'on', 'into', 'with', 'using', 'format', 'file', 'video', 'audio',
      'webm', 'mp4', 'mp3', 'png', 'jpg', 'jpeg', 'pdf', 'tar', 'gz', 'zip', 'json'
    ]);

    const goalTokens = goalClean.split(/\s+/);
    const potentialArgs: string[] = [];

    for (const token of goalTokens) {
      const cleanToken = token.replace(/^['"]|['"]$/g, '').trim();
      const lower = cleanToken.toLowerCase();
      // An argument is dynamic if it contains extension, path separator, or digits, and is not a reserved keyword
      const isDynamicArg = (cleanToken.includes('.') || cleanToken.includes('/') || /\d+/.test(cleanToken)) && !reservedWords.has(lower);
      if (isDynamicArg && cmdClean.includes(cleanToken)) {
        potentialArgs.push(cleanToken);
      }
    }

    // Sort by length descending to replace longer tokens first
    potentialArgs.sort((a, b) => b.length - a.length);

    let patternGoal = goalClean;
    potentialArgs.forEach((arg, index) => {
      patternGoal = patternGoal.replace(arg, `__ARG_${index + 1}__`);
    });

    let regexStr = this.escapeRegex(patternGoal);
    potentialArgs.forEach((_, index) => {
      regexStr = regexStr.replace(new RegExp(`__ARG_${index + 1}__`, 'g'), '(.+?)');
    });

    const regexPattern = '^(?:please\\s+)?(?:could\\s+you\\s+)?(?:how\\s+to\\s+)?' + regexStr + '(?:\\s+format)?$';

    let cmdTemplate = cmdClean;
    let goalTemplate = goalClean;

    potentialArgs.forEach((arg, index) => {
      const placeholder = `{${index + 1}}`;
      // Replace exact argument first
      cmdTemplate = cmdTemplate.replace(new RegExp(this.escapeRegex(arg), 'g'), placeholder);

      // Check if file basename without extension appears (e.g. lecture from lecture.mp4)
      const dotIdx = arg.lastIndexOf('.');
      if (dotIdx > 0) {
        const baseName = arg.substring(0, dotIdx);
        if (cmdTemplate.includes(baseName)) {
          cmdTemplate = cmdTemplate.replace(new RegExp(this.escapeRegex(baseName), 'g'), `{name_${index + 1}}`);
        }
      }

      goalTemplate = goalTemplate.replace(new RegExp(this.escapeRegex(arg), 'g'), `{arg_${index + 1}}`);
    });

    const id = 'pattern_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const pattern: LearnedPattern = {
      id,
      triggerRegex: regexPattern,
      rawGoalTemplate: goalTemplate,
      commandTemplate: cmdTemplate,
      explanation: `Learned workflow: executes '${cmdTemplate}' based on user demonstration`,
      source: 'autonomous_demonstration',
      originalGoal: goalClean,
      demonstratedCommand: cmdClean,
      confidence: 1.0,
      timesUsed: 1,
      createdAt: Date.now(),
      projectFingerprint: projectFp,
      successCount: 1,
      failCount: 0,
      rollingSuccessRate: 1.0,
      retired: false
    };

    this.patterns.set(id, pattern);
    this.savePatterns();
    return pattern;
  }

  /**
   * Explicitly teaches Sentinel a new goal-to-command pattern.
   * e.g. /learn sync drone logs -> rsync -avz pi@rover:/logs/ ./rover_logs/
   */
  public learnExplicit(triggerGoal: string, command: string, explanation?: string, cwd?: string): LearnedPattern {
    const goalClean = SecretRedactor.redact(triggerGoal.trim());
    const cmdClean = SecretRedactor.redact(command.trim());
    const explanationClean = explanation ? SecretRedactor.redact(explanation) : undefined;
    const projectFp = ProjectFingerprint.compute(cwd).fingerprint;

    // Check if user specified placeholders in goal, e.g. "convert {file} to webm"
    const hasPlaceholders = /\{([a-z0-9_-]+)\}/i.test(goalClean);
    let regexStr = '^' + this.escapeRegex(goalClean) + '$';
    let cmdTemplate = cmdClean;

    if (hasPlaceholders) {
      let groupCounter = 1;
      regexStr = '^' + this.escapeRegex(goalClean).replace(/\\\{[a-z0-9_-]+\\\}/gi, () => {
        return '(.+?)';
      }) + '$';

      // Map {param} in command to {1}, {2}
      const matches = goalClean.match(/\{([a-z0-9_-]+)\}/gi) || [];
      matches.forEach((ph, idx) => {
        cmdTemplate = cmdTemplate.replace(new RegExp(this.escapeRegex(ph), 'g'), `{${idx + 1}}`);
      });
    } else {
      // Allow conversational prefix flexibility
      regexStr = '^(?:please\\s+)?(?:could\\s+you\\s+)?' + this.escapeRegex(goalClean) + '$';
    }

    const id = 'pattern_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const pattern: LearnedPattern = {
      id,
      triggerRegex: regexStr,
      rawGoalTemplate: goalClean,
      commandTemplate: cmdTemplate,
      explanation: explanationClean || `Learned workflow: executes '${cmdClean}'`,
      source: 'explicit_user_teach',
      originalGoal: goalClean,
      demonstratedCommand: cmdClean,
      confidence: 1.0,
      timesUsed: 1,
      createdAt: Date.now(),
      projectFingerprint: projectFp,
      successCount: 1,
      failCount: 0,
      rollingSuccessRate: 1.0,
      retired: false
    };

    this.patterns.set(id, pattern);
    this.savePatterns();
    return pattern;
  }

  /**
   * Records execution outcome for a learned pattern to update confidence and retirement.
   */
  public recordPatternOutcome(patternIdOrGoal: string, success: boolean): boolean {
    let pattern: LearnedPattern | undefined;
    if (this.patterns.has(patternIdOrGoal)) {
      pattern = this.patterns.get(patternIdOrGoal);
    } else {
      const lower = patternIdOrGoal.toLowerCase().trim();
      for (const p of this.patterns.values()) {
        if (p.id === patternIdOrGoal || p.originalGoal.toLowerCase() === lower) {
          pattern = p;
          break;
        }
      }
    }

    if (!pattern) return false;

    if (success) {
      pattern.successCount = (pattern.successCount || 0) + 1;
    } else {
      pattern.failCount = (pattern.failCount || 0) + 1;
    }

    const total = (pattern.successCount || 0) + (pattern.failCount || 0);
    pattern.rollingSuccessRate = total > 0 ? (pattern.successCount || 0) / total : 1.0;

    // Retire flaky or stale patterns whose success rate drops below 0.2 (Phase 0.5, Item 12)
    if (pattern.rollingSuccessRate < 0.2 && total >= 3) {
      pattern.retired = true;
      pattern.confidence = 0.05;
    } else {
      pattern.confidence = Math.max(0.1, pattern.rollingSuccessRate);
    }

    this.savePatterns();
    return true;
  }

  public matchGoal(goal: string, cwd?: string): MatchResult {
    return this.matchIntent(goal, cwd);
  }

  /**
   * Check if an input goal matches any stored learned pattern.
   * Scopes matching to the current project fingerprint if provided.
   */
  public matchIntent(inputGoal: string, cwd?: string): MatchResult {
    if (!inputGoal) return { matched: false };
    const cleanInput = inputGoal.trim();
    const activeProjectFp = ProjectFingerprint.compute(cwd).fingerprint;

    // Filter out retired patterns
    const candidates = Array.from(this.patterns.values()).filter(p => !p.retired);

    // Sort candidates: same project first, then higher rolling success rate
    candidates.sort((a, b) => {
      const aProj = a.projectFingerprint === activeProjectFp ? 1 : (a.projectFingerprint === 'global' ? 0 : -1);
      const bProj = b.projectFingerprint === activeProjectFp ? 1 : (b.projectFingerprint === 'global' ? 0 : -1);
      if (aProj !== bProj) return bProj - aProj;
      return (b.rollingSuccessRate ?? b.confidence) - (a.rollingSuccessRate ?? a.confidence);
    });

    for (const pattern of candidates) {
      try {
        const regex = new RegExp(pattern.triggerRegex, 'i');
        const match = cleanInput.match(regex);
        if (match) {
          let interpolated = pattern.commandTemplate;

          // Replace captured positional groups {1}, {2}, etc.
          for (let i = 1; i < match.length; i++) {
            const val = (match[i] || '').trim();
            interpolated = interpolated.replace(new RegExp(`\\{${i}\\}`, 'g'), val);

            // If a base name placeholder exists ({name_1})
            const dotIdx = val.lastIndexOf('.');
            const baseName = dotIdx > 0 ? val.substring(0, dotIdx) : val;
            interpolated = interpolated.replace(new RegExp(`\\{name_${i}\\}`, 'g'), baseName);
          }

          pattern.timesUsed++;
          pattern.lastUsedAt = Date.now();
          this.savePatterns();

          return {
            matched: true,
            pattern,
            interpolatedCommand: interpolated,
            explanation: `Using learned pattern: ${interpolated}`
          };
        }
      } catch {
        // Skip invalid regex
      }
    }

    return { matched: false };
  }

  /**
   * Return all stored learned patterns.
   */
  public getAllPatterns(): LearnedPattern[] {
    return Array.from(this.patterns.values());
  }

  public addPattern(pattern: LearnedPattern): void {
    if (pattern && pattern.id) {
      this.patterns.set(pattern.id, pattern);
      this.savePatterns();
    }
  }

  /**
   * Remove a learned pattern by ID or original goal text.
   */
  public forgetPattern(idOrGoal: string): boolean {
    for (const [id, pattern] of this.patterns.entries()) {
      if (id === idOrGoal || pattern.originalGoal.toLowerCase() === idOrGoal.toLowerCase()) {
        this.patterns.delete(id);
        this.savePatterns();
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all learned patterns.
   */
  public clear(): void {
    this.patterns.clear();
    this.savePatterns();
  }

  public clearAll(): void {
    this.clear();
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Load patterns from ~/.sentinel/learned_patterns.json.
   */
  public async loadPatterns(): Promise<void> {
    if (this.isLoaded) return;
    this.isLoaded = true;

    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return; // Use in-memory for testing
    }

    try {
      const output = await invoke<{ stdout: string }>('execute_command', {
        command: 'sh',
        args: ['-c', 'cat "$HOME/.sentinel/learned_patterns.json" 2>/dev/null || true']
      });

      if (output.stdout && output.stdout.trim()) {
        const parsed: LearnedPattern[] = JSON.parse(output.stdout.trim());
        if (Array.isArray(parsed)) {
          for (const p of parsed) {
            this.patterns.set(p.id, p);
          }
        }
      }
    } catch {
      // In-memory fallback
    }
  }

  /**
   * Persist patterns to ~/.sentinel/learned_patterns.json.
   */
  public async savePatterns(): Promise<void> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return; // Skip filesystem I/O in tests
    }

    try {
      const all = Array.from(this.patterns.values());
      const jsonStr = JSON.stringify(all, null, 2);
      const b64 = safeBase64Encode(jsonStr);
      const cmd = `mkdir -p "$HOME/.sentinel" && echo '${b64}' | base64 --decode > "$HOME/.sentinel/learned_patterns.json"`;

      await invoke('execute_command', {
        command: 'sh',
        args: ['-c', cmd]
      });
    } catch {
      // ignore persistence error in headless environments
    }
  }
}

const CHANGE_VERBS = /\b(?:delete|remove|rm|kill|stop|install|uninstall|create|make|add|move|rename|copy|clean|clear|free\s+up|restart|start|enable|disable|update|upgrade|fix|set|change|compress|extract|unzip|zip|download|mount|unmount|format|build|deploy|push|commit|reset)\b/;

/**
 * Whether a command typed after an unanswered request plausibly performs that request.
 * A read-only command after "delete the build folder" is the user looking around, not a
 * demonstration; a modifying command after a question is not an answer to it either.
 */
export function isPlausibleDemonstration(goal: string, command: string): boolean {
  const g = goal.trim().toLowerCase();
  const asksForChange = CHANGE_VERBS.test(g) && !/^(?:what|which|who|where|when|why|is|are|does|did|show|list|how\s+(?:much|many|big|full))\b/.test(g);
  const changes = isClearlyMutating(command);
  if (asksForChange && !changes) return false;
  if (!asksForChange && changes) return false;
  return true;
}

