import { ToolMetadata } from '../../domain/tool/types';

export class PromptBuilder {
  public static build(goal: string, tools: ToolMetadata[], context: string): string {
    const toolsStr = tools.map(t => 
      `- ${t.id} (${t.category}): ${t.description}\n  Parameters schema: ${JSON.stringify(t.parametersSchema)}`
    ).join('\n');

    return `
You are the AI Planning Engine for Cero.
Your goal is to translate a user request into a deterministic JSON workflow.
You MUST ONLY use the capabilities provided in the AVAILABLE TOOLS section. DO NOT invent shell commands.

CRITICAL INSTRUCTIONS:
1. You MUST generate a custom workflow for the user's specific goal. 
2. DO NOT copy the template values like "Step Name" or "...". Replace them with real values.
3. If the user wants to list bluetooth devices on mac, use \`system_profiler SPBluetoothDataType\` or \`blueutil\`.
4. Output ONLY valid JSON, without any markdown formatting, backticks, or extra text.

CONTEXT:
${context}

AVAILABLE TOOLS:
${toolsStr.length > 0 ? toolsStr : 'No specific tools found. Rely on shell.core.'}

USER GOAL:
${goal}

EXPECTED OUTPUT FORMAT (JSON ONLY):
{
  "workflow": {
    "name": "<Short, descriptive name for the workflow>",
    "description": "<Brief description of what it does>",
    "steps": [
      {
        "id": "step1",
        "name": "<A specific name explaining this exact step>",
        "type": "ExecuteCapability",
        "capabilityId": "<id of the tool to use, e.g. shell.core>",
        "parameters": { 
           // Fill out the parameters schema required by the tool. Example for shell.core:
           "command": "<your explicit shell command here>" 
        },
        "dependencies": []
      }
    ]
  },
  "summary": "<User friendly explanation of the plan>",
  "confidence": 95,
  "estimatedTime": "1s",
  "permissions": ["ShellExecution"],
  "risk": { "level": "SAFE", "score": 10, "explanation": "<Why is it safe?>" }
}
`;
  }
}
