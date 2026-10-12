import { WorkflowEngine } from '../workflow/WorkflowEngine';
import { ExecutionEngine, ExecutionPreviewPlan } from '../security/ExecutionEngine';
import { Planner } from '../planner/Planner';
import { Workflow, WorkflowStep } from '../workflow/types';
import { AgentExecutionState, AgentEvent, ExecutionSummary } from './types';
import { RetryEngine } from './RetryEngine';

type AgentEventListener = (event: AgentEvent, payload?: any) => void;

export class AgentRuntime {
  private state: AgentExecutionState;
  private workflow: Workflow;
  private listeners: AgentEventListener[] = [];
  private cancelToken: boolean = false;
  private pauseToken: boolean = false;
  private authHandler?: (plan: ExecutionPreviewPlan) => Promise<boolean>;

  private repairCount = 0;

  public setAuthorizationHandler(handler: (plan: ExecutionPreviewPlan) => Promise<boolean>) {
    this.authHandler = handler;
  }

  constructor(
    private workflowEngine: WorkflowEngine,
    private executionEngine: ExecutionEngine,
    private planner: any,
    workflow: Workflow
  ) {
    this.workflow = workflow;
    this.state = {
      workflowId: workflow.id,
      status: 'IDLE',
      completedSteps: [],
      failedSteps: [],
      retries: {},
      startTime: 0,
      logs: []
    };
  }

  public on(listener: AgentEventListener) {
    this.listeners.push(listener);
  }

  private emit(event: AgentEvent, payload?: any) {
    this.listeners.forEach(l => l(event, payload));
    if (payload?.log) {
      this.state.logs.push(`[${new Date().toISOString()}] ${payload.log}`);
    }
  }

  public async start(): Promise<ExecutionSummary> {
    this.state.status = 'RUNNING';
    this.state.startTime = performance.now();
    this.cancelToken = false;
    this.pauseToken = false;
    
    this.emit('WorkflowStarted', { log: `Workflow ${this.workflow.name} started.` });
    this.workflowEngine.startWorkflow(this.workflow);
    
    return this.executionLoop();
  }

  public pause() {
    this.pauseToken = true;
    this.state.status = 'PAUSED';
    this.emit('WorkflowPaused', { log: 'Workflow paused.' });
  }

  public async resume(): Promise<ExecutionSummary> {
    if (this.state.status !== 'PAUSED') throw new Error("Cannot resume, not paused.");
    this.pauseToken = false;
    this.state.status = 'RUNNING';
    this.emit('WorkflowResumed', { log: 'Workflow resumed.' });
    return this.executionLoop();
  }

  public cancel() {
    this.cancelToken = true;
    this.state.status = 'CANCELLED';
    this.emit('WorkflowCancelled', { log: 'Workflow cancelled.' });
  }

  private async executionLoop(): Promise<ExecutionSummary> {
    while (this.state.status === 'RUNNING') {
      if (this.cancelToken) {
        this.state.status = 'CANCELLED';
        break;
      }
      if (this.pauseToken) {
        return this.generateSummary();
      }

      // 1. Get next tasks
      const tasks = this.workflowEngine.getNextTasks(this.workflow.id);
      
      // Check if workflow is complete (no tasks pending or running, all completed)
      if (tasks.length === 0) {
        const allExecs = this.workflowEngine.getExecutionState(this.workflow.id);
        const hasPendingOrRunning = Array.from(allExecs?.values() || []).some(e => e.status === 'PENDING' || e.status === 'RUNNING');
        
        if (!hasPendingOrRunning) {
          // Success!
          this.state.status = 'COMPLETED';
          this.emit('WorkflowCompleted', { log: 'Workflow completed successfully.' });
          break;
        } else {
          // Wait for running tasks to finish (simple delay since we're simulating concurrent execution here, though we run sequentially in this loop for now)
          await new Promise(r => setTimeout(r, 100));
          continue;
        }
      }

      // For simplicity in AgentRuntime, we execute sequentially (even parallel nodes can be sequential if we block)
      // A more complex implementation would spawn Promises and await Promise.all
      const step = tasks[0]; 
      
      this.state.currentStepId = step.id;
      this.emit('StepStarted', { log: `Executing step ${step.name}...`, step });
      
      this.workflowEngine.markTaskRunning(this.workflow.id, step.id);

      const success = await this.executeStepWithRetry(step);

      if (!success) {
        this.state.status = 'FAILED';
        this.emit('WorkflowFailed', { log: `Workflow failed at step ${step.name}` });
        break;
      }
    }

    return this.generateSummary();
  }

  private async executeStepWithRetry(step: WorkflowStep): Promise<boolean> {
    let attempt = 0;
    
    while (true) {
      if (this.cancelToken || this.pauseToken) return false;

      let result;
      try {
        if (step.type === 'ExecuteCapability') {
          // 2. Execution (and internal verification via ExecutionEngine)
          this.emit('VerificationStarted', { step });
          
          const input = this.workflowEngine.interpolate(this.workflow.id, step.parameters || {});
          
          result = await this.executionEngine.execute(step.capabilityId!, input, {
            cwd: this.workflow.metadata?.cwd,
            onAskPermission: async (plan: ExecutionPreviewPlan) => {
              this.emit('ApprovalRequested', { plan });
              
              if (this.authHandler) {
                const approved = await this.authHandler(plan);
                if (approved) {
                  this.emit('ApprovalGranted', { log: 'Security authentication & user consent verified.' });
                  return true;
                } else {
                  this.emit('VerificationFailed', { step, error: { message: 'Security authorization denied or password authentication failed.' } });
                  return false;
                }
              }

              // Only permit automated bypass within unit test verification suites
              if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
                this.emit('ApprovalGranted', { log: '[Test Suite Mock] Approval granted by automated verification.' });
                return true;
              }

              // Default safety block: Deny any deletion or administrative command if explicit authentication is missing
              this.emit('VerificationFailed', { step, error: { message: 'Destructive operation blocked: Strict user consent and password authentication required.' } });
              return false;
            }
          });

          if (result.success) {
            this.emit('VerificationPassed', { step });
            this.workflowEngine.markTaskComplete(this.workflow.id, step, result.data, result.rollbackAction);
            this.state.completedSteps.push(step.id);
            this.emit('StepCompleted', { step, data: result.data });
            return true;
          } else {
            this.emit('VerificationFailed', { step, error: result.error });
            throw new Error(result.error?.message || 'Execution failed');
          }
        } else if (step.type === 'Delay') {
           await new Promise(r => setTimeout(r, step.delayMs || 1000));
           this.workflowEngine.markTaskComplete(this.workflow.id, step, null);
           this.state.completedSteps.push(step.id);
           this.emit('StepCompleted', { step });
           return true;
        } else {
          // Handle variable assignment, conditionals directly via WorkflowEngine state
          this.workflowEngine.markTaskComplete(this.workflow.id, step, null);
          this.state.completedSteps.push(step.id);
          this.emit('StepCompleted', { step });
          return true;
        }
      } catch (err: any) {
        // 3. Retry Logic
        if (RetryEngine.shouldRetry(step.retryPolicy, attempt)) {
          attempt++;
          this.state.retries[step.id] = attempt;
          this.emit('RetryStarted', { log: `Retrying step ${step.name} (Attempt ${attempt})...`, step });
          await RetryEngine.waitDelay(step.retryPolicy!, attempt);
          continue;
        }

        this.emit('RetryFailed', { log: `Retries exhausted for step ${step.name}.`, step });
        this.workflowEngine.markTaskFailed(this.workflow.id, step.id, err.message);
        this.state.failedSteps.push(step.id);

        // 4. Planner Repair
        return await this.attemptPlannerRepair(step, err.message);
      }
    }
  }

  private async attemptPlannerRepair(failedStep: WorkflowStep, errorMsg: string): Promise<boolean> {
    this.emit('PlannerRepairRequested', { log: `Diagnosing failure for step ${failedStep.name}: ${errorMsg}` });
    
    if (this.repairCount >= 3) {
      this.emit('WorkflowFailed', { log: 'Max planner repairs exceeded (3). Aborting workflow.' });
      return false;
    }
    
    this.repairCount++;

    try {
      const strategy = this.diagnoseFailure(failedStep, errorMsg);
      this.emit('PlannerRepairStarted', { log: `Repair strategy: ${strategy}`, step: failedStep });

      switch (strategy) {
        case 'PATH_NOT_FOUND':
          return await this.repairPathNotFound(failedStep, errorMsg);
        case 'PERMISSION_DENIED':
          return await this.repairPermissionDenied(failedStep);
        case 'COMMAND_NOT_FOUND':
          return await this.repairCommandNotFound(failedStep, errorMsg);
        case 'PROCESS_NOT_FOUND':
          return await this.repairProcessNotFound(failedStep);
        case 'ALREADY_EXISTS':
          // File/folder already exists — skip this step, it's already done
          this.emit('PlannerRepairCompleted', { log: `Target already exists. Skipping step ${failedStep.name}.` });
          this.workflowEngine.markTaskComplete(this.workflow.id, failedStep, { skipped: true, reason: 'already_exists' });
          this.state.completedSteps.push(failedStep.id);
          return true;
        case 'TIMEOUT':
          // Retry with increased timeout
          return await this.retryWithTimeout(failedStep);
        default:
          this.emit('PlannerRepairCompleted', { log: `No specific repair available for: ${errorMsg}. Skipping step.` });
          return false;
      }
    } catch (e: any) {
      this.emit('WorkflowFailed', { log: `Planner repair threw error: ${e.message}` });
      return false;
    }
  }

  /**
   * Diagnose the type of failure to determine the appropriate repair strategy.
   */
  private diagnoseFailure(step: WorkflowStep, errorMsg: string): string {
    const lower = errorMsg.toLowerCase();

    if (lower.includes('no such file') || lower.includes('not found') || lower.includes('enoent') || lower.includes('does not exist') || lower.includes('path not found')) {
      // Differentiate between missing file and missing executable
      if (lower.includes('failed to execute') && lower.includes('os error 2')) {
        return 'COMMAND_NOT_FOUND';
      }
      return 'PATH_NOT_FOUND';
    }
    if (lower.includes('permission denied') || lower.includes('eperm') || lower.includes('eacces') || lower.includes('operation not permitted') || lower.includes('access denied')) {
      return 'PERMISSION_DENIED';
    }
    if (lower.includes('command not found') || lower.includes('not recognized') || lower.includes('is not a command') || lower.includes('no such command') || (lower.includes('failed to execute') && lower.includes('os error 2'))) {
      return 'COMMAND_NOT_FOUND';
    }
    if (lower.includes('no matching process') || lower.includes('no process found') || lower.includes('no such process') || lower.includes('esrch')) {
      return 'PROCESS_NOT_FOUND';
    }
    if (lower.includes('already exists') || lower.includes('eexist') || lower.includes('file exists')) {
      return 'ALREADY_EXISTS';
    }
    if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout')) {
      return 'TIMEOUT';
    }

    return 'UNKNOWN';
  }

  /**
   * Repair: Path not found — attempt to create missing parent directories or resolve fuzzy path.
   */
  private async repairPathNotFound(step: WorkflowStep, errorMsg: string): Promise<boolean> {
    const params = step.parameters || {};
    const targetPath = params.path || params.directory || params.source || '';
    
    if (!targetPath) return false;

    // Strategy 1: If creating/navigating, auto-create parent directories
    if (step.capabilityId?.includes('mkdir') || step.capabilityId?.includes('create') || step.capabilityId?.includes('navigate')) {
      const parentPath = targetPath.split('/').slice(0, -1).join('/');
      if (parentPath) {
        this.emit('PlannerRepairCompleted', { log: `Creating missing parent directory: ${parentPath}` });
        
        const mkdirStep: WorkflowStep = {
          id: step.id + '_repair_mkdir',
          name: `Auto-create parent: ${parentPath}`,
          type: 'ExecuteCapability',
          capabilityId: 'filesystem.mkdir',
          parameters: { path: parentPath, recursive: true },
          dependencies: [],
          retryPolicy: { type: 'none', maxAttempts: 0, delayMs: 0 }
        };
        
        this.workflowEngine.injectSteps(this.workflow.id, [mkdirStep]);
        const mkdirSuccess = await this.executeStepWithRetry(mkdirStep);
        
        if (mkdirSuccess) {
          // Retry original step now that parent exists
          const retryStep: WorkflowStep = {
            ...step,
            id: step.id + '_retried',
            name: step.name + ' (Retried)',
            retryPolicy: { type: 'none', maxAttempts: 0, delayMs: 0 }
          };
          return await this.executeStepWithRetry(retryStep);
        }
      }
    }

    return false;
  }

  /**
   * Repair: Permission denied — request elevated authorization from user.
   */
  private async repairPermissionDenied(step: WorkflowStep): Promise<boolean> {
    this.emit('PlannerRepairCompleted', { log: 'Permission denied. Requesting elevated authorization...' });
    
    // Re-run the step but force the permission prompt
    const elevatedStep: WorkflowStep = {
      ...step,
      id: step.id + '_elevated',
      name: step.name + ' (Elevated)',
      retryPolicy: { type: 'none', maxAttempts: 0, delayMs: 0 }
    };
    
    return await this.executeStepWithRetry(elevatedStep);
  }

  /**
   * Repair: Command not found — suggest using shell.execute with a corrected command.
   */
  private async repairCommandNotFound(step: WorkflowStep, errorMsg: string): Promise<boolean> {
    // Extract the missing command name from the error
    const cmdMatch = errorMsg.match(/(?:command not found|not recognized):\s*(\S+)/i) || 
                     errorMsg.match(/(\S+):\s*(?:command not found|not recognized)/i) ||
                     errorMsg.match(/Failed to execute (\S+):/i);
    
    if (cmdMatch && cmdMatch[1]) {
      const missingCmd = cmdMatch[1].replace(/['"]/g, '');
      // It is read from program output: only a plain package name may reach the shell
      if (!/^[A-Za-z0-9][A-Za-z0-9._+@-]{0,80}$/.test(missingCmd)) return false;
      
      // Generalized Auto-heal: Attempt to install ANY missing dependency via Homebrew
      this.emit('PlannerRepairCompleted', { log: `Missing dependency "${missingCmd}". Attempting to auto-install via Homebrew...` });
      
      const brewStep: WorkflowStep = {
        id: step.id + '_repair_brew',
        name: `Auto-install dependency: ${missingCmd}`,
        type: 'ExecuteCapability',
        capabilityId: 'shell.execute',
        parameters: { 
          command: 'sh',
          args: ['-c', 'export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin && brew install -- "$1"', 'sh', missingCmd] 
        },
        dependencies: [],
        retryPolicy: { type: 'none', maxAttempts: 0, delayMs: 0 }
      };
      
      this.workflowEngine.injectSteps(this.workflow.id, [brewStep]);
      const brewSuccess = await this.executeStepWithRetry(brewStep);
      
      if (brewSuccess) {
        // Retry original step now that dependency is installed
        const retryStep: WorkflowStep = {
          ...step,
          id: step.id + '_retried',
          name: step.name + ' (Retried)',
          retryPolicy: { type: 'none', maxAttempts: 0, delayMs: 0 }
        };
        return await this.executeStepWithRetry(retryStep);
      } else {
        this.emit('PlannerRepairCompleted', { log: `Command "${missingCmd}" not found. Auto-install failed. Step skipped.` });
      }
    }
    
    return false;
  }

  /**
   * Repair: Process not found — retry with fuzzy process name matching.
   */
  private async repairProcessNotFound(step: WorkflowStep): Promise<boolean> {
    const params = step.parameters || {};
    const processName = params.process || params.app || params.name || '';
    
    if (!processName) return false;

    this.emit('PlannerRepairCompleted', { log: `Process "${processName}" not found. Attempting fuzzy match...` });
    
    // Retry with a more permissive search — the capability driver should handle fuzzy matching
    const fuzzyStep: WorkflowStep = {
      ...step,
      id: step.id + '_fuzzy',
      name: step.name + ' (Fuzzy Match)',
      parameters: { ...params, fuzzy: true, query: processName },
      retryPolicy: { type: 'none', maxAttempts: 0, delayMs: 0 }
    };
    
    return await this.executeStepWithRetry(fuzzyStep);
  }

  /**
   * Repair: Timeout — retry with extended timeout.
   */
  private async retryWithTimeout(step: WorkflowStep): Promise<boolean> {
    this.emit('PlannerRepairCompleted', { log: 'Operation timed out. Retrying with extended timeout...' });
    
    const retryStep: WorkflowStep = {
      ...step,
      id: step.id + '_timeout_retry',
      name: step.name + ' (Extended Timeout)',
      parameters: { ...(step.parameters || {}), timeout: 30000 },
      retryPolicy: { type: 'none', maxAttempts: 0, delayMs: 0 }
    };
    
    return await this.executeStepWithRetry(retryStep);
  }

  private generateSummary(): ExecutionSummary {
    this.state.endTime = performance.now();
    return {
      goal: this.workflow.name,
      completedSteps: this.state.completedSteps,
      skippedSteps: [], // Handled by WorkflowEngine internally
      failedSteps: this.state.failedSteps,
      retries: this.state.retries,
      repairCount: this.repairCount,
      executionTimeMs: this.state.endTime - this.state.startTime,
      warnings: [],
      finalResult: this.state.status === 'COMPLETED' ? 'Success' : (this.state.status === 'CANCELLED' ? 'Cancelled' : 'Failed')
    };
  }
}
