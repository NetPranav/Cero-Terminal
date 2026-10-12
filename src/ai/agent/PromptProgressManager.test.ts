import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptProgressManager, PromptProgressState } from './PromptProgressManager';

describe('PromptProgressManager', () => {
  let manager: PromptProgressManager;
  let listeners: Record<string, Function[]> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = {};
    const mockWindow = {
      addEventListener: (type: string, fn: Function) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      removeEventListener: (type: string, fn: Function) => {
        if (!listeners[type]) return;
        listeners[type] = listeners[type].filter(f => f !== fn);
      },
      dispatchEvent: (e: any) => {
        listeners[e.type]?.forEach(f => f(e));
        return true;
      }
    };
    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('CustomEvent', class CustomEvent {
      type: string;
      detail: any;
      constructor(type: string, opts?: any) {
        this.type = type;
        this.detail = opts?.detail;
      }
    });

    manager = PromptProgressManager.getInstance();
    manager.reset();
  });

  afterEach(() => {
    manager.reset();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('initializes in idle state', () => {
    const state = manager.getState();
    expect(state.active).toBe(false);
    expect(state.percent).toBe(0);
    expect(state.stage).toBe('Idle');
    expect(state.goal).toBe('');
  });

  it('starts prompt tracking with goal and initial progress', () => {
    manager.startPrompt('list all docker containers', 5.0);
    const state = manager.getState();

    expect(state.active).toBe(true);
    expect(state.goal).toBe('list all docker containers');
    expect(state.stage).toBe('Thinking...');
    expect(state.percent).toBeGreaterThanOrEqual(10);
    expect(state.estimatedTotalSec).toBe(5.0);
    expect(state.estimatedSecLeft).toBe(5.0);
  });

  it('smoothly advances percentage and remaining time on interval ticks', () => {
    manager.startPrompt('find files modified today', 4.0);

    // Fast-forward 240ms (2 ticker intervals)
    vi.advanceTimersByTime(240);

    const state = manager.getState();
    expect(state.percent).toBeGreaterThan(10);
    expect(state.elapsedSec).toBeGreaterThanOrEqual(0.2);
  });

  it('updates stages and smoothly adjusts target percent', () => {
    manager.startPrompt('optimize system performance');
    manager.updateStage('Planning...', 45);

    let state = manager.getState();
    expect(state.stage).toBe('Planning...');

    manager.updateStage('Running: systemctl status', 75);
    state = manager.getState();
    expect(state.stage).toBe('Running: systemctl status');
  });

  it('marks prompt completed successfully and records elapsed time', () => {
    manager.startPrompt('check disk usage');
    vi.advanceTimersByTime(1200);

    manager.completePrompt(true, 'Checked disk usage');
    const state = manager.getState();

    expect(state.active).toBe(false);
    expect(state.percent).toBe(100);
    expect(state.stage).toBe('Done');
    expect(state.success).toBe(true);
    expect(state.elapsedSec).toBeGreaterThanOrEqual(1.2);
    expect(state.completedAt).toBeDefined();
  });

  it('marks prompt failed with custom error message', () => {
    manager.startPrompt('install missing driver');
    manager.completePrompt(false, 'Permission denied');
    const state = manager.getState();

    expect(state.active).toBe(false);
    expect(state.percent).toBe(100);
    expect(state.stage).toBe('Permission denied');
    expect(state.success).toBe(false);
  });

  it('broadcasts cero:prompt-progress events', () => {
    const receivedEvents: PromptProgressState[] = [];
    const handler = (e: any) => {
      receivedEvents.push(e.detail);
    };

    window.addEventListener('cero:prompt-progress', handler);

    manager.startPrompt('test prompt broadcast');
    expect(receivedEvents.length).toBeGreaterThan(0);
    expect(receivedEvents[receivedEvents.length - 1].goal).toBe('test prompt broadcast');

    manager.updateStage('Verifying...', 90);
    expect(receivedEvents[receivedEvents.length - 1].stage).toBe('Verifying...');

    manager.completePrompt(true);
    expect(receivedEvents[receivedEvents.length - 1].percent).toBe(100);

    window.removeEventListener('cero:prompt-progress', handler);
  });

  it('resets to idle automatically after completion period', () => {
    manager.startPrompt('temporary prompt');
    manager.completePrompt(true);

    expect(manager.getState().percent).toBe(100);

    // Fast-forward past 3.5s cooldown
    vi.advanceTimersByTime(3600);

    expect(manager.getState().active).toBe(false);
    expect(manager.getState().percent).toBe(0);
    expect(manager.getState().stage).toBe('Idle');
  });
});
