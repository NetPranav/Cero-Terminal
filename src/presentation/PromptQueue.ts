/**
 * PromptQueue manages queued background and user agent prompts.
 * Provides observable state, index/id-based removal, clearing,
 * and command parsing for natural language and slash commands.
 */

export type QueuedPromptKind = 'goal' | 'workflow' | 'flow';

export interface QueuedItem {
  id: string;
  goal: string;
  label: string;
  kind: QueuedPromptKind;
  runner?: (context: any) => Promise<any>;
  flowPlan?: any;
  source?: string;
  timestamp: number;
  addedAt: number;
}

export type QueueCommand =
  | { type: 'show' }
  | { type: 'clear' }
  | { type: 'remove'; index: number }
  | { type: 'open-panel' }
  | { type: 'pause' }
  | { type: 'resume' };

export class PromptQueue {
  private static instance: PromptQueue;
  private items: QueuedItem[] = [];
  private runningItem: QueuedItem | null = null;
  private paused: boolean = false;
  private listeners: Set<(items: QueuedItem[]) => void> = new Set();
  private nextId = 1;

  public static getInstance(): PromptQueue {
    if (!PromptQueue.instance) {
      PromptQueue.instance = new PromptQueue();
    }
    return PromptQueue.instance;
  }

  public enqueue(
    goalOrItem: string | { label: string; kind?: QueuedPromptKind; runner?: (context: any) => Promise<any>; flowPlan?: any; source?: string },
    runner?: (context: any) => Promise<any>,
    kind: QueuedPromptKind = 'goal'
  ): QueuedItem {
    const now = Date.now();
    let label = '';
    let itemKind: QueuedPromptKind = kind;
    let actualRunner = runner;
    let flowPlan: any = undefined;
    let source: string | undefined = undefined;

    if (typeof goalOrItem === 'string') {
      label = goalOrItem;
    } else {
      label = goalOrItem.label;
      itemKind = goalOrItem.kind || 'goal';
      actualRunner = goalOrItem.runner || runner;
      flowPlan = goalOrItem.flowPlan;
      source = goalOrItem.source;
    }

    const item: QueuedItem = {
      id: `queue_${now}_${this.nextId++}`,
      goal: label,
      label,
      kind: itemKind,
      runner: actualRunner,
      flowPlan,
      source,
      timestamp: now,
      addedAt: now,
    };

    this.items.push(item);
    this.notify();
    return item;
  }

  public add(item: { label: string; kind?: QueuedPromptKind; runner?: (context: any) => Promise<any>; flowPlan?: any; source?: string }): QueuedItem {
    return this.enqueue(item);
  }

  public dequeue(): QueuedItem | undefined {
    const item = this.items.shift();
    if (item) {
      this.notify();
    }
    return item;
  }

  public takeNext(): QueuedItem | undefined {
    if (this.paused) {
      return undefined;
    }
    return this.dequeue();
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

  public move(id: string, toIndex: number): boolean {
    const fromIndex = this.items.findIndex(it => it.id === id);
    if (fromIndex === -1) return false;
    if (toIndex < 0 || toIndex >= this.items.length) return false;
    if (fromIndex === toIndex) return true;

    const [moved] = this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, moved);
    this.notify();
    return true;
  }

  public clear(): void {
    if (this.items.length > 0) {
      this.items = [];
      this.notify();
    }
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public setPaused(paused: boolean): void {
    if (this.paused !== paused) {
      this.paused = paused;
      this.notify();
      if (!paused && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sentinel:queue-resumed'));
      }
    }
  }

  public togglePaused(): boolean {
    this.setPaused(!this.paused);
    return this.paused;
  }

  public getRunningItem(): QueuedItem | null {
    return this.runningItem;
  }

  public setRunningItem(item: QueuedItem | null): void {
    this.runningItem = item;
    this.notify();
  }

  public getItems(): QueuedItem[] {
    return [...this.items];
  }

  public list(): readonly QueuedItem[] {
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
    const header = this.paused ? 'Queue [PAUSED]' : 'Queue';
    if (this.items.length === 0) {
      return `${header}: The queue is empty.`;
    }
    const lines = this.items.map((item, idx) => `  ${idx + 1}. [${item.kind}] ${item.label || item.goal}`);
    return `${header} (${this.items.length} ${this.items.length === 1 ? 'item' : 'items'}):\n${lines.join('\n')}`;
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

  // /queue pause
  if (text === '/queue pause') {
    return { type: 'pause' };
  }

  // /queue resume / unpause
  if (text === '/queue resume' || text === '/queue unpause') {
    return { type: 'resume' };
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

  // "pause queue", "pause the queue"
  if (/^pause\s+(?:the\s+)?queue$/i.test(text)) {
    return { type: 'pause' };
  }

  // "resume queue", "resume the queue", "unpause queue"
  if (/^(?:resume|unpause)\s+(?:the\s+)?queue$/i.test(text)) {
    return { type: 'resume' };
  }

  // "clear queue", "empty queue"
  if (/^(?:clear|empty)\s+(?:the\s+)?queue$/i.test(text)) {
    return { type: 'clear' };
  }

  // "cancel the second queued request", "cancel the 2nd queued request", "cancel second queued prompt"
  const ordinalMap: Record<string, number> = {
    first: 1, '1st': 1,
    second: 2, '2nd': 2,
    third: 3, '3rd': 3,
    fourth: 4, '4th': 4,
    fifth: 5, '5th': 5,
  };
  const ordinalMatch = text.match(/^(?:cancel|remove|delete|drop)\s+(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+queued\s+(?:request|prompt|item|task)$/i);
  if (ordinalMatch) {
    const idx = ordinalMap[ordinalMatch[1].toLowerCase()];
    if (idx) return { type: 'remove', index: idx };
  }

  // "remove 2 from queue", "delete 2 from queue", "drop 2 from queue"
  const nlRemove = text.match(/^(?:remove|delete|drop|cancel)\s+(\d+)\s+from\s+(?:the\s+)?queue$/i);
  if (nlRemove) {
    return { type: 'remove', index: parseInt(nlRemove[1], 10) };
  }

  // "remove item 2 from queue"
  const nlRemoveItem = text.match(/^(?:remove|delete|drop|cancel)\s+item\s+(\d+)\s+from\s+(?:the\s+)?queue$/i);
  if (nlRemoveItem) {
    return { type: 'remove', index: parseInt(nlRemoveItem[1], 10) };
  }

  return null;
}
