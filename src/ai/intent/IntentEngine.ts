/**
 * IntentEngine.ts — Core Cero Local Intent AI Platform
 * 
 * Coordinates the full natural language -> structured execution plan conversion pipeline:
 * 1. Receive natural language
 * 2. Build runtime context
 * 3. Load available tools dynamically
 * 4. Understand user intent
 * 5. Extract entities
 * 6. Generate sequential execution plans
 * 7. Estimate confidence
 * 8. Return structured JSON
 * 
 * Strictly adheres to architectural laws: NEVER generates shell commands or workflows.
 */

import { ToolRegistryState } from '../../tools/loader/ToolLoader';
import { ModelManager } from '../management/ModelManager';
import { ContextBuilder } from './ContextBuilder';
import { IntentClassifier, ClassifiedIntent } from './IntentClassifier';
import { EntityExtractor, ExtractedEntities } from './EntityExtractor';
import { Planner, StructuredPlan } from './Planner';
import { PlanValidator, ValidationResult } from './PlanValidator';
import { ConfidenceEstimator } from './ConfidenceEstimator';
import { TelemetryRecorder } from '../telemetry/TelemetryRecorder';

export interface IntentEngineResult {
  plan: StructuredPlan;
  classifiedIntent: ClassifiedIntent;
  entities: ExtractedEntities;
  validation: ValidationResult;
  modelTelemetry: {
    modelId: string;
    providerId: string;
    inferenceTimeMs: number;
  };
}

export class IntentEngine {
  private contextBuilder: ContextBuilder;
  private classifier: IntentClassifier;
  private extractor: EntityExtractor;
  private planner: Planner;
  private validator: PlanValidator;
  private confidenceEstimator: ConfidenceEstimator;
  public readonly telemetry: TelemetryRecorder;

  constructor(
    private registry: ToolRegistryState,
    private modelManager: ModelManager,
    customTelemetry?: TelemetryRecorder
  ) {
    this.contextBuilder = new ContextBuilder(registry);
    this.classifier = new IntentClassifier(modelManager, this.contextBuilder);
    this.extractor = new EntityExtractor();
    this.planner = new Planner(modelManager, this.contextBuilder);
    this.validator = new PlanValidator(registry);
    this.confidenceEstimator = new ConfidenceEstimator();
    this.telemetry = customTelemetry || new TelemetryRecorder();
  }

  /**
   * Primary entry point: converts unrestricted natural language into structured JSON execution plans.
   */
  public async parseIntent(rawQuery: string): Promise<IntentEngineResult> {
    const startTime = performance.now();
    const query = rawQuery.replace(/^[\s>\$#\-:]+/, '').trim();

    // 1. Build context and inspect tool registry dynamically
    this.contextBuilder.buildContext(query);

    // 2. Classify high-level intent & domain
    const classifiedIntent = await this.classifier.classify(query);

    // 3. Extract entities across all 15+ supported entity schemas
    const entities = this.extractor.extract(query);

    // 4. Generate multi-step execution plan composed solely of Tool IDs + entities
    const rawPlan = await this.planner.generatePlan(query);

    // 5. Validate against active tool signatures & auto-correct fuzzy shorthand
    const validation = this.validator.validate(rawPlan);

    // 6. Estimate overall plan confidence (0.00 - 1.00)
    const confidence = this.confidenceEstimator.estimate(validation.correctedPlan, validation, query);
    validation.correctedPlan.confidence = confidence;

    const inferenceTimeMs = performance.now() - startTime;
    const activeModel = this.modelManager.getActiveModel();

    // 7. Self-improvement telemetry capture
    if (!validation.valid || confidence < 0.30) {
      this.telemetry.record('FAILED_MATCH', query, {
        confidence,
        errorReason: validation.errors.join('; ') || 'Very low confidence match'
      });
    } else if (validation.corrections.length > 0) {
      for (const corr of validation.corrections) {
        this.telemetry.record('TOOL_CORRECTION', query, {
          originalTool: corr.originalTool,
          correctedTool: corr.correctedTool,
          confidence
        });
      }
    }

    if (confidence >= 0.30 && confidence < 0.65) {
      this.telemetry.record('AMBIGUOUS_REQUEST', query, { confidence });
    } else if (validation.valid && confidence >= 0.65) {
      this.telemetry.record('SUCCESSFUL_MATCH', query, {
        confidence,
        metadata: { plan: validation.correctedPlan }
      });
    }

    return {
      plan: validation.correctedPlan,
      classifiedIntent,
      entities,
      validation,
      modelTelemetry: {
        modelId: activeModel?.modelId || 'qwen2.5:1.5b',
        providerId: activeModel?.providerId || 'ollama',
        inferenceTimeMs
      }
    };
  }

  public getModelManager(): ModelManager {
    return this.modelManager;
  }
}
