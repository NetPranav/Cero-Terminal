/**
 * ChoiceRequests.ts — ask the person to pick one of a few options, or type their own.
 *
 * The agent uses this where a yes/no confirmation is not enough ("where should this file go?").
 * The focused terminal pane claims requests and shows the dialog; with no screen to ask on
 * (the command-line agent, tests) `askChoice` resolves to undefined so the caller can say so.
 */

export interface ChoiceOption {
  label: string;
  /** Shown under the label (a folder path) */
  detail?: string;
}

export interface ChoiceRequest {
  title: string;
  /** Lines shown above the options (what will be saved) */
  lines?: string[];
  options: ChoiceOption[];
  /** A text field for something else, e.g. a folder path */
  custom?: { label: string; placeholder: string };
}

/** The 0-based option picked, or the text typed; null when cancelled */
export type ChoiceResult = { index: number } | { custom: string } | null;

type Handler = (request: ChoiceRequest) => Promise<ChoiceResult>;

let handler: Handler | null = null;
let owner: string | null = null;

/** Resolves to undefined when nothing can show the dialog */
export function askChoice(request: ChoiceRequest): Promise<ChoiceResult | undefined> {
  if (!handler) return Promise.resolve(undefined);
  return handler(request);
}

export function claimChoiceRequests(paneId: string, next: Handler): void {
  owner = paneId;
  handler = next;
}

export function releaseChoiceRequests(paneId: string): void {
  if (owner === paneId) {
    owner = null;
    handler = null;
  }
}

/** Tests answer the dialog through this */
export function setChoiceHandlerForTests(next: Handler | null): void {
  handler = next;
  owner = next ? '__test__' : null;
}
