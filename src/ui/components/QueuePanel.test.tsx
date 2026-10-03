import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueuePanelView, queueItemState } from './QueuePanel';
import type { QueuedItem } from '../../presentation/PromptQueue';

const item = (id: string, label: string, kind: QueuedItem['kind'] = 'goal', ownerId = 'pane-1'): QueuedItem => ({
  id, goal: label, label, kind, ownerId, timestamp: 0, addedAt: 0,
});

const noop = () => {};
const render = (over: Partial<Parameters<typeof QueuePanelView>[0]> = {}) => renderToStaticMarkup(
  <QueuePanelView running={[]} items={[]} paused={false} onStop={noop} onRemove={noop} onMove={noop} onClear={noop} onTogglePause={noop} onClose={noop} {...over} />
);

describe('QueuePanelView', () => {
  it('shows the order, the text and the state of every waiting prompt', () => {
    const html = render({ items: [item('a', 'list open ports'), item('b', 'run the tests'), item('c', 'open vscode')] });
    const order = ['list open ports', 'run the tests', 'open vscode'].map((t) => html.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order); // listed in queue order
    expect(html).toContain('Next');
    expect(html).toContain('Waiting');
    expect(html.match(/data-testid="queue-item"/g)).toHaveLength(3);
  });

  it('the running task is pinned first with its own Stop button', () => {
    const html = render({ running: [item('r', 'refactor the parser')], items: [item('a', 'next one')] });
    expect(html.indexOf('refactor the parser')).toBeLessThan(html.indexOf('next one'));
    expect(html).toContain('Running');
    expect(html).toContain('aria-label="Stop running task"');
  });

  it('every waiting prompt can be removed on its own, by an accessible button', () => {
    const html = render({ items: [item('a', 'one'), item('b', 'two')] });
    expect(html).toContain('aria-label="Remove item 1"');
    expect(html).toContain('aria-label="Remove item 2"');
  });

  it('moving is disabled at the edges', () => {
    const html = render({ items: [item('a', 'one'), item('b', 'two')] });
    // first row cannot go up, last row cannot go down
    expect(html).toMatch(/disabled=""[^>]*aria-label="Move item 1 up"|aria-label="Move item 1 up"[^>]*disabled=""/);
    expect(html).toMatch(/disabled=""[^>]*aria-label="Move item 2 down"|aria-label="Move item 2 down"[^>]*disabled=""/);
  });

  it('says so when paused and offers Resume', () => {
    const html = render({ paused: true, items: [item('a', 'one'), item('b', 'two')] });
    expect(html).toContain('>Paused<');
    expect(html).toContain('>Resume<');
    expect(queueItemState(0, true)).toBe('Paused');
    expect(html).not.toContain('>Next<');
  });

  it('says on hover that the queue is not kept across restarts', () => {
    expect(render()).toContain('Queued prompts are not kept when Cero restarts');
  });

  it('has an empty state and hides Clear when there is nothing to clear', () => {
    const html = render();
    expect(html).toContain('No queued prompts');
    expect(html).not.toContain('Clear queue');
  });

  it('is compact: small icons and small controls, no full-screen backdrop', () => {
    const html = render({ running: [item('r', 'x')], items: [item('a', 'one'), item('b', 'two')] });
    // lucide icons are rendered at 12px (or 11px for the stop square), never the 24px default
    const sizes = [...html.matchAll(/<svg[^>]*\bwidth="(\d+)"/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(12);
    // controls are 20px, rows 26px; width is a small docked panel
    expect(html).toContain('width:20px;height:20px');
    expect(html).toContain('height:26px');
    expect(html).toContain('width:360px');
    expect(html).not.toMatch(/inset:0|backdrop-filter|rgba\(0, 0, 0, 0\.[5-9]/);
  });

  it('uses no emoji and no class names that need a CSS framework', () => {
    const html = render({ running: [item('r', 'x')], items: [item('a', 'one', 'workflow')], paused: true });
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(html).not.toMatch(/class="[^"]*\b(flex|px-\d|py-\d|bg-white|rounded|text-xs)\b/);
  });
});
