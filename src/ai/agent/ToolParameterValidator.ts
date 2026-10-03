/**
 * Cero — Zero-Hallucination Tool Parameter Validator
 *
 * Validates, repairs, and type-coerces LLM-generated parameter JSON before
 * calling execution drivers. Prevents small-model parameter hallucinations,
 * stringified types, and alias mismatches.
 */

import { ToolSpec } from './SystemPrompt';

export interface ParameterValidationResult {
  valid: boolean;
  coercedParams: Record<string, any>;
  errors?: string[];
  repairedAliases?: string[];
}

export class ToolParameterValidator {
  /** Known common parameter aliases across tool domains */
  private static readonly PARAM_ALIASES: Record<string, string[]> = {
    app: ['appname', 'application', 'applicationname', 'targetapp'],
    dir: ['directory', 'folder', 'dirpath', 'directorypath'],
    path: ['filepath', 'targetpath', 'file', 'targetfile'],
    command: ['cmd', 'commandline', 'exec', 'script'],
    port: ['portnumber', 'targetport'],
    host: ['hostname', 'targethost', 'address'],
    service: ['servicename', 'daemon', 'unit'],
    device: ['devicename', 'peripheral', 'targetdevice', 'name']
  };

  /**
   * Validate and automatically heal parameters against a tool schema.
   */
  public static validateAndCoerce(
    tool: ToolSpec | undefined,
    rawParams: Record<string, any> = {}
  ): ParameterValidationResult {
    const coerced: Record<string, any> = { ...rawParams };
    const repairedAliases: string[] = [];
    const errors: string[] = [];

    if (!tool) {
      return { valid: true, coercedParams: coerced };
    }

    const schemaParams = tool.parameters || [];
    const schemaMap = new Map(schemaParams.map(p => [p.name.toLowerCase(), p]));

    // Helper to find key in coerced object case-insensitively
    const findCoercedKey = (target: string) => {
      const lower = target.toLowerCase();
      return Object.keys(coerced).find(k => k.toLowerCase() === lower);
    };

    // 1. Alias Repair: map model-invented aliases to official schema parameter names
    for (const [canonical, aliases] of Object.entries(this.PARAM_ALIASES)) {
      if (schemaMap.has(canonical) && coerced[canonical] === undefined) {
        for (const alias of aliases) {
          const existingKey = findCoercedKey(alias);
          if (existingKey !== undefined) {
            coerced[canonical] = coerced[existingKey];
            delete coerced[existingKey];
            repairedAliases.push(`${existingKey} -> ${canonical}`);
            break;
          }
        }
      }
    }

    // 2. Type Coercion: heal stringified numbers, booleans, and arrays
    for (const paramSpec of schemaParams) {
      const val = coerced[paramSpec.name];
      if (val === undefined || val === null) continue;

      const targetType = (paramSpec.type || 'string').toLowerCase();

      if (targetType === 'number' || targetType === 'integer') {
        if (typeof val === 'string') {
          const parsed = Number(val);
          if (!isNaN(parsed)) {
            coerced[paramSpec.name] = parsed;
          } else {
            errors.push(`Parameter "${paramSpec.name}" expects a number, received: "${val}"`);
          }
        }
      } else if (targetType === 'boolean') {
        if (typeof val === 'string') {
          if (val.toLowerCase() === 'true') coerced[paramSpec.name] = true;
          else if (val.toLowerCase() === 'false') coerced[paramSpec.name] = false;
          else errors.push(`Parameter "${paramSpec.name}" expects a boolean, received: "${val}"`);
        }
      } else if (targetType === 'string') {
        if (typeof val !== 'string') {
          coerced[paramSpec.name] = String(val);
        }
        // Normalize tilde paths if parameter is a path or dir
        if (paramSpec.name === 'path' || paramSpec.name === 'dir') {
          coerced[paramSpec.name] = coerced[paramSpec.name].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    }

    // 3. Required Parameter Check
    for (const paramSpec of schemaParams) {
      if (paramSpec.required) {
        const val = coerced[paramSpec.name];
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
          errors.push(`Missing required parameter: "${paramSpec.name}" for tool "${tool.id}"`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      coercedParams: coerced,
      errors: errors.length > 0 ? errors : undefined,
      repairedAliases: repairedAliases.length > 0 ? repairedAliases : undefined
    };
  }
}
