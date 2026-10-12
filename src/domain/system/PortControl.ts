/**
 * PortControl.ts — "close port 8765": find what listens there, ask, stop exactly that, check it is free.
 *
 * This used to go to the model, which wrote `lsof ... | grep 8765 | awk ... | xargs kill -9`: `grep 8765`
 * also matches other ports and process ids containing those digits, and -9 gives the program no chance
 * to clean up. Now the listener is looked up by the exact port, shown by name and PID in the approval,
 * asked to exit normally (Stop-Process without -Force), and checked again afterwards.
 */

export type PortOs = 'windows';

export interface PortRequest {
  port: number;
  /** "force close", "kill -9": the program gets no chance to clean up */
  force: boolean;
}

export interface Listener {
  pid: number;
  name: string;
}

const VERB = '(?:close|free(?:\\s+up)?|release|clear|kill|terminate|shut\\s*down|force\\s+close|force\\s+kill)';

export function parsePortRequest(goal: string): PortRequest | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').replace(/^(?:please|can you|could you|hey)\s+/i, '');
  // "stop the server on port 3000" belongs to the terminal that runs the server (Ctrl+C there)
  if (/\bserver\b/i.test(text)) return null;
  const m = text.match(new RegExp(`^(${VERB})\\s+(?:-9\\s+)?(?:the\\s+)?(?:(?:process(?:es)?|app|program|thing|task|listener|whatever)\\s+(?:(?:that|which)\\s+)?(?:is\\s+)?(?:on|using|listening\\s+on|holding|blocking|that\\s+uses|occupying)\\s+)?(?:tcp\\s+)?port\\s+(\\d{1,5})(?:\\s+(?:for\\s+me|now|please))?$`, 'i'));
  if (!m) return null;
  const port = Number(m[2]);
  if (port < 1 || port > 65535) return null;
  return { port, force: /\bforce\b|-9\b/i.test(text) };
}

/** A read-only command that lists the listeners of a port */
export function listListenersCommand(port: number, _os: PortOs): string {
  return `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; "$($_.OwningProcess)\`t$($p.ProcessName)" }`;
}

export function parseListeners(stdout: string, _os: PortOs): Listener[] {
  const seen = new Map<number, Listener>();
  for (const line of stdout.split(/\r?\n/)) {
    const [pid, name] = line.split('\t');
    if (/^\d+$/.test(pid?.trim() ?? '')) seen.set(Number(pid), { pid: Number(pid), name: (name || 'process').trim() });
  }
  return [...seen.values()];
}

/** Ask the program to exit (a forced stop only when the person asked for one) */
export function stopCommand(listeners: Listener[], _os: PortOs, force: boolean): string {
  const pids = listeners.map(l => l.pid);
  return `Stop-Process -Id ${pids.join(',')}${force ? ' -Force' : ''} -ErrorAction Stop`;
}

export function describeListeners(listeners: Listener[]): string {
  return listeners.map(l => `${l.name} (PID ${l.pid})`).join(', ');
}
