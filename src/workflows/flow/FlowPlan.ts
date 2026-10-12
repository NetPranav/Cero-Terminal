/**
 * FlowPlan.ts — a .flow file as concrete Windows steps.
 *
 * A .flow file describes what to do, not how: "open these URLs in Chrome", "open VS Code",
 * "install nodejs", "run npm install in ~/app". Anyone can write one (a tutorial, a teammate, on
 * any OS); the PowerShell commands are chosen here. A command action may carry a `windows`
 * variant, which wins over its plain `command`.
 * TODO(4.7): a command written for bash on another OS must not run through PowerShell silently.
 *
 * Every step is either:
 *  - desktop: opens a browser, an app, a folder or a file. A flow made only of these runs without
 *    opening the terminal at all.
 *  - terminal: installs or runs something. The flow then opens the terminal and types each step
 *    into it, so output is visible and prompts (y/n, UAC for installers) can be answered.
 *
 * Only known action types become commands; values are quoted, URLs must be http(s), and unknown
 * actions are skipped rather than guessed.
 */

export type FlowOs = 'windows';

/** The app's platform name as a FlowOs; this build only runs on Windows */
export function flowOsOf(_platform: string): FlowOs {
  return 'windows';
}

export interface FlowStep {
  name: string;
  kind: 'desktop' | 'terminal';
  /** The PowerShell command */
  command: string;
  /** The step per OS (for the Workflow Manager and saved copies) */
  platformCommands: { windows: string };
  /** Folder to run in (terminal steps) */
  cwd?: string;
}

export interface FlowPlan {
  name: string;
  description?: string;
  steps: FlowStep[];
  /** True when any step has to run in a terminal */
  needsTerminal: boolean;
  /** Actions that were not understood, by position (1-based), so the user can be told */
  skipped: string[];
}

// ---- quoting ---------------------------------------------------------------------------------

/** PowerShell single quotes */
export const pq = (v: string) => `'${String(v).replace(/'/g, "''")}'`;
const isWebUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\/[^\s'"`]+$/i.test(u);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** "~/app" becomes a path under $HOME */
function psPath(p: string): string {
  if (p === '~') return '$HOME';
  if (p.startsWith('~/') || p.startsWith('~\\')) return `(Join-Path $HOME ${pq(p.slice(2))})`;
  return pq(p);
}

// ---- desktop actions -------------------------------------------------------------------------

const WINDOWS_BROWSERS: Record<string, string> = {
  chrome: 'chrome', 'google chrome': 'chrome', firefox: 'firefox', edge: 'msedge', 'microsoft edge': 'msedge',
  brave: 'brave', opera: 'opera', vivaldi: 'vivaldi'
};

/** Apps whose launcher differs from their display name */
const APP_ALIASES: Record<string, string> = {
  'vs code': 'code', vscode: 'code', 'visual studio code': 'code', code: 'code',
  chrome: 'chrome', 'google chrome': 'chrome', firefox: 'firefox', spotify: 'spotify', slack: 'slack', discord: 'discord',
  terminal: 'wt', calculator: 'calc', notes: 'notepad',
};

/** Names the authoring code recognises without guessing (apps with a special launcher, browsers) */
export const KNOWN_APP_NAMES = Object.keys(APP_ALIASES);
export const KNOWN_BROWSER_NAMES = Object.keys(WINDOWS_BROWSERS);

function browserStep(action: any): FlowStep['platformCommands'] | null {
  const urls = (Array.isArray(action.urls) ? action.urls : [action.url]).filter(isWebUrl);
  if (urls.length === 0) return null;
  const app = str(action.app).toLowerCase();
  const winBin = WINDOWS_BROWSERS[app];
  return {
    windows: winBin ? `Start-Process ${winBin} -ArgumentList ${urls.map(pq).join(',')}` : urls.map((u: string) => `Start-Process ${pq(u)}`).join('; '),
  };
}

function appStep(action: any): FlowStep['platformCommands'] | null {
  const app = str(action.app || action.name);
  if (!app || /[\n\r]/.test(app) || app.length > 80) return null;
  const target = typeof action.path === 'string' && action.path ? action.path : '';
  const win = APP_ALIASES[app.toLowerCase()] ?? app;
  return {
    windows: target ? `Start-Process ${pq(win)} -ArgumentList ${psPath(target)}` : `Start-Process ${pq(win)}`,
  };
}

function openPathStep(action: any): FlowStep['platformCommands'] | null {
  const target = str(action.path);
  if (!target || /[\n\r]/.test(target)) return null;
  return { windows: `Invoke-Item ${psPath(target)}` };
}

// ---- installing software ---------------------------------------------------------------------

interface PackageSpec {
  /** Command that exists once installed (skip when already there); '' when there is none to check */
  check?: string;
  winget?: string;
}

const PACKAGES: Record<string, PackageSpec> = {
  nodejs: { check: 'node', winget: 'OpenJS.NodeJS.LTS' },
  python: { check: 'python', winget: 'Python.Python.3.12' },
  git: { check: 'git', winget: 'Git.Git' },
  vscode: { check: 'code', winget: 'Microsoft.VisualStudioCode' },
  chrome: { check: '', winget: 'Google.Chrome' },
  firefox: { winget: 'Mozilla.Firefox' },
  docker: { check: 'docker', winget: 'Docker.DockerDesktop' },
  curl: { check: 'curl', winget: 'cURL.cURL' },
  wget: { check: 'wget', winget: 'JernejSimoncic.Wget' },
  ffmpeg: { check: 'ffmpeg', winget: 'Gyan.FFmpeg' },
  jq: { check: 'jq', winget: 'jqlang.jq' },
  cmake: { check: 'cmake', winget: 'Kitware.CMake' },
  java: { check: 'java', winget: 'EclipseAdoptium.Temurin.21.JDK' },
  go: { check: 'go', winget: 'GoLang.Go' },
  rust: { check: 'cargo', winget: 'Rustlang.Rustup' },
  yarn: { check: 'yarn', winget: 'Yarn.Yarn' },
  pnpm: { check: 'pnpm', winget: 'pnpm.pnpm' },
  ollama: { check: 'ollama', winget: 'Ollama.Ollama' },
};

const PACKAGE_ALIASES: Record<string, string> = {
  node: 'nodejs', 'node.js': 'nodejs', npm: 'nodejs', python3: 'python', pip: 'python', pip3: 'python',
  code: 'vscode', 'vs code': 'vscode', 'visual studio code': 'vscode', 'google chrome': 'chrome', 'google-chrome': 'chrome',
  golang: 'go', rustup: 'rust', cargo: 'rust', openjdk: 'java', jdk: 'java',
};

/** Re-read PATH after winget so the next step finds the new program in this same terminal */
const WIN_REFRESH_PATH = "$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')";

function installCommands(pkgName: string): FlowStep['platformCommands'] | null {
  const raw = pkgName.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.+_ -]{0,60}$/.test(raw)) return null;
  const key = PACKAGE_ALIASES[raw] ?? raw;
  const spec: PackageSpec = PACKAGES[key] ?? { check: raw.replace(/\s+/g, '-'), winget: raw };
  const check = spec.check === undefined ? raw : spec.check;
  const winget = `winget install -e --id ${spec.winget ?? raw} --accept-source-agreements --accept-package-agreements; ${WIN_REFRESH_PATH}`;
  return { windows: check ? `if (-not (Get-Command ${check} -ErrorAction SilentlyContinue)) { ${winget} }` : winget };
}

// ---- building the plan -----------------------------------------------------------------------

function commandAction(action: any): FlowStep['platformCommands'] | null {
  const windows = str(action.windows) || str(action.command);
  return windows ? { windows } : null;
}

/** One .flow action as a step (null: not understood) */
export function stepForAction(action: any, _os: FlowOs, index: number): FlowStep | null {
  const type = str(action?.type).toLowerCase();
  const named = (fallback: string) => str(action?.name) || fallback;
  let cmds: FlowStep['platformCommands'] | null = null;
  let kind: FlowStep['kind'] = 'desktop';
  let name = '';
  switch (type) {
    case 'browser': case 'url': case 'open_url': case 'link':
      cmds = browserStep(action); name = named(`Open ${str(action.url) || 'links'}`); break;
    case 'app': case 'application': case 'launch':
      cmds = appStep(action); name = named(`Open ${str(action.app)}`); break;
    case 'folder': case 'directory': case 'open_folder': case 'file': case 'open_file':
      cmds = openPathStep(action); name = named(`Open ${str(action.path)}`); break;
    case 'command': case 'shell': case 'terminal': case 'run':
      cmds = commandAction(action); kind = 'terminal'; name = named(str(action.command) || 'Run a command'); break;
    case 'install': case 'package': {
      // one step per package: clearer progress, and already-installed ones are skipped
      const list = (Array.isArray(action.packages) ? action.packages : [action.package ?? action.packages]).map(str).filter(Boolean);
      if (list.length !== 1) return null;
      cmds = installCommands(list[0]); kind = 'terminal'; name = named(`Install ${list[0]}`); break;
    }
    case 'clone': case 'git_clone': {
      const repo = str(action.repo || action.url);
      if (!/^(?:https:\/\/|git@)[^\s'"`]+$/.test(repo)) return null;
      const into = str(action.into || action.path);
      cmds = { windows: `git clone ${pq(repo)}${into ? ` ${psPath(into)}` : ''}` };
      kind = 'terminal'; name = named(`Clone ${repo.split('/').pop()?.replace(/\.git$/, '')}`); break;
    }
    case 'download': {
      const url = str(action.url);
      const to = str(action.to || action.path) || url.split('/').pop() || 'download';
      if (!isWebUrl(url)) return null;
      cmds = { windows: `Invoke-WebRequest -Uri ${pq(url)} -OutFile ${psPath(to)}` };
      kind = 'terminal'; name = named(`Download ${to}`); break;
    }
    default:
      return null;
  }
  if (!cmds || !cmds.windows) return null;
  const cwd = str(action.cwd) || undefined;
  return { name: name || `Step ${index + 1}`, kind, command: cmds.windows, platformCommands: cmds, cwd: kind === 'terminal' ? cwd : undefined };
}

/**
 * A plain command from a Cero workflow (.workflow.json) that only opens something: it may run
 * without the terminal. Strict on purpose: one launch, no chaining, redirection or substitution.
 */
export function isDesktopCommand(command: string): boolean {
  const c = command.trim();
  if (!c || /[;&|`$<>\n]/.test(c.replace(/'[^']*'/g, "''"))) return false;
  return /^Start-Process\s+(?:'[^']+'|\S+)(?:\s+-ArgumentList\s+[^;|&]+)?$/i.test(c)
    || /^(?:Invoke-Item|explorer)\s+(?:'[^']+'|\S+)$/i.test(c)
    || /^code\s+(?:\.|'[^']+'|\S+)$/.test(c);
}

/** Plan a .flow document or a Cero workflow ({ steps: [{ command }] }) for this OS. */
export function planFlow(doc: any, fallbackName: string, os: FlowOs): FlowPlan | null {
  if (!doc || typeof doc !== 'object') return null;
  const steps: FlowStep[] = [];
  const skipped: string[] = [];
  if (Array.isArray(doc.actions)) {
    doc.actions.forEach((action: any, i: number) => {
      const step = stepForAction(action, os, i);
      if (step) steps.push(step);
      else skipped.push(`${i + 1}: ${str(action?.name) || str(action?.type) || 'unknown action'}`);
    });
    const meta = doc.metadata || {};
    return steps.length
      ? { name: str(meta.name) || str(meta.id) || fallbackName, description: str(meta.description) || undefined, steps, needsTerminal: steps.some(s => s.kind === 'terminal'), skipped }
      : null;
  }
  if (Array.isArray(doc.steps) && doc.steps.every((s: any) => typeof s?.command === 'string')) {
    doc.steps.forEach((s: any, i: number) => {
      const command = str(s.platformCommands?.windows) || str(s.command);
      steps.push({
        name: str(s.name) || `Step ${i + 1}`,
        kind: isDesktopCommand(command) ? 'desktop' : 'terminal',
        command,
        platformCommands: { windows: command },
        cwd: str(s.cwd) || undefined,
      });
    });
    return steps.length ? { name: str(doc.name) || fallbackName, description: str(doc.description) || undefined, steps, needsTerminal: steps.some(s => s.kind === 'terminal'), skipped } : null;
  }
  return null;
}

/** Plan a flow from file text; null when it is not JSON or has nothing runnable. */
export function planFlowFile(text: string, filePath: string, os: FlowOs): FlowPlan | null {
  let doc: any;
  try {
    doc = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  const base = filePath.split(/[\\/]/).pop()!.replace(/\.(?:flow|workflow\.json|json)$/i, '');
  return planFlow(doc, base, os);
}

/** "cd" into a step's folder first */
export function withCwd(step: FlowStep, _os: FlowOs): string {
  if (!step.cwd) return step.command;
  return `Set-Location -LiteralPath ${psPath(step.cwd)}; ${step.command}`;
}

/**
 * Resolve each step's relative folder against the folder the terminal is in when the flow starts.
 *
 * Steps are typed into one shell, and `Set-Location 'app'; git init` leaves the shell inside app, so the next
 * step's `Set-Location 'app'` would look for app\app and fail. With an absolute folder, repeating it is harmless,
 * and the approval lists exactly what is typed.
 */
export function absolutizeCwd(plan: FlowPlan, base: string | undefined, _os: FlowOs): FlowPlan {
  if (!base) return plan;
  const sep = '\\';
  const isAbsolute = (p: string) => /^(?:~(?:[\\/]|$)|\/|[A-Za-z]:[\\/]|\\\\)/.test(p);
  const join = (dir: string, rel: string) => `${dir.replace(/[\\/]+$/, '')}${sep}${rel.replace(/^\.[\\/]/, '').replace(/[\\/]+/g, sep)}`;
  return { ...plan, steps: plan.steps.map(step => (step.cwd && !isAbsolute(step.cwd) ? { ...step, cwd: join(base, step.cwd) } : step)) };
}

