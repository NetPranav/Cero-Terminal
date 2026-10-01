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

  it('formats human-readable queue list without emojis', () => {
    expect(queue.formatQueueList()).toBe('The queue is empty.');

    queue.enqueue('inspect ports');
    queue.enqueue('run tests');

    const formatted = queue.formatQueueList();
    expect(formatted).toContain('Queue (2 items):');
    expect(formatted).toContain('1. inspect ports');
    expect(formatted).toContain('2. run tests');
    expect(/[\u{1F300}-\u{1F9FF}]/u.test(formatted)).toBe(false);
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

  it('parses remove from queue commands', () => {
    expect(parseQueueCommand('/queue remove 2')).toEqual({ type: 'remove', index: 2 });
    expect(parseQueueCommand('>remove 2 from queue')).toEqual({ type: 'remove', index: 2 });
    expect(parseQueueCommand('delete 1 from the queue')).toEqual({ type: 'remove', index: 1 });
    expect(parseQueueCommand('remove item 3 from queue')).toEqual({ type: 'remove', index: 3 });
  });

  it('returns null for unrelated commands', () => {
    expect(parseQueueCommand('ls -la')).toBeNull();
    expect(parseQueueCommand('>what is port 3000')).toBeNull();
    expect(parseQueueCommand('npm test')).toBeNull();
  });
});
