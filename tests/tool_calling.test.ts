import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Tool Calling Evaluation Suite', () => {
  const testCasesPath = path.resolve(__dirname, 'tool_test_cases.json');
  const data = JSON.parse(fs.readFileSync(testCasesPath, 'utf8'));

  it('loads test suite with comprehensive coverage', () => {
    expect(data.totalToolsCovered).toBeGreaterThanOrEqual(100);
    expect(data.totalTestCases).toBeGreaterThanOrEqual(200);
    expect(data.domains).toContain('network');
    expect(data.domains).toContain('system');
    expect(data.domains).toContain('filesystem');
    expect(data.domains).toContain('application');
  });

  it('contains explicit user bluetooth test scenarios', () => {
    const bluetoothCases = data.testCases.filter((tc: any) => tc.expectedTool.startsWith('network.bluetooth'));
    expect(bluetoothCases.length).toBeGreaterThanOrEqual(7);

    // Turn on/off
    const onCase = bluetoothCases.find((tc: any) => tc.expectedTool === 'network.bluetooth.on');
    const offCase = bluetoothCases.find((tc: any) => tc.expectedTool === 'network.bluetooth.off');
    expect(onCase).toBeDefined();
    expect(offCase).toBeDefined();

    // Soundcore Space One headphone connection
    const soundcoreCase = bluetoothCases.find((tc: any) => 
      tc.expectedTool === 'network.bluetooth.connect' && 
      tc.prompt.toLowerCase().includes('soundcore space one')
    );
    expect(soundcoreCase).toBeDefined();
    expect(soundcoreCase.params.device.toLowerCase()).toContain('soundcore');

    // Check available devices
    const listCase = bluetoothCases.find((tc: any) => 
      tc.expectedTool === 'network.bluetooth.list' && 
      tc.prompt.toLowerCase().includes('available')
    );
    expect(listCase).toBeDefined();
  });

  it('ensures all test case tools exist in the tools directory', () => {
    const toolsDir = path.resolve(__dirname, '../tools');
    const testedToolIds = new Set(data.testCases.map((tc: any) => tc.expectedTool));

    for (const toolId of testedToolIds) {
      const parts = toolId.split('.');
      const domain = parts[0];
      const action = parts.slice(1).join('.');
      const toolJsonPath = path.join(toolsDir, domain, action, 'tool.json');
      expect(fs.existsSync(toolJsonPath), `Tool definition missing for ${toolId} at ${toolJsonPath}`).toBe(true);
    }
  });
});
