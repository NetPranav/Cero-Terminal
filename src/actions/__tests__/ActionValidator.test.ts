import { describe, it, expect, beforeEach } from 'vitest';
import { ActionValidator } from '../validation/ActionValidator';
import { ActionNode, ActionDefinition } from '../models/ActionTypes';
import { GoalNode } from '../../ai/planner/PlannerTypes';
import { createMockAction } from './helpers';

describe('ActionValidator', () => {
  const validator = new ActionValidator();

  const createGoalNode = (boundEntities: { type: string; value: string }[] = []): GoalNode => ({
    id: 'g1',
    title: 'Goal',
    description: '',
    goal: 'unknown.test',
    dependencies: [],
    requiredEntities: [],
    boundEntities: boundEntities.map(e => ({ ...e, confidence: 1, raw: e.value })) as any,
    planningState: 'unsatisfied',
    reasoning: '',
    confidence: 1,
    platformIndependent: true,
  });

  const createActionNode = (action: ActionDefinition, inputs: Record<string, unknown> = {}, goalNode?: GoalNode): ActionNode => ({
    id: 'a1',
    action,
    goalNode: goalNode || createGoalNode(),
    inputs,
    dependencies: [],
    parallelizable: true,
    status: 'pending',
    confidence: 1.0,
  });

  describe('validate ActionNode', () => {
    it('should pass for a valid node with all inputs provided', () => {
      const action = createMockAction({
        id: 'unknown.test' as any,
        inputs: [
          { name: 'path', type: 'string', description: 'File path', required: true },
        ],
      });
      const node = createActionNode(action, { path: '/tmp/foo' });

      const result = validator.validate(node);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail if required input is missing', () => {
      const action = createMockAction({
        id: 'unknown.test' as any,
        inputs: [
          { name: 'path', type: 'string', description: 'File path', required: true },
        ],
      });
      const node = createActionNode(action, {}); // missing 'path'

      const result = validator.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'input.path')).toBe(true);
    });

    it('should pass if missing required input has a default value', () => {
      const action = createMockAction({
        id: 'unknown.test' as any,
        inputs: [
          { name: 'recursive', type: 'boolean', description: 'Recursive', required: true, defaultValue: false },
        ],
      });
      const node = createActionNode(action, {});

      const result = validator.validate(node);
      expect(result.valid).toBe(true);
    });

    it('should fail if platform is unsupported', () => {
      const action = createMockAction({
        id: 'unknown.test' as any,
        // An action file written for another OS
        supportedPlatforms: ['linux' as any],
      });
      const node = createActionNode(action);

      const result = validator.validate(node, 'windows');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'platform')).toBe(true);
    });

    it('should fail if required entity is not bound', () => {
      const action = createMockAction({
        id: 'unknown.test' as any,
        requiredEntities: ['application'],
      });
      const node = createActionNode(action, {}, createGoalNode([]));

      const result = validator.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'entity.application')).toBe(true);
    });

    it('should pass if required entity is bound', () => {
      const action = createMockAction({
        id: 'unknown.test' as any,
        requiredEntities: ['application'],
      });
      const node = createActionNode(action, {}, createGoalNode([{ type: 'application', value: 'Chrome' }]));

      const result = validator.validate(node);
      expect(result.valid).toBe(true);
    });

    it('should warn on mandatory constraints', () => {
      const action = createMockAction({
        id: 'unknown.test' as any,
        constraints: [{ id: 'requires_internet', description: 'Requires internet', mandatory: true }],
      });
      const node = createActionNode(action);

      const result = validator.validate(node);
      expect(result.valid).toBe(true); // warnings don't block
      expect(result.errors.some(e => e.severity === 'warning')).toBe(true);
    });
  });

  describe('validateDefinition', () => {
    it('should pass for a valid definition', () => {
      const action = createMockAction({ id: 'filesystem.copy' });
      const result = validator.validateDefinition(action);
      expect(result.valid).toBe(true);
    });

    it('should fail for invalid ID format', () => {
      const action = createMockAction({ id: 'BadId' });
      const result = validator.validateDefinition(action);
      expect(result.valid).toBe(false);
    });

    it('should fail for empty display name', () => {
      const action = createMockAction({ id: 'test.action', displayName: '' });
      const result = validator.validateDefinition(action);
      expect(result.valid).toBe(false);
    });
  });
});
