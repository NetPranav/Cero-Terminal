import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowScheduler } from '../scheduler/WorkflowScheduler';
import { WorkflowBuilder } from '../builder/WorkflowBuilder';

describe('WorkflowScheduler — Multi-Trigger Scheduling & Event-Driven Evaluation', () => {
  let scheduler: WorkflowScheduler;

  beforeEach(() => {
    scheduler = new WorkflowScheduler();
  });

  it('should register workflows with multiple trigger modes and compute next fire times', () => {
    const wf = new WorkflowBuilder('Scheduled Workflow')
      .addAction('step', 'Step', 'system.noop')
      .addTrigger('daily', { timeOfDay: '09:00' })
      .addTrigger('on_login')
      .addTrigger('manual')
      .build();

    const entries = scheduler.schedule(wf);
    expect(entries.length).toBe(3);
    expect(entries.every(e => e.active)).toBe(true);

    const daily = entries.find(e => e.trigger.type === 'daily');
    expect(daily?.nextFireAt).toBeDefined();
    expect(daily!.nextFireAt!).toBeGreaterThan(Date.now() - 86400000);
  });

  it('should evaluate event-driven triggers for login, startup, filesystem, and application events', () => {
    const wf1 = new WorkflowBuilder('Login Workflow')
      .addAction('s', 'S', 'system.noop')
      .addTrigger('on_login')
      .build();

    const wf2 = new WorkflowBuilder('FS Watcher')
      .addAction('s', 'S', 'system.noop')
      .addTrigger('filesystem_event', { watchPath: '/Users/dev/Documents' })
      .build();

    scheduler.schedule(wf1);
    scheduler.schedule(wf2);

    const loginReady = scheduler.evaluateEventTrigger('login');
    expect(loginReady.length).toBe(1);

    const fsReady = scheduler.evaluateEventTrigger('filesystem_change', { path: '/Users/dev/Documents/report.pdf' });
    expect(fsReady.length).toBe(1);

    const noMatch = scheduler.evaluateEventTrigger('filesystem_change', { path: '/tmp/other.txt' });
    expect(noMatch.length).toBe(0);
  });

  it('should unschedule all triggers for a specific workflow', () => {
    const wf = new WorkflowBuilder('To Remove')
      .addAction('s', 'S', 'system.noop')
      .addTrigger('daily', { timeOfDay: '08:00' })
      .addTrigger('weekly', { dayOfWeek: 1 })
      .build();

    scheduler.schedule(wf);
    expect(scheduler.getAll().length).toBe(2);

    const removed = scheduler.unschedule(wf.id);
    expect(removed).toBe(2);
    expect(scheduler.getAll().length).toBe(0);
  });
});
