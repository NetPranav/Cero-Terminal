import { describe, it, expect } from 'vitest';
import { builtinTemplates } from '../templates/WorkflowTemplates';
import { WorkflowIRCompiler } from '../engine/WorkflowIRCompiler';
import { WorkflowGraphCompiler } from '../engine/WorkflowGraphCompiler';
import { WorkflowRegistry } from '../registry/WorkflowRegistry';

describe('WorkflowTemplates — 6 Built-in Immutable Templates & Clean Compilation', () => {
  const irCompiler = new WorkflowIRCompiler();
  const graphCompiler = new WorkflowGraphCompiler();

  it('should ship 6 immutable built-in templates with complete metadata and typed variables', () => {
    expect(builtinTemplates.length).toBe(6);

    for (const tpl of builtinTemplates) {
      expect(tpl.immutable).toBe(true);
      expect(tpl.source).toBe('builtin');
      expect(tpl.metadata.author).toBe('Cero');
      expect(tpl.nodes.length).toBeGreaterThan(0);
      expect(tpl.outputs.length).toBeGreaterThan(0);
    }
  });

  it('should compile all 6 templates cleanly through the IR → ActionGraph pipeline without errors', () => {
    for (const tpl of builtinTemplates) {
      // Create a UserWorkflow from template for compilation
      const registry = new WorkflowRegistry();
      const userWf = registry.instantiateFromTemplate(tpl.id);
      expect(userWf).toBeDefined();

      // Provide minimal valid inputs for required variables
      const inputs: Record<string, unknown> = {};
      for (const v of tpl.variables) {
        if (v.required && v.defaultValue === undefined) {
          if (v.type === 'path' || v.type === 'repository') inputs[v.name] = '/tmp/test';
          else if (v.type === 'string') inputs[v.name] = 'test-value';
          else if (v.type === 'number') inputs[v.name] = 42;
          else if (v.type === 'port') inputs[v.name] = 3000;
          else if (v.type === 'boolean') inputs[v.name] = true;
          else inputs[v.name] = 'test';
        }
      }

      const { ir, errors } = irCompiler.compile(userWf!, inputs);
      expect(errors.length).toBe(0);
      expect(ir.nodes.length).toBeGreaterThan(0);

      const actionGraph = graphCompiler.compile(ir);
      expect(actionGraph.nodes.length).toBe(ir.nodes.length);
      expect(actionGraph.confidence).toBe(1.0);
    }
  });

  it('should declare typed outputs on every template mapping to valid source nodes', () => {
    for (const tpl of builtinTemplates) {
      for (const output of tpl.outputs) {
        expect(output.name).toBeDefined();
        expect(output.type).toBeDefined();
        const sourceExists = tpl.nodes.some(n => n.id === output.sourceNodeId);
        expect(sourceExists).toBe(true);
      }
    }
  });
});
