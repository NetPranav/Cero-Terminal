/**
 * ToolExecutor.ts — Bridge between AgentLoop and CapabilityRegistrySDK
 * 
 * Executes a tool by ID with given parameters through the SDK driver registry.
 * Handles the mapping from the LLM's tool call to actual OS execution.
 */

import { CapabilityRegistrySDK } from '../../sdk/capabilities/CapabilityRegistrySDK';
import { CapabilityManager } from '../../domain/Capability';
import { AuditLogger } from '../../domain/security/AuditLogger';
import { ExecutionEngine, ExecutionPreviewPlan } from '../../domain/security/ExecutionEngine';
import { PermissionManager } from '../../domain/security/PermissionManager';
import { PolicyEngine } from '../../domain/security/PolicyEngine';
import { SecurityEngine } from '../../domain/security/SecurityEngine';
import { CommandSafetyGuardian } from '../../domain/security/CommandSafetyGuardian';

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  /** Machine-readable error code from the execution engine (e.g. USER_CANCELLED) */
  errorCode?: string;
  commandExecuted?: string;
}

export class ToolExecutor {
  private sdk: CapabilityRegistrySDK;
  private executionEngine: ExecutionEngine;

  constructor() {
    this.sdk = CapabilityRegistrySDK.getInstance();
    this.executionEngine = new ExecutionEngine(
      CapabilityManager.getInstance(),
      PermissionManager.getInstance(),
      new SecurityEngine(),
      new PolicyEngine(),
      AuditLogger.getInstance()
    );
  }

  public static readonly DEFAULT_TIMEOUT_MS = 180000;

  /**
   * Adaptive timeout based on operation scope to avoid interrupting active tasks.
   */
  public static resolveAdaptiveTimeout(toolId: string): number {
    if (toolId.startsWith('filesystem.search') || toolId.startsWith('filesystem.locate') || toolId.startsWith('filesystem.grep')) {
      return 180000; // 3 minutes
    }
    if (toolId.startsWith('docker.') || toolId.startsWith('git.clone') || toolId.startsWith('developer.') || toolId.startsWith('node.') || toolId.startsWith('python.') || toolId === 'shell.execute') {
      return 300000; // 5 minutes
    }
    return 90000; // 90 seconds
  }

  /**
   * Execute a tool by its registry ID with the given parameters.
   * Returns a simplified result the LLM can understand, guarded with an adaptive timeout.
   */
  public async execute(
    toolId: string,
    params: Record<string, any>,
    cwd?: string,
    onAskPermission?: (plan: ExecutionPreviewPlan) => Promise<boolean>,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<ToolExecutionResult> {
    if (signal?.aborted) {
      try {
        const driver = this.sdk.getDriver(toolId);
        if (driver) await driver.cancel();
      } catch { /* ignore */ }
      return {
        success: false,
        error: 'Execution cancelled',
        errorCode: 'CANCELLED'
      };
    }

    // Intercept catastrophic commands before capability dispatch
    if (params?.command && typeof params.command === 'string') {
      const safety = CommandSafetyGuardian.getInstance().evaluate(params.command);
      if (safety.isBlocked) {
        return {
          success: false,
          error: `${safety.capabilityRefusal}\n\nConsequence Analysis:\n${safety.consequenceExplanation}${safety.safeAlternative ? `\n\nSafe Alternative: ${safety.safeAlternative}` : ''}`
        };
      }
    }

    const effectiveTimeout = timeoutMs ?? ToolExecutor.resolveAdaptiveTimeout(toolId);
    let timeoutHandle: any = null;
    let abortListener: (() => void) | null = null;
    try {
      const timeoutPromise = new Promise<ToolExecutionResult>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Tool execution timed out after ${effectiveTimeout}ms`));
        }, effectiveTimeout);
      });

      const abortPromise = new Promise<ToolExecutionResult>((resolve) => {
        if (!signal) return;
        abortListener = () => {
          try {
            const driver = this.sdk.getDriver(toolId);
            if (driver) void driver.cancel();
          } catch { /* ignore */ }
          resolve({
            success: false,
            error: 'Execution cancelled',
            errorCode: 'CANCELLED'
          });
        };
        if (signal.aborted) {
          abortListener();
        } else {
          signal.addEventListener('abort', abortListener, { once: true });
        }
      });

      // An approval dialog outlives the run that raised it. Once the run is cancelled, a pending
      // dialog resolves as declined, and an approval granted after the cancel is ignored, so a
      // cancelled task can never go on to run its command.
      const guardedAsk = onAskPermission && signal
        ? async (plan: ExecutionPreviewPlan): Promise<boolean> => {
            if (signal.aborted) return false;
            let onAbort: (() => void) | undefined;
            const aborted = new Promise<boolean>((resolve) => {
              onAbort = () => resolve(false);
              signal.addEventListener('abort', onAbort, { once: true });
            });
            try {
              const approved = await Promise.race([onAskPermission(plan), aborted]);
              return approved && !signal.aborted;
            } finally {
              if (onAbort) signal.removeEventListener('abort', onAbort);
            }
          }
        : onAskPermission;

      const execPromise = (async (): Promise<ToolExecutionResult> => {
        const result = await this.executionEngine.execute(toolId, params, {
          cwd,
          onAskPermission: guardedAsk,
          timeoutMs: effectiveTimeout
        });

        if (result.success) {
          return {
            success: true,
            data: result.data
          };
        } else {
          return {
            success: false,
            error: result.error?.message || String(result.error || 'Tool execution failed'),
            errorCode: result.error?.code
          };
        }
      })();

      const finalResult = await Promise.race([execPromise, timeoutPromise, abortPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (signal && abortListener) signal.removeEventListener('abort', abortListener);
      return finalResult;
    } catch (err: any) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (signal && abortListener) signal.removeEventListener('abort', abortListener);
      // Cancel active driver if running
      try {
        const driver = this.sdk.getDriver(toolId);
        if (driver) await driver.cancel();
      } catch { /* ignore cancel failure */ }

      return {
        success: false,
        error: err.message || 'Unexpected execution error'
      };
    }
  }

  /**
   * Check if a tool ID has a registered driver.
   */
  public hasDriver(toolId: string): boolean {
    return this.sdk.getDriver(toolId) !== undefined;
  }

  /**
   * Get all registered tool IDs for diagnostics.
   */
  public getRegisteredToolIds(): string[] {
    return this.sdk.getAllRegisteredIds();
  }
}
