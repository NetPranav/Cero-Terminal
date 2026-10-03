import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdaptiveExecutionEngine } from '../engine/AdaptiveExecutionEngine';
import { AdaptiveVerificationEngine } from '../verification/AdaptiveVerificationEngine';
import { MultiStageVerifier } from '../verification/MultiStageVerifier';
import { VerificationSources } from '../verification/VerificationSources';
import { StateEngine } from '../../state/engine/StateEngine';
import { CapabilityResult } from '../../sdk/capabilities/CapabilityTypes';

describe('AdaptiveExecutionEngine & RecoveryEngine — End-to-End Resilient Runtime', () => {
  let engine: AdaptiveExecutionEngine;
  let stateEngine: StateEngine;

  beforeEach(async () => {
    stateEngine = new StateEngine();
    await stateEngine.initialize();
    const sources = new VerificationSources(stateEngine);
    const verifier = new AdaptiveVerificationEngine(new MultiStageVerifier(sources, 5));
    engine = new AdaptiveExecutionEngine(verifier);
  });

  it('should complete cleanly on first attempt when driver execution and verification succeed', async () => {
    const mockSuccess: CapabilityResult = {
      success: true,
      outputs: { connectedSSID: 'Cero_5G_Network' },
      warnings: [],
      timings: { executionMs: 5, dispatchMs: 0 },
    };

    const outcome = await engine.executeWithResilience('wifi.connect', async () => mockSuccess);

    expect(outcome.success).toBe(true);
    expect(outcome.recovery).toBeUndefined();
    expect(outcome.verification.success).toBe(true);
    expect(outcome.totalExecutionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should automatically diagnose, plan, and execute recovery RepairGraphs when initial action fails', async () => {
    let attemptCount = 0;
    const mockFailureCallback = vi.fn().mockImplementation(async () => {
      attemptCount++;
      return {
        success: false,
        outputs: {},
        error: 'ETIMEDOUT: network interface connection timed out',
        warnings: [],
        timings: { executionMs: 10, dispatchMs: 0 },
      };
    });

    const outcome = await engine.executeWithResilience(
      'wifi.connect',
      mockFailureCallback,
      undefined,
      undefined,
      { type: 'isConnected', target: 'Cero_5G_Network', expectedValue: true },
      'RetryStrategy'
    );

    expect(mockFailureCallback).toHaveBeenCalledTimes(1);
    expect(outcome.recovery).toBeDefined();
    expect(outcome.recovery?.resolutionStrategy).toContain('RetryStrategy');
    expect(outcome.recovery?.repairGraph?.nodes.length).toBeGreaterThan(0);
    expect(outcome.success).toBe(true); // Successfully recovered and verified in post-repair stage!
  });

  it('should safely halt execution and initiate controlled escalation when encountering unrecoverable faults', async () => {
    const cancelCallback = async (): Promise<CapabilityResult> => ({
      success: false,
      outputs: {},
      error: 'Execution aborted via CancellationToken by user request',
      warnings: [],
      timings: { executionMs: 1, dispatchMs: 0 },
    });

    const outcome = await engine.executeWithResilience('system.heavy_task', cancelCallback);
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain('Unrecoverable execution fault');
  });
});
