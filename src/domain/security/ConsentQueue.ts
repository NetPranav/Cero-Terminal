/**
 * ConsentQueue.ts — Asynchronous Non-Blocking Consent Flow
 * 
 * Part of Phase 0.5 (Roadmap item 0.5.2):
 * Manages pending user consent/authorization requests for sensitive or admin operations
 * without blocking the entire session or PTY lifecycle. Multi-tab aware.
 */

import { ExecutionPreviewPlan } from './ExecutionEngine';

export type ConsentStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';

export interface ConsentRequest {
  id: string;
  capabilityId: string;
  plan: ExecutionPreviewPlan;
  status: ConsentStatus;
  tabId?: string;
  createdAt: number;
  resolvedAt?: number;
  resolve: (approved: boolean) => void;
  reject: (err: any) => void;
}

export type ConsentQueueListener = (requests: ConsentRequest[]) => void;

export class ConsentQueue {
  private static instance: ConsentQueue | null = null;
  private pendingRequests: Map<string, ConsentRequest> = new Map();
  private listeners: Set<ConsentQueueListener> = new Set();
  /**
   * Approves every request without asking. Only the prompt benchmark turns this on, with the
   * Cero-specific CERO_BENCHMARK switch. Generic variables such as CI or HEADLESS must
   * never do it: many shells and every CI runner export CI=true.
   */
  private autoApprove: boolean =
    typeof process !== 'undefined' && !!process.env && process.env.CERO_BENCHMARK === 'true';

  public static getInstance(): ConsentQueue {
    if (!ConsentQueue.instance) {
      ConsentQueue.instance = new ConsentQueue();
    }
    return ConsentQueue.instance;
  }

  public setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled;
  }

  public isAutoApprove(): boolean {
    return this.autoApprove;
  }

  public hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  /**
   * Enqueues a consent request for user authorization.
   * Returns a promise that resolves to true (approved) or false (denied/cancelled).
   */
  public enqueue(plan: ExecutionPreviewPlan, tabId?: string): Promise<boolean> {
    if (this.isAutoApprove()) {
      return Promise.resolve(true);
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return new Promise<boolean>((resolve, reject) => {
      const request: ConsentRequest = {
        id,
        capabilityId: plan.capabilityId,
        plan,
        status: 'PENDING',
        tabId,
        createdAt: Date.now(),
        resolve,
        reject
      };

      this.pendingRequests.set(id, request);
      this.notifyListeners();
    });
  }

  /**
   * Approves a pending consent request by ID.
   */
  public approve(id: string): boolean {
    const request = this.pendingRequests.get(id);
    if (!request || request.status !== 'PENDING') {
      return false;
    }

    request.status = 'APPROVED';
    request.resolvedAt = Date.now();
    this.pendingRequests.delete(id);
    request.resolve(true);
    this.notifyListeners();
    return true;
  }

  /**
   * Denies a pending consent request by ID.
   */
  public deny(id: string): boolean {
    const request = this.pendingRequests.get(id);
    if (!request || request.status !== 'PENDING') {
      return false;
    }

    request.status = 'DENIED';
    request.resolvedAt = Date.now();
    this.pendingRequests.delete(id);
    request.resolve(false);
    this.notifyListeners();
    return true;
  }

  /**
   * Cancels a pending consent request (e.g. on session termination or user abort).
   */
  public cancel(id: string, reason?: string): boolean {
    const request = this.pendingRequests.get(id);
    if (!request || request.status !== 'PENDING') {
      return false;
    }

    request.status = 'CANCELLED';
    request.resolvedAt = Date.now();
    this.pendingRequests.delete(id);
    request.resolve(false);
    this.notifyListeners();
    return true;
  }

  /**
   * Gets all pending consent requests, optionally filtered by tab ID.
   */
  public getPendingRequests(tabId?: string): ConsentRequest[] {
    const all = Array.from(this.pendingRequests.values());
    if (tabId !== undefined) {
      return all.filter(r => r.tabId === tabId);
    }
    return all;
  }

  /**
   * Gets a specific consent request by ID.
   */
  public getRequest(id: string): ConsentRequest | undefined {
    return this.pendingRequests.get(id);
  }

  /**
   * Returns true if there are pending requests.
   */
  public hasPending(tabId?: string): boolean {
    return this.getPendingRequests(tabId).length > 0;
  }

  /**
   * Clears all pending requests, optionally filtered by tabId.
   */
  public clearQueue(tabId?: string): void {
    const targets = this.getPendingRequests(tabId);
    for (const req of targets) {
      req.status = 'CANCELLED';
      req.resolvedAt = Date.now();
      this.pendingRequests.delete(req.id);
      req.resolve(false);
    }
    if (targets.length > 0) {
      this.notifyListeners();
    }
  }

  /**
   * Subscribes to queue changes. Immediately delivers the current pending list.
   */
  public subscribe(listener: ConsentQueueListener): () => void {
    this.listeners.add(listener);
    try {
      listener(this.getPendingRequests());
    } catch {
      // ignore initial dispatch error
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Resets queue state for testing.
   */
  public reset(): void {
    this.clearQueue();
    this.listeners.clear();
    this.autoApprove = false;
  }

  private notifyListeners(): void {
    const current = this.getPendingRequests();
    for (const listener of this.listeners) {
      try {
        listener(current);
      } catch (err) {
        console.error('[ConsentQueue] Error in listener callback:', err);
      }
    }
  }
}
