import { describe, it, expect } from 'vitest';
import { VariableResolver } from '../variables/WorkflowVariables';
import { WorkflowVariable, VariableType } from '../models/WorkflowTypes';

describe('WorkflowVariables — 11 Strongly Typed Variable Domains & Runtime Resolution', () => {
  const resolver = new VariableResolver();

  it('should resolve and validate all 11 variable types with correct values and reject invalid types', () => {
    const declarations: WorkflowVariable[] = [
      { name: 'name', type: 'string', description: 'Project name', required: true },
      { name: 'count', type: 'number', description: 'Iteration count', required: true },
      { name: 'verbose', type: 'boolean', description: 'Verbose mode', required: true },
      { name: 'files', type: 'array', description: 'File list', required: true },
      { name: 'config', type: 'object', description: 'Config object', required: true },
      { name: 'apiKey', type: 'secret', description: 'API key', required: true },
      { name: 'projectPath', type: 'path', description: 'Path', required: true },
      { name: 'ide', type: 'application', description: 'IDE', required: true },
      { name: 'port', type: 'port', description: 'Port', required: true },
      { name: 'device', type: 'device', description: 'Device', required: true },
      { name: 'repo', type: 'repository', description: 'Repo', required: true },
    ];

    const inputs = {
      name: 'Cero',
      count: 42,
      verbose: true,
      files: ['a.ts', 'b.ts'],
      config: { key: 'value' },
      apiKey: 'sk-12345',
      projectPath: '/home/user/project',
      ide: 'Cursor',
      port: 3000,
      device: 'Magic Keyboard',
      repo: '/Users/dev/repos/cero',
    };

    const { resolved, errors } = resolver.resolve(declarations, inputs);
    expect(errors.length).toBe(0);
    expect(Object.keys(resolved).length).toBe(11);
    expect(resolved.name).toBe('Cero');
    expect(resolved.port).toBe(3000);
  });

  it('should reject invalid values with descriptive error messages', () => {
    const decls: WorkflowVariable[] = [
      { name: 'port', type: 'port', description: 'Port', required: true },
      { name: 'path', type: 'path', description: 'Path', required: true },
    ];

    const { errors } = resolver.resolve(decls, { port: 99999, path: 'not-a-path' });
    expect(errors.length).toBe(2);
    expect(errors[0]).toContain('port number');
    expect(errors[1]).toContain('filesystem path');
  });

  it('should apply default values for optional variables and report errors for missing required variables', () => {
    const decls: WorkflowVariable[] = [
      { name: 'branch', type: 'string', description: 'Branch', required: false, defaultValue: 'main' },
      { name: 'env', type: 'string', description: 'Environment', required: true },
    ];

    const { resolved, errors } = resolver.resolve(decls, {});
    expect(resolved.branch).toBe('main');
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Required variable 'env'");
  });

  it('should substitute {{variable}} placeholders in action parameters', () => {
    const params = { path: '{{projectPath}}/src', branch: '{{branch}}', port: '{{port}}' };
    const vars = { projectPath: '/Users/dev', branch: 'develop', port: '8080' };

    const result = resolver.substituteParameters(params, vars);
    expect(result.path).toBe('/Users/dev/src');
    expect(result.branch).toBe('develop');
    expect(result.port).toBe('8080');
  });
});
