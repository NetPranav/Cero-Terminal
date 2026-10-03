export type EventType = 
  | 'CommandFinished'
  | 'PermissionGranted'
  | 'PermissionDenied'
  | 'WorkflowCompleted'
  | 'PluginInstalled'
  | 'GitRepositoryChanged'
  | 'ProjectOpened'
  | 'InputReceived'
  | 'PlanGenerated'
  | 'ExecutionStarted';

export interface CeroEvent {
  type: EventType;
  payload?: any;
  timestamp: number;
}

export type EventHandler = (event: CeroEvent) => void;

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<EventType, Set<EventHandler>> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public subscribe(eventType: EventType, handler: EventHandler): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);
  }

  public unsubscribe(eventType: EventType, handler: EventHandler): void {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  public publish(eventType: EventType, payload?: any): void {
    const event: CeroEvent = {
      type: eventType,
      payload,
      timestamp: Date.now(),
    };
    
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.forEach(handler => handler(event));
    }
  }
}
