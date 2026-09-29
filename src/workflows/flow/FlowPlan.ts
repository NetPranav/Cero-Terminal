/**
 * FlowPlan.ts — a .flow file as concrete steps for this OS.
 *
 * A .flow file describes what to do, not how: "open these URLs in Chrome", "open VS Code",
 * "install nodejs", "run npm install in ~/app". Anyone can write one (a tutorial, a teammate) and
 * it runs the same on macOS, Windows and every Linux family, because the commands are chosen here.
 *
 * Every step is either:
 *  - desktop: opens a browser, an app, a folder or a file. A flow made only of these runs without
 *    opening the terminal at all.
 *  - terminal: installs or runs something. The flow then opens the terminal and types each step
 *    into it, so output is visible and prompts (sudo passwords, y/n) can be answered.
 *
 * Only known action types become commands; values are quoted, URLs must be http(s), and unknown
 * actions are skipped rather than guessed.
 */

export type FlowOs = 'macos' | 'linux' | 'windows';

/** The app's platform name as a FlowOs */
export function flowOsOf(platform: string): FlowOs {
  return /^win/i.test(platform) ? 'windows' : /^(?:mac|darwin)/i.test(platform) ? 'macos' : 'linux';
}

export interface FlowStep {
  name: string;
  kind: 'desktop' | 'terminal';
  /** The command for this OS */
  command: string;
  /** The same step on every OS (for the Workflow Manager and saved copies) */
  platformCommands: { macos: string; linux: string; windows: string };
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

/** POSIX single quotes */
export const sq = (v: string) => `'${String(v).replace(/'/g, `'\\''`)}'`;
/** PowerShell single quotes */
export const pq = (v: string) => `'${String(v).replace(/'/g, "''")}'`;
const isWebUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\/[^\s'"`]+$/i.test(u);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** "~/app" stays expandable in sh; PowerShell gets $HOME */
function posixPath(p: string): string {
  if (p === '~') return '"$HOME"';
  if (p.startsWith('~/')) return `"$HOME/${p.slice(2).replace(/(["\\$`])/g, '\\$1')}"`;
  return sq(p);
}
function psPath(p: string): string {
  if (p === '~') return '$HOME';
  if (p.startsWith('~/') || p.startsWith('~\\')) return `(Join-Path $HOME ${pq(p.slice(2))})`;
  return pq(p);
}

// ---- desktop actions -------------------------------------------------------------------------

const MAC_BROWSERS: Record<string, string> = {
  safari: 'Safari', chrome: 'Google Chrome', 'google chrome': 'Google Chrome', firefox: 'Firefox',
  brave: 'Brave Browser', edge: 'Microsoft Edge', 'microsoft edge': 'Microsoft Edge', arc: 'Arc', opera: 'Opera', vivaldi: 'Vivaldi'
};
const LINUX_BROWSERS: Record<string, string> = {
  chrome: 'google-chrome', 'google chrome': 'google-chrome', chromium: 'chromium', firefox: 'firefox',
  brave: 'brave-browser', edge: 'microsoft-edge', 'microsoft edge': 'microsoft-edge', opera: 'opera', vivaldi: 'vivaldi'
};
const WINDOWS_BROWSERS: Record<string, string> = {
  chrome: 'chrome', 'google chrome': 'chrome', firefox: 'firefox', edge: 'msedge', 'microsoft edge': 'msedge',
  brave: 'brave', opera: 'opera', vivaldi: 'vivaldi'
};

/** Apps whose launcher differs from their display name */
const APP_ALIASES: Record<string, { macos: string; linux: string; windows: string }> = {
  'vs code': { macos: 'Visual Studio Code', linux: 'code', windows: 'code' },
  vscode: { macos: 'Visual Studio Code', linux: 'code', windows: 'code' },
  'visual studio code': { macos: 'Visual Studio Code', linux: 'code', windows: 'code' },
  code: { macos: 'Visual Studio Code', linux: 'code', windows: 'code' },
  chrome: { macos: 'Google Chrome', linux: 'google-chrome', windows: 'chrome' },
  'google chrome': { macos: 'Google Chrome', linux: 'google-chrome', windows: 'chrome' },
  firefox: { macos: 'Firefox', linux: 'firefox', windows: 'firefox' },
  spotify: { macos: 'Spotify', linux: 'spotify', windows: 'spotify' },
  slack: { macos: 'Slack', linux: 'slack', windows: 'slack' },
  discord: { macos: 'Discord', linux: 'discord', windows: 'discord' },
  terminal: { macos: 'Terminal', linux: 'x-terminal-emulator', windows: 'wt' },
  calculator: { macos: 'Calculator', linux: 'gnome-calculator', windows: 'calc' },
  notes: { macos: 'Notes', linux: 'gnome-text-editor', windows: 'notepad' },
};

/** Names the authoring code recognises without guessing (apps with a special launcher, browsers) */
export const KNOWN_APP_NAMES = Object.keys(APP_ALIASES);
export const KNOWN_BROWSER_NAMES = Object.keys(MAC_BROWSERS);

function browserStep(action: any): FlowStep['platformCommands'] | null {
  const urls = (Array.isArray(action.urls) ? action.urls : [action.url]).filter(isWebUrl);
  if (urls.length === 0) return null;
  const app = str(action.app).toLowerCase();
  const macApp = MAC_BROWSERS[app];
  const linuxBin = LINUX_BROWSERS[app];
  const winBin = WINDOWS_BROWSERS[app];
  return {
    macos: macApp ? `open -a ${sq(macApp)} ${urls.map(sq).join(' ')}` : `open ${urls.map(sq).join(' ')}`,
    linux: linuxBin
      ? `(command -v ${linuxBin} >/dev/null 2>&1 && setsid -f ${linuxBin} ${urls.map(sq).join(' ')} >/dev/null 2>&1) || ${urls.map((u: string) => `xdg-open ${sq(u)}`).join(' && ')}`
      : urls.map((u: string) => `xdg-open ${sq(u)}`).join(' && '),
    windows: winBin ? `Start-Process ${winBin} -ArgumentList ${urls.map(pq).join(',')}` : urls.map((u: string) => `Start-Process ${pq(u)}`).join('; '),
  };
}

function appStep(action: any): FlowStep['platformCommands'] | null {
  const app = str(action.app || action.name);
  if (!app || /[\n\r]/.test(app) || app.length > 80) return null;
  const alias = APP_ALIASES[app.toLowerCase()];
  const target = typeof action.path === 'string' && action.path ? action.path : '';
  const mac = alias?.macos ?? app;
  const linux = alias?.linux ?? app.toLowerCase().replace(/\s+/g, '-');
  const win = alias?.windows ?? app;
  const withTarget = (posixCmd: string) => (target ? `${posixCmd} ${posixPath(target)}` : posixCmd);
  return {
    macos: target ? `open -a ${sq(mac)} ${posixPath(target)}` : `open -a ${sq(mac)}`,
    linux: `setsid -f ${withTarget(sq(linux))} >/dev/null 2>&1`,
    windows: target ? `Start-Process ${pq(win)} -ArgumentList ${psPath(target)}` : `Start-Process ${pq(win)}`,
  };
}

function openPathStep(action: any): FlowStep['platformCommands'] | null {
  const target = str(action.path);
  if (!target || /[\n\r]/.test(target)) return null;
  return { macos: `open ${posixPath(target)}`, linux: `xdg-open ${posixPath(target)}`, windows: `Invoke-Item ${psPath(target)}` };
}

// ---- installing software ---------------------------------------------------------------------

interface PackageSpec {
  /** Command that exists once installed (skip when already there); per OS when it differs */
  check?: string | { macos?: string; linux?: string; windows?: string };
  winget?: string;
  brew?: string;
  cask?: boolean;
  apt?: string;
  dnf?: string;
  pacman?: string;
  zypper?: string;
  /** Linux install that does not come from the distro repositories */
  linuxScript?: string;
}

const PACKAGES: Record<string, PackageSpec> = {
  nodejs: { check: 'node', winget: 'OpenJS.NodeJS.LTS', brew: 'node', apt: 'nodejs npm', dnf: 'nodejs npm', pacman: 'nodejs npm', zypper: 'nodejs npm' },
  python: { check: { macos: 'python3', linux: 'python3', windows: 'python' }, winget: 'Python.Python.3.12', brew: 'python', apt: 'python3 python3-pip python3-venv', dnf: 'python3 python3-pip', pacman: 'python python-pip', zypper: 'python3 python3-pip' },
  git: { check: 'git', winget: 'Git.Git', brew: 'git', apt: 'git', dnf: 'git', pacman: 'git', zypper: 'git' },
  vscode: { check: 'code', winget: 'Microsoft.VisualStudioCode', brew: 'visual-studio-code', cask: true, pacman: 'code',
    linuxScript: 'if command -v snap >/dev/null 2>&1; then sudo snap install code --classic; elif command -v flatpak >/dev/null 2>&1; then flatpak install -y flathub com.visualstudio.code; else echo "Install VS Code from https://code.visualstudio.com" >&2; false; fi' },
  chrome: { check: { macos: '', linux: 'google-chrome', windows: '' }, winget: 'Google.Chrome', brew: 'google-chrome', cask: true,
    linuxScript: 'if command -v flatpak >/dev/null 2>&1; then flatpak install -y flathub com.google.Chrome; else echo "Install Chrome from https://www.google.com/chrome" >&2; false; fi' },
  firefox: { check: { linux: 'firefox' }, winget: 'Mozilla.Firefox', brew: 'firefox', cask: true, apt: 'firefox', dnf: 'firefox', pacman: 'firefox', zypper: 'MozillaFirefox' },
  docker: { check: 'docker', winget: 'Docker.DockerDesktop', brew: 'docker', cask: true, apt: 'docker.io', dnf: 'moby-engine', pacman: 'docker', zypper: 'docker' },
  curl: { check: 'curl', winget: 'cURL.cURL', brew: 'curl', apt: 'curl', dnf: 'curl', pacman: 'curl', zypper: 'curl' },
  wget: { check: 'wget', winget: 'JernejSimoncic.Wget', brew: 'wget', apt: 'wget', dnf: 'wget', pacman: 'wget', zypper: 'wget' },
  ffmpeg: { check: 'ffmpeg', winget: 'Gyan.FFmpeg', brew: 'ffmpeg', apt: 'ffmpeg', dnf: 'ffmpeg-free', pacman: 'ffmpeg', zypper: 'ffmpeg' },
  jq: { check: 'jq', winget: 'jqlang.jq', brew: 'jq', apt: 'jq', dnf: 'jq', pacman: 'jq', zypper: 'jq' },
  cmake: { check: 'cmake', winget: 'Kitware.CMake', brew: 'cmake', apt: 'cmake', dnf: 'cmake', pacman: 'cmake', zypper: 'cmake' },
  java: { check: 'java', winget: 'EclipseAdoptium.Temurin.21.JDK', brew: 'openjdk', apt: 'default-jdk', dnf: 'java-21-openjdk-devel', pacman: 'jdk-openjdk', zypper: 'java-21-openjdk-devel' },
  go: { check: 'go', winget: 'GoLang.Go', brew: 'go', apt: 'golang', dnf: 'golang', pacman: 'go', zypper: 'go' },
  rust: { check: 'cargo', winget: 'Rustlang.Rustup', brew: 'rustup', pacman: 'rustup',
    linuxScript: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y" },
  yarn: { check: 'yarn', winget: 'Yarn.Yarn', brew: 'yarn', linuxScript: 'sudo npm install -g yarn' },
  pnpm: { check: 'pnpm', winget: 'pnpm.pnpm', brew: 'pnpm', linuxScript: 'sudo npm install -g pnpm' },
  ollama: { check: 'ollama', winget: 'Ollama.Ollama', brew: 'ollama', linuxScript: 'curl -fsSL https://ollama.com/install.sh | sh' },
};

const PACKAGE_ALIASES: Record<string, string> = {
  node: 'nodejs', 'node.js': 'nodejs', npm: 'nodejs', python3: 'python', pip: 'python', pip3: 'python',
  code: 'vscode', 'vs code': 'vscode', 'visual studio code': 'vscode', 'google chrome': 'chrome', 'google-chrome': 'chrome',
  golang: 'go', rustup: 'rust', cargo: 'rust', openjdk: 'java', jdk: 'java',
};

/** Re-read PATH after winget so the next step finds the new program in this same terminal */
const WIN_REFRESH_PATH = "$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')";

function checkFor(spec: PackageSpec, os: FlowOs, name: string): string {
  if (spec.check === undefined) return name;
  if (typeof spec.check === 'string') return spec.check;
  return spec.check[os] ?? '';
}

function installCommands(pkgName: string): FlowStep['platformCommands'] | null {
  const raw = pkgName.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.+_ -]{0,60}$/.test(raw)) return null;
  const key = PACKAGE_ALIASES[raw] ?? raw;
  const spec: PackageSpec = PACKAGES[key] ?? { check: raw.replace(/\s+/g, '-'), winget: raw, brew: raw, apt: raw, dnf: raw, pacman: raw, zypper: raw };

  const linuxCheck = checkFor(spec, 'linux', raw);
  const linuxBody = spec.linuxScript && !(spec.apt || spec.dnf || spec.pacman || spec.zypper)
    ? spec.linuxScript
    : [
        spec.apt && `if command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y ${spec.apt}`,
        spec.dnf && `${spec.apt ? 'elif' : 'if'} command -v dnf >/dev/null 2>&1; then sudo dnf install -y ${spec.dnf}`,
        spec.pacman && `${spec.apt || spec.dnf ? 'elif' : 'if'} command -v pacman >/dev/null 2>&1; then sudo pacman -S --needed --noconfirm ${spec.pacman}`,
        spec.zypper && `${spec.apt || spec.dnf || spec.pacman ? 'elif' : 'if'} command -v zypper >/dev/null 2>&1; then sudo zypper --non-interactive install ${spec.zypper}`,
        spec.linuxScript ? `else ${spec.linuxScript}; fi` : `else echo "No supported package manager for ${raw}" >&2; false; fi`,
      ].filter(Boolean).join('; ');
  const linux = linuxCheck ? `command -v ${linuxCheck} >/dev/null 2>&1 || { ${linuxBody}; }` : linuxBody;

  const macCheck = checkFor(spec, 'macos', raw);
  const brewCmd = spec.brew
    ? `brew install ${spec.cask ? '--cask ' : ''}${spec.brew}`
    : `echo "No Homebrew package for ${raw}" >&2; false`;
  const needBrew = `command -v brew >/dev/null 2>&1 || { echo "Homebrew is needed: https://brew.sh" >&2; false; }`;
  const macos = macCheck ? `command -v ${macCheck} >/dev/null 2>&1 || { ${needBrew} && ${brewCmd}; }` : `${needBrew} && ${brewCmd}`;

  const winCheck = checkFor(spec, 'windows', raw);
  const winget = `winget install -e --id ${spec.winget ?? raw} --accept-source-agreements --accept-package-agreements; ${WIN_REFRESH_PATH}`;
  const windows = winCheck ? `if (-not (Get-Command ${winCheck} -ErrorAction SilentlyContinue)) { ${winget} }` : winget;

  return { macos, linux, windows };
}

// ---- building the plan -----------------------------------------------------------------------

function commandAction(action: any): FlowStep['platformCommands'] | null {
  const base = str(action.command);
  const per = { macos: str(action.macos) || base, linux: str(action.linux) || base, windows: str(action.windows) || base };
  if (!per.macos && !per.linux && !per.windows) return null;
  return per;
}

/** One .flow action as a step (null: not understood) */
export function stepForAction(action: any, os: FlowOs, index: number): FlowStep | null {
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
      const posix = `git clone ${sq(repo)}${into ? ` ${posixPath(into)}` : ''}`;
      cmds = { macos: posix, linux: posix, windows: `git clone ${pq(repo)}${into ? ` ${psPath(into)}` : ''}` };
      kind = 'terminal'; name = named(`Clone ${repo.split('/').pop()?.replace(/\.git$/, '')}`); break;
    }
    case 'download': {
      const url = str(action.url);
      const to = str(action.to || action.path) || url.split('/').pop() || 'download';
      if (!isWebUrl(url)) return null;
      const posix = `curl -fL --retry 2 -o ${posixPath(to)} ${sq(url)}`;
      cmds = { macos: posix, linux: posix, windows: `Invoke-WebRequest -Uri ${pq(url)} -OutFile ${psPath(to)}` };
      kind = 'terminal'; name = named(`Download ${to}`); break;
    }
    default:
      return null;
  }
  if (!cmds || !cmds[os]) return null;
  const cwd = str(action.cwd) || undefined;
  return { name: name || `Step ${index + 1}`, kind, command: cmds[os], platformCommands: cmds, cwd: kind === 'terminal' ? cwd : undefined };
}

/**
 * A plain command from a Sentinel workflow (.workflow.json) that only opens something: it may run
 * without the terminal. Strict on purpose: one launch, no chaining, redirection or substitution.
 */
export function isDesktopCommand(command: string): boolean {
  const c = command.trim();
  if (!c || /[;&|`$<>\n]/.test(c.replace(/'[^']*'/g, "''"))) return false;
  return /^open\s+(?:-a\s+(?:'[^']+'|"[^"]+"|\S+)\s*)?(?:(?:'[^']+'|"[^"]+"|\S+)\s*)*$/.test(c)
    || /^xdg-open\s+(?:'[^']+'|\S+)$/.test(c)
    || /^Start-Process\s+(?:'[^']+'|\S+)(?:\s+-ArgumentList\s+[^;|&]+)?$/i.test(c)
    || /^(?:Invoke-Item|explorer)\s+(?:'[^']+'|\S+)$/i.test(c)
    || /^code\s+(?:\.|'[^']+'|\S+)$/.test(c);
}

/** Plan a .flow document or a Sentinel workflow ({ steps: [{ command }] }) for this OS. */
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
      const command = str(s.platformCommands?.[os]) || str(s.command);
      steps.push({
        name: str(s.name) || `Step ${i + 1}`,
        kind: isDesktopCommand(command) ? 'desktop' : 'terminal',
        command,
        platformCommands: { macos: str(s.platformCommands?.macos) || str(s.command), linux: str(s.platformCommands?.linux) || str(s.command), windows: str(s.platformCommands?.windows) || str(s.command) },
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

/** "cd" into a step's folder first, in the shell of this OS */
export function withCwd(step: FlowStep, os: FlowOs): string {
  if (!step.cwd) return step.command;
  return os === 'windows' ? `Set-Location -LiteralPath ${psPath(step.cwd)}; ${step.command}` : `cd ${posixPath(step.cwd)} && ${step.command}`;
}

/**
 * Resolve each step's relative folder against the folder the terminal is in when the flow starts.
 *
 * Steps are typed into one shell, and `cd 'app' && git init` leaves the shell inside app, so the next
 * step's `cd 'app'` would look for app/app and fail. With an absolute folder, repeating the `cd` is harmless
 * in every shell, and the approval lists exactly what is typed.
 */
export function absolutizeCwd(plan: FlowPlan, base: string | undefined, os: FlowOs): FlowPlan {
  if (!base) return plan;
  const sep = os === 'windows' ? '\\' : '/';
  const isAbsolute = (p: string) => /^(?:~(?:[\\/]|$)|\/|[A-Za-z]:[\\/]|\\\\)/.test(p);
  const join = (dir: string, rel: string) => `${dir.replace(/[\\/]+$/, '')}${sep}${rel.replace(/^\.[\\/]/, '').replace(/[\\/]+/g, sep)}`;
  return { ...plan, steps: plan.steps.map(step => (step.cwd && !isAbsolute(step.cwd) ? { ...step, cwd: join(base, step.cwd) } : step)) };
}

