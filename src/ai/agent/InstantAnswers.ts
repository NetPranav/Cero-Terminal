/**
 * InstantAnswers.ts — deterministic answers for the most common inspection questions.
 *
 * These run before any model is consulted, even when one is available, so "check battery" or
 * "what is using port 3000" answers in milliseconds instead of a model round-trip. The set is
 * deliberately small: each pattern must match the whole request, each command is read-only
 * (so SecurityEngine runs it without a prompt), and anything more specific falls through to the
 * model. Commands target Linux; other platforms go straight to the model.
 */

export interface InstantAnswer {
  id: string;
  /** Shell fallback / description of what runs */
  command: string;
  explanation: string;
  /** When set, run this capability driver (structured, formatted output) instead of the shell command */
  tool?: string;
  params?: Record<string, any>;
}

interface InstantRule {
  id: string;
  pattern: RegExp;
  build: (match: RegExpMatchArray) => { command: string; explanation: string; tool?: string; params?: Record<string, any> };
}

const Q = String.raw`(?:(?:can\s+you\s+|please\s+)?(?:check|show(?:\s+me)?|tell\s+me|display|get|what(?:'s|\s+is|\s+are)?|how\s+(?:much|many))\s+)?(?:the\s+|my\s+|current\s+)*`;

const LINUX_RULES: InstantRule[] = [
  {
    id: 'battery',
    pattern: new RegExp(`^${Q}battery(?:\\s+(?:level|status|percentage|charge|left|life))?(?:\\s+(?:is\\s+)?left)?\\s*\\??$`, 'i'),
    build: () => ({
      command: 'found=0; for b in /sys/class/power_supply/BAT*; do [ -d "$b" ] || continue; found=1; echo "$(basename "$b"): $(cat "$b/capacity")% ($(cat "$b/status"))"; done; [ "$found" = 1 ] || echo "No battery found (desktop or AC-only system)"',
      explanation: 'Battery charge and charging state',
      tool: 'system.battery',
      params: {}
    })
  },
  {
    id: 'disk',
    pattern: new RegExp(`^${Q}(?:free\\s+)?(?:disk|storage|drive)\\s*(?:space|usage|left|free)?(?:\\s+(?:do\\s+i\\s+have|is\\s+(?:left|free|used)))?\\s*\\??$`, 'i'),
    build: () => ({
      command: 'df -h -x tmpfs -x devtmpfs -x squashfs -x overlay -x efivarfs 2>/dev/null || df -h',
      explanation: 'Disk usage of mounted filesystems',
      tool: 'system.storage',
      params: {}
    })
  },
  {
    id: 'memory',
    pattern: new RegExp(`^${Q}(?:free\\s+)?(?:ram|memory)(?:\\s+(?:usage|use|left|free|used))?(?:\\s+(?:do\\s+i\\s+have|am\\s+i\\s+using|is\\s+(?:left|free|used)))?\\s*\\??$`, 'i'),
    build: () => ({ command: 'free -h', explanation: 'Memory and swap usage', tool: 'system.ram', params: {} })
  },
  {
    id: 'top-process',
    pattern: /^(?:which|what)\s+(?:process|app|program)(?:es)?\s+(?:is|are)\s+(?:using|eating|consuming|hogging)\s+(?:the\s+)?most\s+(cpu|ram|memory)\s*\??$/i,
    build: (m) => {
      const byMemory = m[1].toLowerCase() !== 'cpu';
      return {
        command: `ps -eo pid,pcpu,pmem,comm --sort=-${byMemory ? 'pmem' : 'pcpu'} | head -n 6`,
        explanation: `Top processes by ${byMemory ? 'memory' : 'CPU'}`
      };
    }
  },
  {
    id: 'listening-ports',
    pattern: new RegExp(`^${Q}(?:(?:open|listening|active)\\s+ports|ports\\s+(?:are\\s+)?(?:open|listening|in\\s+use))\\s*\\??$`, 'i'),
    build: () => ({ command: 'ss -tulpn 2>/dev/null', explanation: 'Listening TCP and UDP ports with their processes', tool: 'network.ports', params: {} })
  },
  {
    id: 'port-owner',
    pattern: /^(?:what|which\s+(?:process|app|program))(?:'s|\s+is)\s+(?:using|on|running\s+on|listening\s+on|holding)\s+port\s+(\d{1,5})\s*\??$/i,
    build: (m) => ({
      command: `ss -tulpn 'sport = :${Number(m[1])}' 2>/dev/null`,
      explanation: `Process listening on port ${Number(m[1])}`
    })
  },
  {
    id: 'local-ip',
    pattern: /^(?:(?:what(?:'s|\s+is)|show(?:\s+me)?|check|get)\s+)?my\s+(?:local\s+|lan\s+|private\s+)?ip(?:\s+address)?\s*\??$/i,
    build: () => ({ command: 'ip -br -4 addr show scope global', explanation: 'Local IPv4 addresses per interface' })
  },
  {
    id: 'uptime',
    pattern: /^(?:(?:how\s+long\s+has\s+(?:this|my)\s+(?:system|computer|machine|pc|laptop)\s+been\s+(?:up|running))|(?:show\s+|check\s+|what(?:'s|\s+is)\s+(?:the\s+)?)?(?:system\s+)?uptime)\s*\??$/i,
    build: () => ({ command: 'uptime -p', explanation: 'Time since last boot' })
  },
  {
    id: 'kernel',
    pattern: /^(?:(?:what(?:'s|\s+is)|show(?:\s+me)?|check)\s+)?(?:my\s+|the\s+)?(?:kernel|linux)\s+version\s*\??$/i,
    build: () => ({ command: 'uname -srm', explanation: 'Kernel release and architecture' })
  },
  {
    id: 'distro',
    pattern: /^(?:(?:what(?:'s|\s+is)|which|show(?:\s+me)?|check)\s+)?(?:my\s+|the\s+)?(?:linux\s+)?(?:distro|distribution|os(?:\s+version)?)(?:\s+(?:am\s+i\s+(?:on|using|running)|is\s+this))?\s*\??$/i,
    build: () => ({ command: `sed -n 's/^PRETTY_NAME=//p' /etc/os-release | tr -d '"'`, explanation: 'Installed Linux distribution' })
  },
];

/** A deterministic answer for this request, or null when the model should handle it. */
export function findInstantAnswer(goal: string, os: string): InstantAnswer | null {
  if (os !== 'linux') return null;
  const text = (goal || '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 80) return null;
  for (const rule of LINUX_RULES) {
    const match = text.match(rule.pattern);
    if (match) return { id: rule.id, ...rule.build(match) };
  }
  return null;
}
