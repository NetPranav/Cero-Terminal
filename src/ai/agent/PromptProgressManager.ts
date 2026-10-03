/**
 * PromptProgressManager.ts — Real-time AI Prompt Progress & Time Estimation
 *
 * Tracks live progress percentage, multi-stage lifecycle, elapsed time,
 * and estimated time to completion for all natural language AI prompts.
 */

export interface PromptProgressState {
  active: boolean;
  goal: string;
  stage: string;
  percent: number;
  startTime: number;
  elapsedSec: number;
  estimatedTotalSec: number;
  estimatedSecLeft: number;
  success?: boolean;
  completedAt?: number;
}

export class PromptProgressManager {
  private static instance: PromptProgressManager;

  private state: PromptProgressState = {
    active: false,
    goal: '',
    stage: 'Idle',
    percent: 0,
    startTime: 0,
    elapsedSec: 0,
    estimatedTotalSec: 4.5,
    estimatedSecLeft: 0
  };

  private tickerInterval: any = null;
  private targetPercent: number = 0;
  private averageLatencySec: number = 4.2;

  public static getInstance(): PromptProgressManager {
    if (!PromptProgressManager.instance) {
      PromptProgressManager.instance = new PromptProgressManager();
    }
    return PromptProgressManager.instance;
  }

  public getState(): PromptProgressState {
    return { ...this.state };
  }

  /**
   * Start tracking a new prompt execution.
   */
  public startPrompt(goal: string, estimatedSec?: number): void {
    const est = estimatedSec || this.averageLatencySec;
    const now = Date.now();

    this.state = {
      active: true,
      goal: goal.trim(),
      stage: 'Thinking...',
      percent: 10,
      startTime: now,
      elapsedSec: 0,
      estimatedTotalSec: est,
      estimatedSecLeft: est
    };

    this.targetPercent = 25;
    this.broadcast();

    // Clear any existing ticker
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
    }

    // Ticker to smoothly advance percentage and time estimation
    this.tickerInterval = setInterval(() => {
      if (!this.state.active) {
        clearInterval(this.tickerInterval);
        this.tickerInterval = null;
        return;
      }

      const elapsed = parseFloat(((Date.now() - this.state.startTime) / 1000).toFixed(1));
      let remaining = parseFloat((this.state.estimatedTotalSec - elapsed).toFixed(1));
      if (remaining <= 0.3) {
        // Dynamically extend estimate if prompt generation takes longer than initial average
        this.state.estimatedTotalSec = parseFloat((elapsed + 1.2).toFixed(1));
        remaining = 1.2;
      }

      // Smoothly crawl towards targetPercent
      let current = this.state.percent;
      if (current < this.targetPercent) {
        current = Math.min(this.targetPercent, current + 2);
      } else if (current < 95) {
        // Slowly creep forward while waiting for LLM token sampling
        current = Math.min(95, current + 0.4);
      }

      this.state.elapsedSec = elapsed;
      this.state.estimatedSecLeft = remaining;
      this.state.percent = Math.round(current);

      this.broadcast();
    }, 120);
  }

  /**
   * Reset manager state back to idle.
   */
  public reset(): void {
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
    }
    this.state = {
      active: false,
      goal: '',
      stage: 'Idle',
      percent: 0,
      startTime: 0,
      elapsedSec: 0,
      estimatedTotalSec: this.averageLatencySec,
      estimatedSecLeft: 0
    };
    this.broadcast();
  }

  /**
   * Update the active stage description and target percent.
   */
  public updateStage(stage: string, targetPercent?: number): void {
    if (!this.state.active) return;

    this.state.stage = stage;
    if (typeof targetPercent === 'number') {
      this.targetPercent = Math.max(this.state.percent, targetPercent);
    }
    this.broadcast();
  }

  /**
   * Mark prompt execution completed (either successfully or with error).
   */
  public completePrompt(success: boolean = true, message?: string): void {
    if (!this.state.active && !this.state.startTime) return;

    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
    }

    const elapsed = parseFloat(((Date.now() - this.state.startTime) / 1000).toFixed(1));

    // Update historical average latency (exponential moving average)
    if (elapsed > 0.5 && elapsed < 30) {
      this.averageLatencySec = parseFloat((this.averageLatencySec * 0.7 + elapsed * 0.3).toFixed(1));
    }

    this.state = {
      ...this.state,
      active: false,
      percent: 100,
      stage: success ? 'Done' : (message || 'Failed'),
      elapsedSec: elapsed,
      estimatedSecLeft: 0,
      success,
      completedAt: Date.now()
    };

    this.broadcast();

    // After 3.5 seconds, reset state to completely idle
    setTimeout(() => {
      if (!this.state.active) {
        this.reset();
      }
    }, 3500);
  }

  private broadcast(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cero:prompt-progress', {
          detail: { ...this.state }
        })
      );
    }
  }
}
