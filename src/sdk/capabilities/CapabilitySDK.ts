/**
 * CapabilitySDK.ts — Core Architecture for Cero Execution Capabilities
 * 
 * Defines the standard interfaces and base classes for concrete capability execution drivers.
 * Every capability in Cero must implement this interface, exposing four critical operations:
 * - execute(): Run platform-specific actions (Launch Services, native APIs, Node filesystem)
 * - verify(): Confirm action success via OS diagnostic queries or filesystem inspection
 * - rollback(): Revert changes safely if verification fails or user undoes action
 * - cancel(): Immediately terminate running tasks or processes
 */

export type Platform = 'macos' | 'windows' | 'linux';

export interface ExecutionContext {
  isDryRun?: boolean;
  cwd?: string;
  environment?: Record<string, string>;
  timeoutMs?: number;
  platform?: Platform;
}

export interface CapabilityExecutionResult<O = any> {
  success: boolean;
  data?: O;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  executionTimeMs?: number;
  verified?: boolean;
  rolledBack?: boolean;
  cancelled?: boolean;
  commandExecuted?: string;
  rollbackPayload?: any;
}

export interface ICapabilityDriver<I = any, O = any> {
  readonly capabilityId: string;
  readonly name: string;
  readonly supportedPlatforms: Platform[];

  /**
   * Execute the capability using concrete platform-specific drivers.
   */
  execute(input: I, context?: ExecutionContext): Promise<CapabilityExecutionResult<O>>;

  /**
   * Verify whether the execution had its desired effect on the operating system or environment.
   */
  verify(input: I, result: CapabilityExecutionResult<O>, context?: ExecutionContext): Promise<boolean>;

  /**
   * Revert any system changes made during execution if possible.
   */
  rollback(input: I, result: CapabilityExecutionResult<O>, context?: ExecutionContext): Promise<boolean>;

  /**
   * Cancel an active or spinning capability task immediately.
   */
  cancel(): Promise<boolean>;
}

export abstract class BaseCapabilityDriver<I = any, O = any> implements ICapabilityDriver<I, O> {
  public abstract readonly capabilityId: string;
  public abstract readonly name: string;
  public abstract readonly supportedPlatforms: Platform[];

  protected isExecuting = false;
  protected activeCancelToken: { cancelled: boolean } | null = null;

  public async execute(input: I, context: ExecutionContext = {}): Promise<CapabilityExecutionResult<O>> {
    const startTime = performance.now();
    this.isExecuting = true;
    this.activeCancelToken = { cancelled: false };

    try {
      if (context.isDryRun) {
        return {
          success: true,
          data: { dryRun: true, capability: this.capabilityId, input } as unknown as O,
          executionTimeMs: performance.now() - startTime
        };
      }

      const platform = context.platform || this.detectPlatform();
      if (!this.supportedPlatforms.includes(platform)) {
        return {
          success: false,
          error: {
            code: 'PLATFORM_UNSUPPORTED',
            message: `Capability ${this.capabilityId} is not supported on platform: ${platform}`
          },
          executionTimeMs: performance.now() - startTime
        };
      }

      let timeoutHandle: any = null;
      const timeoutPromise = context.timeoutMs && context.timeoutMs > 0
        ? new Promise<CapabilityExecutionResult<O>>((resolve) => {
            timeoutHandle = setTimeout(async () => {
              if (this.activeCancelToken) {
                this.activeCancelToken.cancelled = true;
              }
              await this.cancel();
              resolve({
                success: false,
                cancelled: true,
                error: {
                  code: 'EXECUTION_TIMEOUT',
                  message: `Execution timed out after ${context.timeoutMs}ms`
                }
              });
            }, context.timeoutMs);
          })
        : null;

      const execPromise = this.performExecution(input, context, this.activeCancelToken);
      const result = timeoutPromise ? await Promise.race([execPromise, timeoutPromise]) : await execPromise;
      if (timeoutHandle) clearTimeout(timeoutHandle);

      result.executionTimeMs = performance.now() - startTime;
      return result;
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: typeof err === 'string' ? err : (err.message || 'Unknown error occurred during execution'),
          details: err
        },
        executionTimeMs: performance.now() - startTime
      };
    } finally {
      this.isExecuting = false;
      this.activeCancelToken = null;
    }
  }

  protected abstract performExecution(
    input: I,
    context: ExecutionContext,
    cancelToken: { cancelled: boolean }
  ): Promise<CapabilityExecutionResult<O>>;

  public async verify(input: I, result: CapabilityExecutionResult<O>, _context?: ExecutionContext): Promise<boolean> {
    // Default implementation assumes successful execution return state is valid unless overwritten
    return result.success && !result.cancelled;
  }

  public async rollback(_input: I, _result: CapabilityExecutionResult<O>, _context?: ExecutionContext): Promise<boolean> {
    // Override in concrete driver if capability alters durable system or file state
    return false;
  }

  public async cancel(): Promise<boolean> {
    if (this.activeCancelToken && this.isExecuting) {
      this.activeCancelToken.cancelled = true;
      this.isExecuting = false;
      return true;
    }
    return false;
  }

  protected detectPlatform(): Platform {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('linux') || ua.includes('x11')) return 'linux';
      if (ua.includes('mac')) return 'macos';
      if (ua.includes('win')) return 'windows';
    }
    if (typeof process !== 'undefined' && process.platform) {
      if (process.platform === 'linux') return 'linux';
      if (process.platform === 'darwin') return 'macos';
      if (process.platform === 'win32') return 'windows';
    }
    return 'linux';
  }
}
