import { CapabilityManager, CapabilityResult } from '../Capability';
import { IPermissionManager, PermissionCategory } from './PermissionManager';
import { ISecurityEngine } from './SecurityEngine';
import { IPolicyEngine } from './PolicyEngine';
import { IAuditLogger } from './AuditLogger';
import { CapabilityRegistrySDK } from '../../sdk/capabilities/CapabilityRegistrySDK';
import { ConsentQueue } from './ConsentQueue';

export interface ExecutionOptions {
  isDryRun?: boolean;
  skipPreview?: boolean; // For automated workflows where 'Ask' might trigger UI if not skipped
  onAskPermission?: (plan: ExecutionPreviewPlan) => Promise<boolean>;
  cwd?: string; // Terminal current working directory for SDK capabilities
  timeoutMs?: number;
  tabId?: string;
  consentQueue?: ConsentQueue;
}

export interface ExecutionPreviewPlan {
  capabilityId: string;
  parameters: any;
  riskLevel: string;
  riskScore: number;
  permissionsRequired: string[];
  explanation: string;
  requiresPassword?: boolean;
  requiresConsent?: boolean;
}

export class ExecutionEngine {
  private consentQueue: ConsentQueue;

  constructor(
    private capabilityManager: CapabilityManager,
    private permissionManager: IPermissionManager,
    private securityEngine: ISecurityEngine,
    private policyEngine: IPolicyEngine,
    private auditLogger: IAuditLogger,
    consentQueue?: ConsentQueue
  ) {
    this.consentQueue = consentQueue || ConsentQueue.getInstance();
  }

  public getConsentQueue(): ConsentQueue {
    return this.consentQueue;
  }

  private async requestConsent(
    plan: ExecutionPreviewPlan,
    options: ExecutionOptions,
    startTime: number
  ): Promise<boolean> {
    const queue = options.consentQueue || this.consentQueue;

    if (options.onAskPermission) {
      return await options.onAskPermission(plan);
    }

    if (queue.isAutoApprove()) {
      return await queue.enqueue(plan, options.tabId);
    }

    if (queue.hasListeners()) {
      return await queue.enqueue(plan, options.tabId);
    }

    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      return await queue.enqueue(plan, options.tabId);
    }

    // In unit test environment without callback or consent queue listeners, default to allow
    return true;
  }

  public static resolvePermissionCategory(capabilityId: string): PermissionCategory {
    if (capabilityId === 'filesystem.delete' || capabilityId === 'filesystem.trash') {
      return 'DeleteFiles';
    }
    if (capabilityId === 'filesystem.rename') {
      return 'RenameFiles';
    }
    if (capabilityId.startsWith('filesystem.') && ['create', 'mkdir', 'copy', 'move', 'duplicate', 'compress', 'extract', 'restore', 'permissions'].some(op => capabilityId.includes(op))) {
      return 'WriteFiles';
    }
    if (capabilityId === 'system.kill_process' || capabilityId === 'application.force_quit' || capabilityId.startsWith('process.')) {
      return 'ProcessManagement';
    }
    if (
      capabilityId.startsWith('shell.') || 
      capabilityId === 'application.install' || 
      capabilityId === 'application.uninstall' || 
      capabilityId === 'application.update' ||
      capabilityId === 'node.run' ||
      capabilityId === 'python.run'
    ) {
      return 'ShellExecution';
    }
    if (capabilityId.startsWith('git.')) {
      return 'Git';
    }
    if (capabilityId.startsWith('docker.')) {
      return 'Docker';
    }
    if (capabilityId === 'developer.ssh' || capabilityId.startsWith('ssh.') || capabilityId.includes('.ssh')) {
      return 'SSH';
    }
    if (capabilityId.startsWith('network.') || capabilityId.startsWith('wifi.') || capabilityId.startsWith('browser.')) {
      return 'Network';
    }
    if (capabilityId.startsWith('clipboard.')) {
      return 'Clipboard';
    }
    if (capabilityId === 'system.env_get' || capabilityId === 'system.env_set' || capabilityId === 'developer.env' || capabilityId.startsWith('env.')) {
      return 'EnvironmentVariables';
    }
    if (
      capabilityId === 'system.lock' || 
      capabilityId === 'system.sleep' || 
      capabilityId === 'system.volume' || 
      capabilityId === 'system.brightness' || 
      capabilityId === 'system.appearance' ||
      capabilityId.startsWith('system.settings')
    ) {
      return 'SystemSettings';
    }

    return 'ReadFiles';
  }

  public async execute<I, O>(
    capabilityId: string, 
    input: I, 
    options: ExecutionOptions = {}
  ): Promise<CapabilityResult<O>> {
    const startTime = performance.now();
    const capability = this.capabilityManager.getRegistry().get(capabilityId);

    if (!capability) {
      const sdkDriver = CapabilityRegistrySDK.getInstance().getDriver(capabilityId);
      if (sdkDriver) {
        // 1. Evaluate Policy Engine first for SDK calls
        const policyResult = this.policyEngine.evaluate(capabilityId, input);
        if (policyResult === 'Deny') {
          await this.logAudit(capabilityId, input, 100, 'Denied', startTime);
          return this.errorResult('POLICY_DENIED', 'Execution denied by policy rules.', startTime);
        }

        // 2. Evaluate permissions against current Profile
        const permCategory: PermissionCategory = ExecutionEngine.resolvePermissionCategory(capabilityId);

        let permState = this.permissionManager.checkPermission(permCategory);
        if (this.permissionManager.getCurrentProfile() === 'SafeMode' && capabilityId === 'filesystem.trash') {
          // Allow Trash with explicit prompt in SafeMode, while permanent deletes remain AlwaysDeny
          permState = 'AskEveryTime';
        }
        if (permState === 'AlwaysDeny') {
          await this.logAudit(capabilityId, input, 100, 'Denied', startTime);
          return this.errorResult('PERMISSION_DENIED', `Permission ${permCategory} is always denied under current security profile.`, startTime);
        }

        const risk = this.securityEngine.calculateRisk(capabilityId, input);
        const categoryPolicyResult = this.policyEngine.evaluateCategories(risk.categories || []);
        if (categoryPolicyResult === 'Deny') {
          await this.logAudit(capabilityId, input, 100, 'Denied', startTime);
          return this.errorResult('POLICY_DENIED', 'Execution denied by categorical policy rules.', startTime);
        }
        const isSafeAction = risk.level === 'SAFE';
        const isAlwaysAllow = permState === 'AlwaysAllow';
        const needsAsk = (!isSafeAction && permState === 'AskEveryTime') || policyResult === 'Ask' || (!isAlwaysAllow && (categoryPolicyResult === 'Ask' || risk.requiresConsent)) || risk.level === 'CRITICAL' || risk.level === 'ADMIN' || risk.requiresPassword || capabilityId === 'filesystem.delete' || capabilityId === 'filesystem.trash';
        if (needsAsk) {
          const requiresAuth = risk.requiresPassword ?? (risk.level === 'CRITICAL' || risk.level === 'ADMIN');
          const requiresConsent = risk.requiresConsent ?? (risk.level === 'CRITICAL' || risk.level === 'ADMIN');
          const authPerms = requiresAuth ? ['system.password_auth', 'user_consent'] : [];
          const fsAdmin = (capabilityId.startsWith('filesystem.') && (risk.level === 'CRITICAL' || risk.level === 'ADMIN')) ? ['filesystem.admin'] : [];

          const plan: ExecutionPreviewPlan = {
            capabilityId,
            parameters: input,
            riskLevel: risk.level,
            riskScore: risk.score,
            permissionsRequired: [permCategory, ...fsAdmin, ...authPerms],
            explanation: risk.explanation,
            requiresPassword: requiresAuth,
            requiresConsent
          };

          const approved = await this.requestConsent(plan, options, startTime);
          if (!approved) {
            await this.logAudit(capabilityId, input, risk.score, 'Denied', startTime);
            return this.errorResult('USER_CANCELLED', 'Declined in the confirmation dialog.', startTime);
          }
        }
        const res = await sdkDriver.execute(input, { isDryRun: options.isDryRun, cwd: options.cwd, timeoutMs: options.timeoutMs });
        const isVerified = res.success ? await sdkDriver.verify(input, res) : false;
        await this.logAudit(capabilityId, input, risk.score || 10, 'Granted', startTime, isVerified ? 'Success' : 'NotApplicable', !!res.rollbackPayload);
        return {
          success: res.success,
          data: res.data as O,
          error: res.error,
          executionTimeMs: res.executionTimeMs || (performance.now() - startTime),
          rollbackAction: res.rollbackPayload ? {
            description: `Rollback ${capabilityId}`,
            executeRollback: async () => await sdkDriver.rollback(input, res)
          } : undefined
        };
      }
      return this.errorResult('CAP_NOT_FOUND', `Capability '${capabilityId}' not found.`, startTime);
    }

    try {
      // 1. Validate Input (Zod)
      if (capability.inputSchema) {
        const parseResult = capability.inputSchema.safeParse(input);
        if (!parseResult.success) {
          return this.errorResult('VALIDATION_FAILED', 'Input schema validation failed', startTime, (parseResult.error as any).issues || (parseResult.error as any).errors);
        }
      }

      // 2. Check Policy
      const policyResult = this.policyEngine.evaluate(capabilityId, input);
      if (policyResult === 'Deny') {
        await this.logAudit(capabilityId, input, 100, 'Denied', startTime);
        return this.errorResult('POLICY_DENIED', 'Execution denied by policy rules.', startTime);
      }

      // 3. Risk Analysis
      const risk = this.securityEngine.calculateRisk(capabilityId, input);
      const categoryPolicyResult = this.policyEngine.evaluateCategories(risk.categories || []);
      if (categoryPolicyResult === 'Deny') {
        await this.logAudit(capabilityId, input, 100, 'Denied', startTime);
        return this.errorResult('POLICY_DENIED', 'Execution denied by categorical policy rules.', startTime);
      }

      // 4. Check Permissions
      let permissionResult: 'Granted' | 'Denied' | 'Bypassed' = 'Granted';
      let hasAlwaysAllow = capability.metadata.requiredPermissions.length > 0;
      let hasAskEveryTime = false;

      for (const requiredPerm of capability.metadata.requiredPermissions) {
        const state = this.permissionManager.checkPermission(requiredPerm as PermissionCategory);
        if (state === 'AlwaysDeny') {
          await this.logAudit(capabilityId, input, risk.score, 'Denied', startTime);
          return this.errorResult('PERMISSION_DENIED', `Permission ${requiredPerm} is always denied.`, startTime);
        }
        if (state === 'AskEveryTime') {
          hasAskEveryTime = true;
        }
        if (state !== 'AlwaysAllow') {
          hasAlwaysAllow = false;
        }
      }

      let needsAsk = policyResult === 'Ask' || hasAskEveryTime || (!hasAlwaysAllow && (categoryPolicyResult === 'Ask' || risk.requiresConsent)) || risk.level === 'CRITICAL' || risk.level === 'ADMIN' || risk.requiresPassword;

      // 5. Preview & Ask User
      if (needsAsk) {
        const plan: ExecutionPreviewPlan = {
          capabilityId,
          parameters: input,
          riskLevel: risk.level,
          riskScore: risk.score,
          permissionsRequired: [...capability.metadata.requiredPermissions, ...(risk.requiresPassword ? ['system.password_auth', 'user_consent'] : [])],
          explanation: risk.explanation,
          requiresPassword: risk.requiresPassword ?? (risk.level === 'CRITICAL' || risk.level === 'ADMIN'),
          requiresConsent: risk.requiresConsent ?? (risk.level === 'CRITICAL' || risk.level === 'ADMIN')
        };

        const approved = await this.requestConsent(plan, options, startTime);
        if (!approved) {
          await this.logAudit(capabilityId, input, risk.score, 'Denied', startTime);
          return this.errorResult('USER_CANCELLED', 'Declined in the confirmation dialog.', startTime);
        }
      }

      // 6. Dry Run Support
      if (options.isDryRun) {
        if (!capability.supportsDryRun) {
           return this.errorResult('DRY_RUN_UNSUPPORTED', 'This capability does not support dry run simulation.', startTime);
        }
        // Assuming capability.execute uses second param for dry run flag
        const result = await capability.execute(input, true);
        await this.logAudit(capabilityId, input, risk.score, 'Granted', startTime, result.success ? 'Success' : 'Failure');
        return result;
      }

      // 7. Execute
      const result = await capability.execute(input);

      // 8. Verify
      let verifyResult: 'Success' | 'Failure' | 'NotApplicable' = 'NotApplicable';
      if (result.success && capability.verify) {
        try {
          const verified = await capability.verify(input, result);
          if (!verified) {
             verifyResult = 'Failure';
             return this.errorResult('VERIFICATION_FAILED', 'Capability executed but verification failed.', startTime, undefined, result.rollbackAction);
          }
          verifyResult = 'Success';
        } catch (e: any) {
          verifyResult = 'Failure';
        }
      }

      // 9. Audit Log
      await this.logAudit(capabilityId, input, risk.score, 'Granted', startTime, verifyResult, !!result.rollbackAction);

      result.executionTimeMs = performance.now() - startTime;
      return result;

    } catch (e: any) {
      return this.errorResult('UNEXPECTED_ERROR', e.message || 'Unknown execution engine error', startTime);
    }
  }

  private async logAudit(
    capabilityId: string, 
    input: any, 
    riskScore: number, 
    permissionResult: 'Granted' | 'Denied' | 'Bypassed', 
    startTime: number,
    verificationResult: 'Success' | 'Failure' | 'NotApplicable' = 'NotApplicable',
    rollbackAvailable: boolean = false
  ) {
    const executionTimeMs = performance.now() - startTime;
    await this.auditLogger.log({
      capabilityId,
      parameters: input,
      riskScore,
      permissionResult,
      executionTimeMs,
      verificationResult,
      rollbackAvailable,
      userConfirmation: permissionResult === 'Granted' // Simplifying for now
    });
  }

  private errorResult(code: string, message: string, startTime: number, details?: any, rollbackAction?: any): CapabilityResult<any> {
    return {
      success: false,
      error: { code, message, details },
      executionTimeMs: performance.now() - startTime,
      rollbackAction
    };
  }
}
