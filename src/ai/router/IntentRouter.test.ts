import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntentRouter } from './IntentRouter';
import { IntentModel } from '../models/IntentModel';
import { EntityExtractor } from './EntityExtractor';

describe('IntentRouter (Phase 0.75 Tasks 0.75.1, 0.75.8, 0.75.9)', () => {
  beforeEach(() => {
    IntentRouter.resetInstance();
  });

  it('routes application commands and provides domain-scoped tools', async () => {
    const router = IntentRouter.getInstance();
    const result = await router.route('open nvim');

    expect(result.intent.domain).toBe('application');
    expect(result.intent.action).toBe('open');
    expect(result.recommendedTools).toContain('application.open');
    expect(result.recommendedTools).toContain('application.install');
    expect(result.recommendedTools).toContain('shell.execute');
  });

  it('routes system commands and provides system diagnostic tools', async () => {
    const router = IntentRouter.getInstance();
    const result = await router.route('check my cpu and ram usage');

    expect(result.intent.domain).toBe('system');
    expect(result.recommendedTools).toContain('system.cpu');
    expect(result.recommendedTools).toContain('system.memory');
    expect(result.recommendedTools).toContain('shell.execute');
  });

  it('routes network commands and provides wireless tools', async () => {
    const router = IntentRouter.getInstance();
    const result = await router.route('scan available wifi networks');

    expect(result.intent.domain).toBe('network');
    expect(result.recommendedTools).toContain('network.wifi.scan');
    expect(result.recommendedTools).toContain('shell.execute');
  });

  it('supports singleton pattern and reset', () => {
    const instance1 = IntentRouter.getInstance();
    const instance2 = IntentRouter.getInstance();
    expect(instance1).toBe(instance2);

    IntentRouter.resetInstance();
    const instance3 = IntentRouter.getInstance();
    expect(instance3).not.toBe(instance1);
  });

  it('allows custom IntentModel injection for dependency injection / mocking', async () => {
    const mockModel: IntentModel = {
      classify: vi.fn().mockResolvedValue({
        domain: 'git',
        action: 'branch',
        confidence: 0.99,
        executionTier: 'intent_cpu'
      })
    };

    const router = new IntentRouter(mockModel, new EntityExtractor());
    const result = await router.route('switch to branch main');

    expect(mockModel.classify).toHaveBeenCalledWith('switch to branch main', undefined);
    expect(result.intent.domain).toBe('git');
    expect(result.intent.action).toBe('branch');
    expect(result.recommendedTools).toContain('git.branch');
  });

  it('handles classification errors gracefully with safe shell fallback', async () => {
    const failingModel: IntentModel = {
      classify: vi.fn().mockRejectedValue(new Error('CPU inference crash'))
    };

    const router = new IntentRouter(failingModel, new EntityExtractor());
    const result = await router.route('unrecognized obscure string');

    expect(result.intent.domain).toBe('shell');
    expect(result.intent.action).toBe('execute');
    expect(result.intent.confidence).toBe(0.1);
    expect(result.recommendedTools).toEqual(['shell.execute']);
  });
});
