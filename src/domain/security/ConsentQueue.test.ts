import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsentQueue, ConsentRequest } from './ConsentQueue';
import { ExecutionPreviewPlan } from './ExecutionEngine';

describe('ConsentQueue', () => {
  let queue: ConsentQueue;

  const mockPlan: ExecutionPreviewPlan = {
    capabilityId: 'shell.execute',
    parameters: { command: 'systemctl restart nginx' },
    riskLevel: 'ADMIN',
    riskScore: 85,
    permissionsRequired: ['ShellExecution', 'system.password_auth'],
    explanation: 'Restarting system service requires administrative authorization',
    requiresPassword: true,
    requiresConsent: true
  };

  beforeEach(() => {
    queue = new ConsentQueue();
    queue.setAutoApprove(false);
  });

  it('should enqueue requests and return a pending promise', async () => {
    let resolvedValue: boolean | null = null;
    const promise = queue.enqueue(mockPlan, 'tab-1').then(val => {
      resolvedValue = val;
      return val;
    });

    const pending = queue.getPendingRequests();
    expect(pending.length).toBe(1);
    expect(pending[0].capabilityId).toBe('shell.execute');
    expect(pending[0].tabId).toBe('tab-1');
    expect(pending[0].status).toBe('PENDING');
    expect(resolvedValue).toBeNull();

    // Approve the request
    const approved = queue.approve(pending[0].id);
    expect(approved).toBe(true);

    const result = await promise;
    expect(result).toBe(true);
    expect(queue.getPendingRequests().length).toBe(0);
  });

  it('should handle request denial', async () => {
    const promise = queue.enqueue(mockPlan, 'tab-1');
    const pending = queue.getPendingRequests();
    expect(pending.length).toBe(1);

    const denied = queue.deny(pending[0].id);
    expect(denied).toBe(true);

    const result = await promise;
    expect(result).toBe(false);
    expect(queue.getPendingRequests().length).toBe(0);
  });

  it('should handle request cancellation', async () => {
    const promise = queue.enqueue(mockPlan, 'tab-1');
    const pending = queue.getPendingRequests();

    const cancelled = queue.cancel(pending[0].id, 'User aborted');
    expect(cancelled).toBe(true);

    const result = await promise;
    expect(result).toBe(false);
    expect(queue.getPendingRequests().length).toBe(0);
  });

  it('should isolate and filter pending requests per tab', async () => {
    queue.enqueue({ ...mockPlan, capabilityId: 'tab1.cap' }, 'tab-1');
    queue.enqueue({ ...mockPlan, capabilityId: 'tab2.cap' }, 'tab-2');
    queue.enqueue({ ...mockPlan, capabilityId: 'tab1.cap2' }, 'tab-1');

    expect(queue.getPendingRequests().length).toBe(3);
    expect(queue.getPendingRequests('tab-1').length).toBe(2);
    expect(queue.getPendingRequests('tab-2').length).toBe(1);
    expect(queue.getPendingRequests('tab-3').length).toBe(0);

    // Clear only tab-1 requests
    queue.clearQueue('tab-1');
    expect(queue.getPendingRequests('tab-1').length).toBe(0);
    expect(queue.getPendingRequests('tab-2').length).toBe(1);
  });

  it('should notify subscribers on enqueue, approve, and clear events', async () => {
    const events: ConsentRequest[][] = [];
    const unsubscribe = queue.subscribe((requests) => {
      events.push([...requests]);
    });

    // Initial state notification
    expect(events.length).toBe(1);
    expect(events[0].length).toBe(0);

    // Enqueue
    const promise = queue.enqueue(mockPlan, 'tab-1');
    expect(events.length).toBe(2);
    expect(events[1].length).toBe(1);

    // Approve
    const reqId = events[1][0].id;
    queue.approve(reqId);
    await promise;

    expect(events.length).toBe(3);
    expect(events[2].length).toBe(0);

    unsubscribe();
    queue.enqueue(mockPlan, 'tab-2');
    // No new events after unsubscribe
    expect(events.length).toBe(3);
  });

  it('should automatically approve in headless/CI mode without queuing', async () => {
    queue.setAutoApprove(true);
    expect(queue.isAutoApprove()).toBe(true);

    const result = await queue.enqueue(mockPlan, 'tab-ci');
    expect(result).toBe(true);
    expect(queue.getPendingRequests().length).toBe(0);
  });

  it('should return false when approving or denying non-existent request', () => {
    expect(queue.approve('non-existent-id')).toBe(false);
    expect(queue.deny('non-existent-id')).toBe(false);
    expect(queue.cancel('non-existent-id')).toBe(false);
  });
});

import { CapabilityManager, Capability, CapabilityResult } from '../Capability';
import { PermissionManager } from './PermissionManager';
import { SecurityEngine } from './SecurityEngine';
import { PolicyEngine } from './PolicyEngine';
import { AuditLogger } from './AuditLogger';
import { ExecutionEngine } from './ExecutionEngine';
import { z } from 'zod';

class MockConsentCapability implements Capability<any, any> {
  metadata = {
    id: 'consent.test.cap',
    name: 'Consent Test',
    description: 'Testing consent',
    category: 'Other' as const,
    supportedPlatforms: ['linux'] as any,
    requiredPermissions: ['Network'],
    version: '1.0.0'
  };

  inputSchema = z.object({ value: z.string() });
  supportsDryRun = false;

  async execute(input: any): Promise<CapabilityResult<any>> {
    return { success: true, data: input.value };
  }
}

describe('ExecutionEngine + ConsentQueue Integration', () => {
  let executionEngine: ExecutionEngine;
  let consentQueue: ConsentQueue;
  let permissionManager: PermissionManager;

  beforeEach(() => {
    const capManager = CapabilityManager.getInstance();
    capManager.getRegistry().register(new MockConsentCapability());

    permissionManager = new PermissionManager();
    permissionManager.setPermission('Network', 'AskEveryTime');

    consentQueue = new ConsentQueue();
    consentQueue.setAutoApprove(false);

    executionEngine = new ExecutionEngine(
      capManager,
      permissionManager,
      new SecurityEngine(),
      new PolicyEngine(),
      new AuditLogger(),
      consentQueue
    );
  });

  it('should enqueue to ConsentQueue when onAskPermission is omitted and queue has listeners', async () => {
    let capturedReq: ConsentRequest | null = null;
    consentQueue.subscribe((reqs) => {
      if (reqs.length > 0) {
        capturedReq = reqs[0];
      }
    });

    const execPromise = executionEngine.execute('consent.test.cap', { value: 'run-async' }, { tabId: 'tab-pty-1' });

    // Ensure the request was enqueued asynchronously
    expect(capturedReq).not.toBeNull();
    const req = capturedReq as unknown as ConsentRequest;
    expect(req.capabilityId).toBe('consent.test.cap');
    expect(req.tabId).toBe('tab-pty-1');
    expect(req.status).toBe('PENDING');

    // Approve the request
    consentQueue.approve(req.id);

    const result = await execPromise;
    expect(result.success).toBe(true);
    expect(result.data).toBe('run-async');
  });

  it('should reject execution with USER_CANCELLED when request is denied in ConsentQueue', async () => {
    let capturedReq: ConsentRequest | null = null;
    consentQueue.subscribe((reqs) => {
      if (reqs.length > 0) capturedReq = reqs[0];
    });

    const execPromise = executionEngine.execute('consent.test.cap', { value: 'run-denied' }, { tabId: 'tab-pty-2' });

    expect(capturedReq).not.toBeNull();
    const req = capturedReq as unknown as ConsentRequest;
    consentQueue.deny(req.id);

    const result = await execPromise;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('USER_CANCELLED');
  });

  it('should immediately succeed in auto-approve mode without queuing', async () => {
    consentQueue.setAutoApprove(true);

    const result = await executionEngine.execute('consent.test.cap', { value: 'auto-approved' });
    expect(result.success).toBe(true);
    expect(result.data).toBe('auto-approved');
    expect(consentQueue.getPendingRequests().length).toBe(0);
  });
});


describe('ConsentQueue auto-approve switch', () => {
  it('is not turned on by generic CI or HEADLESS variables', async () => {
    const { ConsentQueue } = await import('./ConsentQueue');
    const before = { CI: process.env.CI, HEADLESS: process.env.HEADLESS };
    process.env.CI = 'true';
    process.env.HEADLESS = 'true';
    try {
      expect(new ConsentQueue().isAutoApprove()).toBe(false);
    } finally {
      process.env.CI = before.CI;
      process.env.HEADLESS = before.HEADLESS;
      if (before.CI === undefined) delete process.env.CI;
      if (before.HEADLESS === undefined) delete process.env.HEADLESS;
    }
  });
});
