/**
 * IntentRouter.ts — Two-Tier Intent Routing Engine
 *
 * Implements Phase 0.75 Tasks:
 * - 0.75.1: Two-tier routing layer connecting IntentModel with EntityExtractor
 * - 0.75.8: Sub-3s intent routing with domain-scoped recommended tool generation
 * - 0.75.9: CPU tier execution delegating complex generation to coder model
 */

import { IntentModel, IntentContext, LocalIntentClassifier } from '../models/IntentModel';
import { IntentData } from '../schemas/IntentSchema';
import { EntityExtractor } from './EntityExtractor';
import { ExtractedEntitiesData } from '../schemas/EntitySchema';

export interface IntentRouteResult {
  intent: IntentData;
  entities: ExtractedEntitiesData;
  recommendedTools: string[];
}

export class IntentRouter {
  private static instance: IntentRouter | null = null;

  public static readonly DOMAIN_TOOL_MAP: Record<string, string[]> = {
    application: ['application.open', 'application.install', 'application.uninstall', 'shell.execute'],
    system: ['system.info', 'system.cpu', 'system.memory', 'system.disk', 'system.battery', 'system.process.kill', 'shell.execute'],
    network: ['network.wifi.scan', 'network.wifi.connect', 'network.bluetooth.list', 'network.bluetooth.connect', 'network.ports', 'shell.execute'],
    developer: ['developer.scaffold', 'shell.execute'],
    git: ['git.status', 'git.commit', 'git.branch', 'shell.execute'],
    docker: ['docker.ps', 'docker.run', 'shell.execute'],
    filesystem: ['filesystem.search', 'filesystem.list', 'filesystem.read', 'filesystem.navigate', 'shell.execute'],
    workflow: ['workflow.save', 'workflow.run', 'shell.execute'],
    shell: ['shell.execute']
  };

  constructor(
    private intentModel: IntentModel,
    private entityExtractor: EntityExtractor
  ) {}

  public static getInstance(intentModel?: IntentModel, entityExtractor?: EntityExtractor): IntentRouter {
    if (!IntentRouter.instance || intentModel || entityExtractor) {
      IntentRouter.instance = new IntentRouter(
        intentModel || new LocalIntentClassifier(),
        entityExtractor || new EntityExtractor()
      );
    }
    return IntentRouter.instance;
  }

  public static resetInstance(): void {
    IntentRouter.instance = null;
  }

  public async route(prompt: string, context?: IntentContext): Promise<IntentRouteResult> {
    try {
      const intent = await this.intentModel.classify(prompt, context);
      const entities = this.entityExtractor.extract(prompt);
      const recommendedTools = IntentRouter.DOMAIN_TOOL_MAP[intent.domain] || ['shell.execute'];

      return {
        intent,
        entities,
        recommendedTools
      };
    } catch (e) {
      console.warn('[IntentRouter] Primary classification failed, using fallback:', e);
      return {
        intent: {
          domain: 'shell',
          action: 'execute',
          confidence: 0.1,
          executionTier: 'intent_cpu',
          latencyMs: 1
        },
        entities: this.entityExtractor.extract(prompt),
        recommendedTools: ['shell.execute']
      };
    }
  }
}
