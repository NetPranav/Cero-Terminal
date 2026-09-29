/**
 * FlowImport.ts — read ".flow" workflow files (action lists) as Sentinel workflows.
 *
 * A .flow file lists actions such as "open these URLs in Safari" or "launch Antigravity"
 * instead of shell commands. Each action becomes a step with a macOS and a Linux command, so
 * the Workflow Manager lists these files and they replay like any saved workflow (through the
 * same confirmation). Unknown action types are skipped rather than guessed.
 */

import type { SavedWorkflowDefinition, WorkflowStepDefinition } from '../models/WorkflowTypes';

export type FlowOs = 'macos' | 'linux' | 'windows';

const q = (value: string) => `'${String(value).replace(/'/g, `'\\''`)}'`;
/** PowerShell single quotes ('' escapes a quote) */
const pq = (value: string) => `'${String(value).replace(/'/g, "''")}'`;
const isWebUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\/[^\s'"]+$/i.test(u);

const MAC_BROWSERS: Record<string, string> = {
  safari: 'Safari', chrome: 'Google Chrome', 'google chrome': 'Google Chrome', firefox: 'Firefox',
  brave: 'Brave Browser', edge: 'Microsoft Edge', arc: 'Arc', opera: 'Opera', vivaldi: 'Vivaldi'
};
const WINDOWS_BROWSERS: Record<string, string> = {
  chrome: 'chrome', 'google chrome': 'chrome', firefox: 'firefox', edge: 'msedge', 'microsoft edge': 'msedge',
  brave: 'brave', opera: 'opera', vivaldi: 'vivaldi'
};
const LINUX_BROWSERS: Record<string, string> = {
  chrome: 'google-chrome', 'google chrome': 'google-chrome', chromium: 'chromium', firefox: 'firefox',
  brave: 'brave-browser', edge: 'microsoft-edge', opera: 'opera', vivaldi: 'vivaldi'
};

function commandsFor(action: any): { macos: string; linux: string; windows: string } | null {
  const type = String(action?.type || '').toLowerCase();
  if (type === 'browser' || type === 'url' || type === 'open_url') {
    const urls = (Array.isArray(action.urls) ? action.urls : [action.url]).filter(isWebUrl);
    if (urls.length === 0) return null;
    const app = String(action.app || '').toLowerCase();
    const macApp = MAC_BROWSERS[app];
    const linuxBin = LINUX_BROWSERS[app];
    const winBin = WINDOWS_BROWSERS[app];
    return {
      macos: macApp ? `open -a ${q(macApp)} ${urls.map(q).join(' ')}` : `open ${urls.map(q).join(' ')}`,
      linux: linuxBin ? `setsid -f ${linuxBin} ${urls.map(q).join(' ')} >/dev/null 2>&1` : urls.map((u: string) => `xdg-open ${q(u)}`).join(' && '),
      windows: winBin ? `Start-Process ${winBin} -ArgumentList ${urls.map(pq).join(',')}` : urls.map((u: string) => `Start-Process ${pq(u)}`).join('; ')
    };
  }
  if (type === 'app' || type === 'application' || type === 'launch') {
    const app = typeof action.app === 'string' ? action.app.trim() : '';
    if (!app || /[\n\r]/.test(app)) return null;
    return {
      macos: `open -a ${q(app)}`,
      linux: `setsid -f ${q(app.toLowerCase().replace(/\s+/g, '-'))} >/dev/null 2>&1`,
      windows: `Start-Process ${pq(app)}`
    };
  }
  if (type === 'folder' || type === 'directory' || type === 'open_folder') {
    const target = typeof action.path === 'string' ? action.path : '';
    if (!target) return null;
    return { macos: `open ${q(target)}`, linux: `xdg-open ${q(target)}`, windows: `Invoke-Item ${pq(target)}` };
  }
  if (type === 'command' || type === 'shell' || type === 'terminal') {
    const command = typeof action.command === 'string' ? action.command.trim() : '';
    return command ? { macos: command, linux: command, windows: command } : null;
  }
  return null;
}

/** A .flow document as a saved workflow, or null when it has no runnable actions. */
export function flowToWorkflow(raw: unknown, fallbackName: string, os: FlowOs): SavedWorkflowDefinition | null {
  const doc = raw as any;
  if (!doc || !Array.isArray(doc.actions)) return null;
  const meta = doc.metadata || {};
  const steps: WorkflowStepDefinition[] = [];
  doc.actions.forEach((action: any, i: number) => {
    const cmds = commandsFor(action);
    if (!cmds) return;
    steps.push({
      id: `step-${steps.length + 1}`,
      name: typeof action.name === 'string' && action.name.trim() ? action.name.trim() : `${action.type} ${i + 1}`,
      command: cmds[os],
      platformCommands: { macos: cmds.macos, linux: cmds.linux, windows: cmds.windows }
    });
  });
  if (steps.length === 0) return null;
  return {
    schemaVersion: 1,
    name: typeof meta.id === 'string' && meta.id ? meta.id : fallbackName,
    description: meta.description || meta.name,
    steps,
    createdAt: Number(meta.createdAt) || 0,
    updatedAt: Number(meta.updatedAt) || 0,
    author: meta.author,
    tags: [...(Array.isArray(meta.tags) ? meta.tags : []), 'flow']
  };
}

/** A workflow from file text: Sentinel's step format or a .flow action list. */
export function parseWorkflowFile(text: string, fileName: string, os: FlowOs): SavedWorkflowDefinition | null {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const base = fileName.split('/').pop()!.replace(/\.(?:flow|json)$/i, '');
  if (Array.isArray(raw?.actions)) return flowToWorkflow(raw, base, os);
  if (Array.isArray(raw?.steps) && raw.steps.every((s: any) => typeof s?.command === 'string')) {
    return {
      schemaVersion: 1,
      name: typeof raw.name === 'string' && raw.name ? raw.name : base,
      description: raw.description,
      steps: raw.steps.map((s: any, i: number) => ({ ...s, id: s.id || `step-${i + 1}`, name: s.name || `Step ${i + 1}` })),
      parameters: raw.parameters,
      createdAt: Number(raw.createdAt) || 0,
      updatedAt: Number(raw.updatedAt) || 0,
      author: raw.author,
      tags: raw.tags
    };
  }
  return null;
}

/** Whether a path names a workflow file Sentinel can open. */
export function isWorkflowFilePath(p: string): boolean {
  return /\.flow$/i.test(p) || /\.(?:sentinel-workflow|workflow)\.json$/i.test(p) || /\/\.sentinel\/workflows\/[^/]+\.json$/.test(p);
}
