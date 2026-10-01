/**
 * PromptQueue manages queued background and user agent prompts.
 * Provides observable state, index/id-based removal, clearing,
 * and command parsing for natural language and slash commands.
 */

export interface QueuedItem {
  id: string;
  goal: string;
  runner?: (context: any) => Promise<any>;
  timestamp: number;
}

export type QueueCommand =
  | { type: 'show' }
  | { type: 'clear' }
  | { type: 'remove'; index: number }
  | { type: 'open-panel' };

export class PromptQueue {
  private static instance: PromptQueue;
  private items: QueuedItem[] = [];
  private listeners: Set<(items: QueuedItem[]) => void> = new Set();
  private nextId = 1;

  public static getInstance(): PromptQueue {
    if (!PromptQueue.instance) {
      PromptQueue.instance = new PromptQueue();
    }
    return PromptQueue.instance;
  }

  public enqueue(goal: string, runner?: (context: any) => Promise<any>): QueuedItem {
    const item: QueuedItem = {
      id: `queue_${Date.now()}_${this.nextId++}`,
      goal,
      runner,
      timestamp: Date.now()
    };
    this.items.push(item);
    this.notify();
    return item;
  }

  public dequeue(): QueuedItem | undefined {
    const item = this.items.shift();
    if (item) {
      this.notify();
    }
    return item;
  }

  public peek(): QueuedItem | undefined {
    return this.items[0];
  }

  public remove(indexOrId: number | string): boolean {
    if (typeof indexOrId === 'number') {
      const idx = indexOrId - 1; // 1-based index
      if (idx >= 0 && idx < this.items.length) {
        this.items.splice(idx, 1);
        this.notify();
        return true;
      }
      return false;
    } else {
      const idx = this.items.findIndex(it => it.id === indexOrId);
      if (idx !== -1) {
        this.items.splice(idx, 1);
        this.notify();
        return true;
      }
      return false;
    }
  }

  public clear(): void {
    if (this.items.length > 0) {
      this.items = [];
      this.notify();
    }
  }

  public getItems(): QueuedItem[] {
    return [...this.items];
  }

  public size(): number {
    return this.items.length;
  }

  public subscribe(listener: (items: QueuedItem[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.items]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = [...this.items];
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[PromptQueue] listener error:', err);
      }
    }
  }

  public formatQueueList(): string {
    if (this.items.length === 0) {
      return 'The queue is empty.';
    }
    const lines = this.items.map((item, idx) => `  ${idx + 1}. ${item.goal}`);
    return `Queue (${this.items.length} ${this.items.length === 1 ? 'item' : 'items'}):\n${lines.join('\n')}`;
  }
}

/**
 * Parses user input for slash and natural-language queue commands.
 */
export function parseQueueCommand(raw: string): QueueCommand | null {
  const text = raw.trim().replace(/^>+\s*/, '').toLowerCase();

  // /queue or /queue list
  if (text === '/queue' || text === '/queue list') {
    return { type: 'open-panel' };
  }

  // /queue clear
  if (text === '/queue clear') {
    return { type: 'clear' };
  }

  // /queue remove <N>
  const slashRemove = text.match(/^\/queue\s+(?:remove|delete|drop)\s+(\d+)$/i);
  if (slashRemove) {
    return { type: 'remove', index: parseInt(slashRemove[1], 10) };
  }

  // Natural language:
  // "show queue", "what's in the queue", "what is in the queue", "list queue", "view queue"
  if (
    /^(?:show|list|view|display)\s+(?:the\s+)?queue\??$/i.test(text) ||
    /^what(?:'s|\s+is)\s+(?:in\s+)?(?:the\s+)?queue\??$/i.test(text)
  ) {
    return { type: 'show' };
  }

  // "clear queue", "empty queue"
  if (/^(?:clear|empty)\s+(?:the\s+)?queue$/i.test(text)) {
    return { type: 'clear' };
  }

  // "remove 2 from queue", "delete 2 from queue", "drop 2 from queue"
  const nlRemove = text.match(/^(?:remove|delete|drop)\s+(\d+)\s+from\s+(?:the\s+)?queue$/i);
  if (nlRemove) {
    return { type: 'remove', index: parseInt(nlRemove[1], 10) };
  }

  // "remove item 2 from queue"
  const nlRemoveItem = text.match(/^(?:remove|delete|drop)\s+item\s+(\d+)\s+from\s+(?:the\s+)?queue$/i);
  if (nlRemoveItem) {
    return { type: 'remove', index: parseInt(nlRemoveItem[1], 10) };
  }

  return null;
}
