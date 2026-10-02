import { describe, expect, it, beforeEach } from 'vitest';
import { PromptQueue, parseQueueCommand } from './PromptQueue';

describe('PromptQueue (Task 2.3)', () => {
  let queue: PromptQueue;

  beforeEach(() => {
    queue = PromptQueue.getInstance();
    queue.clear();
  });

  it('enqueues, peeks, and dequeues items in FIFO order', () => {
    expect(queue.size()).toBe(0);
    const item1 = queue.enqueue('task 1');
    const item2 = queue.enqueue('task 2');

    expect(queue.size()).toBe(2);
    expect(queue.peek()?.id).toBe(item1.id);

    const dequeued1 = queue.dequeue();
    expect(dequeued1?.id).toBe(item1.id);
    expect(queue.size()).toBe(1);

    const dequeued2 = queue.dequeue();
    expect(dequeued2?.id).toBe(item2.id);
    expect(queue.size()).toBe(0);
  });

  it('removes items by 1-based index', () => {
    queue.enqueue('first');
    queue.enqueue('second');
    queue.enqueue('third');

    expect(queue.remove(2)).toBe(true);
    expect(queue.size()).toBe(2);

    const items = queue.getItems();
    expect(items[0].goal).toBe('first');
    expect(items[1].goal).toBe('third');

    // Out of bounds
    expect(queue.remove(5)).toBe(false);
    expect(queue.remove(0)).toBe(false);
  });

  it('removes items by string id', () => {
    const item1 = queue.enqueue('first');
    const item2 = queue.enqueue('second');

    expect(queue.remove(item1.id)).toBe(true);
    expect(queue.size()).toBe(1);
    expect(queue.getItems()[0].id).toBe(item2.id);

    expect(queue.remove('non-existent')).toBe(false);
  });

  it('clears all items and notifies subscribers', () => {
    queue.enqueue('a');
    queue.enqueue('b');

    let notifiedCount = 0;
    const unsubscribe = queue.subscribe((items) => {
      notifiedCount = items.length;
    });

    expect(notifiedCount).toBe(2);
    queue.clear();
    expect(notifiedCount).toBe(0);
    expect(queue.size()).toBe(0);

    unsubscribe();
  });

  it('moves items within the queue for reordering and run next', () => {
    const item1 = queue.enqueue('task 1');
    const item2 = queue.enqueue('task 2');
    const item3 = queue.enqueue('task 3');

    // Move task 3 to top (run next)
    expect(queue.move(item3.id, 0)).toBe(true);
    expect(queue.getItems().map(it => it.id)).toEqual([item3.id, item1.id, item2.id]);

    // Move task 3 to end
    expect(queue.move(item3.id, 2)).toBe(true);
    expect(queue.getItems().map(it => it.id)).toEqual([item1.id, item2.id, item3.id]);

    // Invalid index
    expect(queue.move(item1.id, 99)).toBe(false);
    expect(queue.move('non-existent', 0)).toBe(false);
  });

  it('pauses and resumes queue execution via takeNext', () => {
    queue.enqueue('task 1');
    queue.enqueue('task 2');

    expect(queue.isPaused()).toBe(false);
    queue.setPaused(true);
    expect(queue.isPaused()).toBe(true);

    // When paused, takeNext does not dequeue anything
    expect(queue.takeNext()).toBeUndefined();
    expect(queue.size()).toBe(2);

    // Unpause resumes execution
    queue.setPaused(false);
    const next = queue.takeNext();
    expect(next?.goal).toBe('task 1');
    expect(queue.size()).toBe(1);
  });

  it('tracks the currently running item', () => {
    expect(queue.getRunningItem()).toBeNull();
    const item = queue.enqueue('current active prompt');
    queue.setRunningItem(item);
    expect(queue.getRunningItem()?.id).toBe(item.id);

    queue.setRunningItem(null);
    expect(queue.getRunningItem()).toBeNull();
  });

  it('formats human-readable queue list without emojis', () => {
    expect(queue.formatQueueList()).toContain('The queue is empty.');

    queue.enqueue('inspect ports');
    queue.enqueue('run tests');

    const formatted = queue.formatQueueList();
    expect(formatted).toContain('Queue (2 items):');
    expect(formatted).toContain('1. [goal] inspect ports');
    expect(formatted).toContain('2. [goal] run tests');
    expect(/[\u{1F300}-\u{1F9FF}]/u.test(formatted)).toBe(false);
  });

  it('queues a flow request when busy and preserves flowPlan', () => {
    const mockPlan = {
      name: 'Build and Test',
      source: '/home/user/build.flow',
      needsTerminal: true,
      steps: [{ type: 'command' as const, name: 'Build', command: 'npm run build' }],
    };

    // First item is currently running (busy)
    const running = queue.enqueue('active long running task');
    queue.setRunningItem(running);

    // Second flow arrives while busy
    const queuedFlow = queue.enqueue({
      label: `Flow: ${mockPlan.name}`,
      kind: 'flow',
      flowPlan: mockPlan,
      source: mockPlan.source,
    });

    expect(queue.size()).toBe(2);
    expect(queuedFlow.kind).toBe('flow');
    expect(queuedFlow.flowPlan?.name).toBe('Build and Test');

    // Dequeuing first gets the active/next item
    const first = queue.dequeue();
    expect(first?.id).toBe(running.id);

    // Dequeuing next gets the flow in order
    const nextFlow = queue.dequeue();
    expect(nextFlow?.id).toBe(queuedFlow.id);
    expect(nextFlow?.kind).toBe('flow');
    expect(nextFlow?.flowPlan?.steps[0].command).toBe('npm run build');
  });
});

describe('parseQueueCommand (Task 2.3)', () => {
  it('parses /queue and /queue list to open panel', () => {
    expect(parseQueueCommand('/queue')).toEqual({ type: 'open-panel' });
    expect(parseQueueCommand('  /queue   ')).toEqual({ type: 'open-panel' });
    expect(parseQueueCommand('/queue list')).toEqual({ type: 'open-panel' });
    expect(parseQueueCommand('> /queue')).toEqual({ type: 'open-panel' });
  });

  it('parses show queue natural language variations', () => {
    expect(parseQueueCommand('show queue')).toEqual({ type: 'show' });
    expect(parseQueueCommand('show the queue')).toEqual({ type: 'show' });
    expect(parseQueueCommand(">what's in the queue")).toEqual({ type: 'show' });
    expect(parseQueueCommand('what is in the queue?')).toEqual({ type: 'show' });
    expect(parseQueueCommand('>list queue')).toEqual({ type: 'show' });
    expect(parseQueueCommand('view queue')).toEqual({ type: 'show' });
  });

  it('parses clear queue commands', () => {
    expect(parseQueueCommand('/queue clear')).toEqual({ type: 'clear' });
    expect(parseQueueCommand('clear queue')).toEqual({ type: 'clear' });
    expect(parseQueueCommand('>clear the queue')).toEqual({ type: 'clear' });
    expect(parseQueueCommand('empty queue')).toEqual({ type: 'clear' });
  });

  it('parses remove from queue commands including ordinals', () => {
    expect(parseQueueCommand('/queue remove 2')).toEqual({ type: 'remove', index: 2 });
    expect(parseQueueCommand('>remove 2 from queue')).toEqual({ type: 'remove', index: 2 });
    expect(parseQueueCommand('delete 1 from the queue')).toEqual({ type: 'remove', index: 1 });
    expect(parseQueueCommand('remove item 3 from queue')).toEqual({ type: 'remove', index: 3 });
    expect(parseQueueCommand('cancel the second queued request')).toEqual({ type: 'remove', index: 2 });
    expect(parseQueueCommand('cancel the 1st queued prompt')).toEqual({ type: 'remove', index: 1 });
  });

  it('parses pause and resume queue commands', () => {
    expect(parseQueueCommand('/queue pause')).toEqual({ type: 'pause' });
    expect(parseQueueCommand('pause queue')).toEqual({ type: 'pause' });
    expect(parseQueueCommand('pause the queue')).toEqual({ type: 'pause' });
    expect(parseQueueCommand('/queue resume')).toEqual({ type: 'resume' });
    expect(parseQueueCommand('resume queue')).toEqual({ type: 'resume' });
    expect(parseQueueCommand('unpause queue')).toEqual({ type: 'resume' });
  });

  it('returns null for unrelated commands', () => {
    expect(parseQueueCommand('ls -la')).toBeNull();
    expect(parseQueueCommand('>what is port 3000')).toBeNull();
    expect(parseQueueCommand('npm test')).toBeNull();
  });
});
