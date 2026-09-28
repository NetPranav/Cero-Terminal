/**
 * InstantAnswers.ts — deterministic answers for the most common inspection questions.
 *
 * These run before any model is consulted, even when one is available, so "check battery" or
 * "what is using port 3000" answers in milliseconds instead of a model round-trip. The set is
 * deliberately small: each pattern must match the whole request, each command is read-only
 * (so SecurityEngine runs it without a prompt), and anything more specific falls through to the
 * model. Commands exist for Linux and macOS; other platforms go straight to the model.
 */

import { desktopCommands, detectCompositor } from '../../domain/desktop/DesktopCommands';

export interface InstantAnswer {
  id: string;
  /** Shell fallback / description of what runs */
  command: string;
  explanation: string;
  /** When set, run this capability driver (structured, formatted output) instead of the shell command */
  tool?: string;
  params?: Record<string, any>;
}

type InstantOs = 'linux' | 'macos';

interface InstantRule {
  id: string;
  pattern: RegExp;
  /** null when the platform has no deterministic answer (the model handles it) */
  build: (match: RegExpMatchArray, os: InstantOs) => { command: string; explanation: string; tool?: string; params?: Record<string, any> } | null;
}

const Q = String.raw`(?:(?:can\s+you\s+|please\s+)?(?:check|show(?:\s+me)?|tell\s+me|display|get|what(?:'s|\s+is|\s+are)?|how\s+(?:much|many))\s+)?(?:the\s+|my\s+|current\s+)*`;

const RULES: InstantRule[] = [
  {
    id: 'battery',
    pattern: new RegExp(`^${Q}battery(?:\\s+(?:level|status|percentage|charge|left|life))?(?:\\s+(?:is\\s+)?left)?\\s*\\??$`, 'i'),
    build: (_m, os) => ({
      command: os === 'macos'
        ? 'pmset -g batt'
        : 'found=0; for b in /sys/class/power_supply/BAT*; do [ -d "$b" ] || continue; found=1; echo "$(basename "$b"): $(cat "$b/capacity")% ($(cat "$b/status"))"; done; [ "$found" = 1 ] || echo "No battery found (desktop or AC-only system)"',
      explanation: 'Battery charge and charging state',
      tool: 'system.battery',
      params: {}
    })
  },
  {
    id: 'disk',
    pattern: new RegExp(`^(?:${Q}(?:free\\s+)?(?:disk|storage|drive)\\s*(?:space|usage|left|free)?(?:\\s+(?:do\\s+i\\s+have|is\\s+(?:left|free|used)))?|how\\s+full\\s+is\\s+(?:my\\s+|the\\s+)?(?:disk|drive|storage|ssd|hard\\s+drive))\\s*\\??$`, 'i'),
    build: (_m, os) => ({
      command: os === 'macos' ? 'df -h -l' : 'df -h -x tmpfs -x devtmpfs -x squashfs -x overlay -x efivarfs 2>/dev/null || df -h',
      explanation: 'Disk usage of mounted filesystems',
      tool: 'system.storage',
      params: {}
    })
  },
  {
    id: 'memory',
    pattern: new RegExp(`^${Q}(?:free\\s+)?(?:ram|memory)(?:\\s+(?:usage|use|left|free|used))?(?:\\s+(?:do\\s+i\\s+have|am\\s+i\\s+using|is\\s+(?:left|free|used)))?\\s*\\??$`, 'i'),
    build: (_m, os) => ({ command: os === 'macos' ? 'vm_stat' : 'free -h', explanation: 'Memory and swap usage', tool: 'system.ram', params: {} })
  },
  {
    id: 'top-process',
    pattern: /^(?:(?:which|what)\s+(?:process|app|program)(?:es)?\s+(?:is|are)\s+(?:using|eating|consuming|hogging)\s+(?:the\s+)?most\s+(cpu|ram|memory)|(?:what|who)(?:'s|\s+is)\s+(?:eating|using|hogging|consuming)\s+(?:all\s+)?(?:of\s+)?(?:my\s+|the\s+)?(cpu|ram|memory))\s*\??$/i,
    build: (m, os) => {
      const byMemory = (m[1] || m[2]).toLowerCase() !== 'cpu';
      return {
        command: os === 'macos'
          ? `ps -Aceo pid,pcpu,pmem,comm ${byMemory ? '-m' : '-r'} | head -n 6`
          : `ps -eo pid,pcpu,pmem,comm --sort=-${byMemory ? 'pmem' : 'pcpu'} | head -n 6`,
        explanation: `Top processes by ${byMemory ? 'memory' : 'CPU'}`,
        tool: 'system.processes',
        params: { sort: byMemory ? 'ram' : 'cpu', count: 5 }
      };
    }
  },
  {
    id: 'listening-ports',
    pattern: new RegExp(`^(?:${Q}(?:(?:open|listening|active)\\s+ports|ports\\s+(?:are\\s+)?(?:open|listening|in\\s+use))|what(?:'s|\\s+is)\\s+listening(?:\\s+on\\s+(?:which|what)\\s+ports)?)\\s*\\??$`, 'i'),
    build: (_m, os) => os === 'macos'
      ? { command: 'lsof -nP -iTCP -sTCP:LISTEN', explanation: 'Listening TCP ports with their processes (your processes; system ones need sudo)' }
      : { command: 'ss -tulpn 2>/dev/null', explanation: 'Listening TCP and UDP ports with their processes', tool: 'network.ports', params: {} }
  },
  {
    id: 'port-owner',
    pattern: /^(?:what|which\s+(?:process|app|program))(?:'s|\s+is)\s+(?:using|on|running\s+on|listening\s+on|holding)\s+port\s+(\d{1,5})\s*\??$/i,
    build: (m, os) => {
      const port = Number(m[1]);
      return os === 'macos'
        ? { command: `lsof -nP -iTCP:${port} -sTCP:LISTEN`, explanation: `Process listening on port ${port}` }
        : { command: `ss -tulpn 'sport = :${port}' 2>/dev/null`, explanation: `Process listening on port ${port}` };
    }
  },
  {
    id: 'local-ip',
    pattern: /^(?:(?:what(?:'s|\s+is)|show(?:\s+me)?|check|get)\s+)?my\s+(?:local\s+|lan\s+|private\s+)?ip(?:\s+address)?\s*\??$/i,
    build: (_m, os) => os === 'macos'
      ? { command: `ifconfig | awk '/^[a-z]/ {i=$1} /inet / && $2 != "127.0.0.1" {print i, $2}'`, explanation: 'Local IPv4 addresses per interface' }
      : { command: 'ip -br -4 addr show scope global', explanation: 'Local IPv4 addresses per interface' }
  },
  {
    id: 'uptime',
    pattern: /^(?:(?:how\s+long\s+has\s+(?:this|my)\s+(?:system|computer|machine|pc|laptop|mac)\s+been\s+(?:up|running|on))|(?:show\s+|check\s+|what(?:'s|\s+is)\s+(?:the\s+|my\s+)?)?(?:system\s+)?uptime)\s*\??$/i,
    build: (_m, os) => os === 'macos'
      ? { command: 'uptime', explanation: 'Time since last boot', tool: 'system.uptime', params: {} }
      : { command: 'uptime -p', explanation: 'Time since last boot' }
  },
  {
    id: 'last-commit',
    pattern: /^(?:(?:what|which\s+files?)\s+(?:changed|did\s+(?:i|we)\s+change)\s+in\s+(?:the\s+)?(?:last|latest|previous|most\s+recent)\s+commit|(?:show(?:\s+me)?|what(?:'s|\s+is|\s+was))\s+(?:in\s+)?(?:the\s+)?(?:last|latest|most\s+recent)\s+commit|what\s+did\s+(?:the\s+)?(?:last|latest)\s+commit\s+(?:change|do))(?:\s+(?:here|in\s+this\s+(?:repo|repository|project|folder)))?\s*\??$/i,
    build: () => ({
      command: `git --no-pager show --stat --format='%h %s%n%an, %ar' HEAD`,
      explanation: 'Files and lines changed in the last commit'
    })
  },
  {
    id: 'kernel',
    pattern: /^(?:(?:what(?:'s|\s+is)|show(?:\s+me)?|check)\s+)?(?:my\s+|the\s+)?(?:kernel|linux|darwin)\s+version\s*\??$/i,
    build: () => ({ command: 'uname -srm', explanation: 'Kernel release and architecture' })
  },
  {
    id: 'distro',
    pattern: /^(?:(?:what(?:'s|\s+is)?|which|show(?:\s+me)?|check)\s+)?(?:my\s+|the\s+)?(?:linux\s+|macos\s+)?(?:distro|distribution|os(?:\s+version)?|macos(?:\s+version)?)(?:\s+(?:am\s+i\s+(?:on|using|running)|is\s+this))?\s*\??$/i,
    build: (_m, os) => os === 'macos'
      ? { command: 'echo "$(sw_vers -productName) $(sw_vers -productVersion) (build $(sw_vers -buildVersion))"', explanation: 'Installed macOS version' }
      : { command: `sed -n 's/^PRETTY_NAME=//p' /etc/os-release | tr -d '"'`, explanation: 'Installed Linux distribution' }
  },
];

export interface DesktopInfo {
  environment?: string;
  session?: string;
}

/** Answers that depend on the compositor (window listing, screenshots). */
function desktopAnswer(text: string, desktop: DesktopInfo | undefined): InstantAnswer | null {
  const commands = desktopCommands(detectCompositor(desktop?.environment, desktop?.session));
  if (/^(?:list|show(?:\s+me)?|what\s+are)\s+(?:all\s+)?(?:the\s+|my\s+)?(?:open|active|running)?\s*windows\s*\??$/i.test(text)) {
    return commands.listWindows
      ? { id: 'list-windows', command: commands.listWindows, explanation: 'Open windows' }
      : null;
  }
  const shot = text.match(/^(?:take|capture|grab)\s+(?:a\s+)?(region\s+|area\s+|selection\s+|partial\s+)?screenshot(?:\s+of\s+(?:a\s+|the\s+)?(region|area|selection|screen|desktop))?\s*$/i);
  if (shot) {
    const region = Boolean(shot[1]) || /region|area|selection/i.test(shot[2] || '');
    return { id: 'screenshot', command: commands.screenshot(region), explanation: region ? 'Screenshot of a selected region' : 'Screenshot of the screen' };
  }
  return null;
}

/** A deterministic answer for this request, or null when the model should handle it. */
export function findInstantAnswer(goal: string, os: string, desktop?: DesktopInfo): InstantAnswer | null {
  const platform: InstantOs | null = os === 'linux' ? 'linux' : (os === 'macos' || os === 'mac' || os === 'darwin') ? 'macos' : null;
  if (!platform) return null;
  const text = (goal || '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 80) return null;
  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const built = rule.build(match, platform);
    return built ? { id: rule.id, ...built } : null;
  }
  return platform === 'linux' ? desktopAnswer(text, desktop) : macDesktopAnswer(text);
}

/** macOS screenshots use the built-in screencapture (window listing needs accessibility rights). */
function macDesktopAnswer(text: string): InstantAnswer | null {
  const shot = text.match(/^(?:take|capture|grab)\s+(?:a\s+)?(region\s+|area\s+|selection\s+|partial\s+)?screenshot(?:\s+of\s+(?:a\s+|the\s+)?(region|area|selection|screen|desktop))?\s*$/i);
  if (!shot) return null;
  const region = Boolean(shot[1]) || /region|area|selection/i.test(shot[2] || '');
  const dir = '"$HOME/Pictures/Screenshots"';
  return {
    id: 'screenshot',
    command: `mkdir -p ${dir} && f="$HOME/Pictures/Screenshots/sentinel-$(date +%Y%m%d-%H%M%S).png" && screencapture ${region ? '-i' : '-x'} "$f" && echo "Saved $f"`,
    explanation: region ? 'Screenshot of a selected region' : 'Screenshot of the screen'
  };
}
