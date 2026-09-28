/**
 * TerminalWorkspace.ts — what every terminal pane is doing, and a way to open new ones.
 *
 * Panes register themselves (TerminalView) and report their folder, the command running in the
 * foreground and the last lines of output. The agent reads this to know about the other
 * terminals, and asks for a new pane when a command keeps running (a server, `tail -f`, a ROS
 * node) instead of blocking its own terminal until the timeout.
 *
 * Layout is owned by the app (App.tsx registers a spawner). Policy lives here:
 *  - an idle pane the agent opened earlier is reused before anything new is created;
 *  - otherwise the app splits the requesting tab (up to MAX_PANES_PER_TAB) or opens a tab.
 */

export interface PaneInfo {
  paneId: string;
  tabId?: string;
  sessionId?: string;
  /** Short label for agent-opened panes ("talker", "dev server") */
  title?: string;
  cwd?: string;
  /** Command started in the foreground, while it is still running */
  runningCommand?: string;
  busy: boolean;
  spawnedByAgent: boolean;
  outputTail: string[];
  updatedAt: number;
}

export interface SpawnRequest {
  command: string;
  cwd?: string;
  title?: string;
  /** Pane the request came from; its tab is split first */
  requesterPaneId?: string;
  placement?: 'auto' | 'split' | 'tab';
}

export interface SpawnResult {
  paneId: string;
  reused: boolean;
}

/** Creates the pane in the UI and returns its id; the command runs once its shell is ready. */
export type PaneSpawner = (request: SpawnRequest) => string;

/** Writes text to a pane's shell (used when an idle pane is reused). */
export type PaneWriter = (sessionId: string, data: string) => void;

export const MAX_PANES_PER_TAB = 3;
const TAIL_LINES = 20;

const stripAnsi = (s: string) => s
  .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
  .replace(/\x1b[()][A-Za-z0-9]/g, '');

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export class TerminalWorkspace {
  private static instance: TerminalWorkspace | null = null;

  private panes = new Map<string, PaneInfo>();
  private pending = new Map<string, SpawnRequest>();
  private partialLine = new Map<string, string>();
  private spawner: PaneSpawner | null = null;
  private writer: PaneWriter | null = null;

  public static getInstance(): TerminalWorkspace {
    if (!TerminalWorkspace.instance) TerminalWorkspace.instance = new TerminalWorkspace();
    return TerminalWorkspace.instance;
  }

  /** Test helper: a fresh workspace */
  public static resetForTests(): void {
    TerminalWorkspace.instance = new TerminalWorkspace();
  }

  public setSpawner(spawner: PaneSpawner | null): void {
    this.spawner = spawner;
  }

  public setWriter(writer: PaneWriter | null): void {
    this.writer = writer;
  }

  public register(paneId: string, info: Partial<PaneInfo> = {}): void {
    const existing = this.panes.get(paneId);
    this.panes.set(paneId, {
      paneId,
      busy: false,
      spawnedByAgent: false,
      outputTail: [],
      ...existing,
      ...info,
      updatedAt: Date.now(),
    });
  }

  public update(paneId: string, patch: Partial<PaneInfo>): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    this.panes.set(paneId, { ...pane, ...patch, updatedAt: Date.now() });
  }

  public unregister(paneId: string): void {
    this.panes.delete(paneId);
    this.pending.delete(paneId);
    this.partialLine.delete(paneId);
  }

  public get(paneId: string): PaneInfo | undefined {
    return this.panes.get(paneId);
  }

  public list(): PaneInfo[] {
    return [...this.panes.values()];
  }

  /** Keep the last lines a pane printed (ANSI stripped). */
  public appendOutput(paneId: string, chunk: string): void {
    const pane = this.panes.get(paneId);
    if (!pane || !chunk) return;
    const text = (this.partialLine.get(paneId) || '') + stripAnsi(chunk).replace(/\r(?!\n)/g, '\n');
    const parts = text.split(/\r?\n/);
    this.partialLine.set(paneId, parts.pop() || '');
    const lines = parts.map(l => l.trimEnd()).filter(l => l.length > 0);
    if (lines.length === 0) return;
    pane.outputTail = [...pane.outputTail, ...lines].slice(-TAIL_LINES);
    pane.updatedAt = Date.now();
  }

  /**
   * Run a long-lived command in its own pane: reuse an idle pane the agent opened before,
   * otherwise ask the app to create one. Throws when no layout is available (tests, CLI).
   */
  public spawn(request: SpawnRequest): SpawnResult {
    const reusable = this.list().find(p => p.spawnedByAgent && !p.busy && p.sessionId
      && p.paneId !== request.requesterPaneId);
    if (reusable && this.writer && reusable.sessionId) {
      const cd = request.cwd && request.cwd !== reusable.cwd ? `cd ${shellQuote(request.cwd)} && ` : '';
      this.writer(reusable.sessionId, `${cd}${request.command}\r`);
      this.update(reusable.paneId, { busy: true, runningCommand: request.command, title: request.title ?? reusable.title, outputTail: [] });
      return { paneId: reusable.paneId, reused: true };
    }
    if (!this.spawner) throw new Error('No terminal layout is available to open a new pane.');
    const paneId = this.spawner(request);
    this.pending.set(paneId, request);
    this.register(paneId, { spawnedByAgent: true, title: request.title, cwd: request.cwd, busy: true, runningCommand: request.command });
    return { paneId, reused: false };
  }

  /** The command a freshly created pane should run once its shell prompt appears (once). */
  public takePendingCommand(paneId: string): SpawnRequest | undefined {
    const request = this.pending.get(paneId);
    this.pending.delete(paneId);
    return request;
  }

  public hasPendingCommand(paneId: string): boolean {
    return this.pending.has(paneId);
  }

  /**
   * The other terminals, for the model's prompt. Bounded (6 panes, 5 lines each, 160 chars a
   * line); the caller wraps it as untrusted data because pane output can contain anything.
   */
  public describeForPrompt(excludePaneId?: string): string {
    const others = this.list().filter(p => p.paneId !== excludePaneId).slice(0, 6);
    if (others.length === 0) return '';
    return others.map((p, i) => {
      const head = [
        `Terminal ${i + 1}${p.title ? ` "${p.title}"` : ''}`,
        p.cwd ? `in ${p.cwd}` : '',
        p.busy && p.runningCommand ? `running: ${p.runningCommand}` : 'idle',
      ].filter(Boolean).join(', ');
      const tail = p.outputTail.slice(-5).map(l => `  | ${l.slice(0, 160)}`).join('\n');
      return tail ? `${head}\n${tail}` : head;
    }).join('\n');
  }
}

/**
 * Commands that keep running until stopped. They get their own pane; everything else runs
 * inline. Deterministic on purpose: the small model does not decide when to split.
 */
export function isLongRunningCommand(command: string): boolean {
  const c = command.trim();
  if (!c) return false;
  // Explicitly backgrounded or detached: returns immediately
  if (/&\s*$/.test(c) || /\b(?:nohup|setsid|disown)\b/.test(c) || /\bdocker\s+compose\s+up\b.*\s-d\b|\bdocker\s+run\b.*\s-d\b/.test(c)) return false;
  return [
    /\bros2\s+(?:run|launch)\b/,
    /\bros2\s+topic\s+(?:echo|hz|bw|pub)\b(?![^;&|]*--once)(?![^;&|]*\s-1\b)/,
    /\bros2\s+bag\s+(?:record|play)\b/,
    /\b(?:roslaunch|rosrun|roscore|rviz2?|rqt\w*|gazebo|gz\s+sim|ign\s+gazebo)\b/,
    /\btail\b[^;&|]*\s(?:-[a-zA-Z]*[fF][a-zA-Z]*|--follow)\b/,
    /\bjournalctl\b.*\s-f\b/,
    /\bwatch\s+\S/,
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|watch|preview)\b/,
    /\b(?:vite|next\s+dev|nuxt\s+dev|webpack\s+serve|ng\s+serve|expo\s+start)\b/,
    /\bpython3?\s+-m\s+http\.server\b/,
    /\b(?:flask\s+run|uvicorn|gunicorn|rails\s+s(?:erver)?|php\s+-S|hugo\s+server|jekyll\s+serve)\b/,
    /\b(?:cargo\s+watch|nodemon|tsc\s+.*--watch|jupyter\s+(?:notebook|lab))\b/,
    /\bdocker\s+compose\s+up\b/,
    /\bdocker\s+(?:logs|events)\b.*\s-f\b/,
    /\bkubectl\s+(?:logs\s+.*-f|port-forward)\b/,
    /\b(?:ssh)\s+\S+\s*$/,
    /\bturtle_teleop_key\b|\bteleop_twist_keyboard\b/,
  ].some(pattern => pattern.test(c));
}

/** A short pane title from a command ("ros2 run turtlesim turtlesim_node" -> "turtlesim_node"). */
export function paneTitleFor(command: string): string {
  const c = command.trim();
  const ros = c.match(/\bros2\s+(?:run|launch)\s+\S+\s+(\S+)/);
  if (ros) return ros[1].replace(/\.launch\.(?:py|xml|yaml)$/, '');
  const echo = c.match(/\bros2\s+topic\s+echo\s+(\S+)/);
  if (echo) return `echo ${echo[1]}`;
  const tail = c.match(/\btail\s+\S+\s+(\S+)\s*$/);
  if (tail) return `tail ${tail[1].split('/').pop()}`;
  const npm = c.match(/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(\w+)/);
  if (npm) return npm[1] === 'dev' || npm[1] === 'start' ? 'dev server' : npm[1];
  const first = c.replace(/^(?:cd\s+\S+\s*&&\s*)+/, '').split(/\s+/)[0] || 'task';
  return first.split('/').pop() || 'task';
}
