/**
 * LearnCommand.ts: Cero learns only when told to.
 *
 * Nothing is learned from watching. After a request, Cero remembers two candidates and does nothing with them:
 *   - the command it ran that worked (a request that succeeded with one command), and
 *   - a command you typed yourself soon after a request that did not work.
 * Typing `/learn` on its own teaches the newest candidate for the request just above it. A request that failed is
 * never learnable. `/learn <request> -> <command>` and `/forget` work as before.
 */

export interface LearnCandidate {
  goal: string;
  command: string;
  at: number;
  /** "ran": Cero ran it and it worked; "typed": you typed it yourself after a request that did not work */
  source: 'ran' | 'typed';
}

export type LearnDecision =
  | { kind: 'learn'; goal: string; command: string; source: LearnCandidate['source'] }
  | { kind: 'refuse'; reason: string };

/** How long a candidate stays available for `/learn` */
export const LEARN_WINDOW_MS = 10 * 60 * 1000;

export function decideLearn(candidate: LearnCandidate | null, now: number = Date.now()): LearnDecision {
  if (!candidate) {
    return { kind: 'refuse', reason: 'There is nothing to learn yet. Make a request that works, or type your own command after one that did not, then type /learn.' };
  }
  if (now - candidate.at > LEARN_WINDOW_MS) {
    return { kind: 'refuse', reason: 'That was a while ago, so nothing was learned. Do it again, then type /learn.' };
  }
  if (!candidate.goal.trim() || !candidate.command.trim()) {
    return { kind: 'refuse', reason: 'There is no request and command pair to learn.' };
  }
  return { kind: 'learn', goal: candidate.goal, command: candidate.command, source: candidate.source };
}

/** The shell command of a request that worked with exactly one command; otherwise nothing to offer */
export function candidateFromRun(
  goal: string,
  result: { success: boolean; steps: Array<{ tool: string; params?: any; result?: { success?: boolean } | null }> },
  now: number = Date.now(),
): LearnCandidate | null {
  if (!result.success) return null;
  const shell = result.steps.filter(s => s.tool === 'shell.execute' && typeof s.params?.command === 'string' && !String(s.tool).startsWith('__'));
  if (shell.length !== 1 || shell[0].result?.success === false) return null;
  return { goal, command: String(shell[0].params.command).trim(), at: now, source: 'ran' };
}

/** `/learn` with nothing after it */
export const isBareLearn = (text: string) => /^\/learn\s*$/i.test(text.trim());
