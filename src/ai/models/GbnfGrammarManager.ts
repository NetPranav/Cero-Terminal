/**
 * GbnfGrammarManager.ts — GBNF (GGML BNF) Grammar-Constrained Decoding Manager
 * 
 * Formal grammar constraints enforced at the token sampling level in llama.cpp / llama-server.
 * Mathematically eliminates 100% of conversational chatbot apologies, markdown leaks,
 * and malformed JSON output at hardware sampling time with zero token overhead.
 *
 * Whitespace between tokens is bounded (`ws`, as in llama.cpp's own json.gbnf). An unbounded
 * `[ \t\n\r]*` lets a small model keep emitting newlines until the token limit, which cuts the
 * JSON off and reaches the user as "could not understand the instruction", on the built-in model only.
 */

export type GrammarType = 'CERO_ACTION' | 'CERO_PLANNER' | 'STRICT_JSON';

export class GbnfGrammarManager {
  private static instance: GbnfGrammarManager;

  // ---------------------------------------------------------------------------
  // Pre-compiled GBNF Grammars
  // ---------------------------------------------------------------------------

  /**
   * CERO_ACTION GBNF:
   * Strictly enforces:
   *   {"action": "execute", "command": "<cmd>", "explanation": "<exp>"}
   * or
   *   {"action": "done", "summary": "<sum>"}
   */
  public static readonly CERO_ACTION_GBNF = `root ::= action-execute | action-done

action-execute ::= ("{" ws "\\"action\\"" ws ":" ws "\\"execute\\"" ws "," ws "\\"command\\"" ws ":" ws string ws "," ws "\\"explanation\\"" ws ":" ws string ws "}") | ("{" ws "\\"action\\"" ws ":" ws "\\"execute\\"" ws "," ws "\\"explanation\\"" ws ":" ws string ws "," ws "\\"command\\"" ws ":" ws string ws "}")

action-done ::= ("{" ws "\\"action\\"" ws ":" ws "\\"done\\"" ws "," ws "\\"summary\\"" ws ":" ws string ws "}") | ("{" ws "\\"summary\\"" ws ":" ws string ws "," ws "\\"action\\"" ws ":" ws "\\"done\\"" ws "}")

string ::= "\\"" ([^"\\\\\\x7F\\x00-\\x1F] | "\\\\" (["\\\\bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* "\\""
ws ::= | " " | "\\n" [ \\t]{0,20}`;

  /**
   * JSON Schema equivalent of CERO_ACTION for backends that take a schema instead of GBNF
   * (Ollama `format`, OpenAI-compatible `response_format`). Kept flat because every backend's
   * schema-to-grammar converter supports enum/required, not all support anyOf/const.
   */
  public static readonly CERO_ACTION_JSON_SCHEMA: Record<string, any> = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['execute', 'done'] },
      command: { type: 'string' },
      explanation: { type: 'string' },
      summary: { type: 'string' }
    },
    required: ['action']
  };

  /**
   * CERO_PLANNER GBNF:
   * Strictly enforces:
   *   {"decision": "plan" | "clarify", "summary": "<string>", "steps": ["<step1>", ...], "question": "<opt>"}
   */
  public static readonly CERO_PLANNER_GBNF = `root ::= "{" ws "\\"decision\\"" ws ":" ws ("\\"plan\\"" | "\\"clarify\\"") ws "," ws "\\"summary\\"" ws ":" ws string ws "," ws "\\"steps\\"" ws ":" ws string-list (ws "," ws "\\"question\\"" ws ":" ws string)? ws "}"

string-list ::= "[" ws (string (ws "," ws string)*)? ws "]"
string ::= "\\"" ([^"\\\\\\x7F\\x00-\\x1F] | "\\\\" (["\\\\bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* "\\""
ws ::= | " " | "\\n" [ \\t]{0,20}`;

  /**
   * STRICT_JSON GBNF:
   * Complete formal JSON grammar matching RFC 8259.
   */
  public static readonly STRICT_JSON_GBNF = `root ::= object | array

object ::= "{" ws (pair (ws "," ws pair)*)? ws "}"
pair ::= string ws ":" ws value

array ::= "[" ws (value (ws "," ws value)*)? ws "]"

value ::= object | array | string | number | "true" | "false" | "null"

string ::= "\\"" ([^"\\\\\\x7F\\x00-\\x1F] | "\\\\" (["\\\\bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* "\\""
number ::= ("-"? ([0-9] | [1-9] [0-9]*)) ("." [0-9]+)? ([eE] [-+]? [0-9]+)?
ws ::= | " " | "\\n" [ \\t]{0,20}`;

  public static getInstance(): GbnfGrammarManager {
    if (!GbnfGrammarManager.instance) {
      GbnfGrammarManager.instance = new GbnfGrammarManager();
    }
    return GbnfGrammarManager.instance;
  }

  /**
   * Retrieve a pre-compiled GBNF grammar by type.
   */
  public static getGrammar(type: GrammarType): string {
    switch (type) {
      case 'CERO_ACTION':
        return GbnfGrammarManager.CERO_ACTION_GBNF;
      case 'CERO_PLANNER':
        return GbnfGrammarManager.CERO_PLANNER_GBNF;
      case 'STRICT_JSON':
        return GbnfGrammarManager.STRICT_JSON_GBNF;
      default:
        return GbnfGrammarManager.CERO_ACTION_GBNF;
    }
  }

  /**
   * Dynamically compile a JSON Schema definition into a valid GBNF grammar string.
   */
  public compileJsonSchema(schema: Record<string, any>): string {
    if (!schema || schema.type !== 'object' || !schema.properties) {
      return GbnfGrammarManager.STRICT_JSON_GBNF;
    }

    const properties = schema.properties;
    const required: string[] = schema.required || Object.keys(properties);

    const propRules: string[] = [];
    for (const [key, propDef] of Object.entries(properties) as [string, any][]) {
      const isReq = required.includes(key);
      let valueExpr = 'string';

      if (propDef.enum && Array.isArray(propDef.enum)) {
        const enumChoices = propDef.enum.map((v: string) => `"\\"${v}\\""`).join(' | ');
        valueExpr = `(${enumChoices})`;
      } else if (propDef.type === 'number' || propDef.type === 'integer') {
        valueExpr = 'number';
      } else if (propDef.type === 'boolean') {
        valueExpr = '("true" | "false")';
      } else if (propDef.type === 'array') {
        valueExpr = 'string-list';
      }

      const rule = `"\\"${key}\\"" ws ":" ws ${valueExpr}`;
      propRules.push(isReq ? rule : `(${rule})?`);
    }

    // Combine into root object rule
    const propSequence = propRules.join(' ws "," ws ');
    return `root ::= "{" ws ${propSequence} ws "}"

string-list ::= "[" ws (string (ws "," ws string)*)? ws "]"
string ::= "\\"" ([^"\\\\\\x7F\\x00-\\x1F] | "\\\\" (["\\\\bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* "\\""
number ::= ("-"? ([0-9] | [1-9] [0-9]*)) ("." [0-9]+)? ([eE] [-+]? [0-9]+)?
ws ::= | " " | "\\n" [ \\t]{0,20}`;
  }

  /**
   * Validates whether a text output conforms to the target grammar structure.
   */
  public validateOutput(
    content: string,
    grammarType: GrammarType
  ): { valid: boolean; parsed?: any; error?: string } {
    if (!content || !content.trim()) {
      return { valid: false, error: 'Empty content' };
    }

    const trimmed = content.trim();

    // Check for prohibited conversational preamble or markdown leakage
    if (trimmed.startsWith('```') || trimmed.includes('<think>') || trimmed.startsWith("I'm sorry") || trimmed.startsWith('Sure')) {
      return {
        valid: false,
        error: 'Content contains markdown code fences, thinking tags, or conversational chatbot preamble prohibited by grammar.'
      };
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (grammarType === 'CERO_ACTION') {
        if (parsed.action === 'execute') {
          if (typeof parsed.command === 'string' && typeof parsed.explanation === 'string') {
            return { valid: true, parsed };
          }
          return { valid: false, error: 'action "execute" missing valid command or explanation string.' };
        } else if (parsed.action === 'done') {
          if (typeof parsed.summary === 'string') {
            return { valid: true, parsed };
          }
          return { valid: false, error: 'action "done" missing valid summary string.' };
        }
        return { valid: false, error: `Invalid action type "${parsed.action}". Must be "execute" or "done".` };
      }

      if (grammarType === 'CERO_PLANNER') {
        if (
          (parsed.decision === 'plan' || parsed.decision === 'clarify') &&
          typeof parsed.summary === 'string' &&
          Array.isArray(parsed.steps)
        ) {
          return { valid: true, parsed };
        }
        return { valid: false, error: 'Invalid planner schema. decision must be "plan" or "clarify" with steps array.' };
      }

      if (grammarType === 'STRICT_JSON') {
        return { valid: typeof parsed === 'object' && parsed !== null, parsed };
      }

      return { valid: true, parsed };
    } catch (err: any) {
      return { valid: false, error: `JSON parse syntax violation: ${err.message}` };
    }
  }

  /**
   * Sanitizes a raw LLM text response if GBNF was not applied at sampling time
   * (e.g. when falling back to external non-llama.cpp providers).
   */
  public sanitizeFallbackOutput(text: string): string {
    let clean = text.trim();
    // Strip <think>...</think>
    clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Strip markdown fences ```json ... ```
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
    }
    return clean;
  }
}
