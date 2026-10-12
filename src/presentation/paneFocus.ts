/**
 * paneFocus.ts — keep the focused pane inside the tab on screen.
 *
 * Requests from outside a terminal (an opened .flow file, a Workflow Manager run) go to the focused
 * pane. After a tab switch or a closed pane, focus could stay in a hidden tab, so a flow was typed
 * into a terminal the user could not see.
 */

type PaneTree =
  | { type: 'terminal'; data: { id: string } }
  | { type: 'split'; data: { pane1: PaneTree; pane2: PaneTree } };

export function paneIdsOf(node: PaneTree): string[] {
  return node.type === 'terminal' ? [node.data.id] : [...paneIdsOf(node.data.pane1), ...paneIdsOf(node.data.pane2)];
}

/** The pane to focus in this tab, or null when the focused pane is already in it */
export function paneToFocus(root: PaneTree, activePaneId: string): string | null {
  const ids = paneIdsOf(root);
  return ids.length && !ids.includes(activePaneId) ? ids[0] : null;
}
