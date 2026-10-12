/**
 * ExecutionEngine.ts — Master orchestrator for Cero V3 Execution Runtime
 *
 * Coordinates ExecutionSessions, Schedulers, State Machines, and Event Streams.
 * Guaranteed stateless between sessions: retains zero session state after execution completes.
 */

import { ActionGraph, ActionResult, ActionExecutor } from '../../actions/models/ActionTypes';
import { SessionSnapshot, SessionProgress } from '../models/RuntimeTypes';
import { ExecutionSession } from '../sessions/ExecutionSession';
import { SessionLifecycleManager } from '../lifecycle/SessionLifecycle';
import { RuntimeEventBus } from '../events/RuntimeEventBus';
import { RuntimeHooks } from '../lifecycle/RuntimeHooks';
import { MockExecutor } from '../executor/NodeExecutor';

export interface ExecutionEngineOutput {
  sessionId: string;
  results: ActionResult[];
  snapshot: SessionSnapshot;
}

export class ExecutionEngine {
  private lifecycle = new SessionLifecycleManager();

  constructor(
    public readonly eventBus = new RuntimeEventBus(),
    public readonly hooks = new RuntimeHooks(),
    private defaultExecutor: ActionExecutor = new MockExecutor()
  ) {}

  /**
   * Executes an ActionGraph inside an isolated ExecutionSession.
   * Completely stateless: once execution completes, the session is cleared from runtime memory.
   */
  public async execute(
    graph: ActionGraph,
    customExecutor?: ActionExecutor,
    sessionId?: string
  ): Promise<ExecutionEngineOutput> {
    const executor = customExecutor || this.defaultExecutor;
    const session = new ExecutionSession(graph, this.eventBus, this.hooks, executor, sessionId);
    
    this.lifecycle.register(session);

    try {
      const results = await session.execute();
      const snapshot = session.export();
      return {
        sessionId: session.sessionId,
        results,
        snapshot,
      };
    } finally {
      // Clean up session and clear event history for this session from the global bus
      // to ensure zero session-specific state retention in the runtime.
      this.lifecycle.unregister(session.sessionId);
      this.eventBus.clearHistory(session.sessionId);
    }
  }

  /**
   * Cancel an active execution session or an individual action node within it.
   */
  public async cancel(sessionId: string, nodeId?: string): Promise<boolean> {
    return this.lifecycle.cancelSession(sessionId, nodeId);
  }

  /**
   * Pause an active execution session.
   */
  public pause(sessionId: string): boolean {
    return this.lifecycle.pauseSession(sessionId);
  }

  /**
   * Resume a paused execution session.
   */
  public resume(sessionId: string): boolean {
    return this.lifecycle.resumeSession(sessionId);
  }

  /**
   * Get live progress of an active session.
   */
  public getProgress(sessionId: string): SessionProgress | undefined {
    return this.lifecycle.getProgress(sessionId);
  }

  /**
   * Get total number of currently active sessions running in the engine.
   */
  public getActiveSessionCount(): number {
    return this.lifecycle.getActiveCount();
  }

  /**
   * Replay a completed session from its event history snapshot for debugging or visualization.
   */
  public async replaySession(snapshot: SessionSnapshot, onEvent: (ev: any) => void | Promise<void>): Promise<void> {
    for (const ev of snapshot.events) {
      await onEvent(ev);
    }
  }
}
