/**
 * InstantAnswers.ts — deterministic answers for the most common inspection questions.
 *
 * These run before any model is consulted, even when one is available, so "check battery" or
 * "what is using port 3000" answers in milliseconds instead of a model round-trip. The set is
 * deliberately small: each pattern must match the whole request, each command is read-only
 * (so SecurityEngine runs it without a prompt), and anything more specific falls through to the
 * model.
 *
 * TODO(4.3): Windows commands for the rules that answer null (PowerShell / CIM equivalents of the
 * Linux and macOS commands this list had); until then those requests go to the model.
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
  /** null when there is no deterministic answer yet (the model handles it) */
  build: (match: RegExpMatchArray) => { command: string; explanation: string; tool?: string; params?: Record<string, any> } | null;
}

const Q = String.raw`(?:(?:can\s+you\s+|please\s+)?(?:check|show(?:\s+me)?|tell\s+me|display|get|what(?:'s|\s+is|\s+are)?|how\s+(?:much|many))\s+)?(?:the\s+|my\s+|current\s+)*`;

const RULES: InstantRule[] = [
  {
    id: 'battery',
    pattern: new RegExp(`^${Q}battery(?:\\s+(?:level|status|percentage|charge|left|life))?(?:\\s+(?:is\\s+)?left)?\\s*\\??$`, 'i'),
    build: () => null
  },
  {
    id: 'disk',
    pattern: new RegExp(`^(?:${Q}(?:free\\s+)?(?:disk|storage|drive)\\s*(?:space|usage|left|free)?(?:\\s+(?:do\\s+i\\s+have|is\\s+(?:left|free|used)))?|how\\s+full\\s+is\\s+(?:my\\s+|the\\s+)?(?:disk|drive|storage|ssd|hard\\s+drive))\\s*\\??$`, 'i'),
    build: () => null
  },
  {
    id: 'memory',
    pattern: new RegExp(`^${Q}(?:free\\s+)?(?:ram|memory)(?:\\s+(?:usage|use|left|free|used))?(?:\\s+(?:do\\s+i\\s+have|am\\s+i\\s+using|is\\s+(?:left|free|used)))?\\s*\\??$`, 'i'),
    build: () => null
  },
  {
    id: 'top-process',
    pattern: /^(?:(?:which|what)\s+(?:process|app|program)(?:es)?\s+(?:is|are)\s+(?:using|eating|consuming|hogging)\s+(?:the\s+)?most\s+(cpu|ram|memory)|(?:what|who)(?:'s|\s+is)\s+(?:eating|using|hogging|consuming)\s+(?:all\s+)?(?:of\s+)?(?:my\s+|the\s+)?(cpu|ram|memory))\s*\??$/i,
    build: () => null
  },
  {
    id: 'listening-ports',
    pattern: new RegExp(`^(?:${Q}(?:(?:open|listening|active)\\s+ports|ports\\s+(?:are\\s+)?(?:open|listening|in\\s+use))|what(?:'s|\\s+is)\\s+listening(?:\\s+on\\s+(?:which|what)\\s+ports)?)\\s*\\??$`, 'i'),
    build: () => null
  },
  {
    id: 'port-owner',
    pattern: /^(?:what|which\s+(?:process|app|program))(?:'s|\s+is)\s+(?:using|on|running\s+on|listening\s+on|holding)\s+port\s+(\d{1,5})\s*\??$/i,
    build: () => null
  },
  {
    id: 'local-ip',
    pattern: /^(?:(?:what(?:'s|\s+is)|show(?:\s+me)?|check|get)\s+)?my\s+(?:local\s+|lan\s+|private\s+)?ip(?:\s+address)?\s*\??$/i,
    build: () => null
  },
  {
    id: 'uptime',
    pattern: /^(?:(?:how\s+long\s+has\s+(?:this|my)\s+(?:system|computer|machine|pc|laptop|mac)\s+been\s+(?:up|running|on))|(?:show\s+|check\s+|what(?:'s|\s+is)\s+(?:the\s+|my\s+)?)?(?:system\s+)?uptime)\s*\??$/i,
    build: () => null
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
    build: () => null
  },
  {
    id: 'distro',
    pattern: /^(?:(?:what(?:'s|\s+is)?|which|show(?:\s+me)?|check)\s+)?(?:my\s+|the\s+)?(?:linux\s+|macos\s+)?(?:distro|distribution|os(?:\s+version)?|macos(?:\s+version)?)(?:\s+(?:am\s+i\s+(?:on|using|running)|is\s+this))?\s*\??$/i,
    build: () => null
  },
];

/** The id of the rule whose pattern matches this request, whether or not it has an answer yet */
export function instantRuleFor(goal: string): string | null {
  const text = (goal || '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 80) return null;
  return RULES.find(rule => rule.pattern.test(text))?.id ?? null;
}

/** A deterministic answer for this request, or null when the model should handle it. */
export function findInstantAnswer(goal: string): InstantAnswer | null {
  const text = (goal || '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 80) return null;
  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const built = rule.build(match);
    return built ? { id: rule.id, ...built } : null;
  }
  return null;
}

/**
 * Instant answers for every part of "what's my battery and uptime" / "check disk, memory and
 * uptime", or null unless each part has one. A single matching request returns one answer.
 */
export function findInstantAnswers(goal: string): InstantAnswer[] | null {
  const single = findInstantAnswer(goal);
  if (single) return [single];
  const text = (goal || '').trim().replace(/\s+/g, ' ').replace(/\?+$/, '');
  if (!text || text.length > 120) return null;
  const m = text.match(/^((?:(?:can\s+you\s+|please\s+)?(?:check|show(?:\s+me)?|tell\s+me|get|what(?:'s|\s+is|\s+are)?)\s+)?(?:the\s+|my\s+)?)(.+)$/i);
  const prefix = m?.[1] ?? '';
  const parts = (m?.[2] ?? text).split(/\s*(?:,|&|\band\b|\bplus\b)\s*/i).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return null;
  const answers = parts.map(p => findInstantAnswer(`${prefix}${p}`) ?? findInstantAnswer(p));
  if (!answers.every(Boolean)) return null;
  // "battery and battery" or two phrasings of one thing: answer once
  const unique = answers.filter((a, i) => answers.findIndex(b => b!.id === a!.id) === i) as InstantAnswer[];
  return unique;
}

