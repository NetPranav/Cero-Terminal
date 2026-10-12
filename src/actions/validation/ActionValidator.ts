/**
 * ActionValidator.ts — Pre-execution planning validation
 *
 * Validates inputs, required entities, platform compatibility, and constraints.
 * Does NOT validate runtime state — that belongs to the future State Engine.
 */

import { ActionNode, ActionDefinition, SupportedPlatform } from '../models/ActionTypes';
import { EntityType } from '../../ai/conversation/ConversationTypes';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export class ActionValidator {
  /**
   * Validates an ActionNode before it enters the ActionGraph.
   */
  public validate(node: ActionNode, currentPlatform: SupportedPlatform = 'windows'): ValidationResult {
    const errors: ValidationError[] = [];

    this.validatePlatform(node.action, currentPlatform, errors);
    this.validateRequiredInputs(node, errors);
    this.validateRequiredEntities(node, errors);
    this.validateConstraints(node.action, errors);

    return {
      valid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
    };
  }

  /**
   * Validates an ActionDefinition's structural integrity.
   */
  public validateDefinition(action: ActionDefinition): ValidationResult {
    const errors: ValidationError[] = [];

    if (!action.id || !action.id.match(/^[a-z]+\.[a-z_]+$/)) {
      errors.push({ field: 'id', message: `Invalid action ID format: '${action.id}'. Must be domain.action`, severity: 'error' });
    }

    if (action.supportedPlatforms.length === 0) {
      errors.push({ field: 'supportedPlatforms', message: 'Must support at least one platform', severity: 'error' });
    }

    if (!action.displayName) {
      errors.push({ field: 'displayName', message: 'Display name is required', severity: 'error' });
    }

    if (action.timeoutMs <= 0) {
      errors.push({ field: 'timeoutMs', message: 'Timeout must be positive', severity: 'warning' });
    }

    return {
      valid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
    };
  }

  private validatePlatform(action: ActionDefinition, platform: SupportedPlatform, errors: ValidationError[]): void {
    if (!action.supportedPlatforms.includes(platform)) {
      errors.push({
        field: 'platform',
        message: `Action '${action.id}' does not support platform '${platform}'. Supported: ${action.supportedPlatforms.join(', ')}`,
        severity: 'error',
      });
    }
  }

  private validateRequiredInputs(node: ActionNode, errors: ValidationError[]): void {
    const requiredInputs = node.action.inputs.filter(i => i.required);
    for (const input of requiredInputs) {
      if (!(input.name in node.inputs) && input.defaultValue === undefined) {
        errors.push({
          field: `input.${input.name}`,
          message: `Required input '${input.name}' is missing for action '${node.action.id}'`,
          severity: 'error',
        });
      }
    }
  }

  private validateRequiredEntities(node: ActionNode, errors: ValidationError[]): void {
    const requiredEntities = new Set(node.action.requiredEntities);
    const boundEntityTypes = new Set(node.goalNode.boundEntities.map(e => e.type));

    for (const required of requiredEntities) {
      if (!boundEntityTypes.has(required as EntityType)) {
        errors.push({
          field: `entity.${required}`,
          message: `Required entity '${required}' is not bound for action '${node.action.id}'`,
          severity: 'error',
        });
      }
    }
  }

  private validateConstraints(action: ActionDefinition, errors: ValidationError[]): void {
    // Constraint validation is declarative — we flag mandatory constraints
    // that must be checked by the State Engine before execution
    for (const constraint of action.constraints) {
      if (constraint.mandatory) {
        errors.push({
          field: `constraint.${constraint.id}`,
          message: `Mandatory constraint '${constraint.id}': ${constraint.description}`,
          severity: 'warning', // Warning because State Engine will validate at runtime
        });
      }
    }
  }
}
