import { describe, it, expect } from 'vitest';
import { paneIdsOf, paneToFocus } from './paneFocus';

const term = (id: string) => ({ type: 'terminal' as const, data: { id } });
const split = (a: any, b: any) => ({ type: 'split' as const, data: { pane1: a, pane2: b } });

describe('paneFocus', () => {
  const tab1 = split(term('a'), split(term('b'), term('c')));
  const tab2 = term('server');

  it('lists the panes of a tab in order', () => {
    expect(paneIdsOf(tab1)).toEqual(['a', 'b', 'c']);
  });

  it('moves focus into the tab on screen after switching back from another tab', () => {
    // "go to tab 1" typed in the server tab: focus was still on the server pane
    expect(paneToFocus(tab1, 'server')).toBe('a');
  });

  it('keeps focus when it is already in the tab, and after a pane was closed picks one', () => {
    expect(paneToFocus(tab1, 'c')).toBeNull();
    expect(paneToFocus(tab2, '')).toBe('server');
  });
});
