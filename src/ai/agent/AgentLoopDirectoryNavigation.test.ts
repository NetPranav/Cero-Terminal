import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop } from './AgentLoop';
import { DirectoryScanner, DirectoryNavigationEngine } from './DirectoryNavigationEngine';

describe('AgentLoop Directory Navigation Integration', () => {
  let agentLoop: AgentLoop;
  const mockScanner: DirectoryScanner = {
    listSubdirectories: async (dir: string) => {
      if (dir === '/workspace') return ['cero', 'backend', 'docs'];
      return [];
    },
    directoryExists: async (p: string) => {
      const existing = ['/workspace/cero', '/workspace/backend', '/workspace/docs'];
      return existing.includes(p);
    },
    mkdir: async () => true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    agentLoop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any);
  });

  it('navigates immediately on exact directory match and returns cdPath', async () => {
    vi.spyOn(DirectoryNavigationEngine.getInstance(), 'resolve').mockImplementationOnce(async (goal, cwd) => {
      return {
        type: 'exact',
        rawTarget: 'backend',
        cdPath: '/workspace/backend',
        summary: 'Switched working directory to /workspace/backend'
      };
    });

    const events: any[] = [];
    agentLoop.onEvent((e) => events.push(e));

    const res = await agentLoop.run('switch to backend', { os: 'linux', cwd: '/workspace' });

    expect(res.success).toBe(true);
    expect(res.cdPath).toBe('/workspace/backend');
    expect(events.some(e => e.type === 'tool_done' && e.message.includes('/workspace/backend'))).toBe(true);
  });

  it('asks "Did you mean?" question on typo and navigates upon confirmation', async () => {
    vi.spyOn(DirectoryNavigationEngine.getInstance(), 'resolve').mockImplementationOnce(async () => {
      return {
        type: 'did_you_mean',
        rawTarget: 'sentinal',
        cdPath: '/workspace/cero',
        question: "Directory 'sentinal' not found. Did you mean 'cero' (/workspace/cero)?",
        summary: "Did you mean 'cero'?"
      };
    });

    const events: any[] = [];
    agentLoop.onEvent((e) => events.push(e));

    // Turn 1: User says "switch to sentinal"
    const turn1 = await agentLoop.run('switch to sentinal', { os: 'linux', cwd: '/workspace' });
    expect(turn1.awaitingInput).toBe(true);
    expect(turn1.summary).toContain("Did you mean 'cero'");
    expect(agentLoop.hasPendingQuestion()).toBe(true);
    expect(events.some(e => e.type === 'question' && e.message.includes("Did you mean 'cero'"))).toBe(true);

    // Turn 2: User responds "yes"
    const turn2 = await agentLoop.run('yes', { os: 'linux', cwd: '/workspace' });
    expect(turn2.success).toBe(true);
    expect(turn2.cdPath).toBe('/workspace/cero');
    expect(agentLoop.hasPendingQuestion()).toBe(false);
  });

  it('asks to create directory on missing folder and creates it upon confirmation', async () => {
    vi.spyOn(DirectoryNavigationEngine.getInstance(), 'resolve').mockImplementationOnce(async () => {
      return {
        type: 'not_found',
        rawTarget: 'my_new_app',
        cdPath: '/workspace/my_new_app',
        question: "Directory 'my_new_app' does not exist. Would you like me to create it (mkdir -p my_new_app) and switch to it?",
        createCommand: 'mkdir -p "/workspace/my_new_app"',
        summary: "Directory 'my_new_app' does not exist."
      };
    });

    const events: any[] = [];
    agentLoop.onEvent((e) => events.push(e));

    // Turn 1: User says "cd into my_new_app"
    const turn1 = await agentLoop.run('cd into my_new_app', { os: 'linux', cwd: '/workspace' });
    expect(turn1.awaitingInput).toBe(true);
    expect(turn1.summary).toContain("does not exist. Would you like me to create it");
    expect(agentLoop.hasPendingQuestion()).toBe(true);

    // Turn 2: User responds "create it"
    const turn2 = await agentLoop.run('create it', { os: 'linux', cwd: '/workspace' });
    expect(turn2.success).toBe(true);
    expect(turn2.cdPath).toBe('/workspace/my_new_app');
    expect(events.some(e => e.type === 'tool_done' && e.message.includes('Created directory'))).toBe(true);
  });

  it('cancels pending directory action when user declines', async () => {
    vi.spyOn(DirectoryNavigationEngine.getInstance(), 'resolve').mockImplementationOnce(async () => {
      return {
        type: 'not_found',
        rawTarget: 'ghost_dir',
        cdPath: '/workspace/ghost_dir',
        question: "Directory 'ghost_dir' does not exist. Would you like me to create it?",
        summary: "Directory 'ghost_dir' does not exist."
      };
    });

    const events: any[] = [];
    agentLoop.onEvent((e) => events.push(e));

    await agentLoop.run('switch to ghost_dir', { os: 'linux', cwd: '/workspace' });
    expect(agentLoop.hasPendingQuestion()).toBe(true);

    const turn2 = await agentLoop.run('cancel', { os: 'linux', cwd: '/workspace' });
    expect(turn2.success).toBe(true);
    expect(turn2.summary).toMatch(/cancelled/i);
    expect(agentLoop.hasPendingQuestion()).toBe(false);
  });
});
