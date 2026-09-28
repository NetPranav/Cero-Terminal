/**
 * TerminalRequests.ts — hand an AI request or a workflow run to the focused terminal pane.
 *
 * The Workflow Manager and "open a workflow file" live outside any terminal. They submit here;
 * the focused TerminalView runs the request with its renderer and confirmation dialog, so the
 * progress and the approval are visible where the user is looking. Requests made before any
 * pane is ready (a file opened at launch) wait in the queue.
 */

import type { SavedWorkflowDefinition } from '../workflows/models/WorkflowTypes';

export type TerminalRequest =
  | { kind: 'goal'; goal: string }
  | { kind: 'workflow'; definition: SavedWorkflowDefinition; source?: string };

type Handler = (request: TerminalRequest) => void;

const queue: TerminalRequest[] = [];
let handler: Handler | null = null;
let owner: string | null = null;

export function submitTerminalRequest(request: TerminalRequest): void {
  if (handler) handler(request);
  else queue.push(request);
}

/** The focused pane claims requests; queued ones are delivered at once. */
export function claimTerminalRequests(paneId: string, next: Handler): void {
  owner = paneId;
  handler = next;
  while (queue.length && handler) handler(queue.shift()!);
}

/** Release only if this pane still owns the handler (focus may have moved already). */
export function releaseTerminalRequests(paneId: string): void {
  if (owner === paneId) {
    owner = null;
    handler = null;
  }
}

/** Test helper */
export function resetTerminalRequestsForTests(): void {
  queue.length = 0;
  handler = null;
  owner = null;
}
