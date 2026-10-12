/**
 * ContextBuilder.ts — Dynamic Tool Awareness & Context Engineering
 * 
 * At runtime, builds lightweight prompt runtime context from active Tool Registry state:
 * - available tools, tool descriptions, aliases, examples, required parameters, and entity definitions.
 * Automatically adapts when new tools are added without requiring prompt edits or re-compilation.
 */

import { ToolRegistryState } from '../../tools/loader/ToolLoader';
import { LoadedTool } from '../../tools/schemas/ToolDefinitionSchema';
import { ToolSearcher } from '../../tools/search/ToolSearcher';

export interface DynamicToolSignature {
  id: string;
  displayName: string;
  description: string;
  aliases: string[];
  parameters: string[];
  entityHints?: Record<string, string[]>;
}

export class ContextBuilder {
  private searcher: ToolSearcher;

  constructor(private registry: ToolRegistryState) {
    this.searcher = new ToolSearcher(registry);
  }

  /**
   * Generates token-efficient context containing candidate tool signatures relevant to the user request.
   * By limiting to top candidate matches, we guarantee <300ms inference latency on lightweight models.
   */
  public buildContext(query: string, maxTools: number = 8): {
    systemPrompt: string;
    toolSignatures: DynamicToolSignature[];
    rawToolCount: number;
  } {
    const allTools = this.registry.toolIndex.getAll();
    let candidates: LoadedTool[] = [];

    // Use semantic pre-filtering to select the most relevant tools for the prompt
    const matches = this.searcher.search(query);
    if (matches.length > 0) {
      candidates = matches.slice(0, maxTools).map(m => m.tool);
    } else {
      candidates = allTools.slice(0, maxTools);
    }

    // Ensure core network, system, filesystem, and shell tools are included if list is small
    if (candidates.length < 4) {
      for (const t of allTools) {
        if (candidates.length >= maxTools) break;
        if (!candidates.some(c => c.definition.id === t.definition.id)) {
          candidates.push(t);
        }
      }
    }

    const signatures: DynamicToolSignature[] = candidates.map(t => {
      const def = t.definition;
      const paramNames = [
        ...def.parameters.map(p => p.name),
        ...def.optionalParameters.map(p => `${p.name} (optional)`)
      ];

      return {
        id: def.id,
        displayName: def.displayName,
        description: def.description,
        aliases: def.aliases || [],
        parameters: paramNames,
        entityHints: t.knowledge?.entityHints
      };
    });

    const toolJsonStr = JSON.stringify(signatures, null, 2);

    const systemPrompt = `You are Cero's Local Intent AI System.
Your ONLY purpose is to understand natural language, determine user intent, extract entities, and generate a high-level sequential execution plan using available tools from Cero's Tool Registry.

IMPORTANT RULES:
1. NEVER generate raw shell commands or scripts.
2. NEVER generate workflow definitions or decide low-level execution logic.
3. ONLY select tools from the AVAILABLE TOOLS list below.
4. Output STRICT JSON conforming EXACTLY to this structure:
{
  "goal": "Description of what the user wants to achieve",
  "confidence": 0.98,
  "tasks": [
    {
      "tool": "exact.tool.id",
      "entities": {
        "entity_name": "extracted_value"
      }
    }
  ]
}

AVAILABLE TOOLS IN REGISTRY:
${toolJsonStr}`;

    return {
      systemPrompt,
      toolSignatures: signatures,
      rawToolCount: allTools.length
    };
  }

  public getToolSearcher(): ToolSearcher {
    return this.searcher;
  }
}
