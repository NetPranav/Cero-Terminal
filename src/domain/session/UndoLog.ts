/**
 * UndoLog.ts — Destructive Workflow Rollback & Undo Log (Phase 0.5, Item 9)
 *
 * Maintains a chronological log of commands and mutations executed across the session.
 * For destructive actions, records rollback commands (git reset, git checkout -, stash recovery, etc.)
 * and allows the user to inspect what was done (`>what did you just do`) or safely
 * rollback the last operation (`>undo last step`).
 */

export type Reversibility = 'automatic' | 'manual' | 'irreversible';
export type RollbackType = 'git_stash' | 'trash_restore' | 'command' | 'manual_advice' | 'none';

export interface UndoLogEntry {
  id: string;
  timestamp: number;
  sessionId?: string;
  goal: string;
  command: string;
  tool: string;
  isDestructive: boolean;
  rollbackCommand?: string;
  rollbackType: RollbackType;
  reversibility: Reversibility;
  manualAdvice?: string;
  status: 'executed' | 'rolled_back' | 'failed';
}

export class UndoLog {
  private static instance?: UndoLog;
  private entries: UndoLogEntry[] = [];
  private maxEntries: number = 100;

  public static getInstance(): UndoLog {
    if (!UndoLog.instance) {
      UndoLog.instance = new UndoLog();
    }
    return UndoLog.instance;
  }

  public recordAction(entry: {
    sessionId?: string;
    goal: string;
    command: string;
    tool?: string;
    isDestructive?: boolean;
    rollbackCommand?: string;
    rollbackType?: RollbackType;
    reversibility?: Reversibility;
    manualAdvice?: string;
  }): UndoLogEntry {
    const isDestructive = entry.isDestructive ?? this.detectDestructive(entry.command);
    const inferredRollback = this.inferRollback(entry.command, isDestructive);

    const logEntry: UndoLogEntry = {
      id: `undo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      sessionId: entry.sessionId || 'default',
      goal: entry.goal,
      command: entry.command,
      tool: entry.tool || 'shell.execute',
      isDestructive,
      rollbackCommand: entry.rollbackCommand || inferredRollback.rollbackCommand,
      rollbackType: entry.rollbackType || inferredRollback.rollbackType,
      reversibility: entry.reversibility || inferredRollback.reversibility,
      manualAdvice: entry.manualAdvice || inferredRollback.manualAdvice,
      status: 'executed'
    };

    this.entries.push(logEntry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    return logEntry;
  }

  public getRecentActions(sessionId?: string, limit: number = 10): UndoLogEntry[] {
    const list = sessionId 
      ? this.entries.filter(e => e.sessionId === sessionId || e.sessionId === 'default')
      : this.entries;
    return list.slice(-limit).reverse();
  }

  public getLastDestructiveAction(sessionId?: string): UndoLogEntry | undefined {
    const list = sessionId 
      ? this.entries.filter(e => e.sessionId === sessionId || e.sessionId === 'default')
      : this.entries;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].isDestructive && list[i].status === 'executed') {
        return list[i];
      }
    }
    return undefined;
  }

  public formatWhatDidYouJustDo(sessionId?: string, limit: number = 5): string {
    const recent = this.getRecentActions(sessionId, limit);
    if (recent.length === 0) {
      return "No actions have been executed in this session yet.";
    }

    let out = `### Recent Session Actions (${recent.length} recorded):\n\n`;
    recent.forEach((item, idx) => {
      const timeStr = new Date(item.timestamp).toLocaleTimeString();
      const destructiveTag = item.isDestructive ? ' `[DESTRUCTIVE]`' : ' `[READ-ONLY]`';
      const statusTag = item.status === 'rolled_back' ? ' `[ROLLED BACK]`' : '';
      out += `${idx + 1}. **\`${item.command}\`**${destructiveTag}${statusTag} (${timeStr})\n`;
      out += `   - Goal: "${item.goal}"\n`;
      if (item.isDestructive) {
        out += `   - Rollback: ${item.reversibility === 'automatic' ? `Available via \`>undo\` (\`${item.rollbackCommand}\`)` : (item.manualAdvice || 'Irreversible / Manual check required')}\n`;
      }
    });

    return out.trim();
  }

  public async rollbackLastStep(
    sessionId?: string,
    executor?: (cmd: string) => Promise<{ code: number; stdout: string; stderr: string }>
  ): Promise<{ success: boolean; message: string; rolledBackEntry?: UndoLogEntry }> {
    const target = this.getLastDestructiveAction(sessionId);
    if (!target) {
      return {
        success: false,
        message: "No destructive actions found in this session to undo."
      };
    }

    if (target.reversibility === 'irreversible') {
      return {
        success: false,
        message: `Cannot undo \`${target.command}\`: Operation is irreversible. ${target.manualAdvice || ''}`
      };
    }

    if (target.reversibility === 'manual') {
      return {
        success: false,
        message: `Action \`${target.command}\` cannot be automatically rolled back.\n\nManual recovery advice:\n${target.manualAdvice || 'Please inspect state manually.'}`
      };
    }

    if (!target.rollbackCommand) {
      return {
        success: false,
        message: `No automated rollback command registered for \`${target.command}\`.`
      };
    }

    // Execute the rollback if executor supplied
    if (executor) {
      try {
        const res = await executor(target.rollbackCommand);
        if (res.code === 0) {
          target.status = 'rolled_back';
          return {
            success: true,
            message: `Successfully rolled back \`${target.command}\` using \`${target.rollbackCommand}\`.`,
            rolledBackEntry: target
          };
        } else {
          return {
            success: false,
            message: `Rollback command failed (${res.code}): ${res.stderr || res.stdout}`
          };
        }
      } catch (err: any) {
        return {
          success: false,
          message: `Error executing rollback: ${err.message}`
        };
      }
    }

    target.status = 'rolled_back';
    return {
      success: true,
      message: `Rollback prepared: \`${target.rollbackCommand}\` (reverses \`${target.command}\`).`,
      rolledBackEntry: target
    };
  }

  public clear(sessionId?: string): void {
    if (sessionId) {
      this.entries = this.entries.filter(e => e.sessionId !== sessionId);
    } else {
      this.entries = [];
    }
  }

  private detectDestructive(cmd: string): boolean {
    const trimmed = cmd.trim();
    return /\b(rm|rmdir|git\s+(checkout|commit|merge|rebase|reset|push|clean)|trash|mv|chmod|chown|kill|pkill)\b/i.test(trimmed);
  }

  private inferRollback(cmd: string, isDestructive: boolean): {
    rollbackCommand?: string;
    rollbackType: RollbackType;
    reversibility: Reversibility;
    manualAdvice?: string;
  } {
    if (!isDestructive) {
      return { rollbackType: 'none', reversibility: 'irreversible' };
    }

    const trimmed = cmd.trim();

    // Git checkout/switch -> git checkout -
    if (/^\s*git\s+(checkout|switch)\b/i.test(trimmed)) {
      return {
        rollbackCommand: 'git checkout -',
        rollbackType: 'command',
        reversibility: 'automatic',
        manualAdvice: 'Run `git checkout -` to return to the previous branch or commit.'
      };
    }

    // Git commit -> git reset --soft HEAD~1
    if (/^\s*git\s+commit\b/i.test(trimmed)) {
      return {
        rollbackCommand: 'git reset --soft HEAD~1',
        rollbackType: 'command',
        reversibility: 'automatic',
        manualAdvice: 'Run `git reset --soft HEAD~1` to uncommit changes while keeping modified files staged.'
      };
    }

    // Git stash pop -> git stash
    if (/^\s*git\s+stash\s+pop\b/i.test(trimmed)) {
      return {
        rollbackCommand: 'git stash',
        rollbackType: 'git_stash',
        reversibility: 'automatic',
        manualAdvice: 'Run `git stash` to re-stash working directory modifications.'
      };
    }

    // File deletion via rm
    if (/^\s*rm\b/i.test(trimmed)) {
      return {
        rollbackType: 'trash_restore',
        reversibility: 'manual',
        manualAdvice: 'File was deleted. If files were moved to ~/.cero/trash, restore from there; otherwise recover from git or backups.'
      };
    }

    // Process kill
    if (/^\s*(kill|pkill|killall)\b/i.test(trimmed)) {
      return {
        rollbackType: 'manual_advice',
        reversibility: 'irreversible',
        manualAdvice: 'Terminated process cannot be automatically resurrected. Restart the target service or command manually.'
      };
    }

    return {
      rollbackType: 'none',
      reversibility: 'manual',
      manualAdvice: 'Review git status or system state to verify modifications.'
    };
  }
}
