import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveVerificationEngine } from '../verification/AdaptiveVerificationEngine';
import { MultiStageVerifier } from '../verification/MultiStageVerifier';
import { VerificationSources } from '../verification/VerificationSources';
import { StateEngine } from '../../state/engine/StateEngine';
import { StateEventBus } from '../../state/events/StateEventBus';
import { CapabilityResult } from '../../sdk/capabilities/CapabilityTypes';

describe('AdaptiveVerificationEngine & MultiStageVerifier — Evidence-Based Resilience', () => {
  let verifier: AdaptiveVerificationEngine;
  let stateEngine: StateEngine;
  let eventBus: StateEventBus;

  beforeEach(async () => {
    eventBus = new StateEventBus();
    stateEngine = new StateEngine();
    await stateEngine.initialize();
    const sources = new VerificationSources(stateEngine, eventBus);
    verifier = new AdaptiveVerificationEngine(new MultiStageVerifier(sources, 10));
  });

  it('should combine evidence across multiple independent observation sources with high confidence', async () => {
    const mockExec: CapabilityResult = {
      success: true,
      outputs: { connectedSSID: 'Cero_5G_Network' },
      warnings: [],
      timings: { executionMs: 5, dispatchMs: 0 },
    };

    const res = await verifier.verifyAction('wifi.connect', mockExec, undefined, undefined, {
      type: 'isConnected',
      target: 'Cero_5G_Network',
      expectedValue: true,
    });

    expect(res.success).toBe(true);
    expect(res.confidence).toBeGreaterThanOrEqual(0.8);
    expect(res.evidence.length).toBeGreaterThanOrEqual(2);
    expect(res.reasoning).toContain('Verification passed');
    expect(res.verifiedOutputs.connectedSSID).toBe('Cero_5G_Network');
  });

  it('should trigger delayed Stage 2 settling checks when initial verification indicates asynchronous race conditions', async () => {
    const mockExec: CapabilityResult = {
      success: false,
      outputs: {},
      error: 'Resource temporarily locked: race condition suspected on database port',
      warnings: [],
      timings: { executionMs: 2, dispatchMs: 0 },
    };

    const res = await verifier.verifyAction('process.bind', mockExec, undefined, undefined, undefined, 'immediate');

    expect(res.success).toBe(false);
    expect(res.stage).toBe('delayed'); // Automatically advanced to Stage 2 settling check
    expect(res.evidence.some(e => e.toLowerCase().includes('race') || e.toLowerCase().includes('failure'))).toBe(true);
  });

  it('should execute Stage 4 Pre-Consumption audits before downstream nodes bind parameters', async () => {
    const audit = await verifier.verifyPreConsumption('wifi.connect', ['connectedSSID', 'ipAddress']);
    expect(audit.success).toBe(true);
    expect(audit.stage).toBe('pre-consumption');
    expect(audit.evidence[0]).toContain('Audited 2 parameter bindings');
  });

  it('should guarantee all outcomes return explicit confidence, reasoning, evidence arrays, and timestamps', async () => {
    const res = await verifier.verifyPostRepair('system.audio.mute');
    expect(typeof res.confidence).toBe('number');
    expect(typeof res.reasoning).toBe('string');
    expect(Array.isArray(res.evidence)).toBe(true);
    expect(typeof res.timestamp).toBe('number');
  });
});
