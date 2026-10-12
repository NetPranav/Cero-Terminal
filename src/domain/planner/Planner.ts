/**
 * Planner.ts — AI Operating Knowledge Base Orchestrator (Phase X Integrated)
 * 
 * The Planner orchestrates Cero's Local Intent AI System:
 * 1. IntentEngine classifies user intent, extracts entities, and creates structured execution plans
 * 2. For single or multi-step plans, WorkflowCompiler compiles corresponding tool workflows cleanly
 * 3. Returns compiled workflow with rich model telemetry and confidence score
 * 
 * The AI NEVER generates workflows or shell commands.
 * The AI ONLY identifies WHAT the user wants.
 * The Tool Registry decides HOW it is done.
 */

import { PlanningRequest, PlanningResponse } from './types';
import { isWindowsName } from '../../shared/platform';
import { ToolSearcher } from '../../tools/search/ToolSearcher';
import { WorkflowCompiler, CompilationContext } from '../../tools/compiler/WorkflowCompiler';
import { ToolRegistryState } from '../../tools/loader/ToolLoader';
import { Platform, LoadedTool } from '../../tools/schemas/ToolDefinitionSchema';
import { IntentEngine } from '../../ai/intent/IntentEngine';
import { ModelManager } from '../../ai/management/ModelManager';

export class Planner {
  private toolSearcher: ToolSearcher;
  private workflowCompiler: WorkflowCompiler;
  private intentEngine: IntentEngine;
  private modelManager: ModelManager;

  constructor(
    private registry: ToolRegistryState,
    customModelManager?: ModelManager
  ) {
    this.toolSearcher = new ToolSearcher(registry);
    this.workflowCompiler = new WorkflowCompiler();
    this.modelManager = customModelManager || new ModelManager();
    this.intentEngine = new IntentEngine(registry, this.modelManager);
  }

  public async plan(request: PlanningRequest): Promise<PlanningResponse> {
    try {
      this.emitEvent('PlanningStarted', { goal: request.goal });

      const os = (request.context?.os || 'macos') as string;
      const platform = this.osToPlatform(os);

      // 1. Invoke Phase X Intent Engine to reason over natural language and generate structured execution plan
      const intentOutput = await this.intentEngine.parseIntent(request.goal);
      const structuredPlan = intentOutput.plan;

      this.emitEvent('IntentParsed', {
        goal: structuredPlan.goal,
        confidence: structuredPlan.confidence,
        tasks: structuredPlan.tasks,
        model: intentOutput.modelTelemetry
      });

      if (structuredPlan.tasks.length === 0 || !intentOutput.validation.valid) {
        this.emitEvent('NoToolFound', { goal: request.goal });
        return {
          success: false,
          confidence: Math.round(structuredPlan.confidence * 100),
          intentResult: {
            modelId: intentOutput.modelTelemetry.modelId,
            providerId: intentOutput.modelTelemetry.providerId,
            confidence: structuredPlan.confidence,
            goal: structuredPlan.goal,
            tasks: structuredPlan.tasks
          },
          error: {
            code: 'NO_MATCHING_TOOL',
            message: `No validated tool found matching: "${request.goal}". Available domains: ${this.registry.domainIndex.getAllDomains().join(', ')}`
          }
        };
      }

      // 2. Compile sequential workflow steps for each planned task in order
      const compiledSteps: any[] = [];
      let combinedRisk = 'SAFE';
      let maxRiskScore = 0;
      const allPermissions: Set<string> = new Set();
      const matchedTools: LoadedTool[] = [];

      for (const task of structuredPlan.tasks) {
        let tool = this.registry.toolIndex.get(task.tool);
        if (!tool) {
          // If task tool ID wasn't directly indexed, find via ToolSearcher
          const searchRes = this.toolSearcher.search(task.tool);
          if (searchRes.length > 0 && searchRes[0].score >= 200) {
            tool = searchRes[0].tool;
          }
        }

        if (!tool) {
          return {
            success: false,
            confidence: Math.round(structuredPlan.confidence * 100),
            error: {
              code: 'TOOL_MISSING',
              message: `Task execution plan referenced unindexed tool: "${task.tool}"`
            }
          };
        }

        matchedTools.push(tool);

        // Merge task extracted entities with parameters
        const parameters = this.extractParameters(request.goal, tool, task.entities || {}, request.context?.cwd);

        const compilationContext: CompilationContext = {
          platform,
          parameters,
          cwd: request.context?.cwd,
        };

        const compilationResult = this.workflowCompiler.compile(tool, compilationContext);

        if (!compilationResult.success || !compilationResult.workflow) {
          this.emitEvent('CompilationFailed', { tool: tool.definition.id, error: compilationResult.error });
          return {
            success: false,
            confidence: Math.round(structuredPlan.confidence * 100),
            error: {
              code: 'COMPILATION_FAILED',
              message: compilationResult.error || `Failed to compile workflow for tool ${tool.definition.id}`
            }
          };
        }

        for (const step of compilationResult.workflow.steps) {
          const uniqueStepId = structuredPlan.tasks.length > 1 
            ? `${step.id}_${compiledSteps.length + 1}` 
            : step.id;
          const prevStep = compiledSteps.length > 0 ? compiledSteps[compiledSteps.length - 1] : undefined;
          const dependencies = structuredPlan.tasks.length > 1 && prevStep
            ? [prevStep.id]
            : (step.dependencies || []);

          compiledSteps.push({
            ...step,
            id: uniqueStepId,
            dependencies
          });
        }

        // Track aggregate risk & permissions
        const toolRiskScore = this.riskToScore(tool.definition.securityRisk);
        if (toolRiskScore > maxRiskScore) {
          maxRiskScore = toolRiskScore;
          combinedRisk = tool.definition.securityRisk === 'SAFE' ? 'SAFE' :
                         tool.definition.securityRisk === 'LOW' ? 'SAFE' :
                         tool.definition.securityRisk === 'MEDIUM' ? 'SENSITIVE' :
                         tool.definition.securityRisk === 'HIGH' ? 'ADMIN' : 'CRITICAL';
        }
        (tool.definition.requiredPermissions || []).forEach(p => allPermissions.add(p));
      }

      // 3. Assemble unified execution workflow
      const primaryTool = matchedTools[0];
      const workflowId = matchedTools.length === 1 
        ? primaryTool.definition.id 
        : `sequential.${matchedTools.map(t => t.definition.id).join('_')}`;

      const workflowName = matchedTools.length === 1
        ? primaryTool.definition.displayName
        : structuredPlan.goal;

      const summaryText = matchedTools.length === 1
        ? `Using "${primaryTool.definition.displayName}" — ${primaryTool.definition.description}`
        : `Sequential AI Intent Plan (${matchedTools.length} tools): ${matchedTools.map(t => t.definition.displayName).join(' → ')}`;

      const confidencePct = Math.min(Math.round(structuredPlan.confidence * 100), 100);

      const assembledWorkflow = {
        id: workflowId,
        name: workflowName,
        description: summaryText,
        version: '1.0.0',
        createdTime: new Date().toISOString(),
        variables: {},
        steps: compiledSteps
      };

      this.emitEvent('PlanningCompleted', {
        workflowId,
        confidence: confidencePct,
        stepsCount: compiledSteps.length,
        tasksCount: structuredPlan.tasks.length
      });

      return {
        success: true,
        workflow: assembledWorkflow,
        summary: summaryText,
        confidence: confidencePct,
        estimatedTime: primaryTool.definition.estimatedExecutionTime,
        permissions: Array.from(allPermissions),
        risk: {
          level: combinedRisk as any,
          score: maxRiskScore,
          explanation: `Aggregate security risk across ${matchedTools.length} step(s): ${combinedRisk}`
        },
        intentResult: {
          modelId: intentOutput.modelTelemetry.modelId,
          providerId: intentOutput.modelTelemetry.providerId,
          confidence: structuredPlan.confidence,
          goal: structuredPlan.goal,
          tasks: structuredPlan.tasks
        }
      };

    } catch (e: any) {
      this.emitEvent('PlanningFailed', { error: e.message });
      return {
        success: false,
        confidence: 0,
        error: { code: 'INTERNAL_ERROR', message: e.message }
      };
    }
  }

  /**
   * Extract parameters merging natural language extraction with entity intelligence.
   */
  /**
   * Extract parameters merging natural language extraction with entity intelligence.
   */
  private extractParameters(goal: string, tool: LoadedTool, entities: Record<string, any> = {}, cwd: string = '~'): Record<string, any> {
    const params: Record<string, any> = { ...entities };

    // Apply defaults for all parameters not covered by entities
    for (const param of tool.definition.parameters) {
      if (params[param.name] === undefined && param.default !== undefined) {
        params[param.name] = param.default;
      }
    }

    // Synchronize parameter names across different tool schemas
    const existingPath = params['path'] || params['directory'] || params['dir'] || params['workingDir'] || params['targetDir'];
    if (existingPath) {
      params['path'] = existingPath;
      params['directory'] = existingPath;
      params['dir'] = existingPath;
    }

    // Intelligent folder and path extraction fallback
    if (!params['path'] && !params['directory'] && !params['dir'] && (tool.definition.parameters.some(p => ['path', 'directory', 'dir', 'workingDir', 'targetDir'].includes(p.name)))) {
      const lower = goal.toLowerCase();
      let detectedPath = '';
      if (lower.includes('download') || lower.includes('donwload') || lower.includes('downlod') || lower.includes('dwnload') || lower.includes('downlaod')) {
        detectedPath = '~/Downloads';
      } else if (lower.includes('desktop')) {
        detectedPath = '~/Desktop';
      } else if (lower.includes('document')) {
        detectedPath = '~/Documents';
      } else if (lower.includes('picture') || lower.includes('photo') || lower.includes('image')) {
        detectedPath = '~/Pictures';
      } else if (lower.includes('music') || lower.includes('song') || lower.includes('audio')) {
        detectedPath = '~/Music';
      } else if (lower.includes('movie') || lower.includes('video')) {
        detectedPath = '~/Movies';
      } else if (lower.includes('home') || lower.includes('user folder')) {
        detectedPath = '~';
      } else if (lower.includes('here') || lower.includes('current folder') || lower.includes('current dir') || lower.includes('this folder') || lower.includes('this dir')) {
        detectedPath = cwd || '~';
      } else {
        const pathMatch = goal.match(/(?:in|at|from|to|of)\s+(~?\/[^\s]+|~\w*)/i);
        if (pathMatch) {
          detectedPath = pathMatch[1];
        } else {
          // If no specific folder mentioned, fall back to current terminal working directory
          detectedPath = cwd || '~';
        }
      }
      if (detectedPath) {
        params['path'] = detectedPath;
        params['directory'] = detectedPath;
        params['dir'] = detectedPath;
      }
    }

    // Extract search pattern or keyword (e.g., "png files", "starting with whatsapp", "named id_rsa")
    if (!params['pattern'] && !params['query'] && !params['name'] && tool.definition.parameters.some(p => ['pattern', 'query', 'name'].includes(p.name))) {
      let extVal = '';
      const startMatch = goal.match(/(?:starting with|starts with|begins with|beginning with)\s+([^\s,.]+(?:\.\w+)?)/i);
      const endMatch = goal.match(/(?:ending with|ends with|ending in|ends in)\s+\.?([^\s,.]+(?:\.\w+)?)/i);
      const nameMatch = goal.match(/(?:named|called|containing|with name|matching|keyword|labeled)\s+([^\s,.]+(?:\.\w+)?)/i);
      const extMatch = goal.match(/(?:all\s+|any\s+|the\s+)?(\w+|\*?\.\w+)\s+(?:files?|folders?|directories|dirs?)/i);

      if (startMatch && startMatch[1]) {
        extVal = `${startMatch[1]}*`;
      } else if (endMatch && endMatch[1]) {
        extVal = `*${endMatch[1]}`;
      } else if (nameMatch && nameMatch[1]) {
        extVal = nameMatch[1];
      } else if (extMatch && extMatch[1] && !['the', 'all', 'any', 'some', 'these', 'those', 'few', 'other', 'many', 'how', 'what', 'which', 'there', 'here', 'total', 'count', 'more', 'less'].includes(extMatch[1].toLowerCase())) {
        extVal = extMatch[1].startsWith('.') || extMatch[1].startsWith('*') ? extMatch[1] : `*.${extMatch[1]}`;
      }

      if (!extVal) {
        const catchAll = goal.match(/(?:find|search|locate|show|tell me all the|tell me all|how many|count)\s+([^\s,.]+(?:\.\w+)?)/i);
        if (catchAll && catchAll[1] && !['the', 'all', 'any', 'some', 'files', 'folders', 'here', 'there', 'in', 'many', 'how', 'total', 'count', 'are'].includes(catchAll[1].toLowerCase())) {
          extVal = catchAll[1].startsWith('.') || catchAll[1].startsWith('*') ? catchAll[1] : (catchAll[0].toLowerCase().includes('many') || catchAll[0].toLowerCase().includes('count') ? `*.${catchAll[1]}` : catchAll[1]);
        }
      }

      if (extVal) {
        params['pattern'] = extVal;
        params['query'] = extVal;
        params['name'] = extVal;
      }
    }

    return params;
  }

  private osToPlatform(os: string): Platform {
    const normalized = os.toLowerCase();
    if (normalized.includes('mac') || normalized.includes('darwin')) return 'macos';
    if (isWindowsName(normalized)) return 'windows';
    return 'linux';
  }

  private riskToScore(risk: string): number {
    switch (risk) {
      case 'SAFE': return 0;
      case 'LOW': return 10;
      case 'MEDIUM': return 40;
      case 'HIGH': return 70;
      case 'CRITICAL': return 95;
      default: return 50;
    }
  }

  private emitEvent(eventName: string, payload: any) {
    console.log(`[Planner] ${eventName}:`, JSON.stringify(payload));
  }

  public getIntentEngine(): IntentEngine {
    return this.intentEngine;
  }
}
