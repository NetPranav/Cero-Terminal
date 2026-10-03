import { describe, it, expect } from 'vitest';
import { ToolParameterValidator } from './ToolParameterValidator';
import { ToolSpec } from './SystemPrompt';

describe('ToolParameterValidator — Zero-Hallucination Parameter Coercion', () => {
  const mockPortTool: ToolSpec = {
    id: 'network.ports',
    name: 'Check Port',
    description: 'Check port occupancy',
    parameters: [
      { name: 'port', type: 'number', required: true, description: 'Port number' }
    ]
  };

  const mockAppTool: ToolSpec = {
    id: 'application.open',
    name: 'Open Application',
    description: 'Launch desktop app',
    parameters: [
      { name: 'app', type: 'string', required: true, description: 'Target app' }
    ]
  };

  const mockDotfileTool: ToolSpec = {
    id: 'system.dotfile',
    name: 'Manage Dotfile',
    description: 'Configure autostart',
    parameters: [
      { name: 'app', type: 'string', required: true, description: 'App name' },
      { name: 'enable', type: 'boolean', required: true, description: 'Enable flag' }
    ]
  };

  it('coerces string number to integer for numeric schema parameters', () => {
    const res = ToolParameterValidator.validateAndCoerce(mockPortTool, { port: '3000' });
    expect(res.valid).toBe(true);
    expect(res.coercedParams.port).toBe(3000);
    expect(typeof res.coercedParams.port).toBe('number');
  });

  it('coerces string boolean ("true"/"false") to boolean type', () => {
    const res = ToolParameterValidator.validateAndCoerce(mockDotfileTool, { app: 'gazebo', enable: 'false' });
    expect(res.valid).toBe(true);
    expect(res.coercedParams.enable).toBe(false);
    expect(typeof res.coercedParams.enable).toBe('boolean');
  });

  it('repairs common model parameter aliases (e.g. appName -> app)', () => {
    const res = ToolParameterValidator.validateAndCoerce(mockAppTool, { appName: 'Safari' });
    expect(res.valid).toBe(true);
    expect(res.coercedParams.app).toBe('Safari');
    expect(res.coercedParams.appName).toBeUndefined();
    expect(res.repairedAliases).toContain('appName -> app');
  });

  it('detects and flags missing required parameters', () => {
    const res = ToolParameterValidator.validateAndCoerce(mockPortTool, {});
    expect(res.valid).toBe(false);
    expect(res.errors).toBeDefined();
    expect(res.errors![0]).toContain('Missing required parameter: "port"');
  });
});
