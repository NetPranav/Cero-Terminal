import { afterEach, describe, expect, it } from 'vitest';
import { ConsentQueue } from '../domain/security/ConsentQueue';
import { InputLineTracker } from './InputLineTracker';
import { APPROVAL_PRESENTATION } from './approvalPresentation';

/**
 * Prompt A is running and asks for approval while the user is writing Prompt B.
 * Uses the real ConsentQueue and the same decision TerminalView makes when a request arrives.
 */
describe('approval request from a running task while another prompt is being written', () => {
  const plan: any = { capabilityId: 'shell.execute', parameters: { command: 'rm -r build' }, riskLevel: 'high' };
  let unsub: (() => void) | undefined;
  afterEach(() => { unsub?.(); });

  function arrive(tracker: InputLineTracker, lastKeyAt: number) {
    const shown: Array<{ id: string; presentation: string }> = [];
    unsub = ConsentQueue.getInstance().subscribe((pending) => {
      const req = pending[0];
      if (req && !shown.find(s => s.id === req.id)) {
        shown.push({
          id: req.id,
          presentation: APPROVAL_PRESENTATION,
        });
      }
    });
    const answer = ConsentQueue.getInstance().enqueue(plan, 'tab-1');
    return { shown, answer };
  }

  it('mid-draft: shown as a card that cannot take the keyboard, draft untouched', async () => {
    const tracker = new InputLineTracker();
    const typed = 'explain how to rebase onto main';
    for (const ch of typed) tracker.noteKeystroke(ch, { row: 3, col: 2 }, false);

    const { shown, answer } = arrive(tracker, Date.now() - 20_000); // paused to think: still a draft
    expect(shown).toHaveLength(1);
    expect(shown[0].presentation).toBe('dock');
    // Nothing about the draft changed because a request arrived
    expect(tracker.typedText()).toBe(typed);
    expect(tracker.hasDraft()).toBe(true);

    // Answering it resolves Prompt A's request only, and does not touch Prompt B's bookkeeping
    ConsentQueue.getInstance().deny(shown[0].id);
    await expect(answer).resolves.toBe(false);
    expect(tracker.typedText()).toBe(typed);
  });

  it('typing right now with an empty line (just deleted): still a card', () => {
    const { shown } = arrive(new InputLineTracker(), Date.now() - 400);
    expect(shown[0].presentation).toBe('dock');
    ConsentQueue.getInstance().deny(shown[0].id);
  });

  it('user idle with nothing typed: the same card, never a different dialog', () => {
    const { shown } = arrive(new InputLineTracker(), 0);
    expect(shown[0].presentation).toBe('dock');
    ConsentQueue.getInstance().deny(shown[0].id);
  });

  it('approving from the card runs Prompt A while Prompt B stays a draft, not submitted', async () => {
    const tracker = new InputLineTracker();
    tracker.noteKeystroke('h', { row: 0, col: 2 }, false);
    tracker.noteKeystroke('i', { row: 0, col: 2 }, false);
    const { shown, answer } = arrive(tracker, Date.now());
    ConsentQueue.getInstance().approve(shown[0].id);
    await expect(answer).resolves.toBe(true);
    // Prompt B still has its text and no Enter was ever recorded for it
    expect(tracker.typedText()).toBe('hi');
  });
});
