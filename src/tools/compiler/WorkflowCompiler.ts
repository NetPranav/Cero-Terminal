/**
 * WorkflowCompiler.ts
 * 
 * Compiles a tool's workflow.json into an executable Workflow object.
 * 
 * Responsibilities:
 * - Load the workflow definition from a matched tool
 * - Select the Windows steps when the tool has platform-specific ones
 * - Inject runtime parameters (entities) into {{placeholder}} slots
 * - Validate parameter schema against tool.json
 * - Build a fully typed Workflow compatible with WorkflowEngine
 * 
 * The AI NEVER builds workflows. Only the WorkflowCompiler does.
 */

import { v4 as uuidv4 } from 'uuid';
import { LoadedTool, Platform } from '../schemas/ToolDefinitionSchema';
import { Workflow, WorkflowStep } from '../../domain/workflow/types';

export interface CompilationContext {
  platform: Platform;
  parameters: Record<string, any>;
  cwd?: string;
}

export interface CompilationResult {
  success: boolean;
  workflow?: Workflow;
  error?: string;
}

export class WorkflowCompiler {
  /**
   * Compile a LoadedTool's workflow.json into a Workflow object.
   */
  public compile(tool: LoadedTool, context: CompilationContext): CompilationResult {
    try {
      // 1. Validate required parameters
      const paramError = this.validateParameters(tool, context.parameters, context);
      if (paramError) {
        return { success: false, error: paramError };
      }

      // 2. Select platform-specific steps or fall back to default
      const platformWorkflow = tool.workflow.platforms?.[context.platform];
      const rawSteps = platformWorkflow?.steps || tool.workflow.steps;

      if (!rawSteps || rawSteps.length === 0) {
        return { success: false, error: `No workflow steps defined for platform ${context.platform}` };
      }

      // 3. Deep clone and inject parameters
      const compiledSteps: WorkflowStep[] = rawSteps.map(step => {
        let compiledParams: Record<string, any> | undefined = undefined;
        if (step.parameters) {
          const injected = this.injectParameters(step.parameters, context.parameters);
          compiledParams = this.cleanUnreplacedPlaceholders(injected);
          // Preserve any additional extracted entities (such as url, file, args, ssid, device) so native capabilities receive all target context
          if (typeof compiledParams === 'object' && compiledParams !== null && context.parameters) {
            for (const [k, v] of Object.entries(context.parameters)) {
              if (v !== undefined && v !== null && v !== '' && compiledParams[k] === undefined) {
                compiledParams[k] = v;
              }
            }
          }
        }

        const compiled: WorkflowStep = {
          id: step.id,
          type: step.type as WorkflowStep['type'],
          name: step.name,
          dependencies: step.dependencies || [],
          capabilityId: step.capabilityId,
          parameters: compiledParams,
          condition: step.condition,
          trueBranch: step.trueBranch,
          falseBranch: step.falseBranch,
          assignments: step.assignments,
          delayMs: step.delayMs,
          timeoutMs: step.timeoutMs,
          retryPolicy: step.retryPolicy,
        };
        return compiled;
      });

      // 4. Build the Workflow object
      const workflow: Workflow = {
        id: uuidv4(),
        name: tool.definition.displayName,
        description: tool.definition.description,
        version: tool.definition.version,
        createdTime: new Date().toISOString(),
        metadata: { cwd: context.cwd },
        variables: { ...context.parameters },
        steps: compiledSteps,
      };

      return { success: true, workflow };

    } catch (e: any) {
      return { success: false, error: `Compilation error: ${e.message}` };
    }
  }

  /**
   * Validate that all required parameters are provided.
   */
  private validateParameters(tool: LoadedTool, params: Record<string, any>, context?: CompilationContext): string | null {
    for (const param of tool.definition.parameters) {
      if (param.required && (params[param.name] === undefined || params[param.name] === null || params[param.name] === '')) {
        // Check if there's a default value
        if (param.default !== undefined) {
          params[param.name] = param.default;
        } else if (['dir', 'path', 'directory', 'workingDir', 'cwd', 'targetDir', 'targetPath', 'folder'].includes(param.name)) {
          params[param.name] = (context?.cwd && context.cwd !== 'unknown') ? context.cwd : '~';
        } else if (['pattern', 'query', 'name', 'keyword', 'filename'].includes(param.name)) {
          params[param.name] = '*';
        } else {
          return `Missing required parameter: ${param.name} (${param.description})`;
        }
      }
    }
    return null;
  }

  /**
   * Recursively inject {{paramName}} placeholders with actual values.
   */
  private injectParameters(obj: any, params: Record<string, any>): any {
    if (typeof obj === 'string') {
      // Replace {{paramName}} patterns
      return obj.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return params[key] !== undefined ? String(params[key]) : `{{${key}}}`;
      });
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.injectParameters(item, params));
    }

    if (typeof obj === 'object' && obj !== null) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.injectParameters(value, params);
      }
      return result;
    }

    return obj;
  }

  /**
   * Remove unreplaced {{placeholders}} for optional parameters from compiled parameter objects.
   */
  private cleanUnreplacedPlaceholders(obj: any): any {
    if (typeof obj === 'string') {
      if (/^\{\{\w+\}\}$/.test(obj)) return undefined;
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanUnreplacedPlaceholders(item)).filter(v => v !== undefined);
    }
    if (typeof obj === 'object' && obj !== null) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleaned = this.cleanUnreplacedPlaceholders(value);
        if (cleaned !== undefined) {
          result[key] = cleaned;
        }
      }
      return result;
    }
    return obj;
  }
}
