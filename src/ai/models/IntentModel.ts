/**
 * IntentModel.ts — Two-Tier Intent Classification & Step Decomposition Engine
 *
 * Implements Phase 0.75 Tasks:
 * - 0.75.1: Real IntentModel.classify() backed by small CPU-resident 0.5B-1.5B model / fallback
 * - 0.75.8: Hard sub-3s latency budget enforced with fast zero-shot fallback (<5ms)
 * - 0.75.9: Resource budget partitioning: CPU execution (0 GPU layers) reserving GPU for 3B coder
 */

import { IntentData, IntentSchema, IntentStep } from '../schemas/IntentSchema';

export interface IntentContext {
  cwd?: string;
  lastExitCode?: number;
  os?: string;
  activeModel?: string;
  sessionId?: string;
  timeoutMs?: number;
  endpointUrl?: string;
  forceCpu?: boolean;
}

export interface IntentModel {
  classify(prompt: string, context?: IntentContext): Promise<IntentData>;
}

export class LocalIntentClassifier implements IntentModel {
  public static readonly DEFAULT_TIMEOUT_MS = 3000; // Phase 0.75 Task 0.75.8: Hard ~3s latency budget

  /** localStorage key holding an Ollama-compatible endpoint for the optional intent model */
  public static readonly ENDPOINT_STORAGE_KEY = 'sentinel_intent_model_endpoint';

  private configuredEndpoint?: string;
  private defaultTimeoutMs: number;

  constructor(options?: { endpointUrl?: string; timeoutMs?: number }) {
    this.configuredEndpoint = options?.endpointUrl;
    this.defaultTimeoutMs = options?.timeoutMs || LocalIntentClassifier.DEFAULT_TIMEOUT_MS;
  }

  /**
   * The model tier is opt-in. It used to call Ollama at 127.0.0.1:11434 with qwen2.5:1.5b
   * before every request, adding up to 3 s even for users on the embedded engine or a cloud
   * API who never installed that model. Without a configured endpoint the heuristic runs alone.
   */
  private resolveEndpoint(context?: IntentContext): string | undefined {
    if (context?.endpointUrl) return context.endpointUrl;
    if (this.configuredEndpoint) return this.configuredEndpoint;
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LocalIntentClassifier.ENDPOINT_STORAGE_KEY) : null;
      return saved || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Classify user prompt into domain, action, and optional decomposed steps.
   * Runs on CPU (Task 0.75.9) with strict <= 3s timeout budget (Task 0.75.8).
   */
  public async classify(prompt: string, context?: IntentContext): Promise<IntentData> {
    const startTime = performance.now();
    const timeoutMs = Math.min(context?.timeoutMs || this.defaultTimeoutMs, LocalIntentClassifier.DEFAULT_TIMEOUT_MS);
    const endpoint = this.resolveEndpoint(context);

    // 1. Optional small-model classification, only when an endpoint was configured
    if (endpoint) {
      try {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

        // Minimal context payload (deliberately small input: prompt + minimal session state, NOT full tool catalog)
        const minimalPrompt = this.buildIntentPrompt(prompt, context);

        const response = await fetch(`${endpoint}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: context?.activeModel || 'qwen2.5:1.5b',
            prompt: minimalPrompt,
            stream: false,
            format: 'json',
            options: {
              temperature: 0.1,
              num_gpu: 0 // Task 0.75.9: Strictly CPU execution, reserving GPU for 3B coder model
            }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutHandle);

        if (response.ok) {
          const raw = await response.json();
          const parsed = this.parseModelOutput(raw?.response || '');
          if (parsed) {
            const elapsed = Math.round(performance.now() - startTime);
            return {
              ...parsed,
              executionTier: 'intent_cpu',
              latencyMs: elapsed
            };
          }
        }
      } catch {
        // Timeout (AbortError), connection refused, or parse error -> immediate fallback
      }
    }

    // 2. High-accuracy, sub-5ms zero-shot heuristic fallback
    const heuristic = this.classifyHeuristic(prompt, context);
    const elapsed = Math.round(performance.now() - startTime);
    return {
      ...heuristic,
      executionTier: 'intent_cpu',
      latencyMs: elapsed
    };
  }

  /**
   * Build minimal prompt for 0.5B-1.5B intent model.
   * Only includes prompt and minimal session state; excludes full tool specs.
   */
  private buildIntentPrompt(prompt: string, context?: IntentContext): string {
    return `You are Sentinel's Intent Classifier. Classify the user instruction into domain, action, and whether it requires multi-step decomposition.
Output JSON only:
{
  "domain": "application|system|network|developer|filesystem|git|docker|shell|workflow|general",
  "action": "open|install|reinstall|uninstall|check|inspect|list|kill|configure|execute|decompose|save|run",
  "confidence": 0.0-1.0,
  "isComplex": true|false,
  "suggestedSteps": [
    {
      "id": 1,
      "goal": "step description",
      "precondition_check": "shell command to check",
      "if_precondition_true": "skip|continue|abort",
      "if_precondition_false": "install|continue|abort|skip"
    }
  ]
}

User prompt: "${prompt}"
Context: os=${context?.os || 'linux'}, cwd=${context?.cwd || '~'}, lastExitCode=${context?.lastExitCode ?? 0}`;
  }

  /**
   * Parse model output JSON and validate with IntentSchema.
   */
  private parseModelOutput(raw: string): IntentData | null {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const json = JSON.parse(match[0]);
      const validated = IntentSchema.safeParse(json);
      return validated.success ? validated.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Zero-shot heuristic classifier (<5ms).
   * Maps user goal into domain, action, confidence, and precondition-aware steps.
   */
  public classifyHeuristic(prompt: string, context?: IntentContext): IntentData {
    const raw = prompt.trim();
    const clean = raw.toLowerCase();

    // Check for complex multi-step instructions (Phase 0.75 Task 0.75.1 & 0.75.2)
    const complexDecomposition = this.decomposeComplexGoal(raw, context);
    if (complexDecomposition) {
      return complexDecomposition;
    }

    // 1. Application Management & Launch
    if (/(?:re-?install|remove\s+and\s+install|uninstall\s+and\s+install)/i.test(clean)) {
      return {
        domain: 'application',
        action: 'reinstall',
        confidence: 0.98
      };
    }

    if (/\b(?:install|get|download|setup)\s+([a-zA-Z0-9_\-\.]+)/i.test(clean) && !/\b(?:git|npm|pip|cargo|docker)\b/i.test(clean)) {
      return {
        domain: 'application',
        action: 'install',
        confidence: 0.95
      };
    }

    if (/\b(?:uninstall|remove|purge)\s+([a-zA-Z0-9_\-\.]+)/i.test(clean) && !/\b(?:rm|file|dir|branch)\b/i.test(clean)) {
      return {
        domain: 'application',
        action: 'uninstall',
        confidence: 0.95
      };
    }

    if (/^(?:open|launch|start)\s+(?:the\s+)?([a-zA-Z0-9_\-\.]+)/i.test(clean) && !/\b(?:docker|service|workflow)\b/i.test(clean)) {
      return {
        domain: 'application',
        action: 'open',
        confidence: 0.96
      };
    }

    // 2. System Diagnostics & Hardware
    if (/\b(?:cpu|processor|cores|load\s*avg|usage)\b/i.test(clean)) {
      return { domain: 'system', action: 'cpu', confidence: 0.96 };
    }
    if (/\b(?:ram|memory|swap|free\s*mem)\b/i.test(clean)) {
      return { domain: 'system', action: 'memory', confidence: 0.96 };
    }
    if (/\b(?:disk|storage|filesystem\s*space|df|mount)\b/i.test(clean)) {
      return { domain: 'system', action: 'disk', confidence: 0.95 };
    }
    if (/\b(?:battery|power|charge|capacity)\b/i.test(clean)) {
      return { domain: 'system', action: 'battery', confidence: 0.97 };
    }
    if (/\b(?:kill|terminate|stop\s*process|pkill|killall)\b/i.test(clean)) {
      return { domain: 'system', action: 'kill', confidence: 0.94 };
    }
    if (/\b(?:uptime|system\s*info|specs|hardware|uname)\b/i.test(clean)) {
      return { domain: 'system', action: 'info', confidence: 0.95 };
    }
    if (/\b(?:service|systemctl|daemon|journalctl)\b/i.test(clean)) {
      return { domain: 'system', action: 'service', confidence: 0.94 };
    }

    // 3. Network & Connectivity
    if (/\b(?:wifi|wi-fi|wlan|ssid|wireless)\b/i.test(clean)) {
      const action = /\b(?:scan|list|show|find)\b/i.test(clean) ? 'scan' : 'check';
      return { domain: 'network', action, confidence: 0.96 };
    }
    if (/\b(?:bluetooth|bt|pair|headphone|earbuds)\b/i.test(clean)) {
      return { domain: 'network', action: 'bluetooth', confidence: 0.95 };
    }
    if (/\b(?:port|ports|listening|lsof|netstat|ss)\b/i.test(clean)) {
      return { domain: 'network', action: 'ports', confidence: 0.96 };
    }
    if (/\b(?:ping|latency|dns|ip|ifconfig|curl|wget)\b/i.test(clean)) {
      return { domain: 'network', action: 'query', confidence: 0.94 };
    }

    // 4. Developer Tools & Builds
    if (/\b(?:cargo|rustc)\s+(?:build|check|test|run|clippy)\b/i.test(clean) || /\b(?:build|compile|test)\s+rust\b/i.test(clean)) {
      return { domain: 'developer', action: 'cargo', confidence: 0.97 };
    }
    if (/\b(?:npm|yarn|pnpm|bun)\s+(?:install|run|build|test|dev)\b/i.test(clean) || /\b(?:build|test)\s+(?:node|frontend|react|vite)\b/i.test(clean)) {
      return { domain: 'developer', action: 'node', confidence: 0.97 };
    }
    if (/\b(?:python|python3|pip|pytest|poetry)\b/i.test(clean)) {
      return { domain: 'developer', action: 'python', confidence: 0.96 };
    }

    // 5. Version Control (Git)
    if (/\b(?:git|commit|push|pull|branch|checkout|merge|rebase|stash|diff|repo)\b/i.test(clean)) {
      const action = /\b(?:commit)\b/i.test(clean) ? 'commit'
        : /\b(?:push)\b/i.test(clean) ? 'push'
        : /\b(?:pull)\b/i.test(clean) ? 'pull'
        : /\b(?:branch|checkout)\b/i.test(clean) ? 'branch'
        : 'status';
      return { domain: 'git', action, confidence: 0.97 };
    }

    // 6. Containers (Docker / Podman)
    if (/\b(?:docker|podman|container|docker-compose)\b/i.test(clean)) {
      const action = /\b(?:run|start)\b/i.test(clean) ? 'start'
        : /\b(?:stop|kill)\b/i.test(clean) ? 'stop'
        : /\b(?:build)\b/i.test(clean) ? 'build'
        : 'list';
      return { domain: 'docker', action, confidence: 0.96 };
    }

    // 7. Filesystem & Navigation
    if (/\b(?:ls|dir|list\s+files|list\s+directory)\b/i.test(clean)) {
      return { domain: 'filesystem', action: 'list', confidence: 0.95 };
    }
    if (/\b(?:find|search\s+for\s+file|locate|mdfind)\b/i.test(clean)) {
      return { domain: 'filesystem', action: 'search', confidence: 0.95 };
    }
    if (/\b(?:cd|navigate|change\s+directory)\b/i.test(clean)) {
      return { domain: 'filesystem', action: 'navigate', confidence: 0.95 };
    }
    if (/\b(?:cat|head|tail|read\s+file)\b/i.test(clean)) {
      return { domain: 'filesystem', action: 'read', confidence: 0.95 };
    }

    // 8. Workflow Engine (Dedicated run or save commands, not compound multi-step instructions)
    const isPureWorkflowCmd = /^(?:run|save|list|replay|delete)\s+workflow\b/i.test(clean) ||
      /^workflow\s+(?:run|save|list|replay|delete)\b/i.test(clean);
    const hasProceduralAction = /\b(?:create|mkdir|put|echo|touch|write|cat|build|test|install|remove|delete|clone)\b/i.test(clean);

    if (isPureWorkflowCmd || (/\b(?:save\s+workflow|run\s+workflow)\b/i.test(clean) && !hasProceduralAction)) {
      return { domain: 'workflow', action: clean.includes('save') ? 'save' : 'run', confidence: 0.98 };
    }

    // Default generic execution
    return {
      domain: 'shell',
      action: 'execute',
      confidence: 0.60
    };
  }

  /**
   * Decompose ambiguous or multi-step requests into precondition-aware step schema (Task 0.75.2).
   */
  private decomposeComplexGoal(prompt: string, _context?: IntentContext): IntentData | null {
    const clean = prompt.trim();

    // Pattern A: "ensure/check if <app> is installed ... then open/run it"
    const ensureLaunchMatch = clean.match(/^(?:ensure|check\s+if)\s+([a-zA-Z0-9_\-\.]+)\s+is\s+installed(?:\s*(?:,|and|then)\s*(?:if\s+not\s+install\s+it)?)?(?:\s*(?:,|and|then)\s*(?:open|launch|start|run)\s+(?:it|[a-zA-Z0-9_\-\.]+))?/i);
    if (ensureLaunchMatch) {
      const app = ensureLaunchMatch[1].trim();
      const steps: IntentStep[] = [
        {
          id: 1,
          goal: `ensure ${app} is installed`,
          precondition_check: `which "${app}"`,
          if_precondition_true: 'skip',
          if_precondition_false: 'install'
        },
        {
          id: 2,
          goal: `open ${app}`
        }
      ];

      return {
        domain: 'application',
        action: 'decompose',
        confidence: 0.96,
        isComplex: true,
        suggestedSteps: steps
      };
    }

    // Pattern B: "install <app> if not installed and (then) open it"
    const installIfAbsentMatch = clean.match(/^install\s+([a-zA-Z0-9_\-\.]+)\s+if\s+(?:it\s+is\s+)?not\s+(?:already\s+)?installed(?:\s*(?:,|and|then)\s*(?:open|launch|start|run)\s+(?:it|[a-zA-Z0-9_\-\.]+))?/i);
    if (installIfAbsentMatch) {
      const app = installIfAbsentMatch[1].trim();
      const steps: IntentStep[] = [
        {
          id: 1,
          goal: `install ${app}`,
          precondition_check: `which "${app}"`,
          if_precondition_true: 'skip',
          if_precondition_false: 'install'
        },
        {
          id: 2,
          goal: `open ${app}`
        }
      ];

      return {
        domain: 'application',
        action: 'decompose',
        confidence: 0.96,
        isComplex: true,
        suggestedSteps: steps
      };
    }

    // Pattern C: Sequential conjunctions without formal regex prefix ("build project and then run tests and start server")
    if (/\s+(?:and\s+then|after\s+that|followed\s+by)\s+/i.test(clean)) {
      const parts = clean.split(/\s+(?:and\s+then|after\s+that|followed\s+by)\s+/i).map(p => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        const steps: IntentStep[] = parts.map((part, idx) => {
          let preCheck: string | undefined;
          let ifFalse: 'install' | 'continue' | 'abort' | 'skip' | undefined;

          if (/\b(?:build|test|compile)\b/i.test(part)) {
            preCheck = 'test -f package.json || test -f Cargo.toml';
            ifFalse = 'abort';
          } else if (/\b(?:install)\s+([a-zA-Z0-9_\-\.]+)/i.test(part)) {
            const pkg = part.match(/\b(?:install)\s+([a-zA-Z0-9_\-\.]+)/i)?.[1];
            if (pkg) {
              preCheck = `which "${pkg}"`;
              ifFalse = 'install';
            }
          }

          return {
            id: idx + 1,
            goal: part,
            precondition_check: preCheck,
            if_precondition_true: preCheck ? 'skip' : undefined,
            if_precondition_false: ifFalse
          };
        });

        return {
          domain: 'developer',
          action: 'decompose',
          confidence: 0.92,
          isComplex: true,
          suggestedSteps: steps
        };
      }
    }

    return null;
  }
}
