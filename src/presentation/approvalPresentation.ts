/**
 * approvalPresentation.ts — how an approval request from a running task is shown.
 *
 * Every request is shown the same way: a docked card (ApprovalDock) that never takes keyboard
 * focus and is answered only with a click. It used to switch between that card and a full-screen
 * dialog depending on whether a key had been pressed in the last 2.5 seconds, so the same kind of
 * request looked different from one moment to the next. The dialog also took focus, which cut a
 * prompt being written in two. One presentation fixes both.
 */

export type ApprovalPresentation = 'dock';

export const APPROVAL_PRESENTATION: ApprovalPresentation = 'dock';
