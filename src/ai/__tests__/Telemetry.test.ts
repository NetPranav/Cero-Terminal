import { describe, it, expect } from 'vitest';
import { TelemetryRecorder } from '../telemetry/TelemetryRecorder';
import { DatasetGenerator } from '../telemetry/DatasetGenerator';
import { StructuredPlan } from '../intent/Planner';

describe('Phase X — Telemetry & Fine-Tuning Pipeline Verification', () => {
  it('should record telemetry events and generate JSONL training datasets for LoRA adaptation', () => {
    const recorder = new TelemetryRecorder();
    
    // Simulate successful matches and tool corrections
    const mockPlan: StructuredPlan = {
      goal: 'Connect Bluetooth headphones',
      confidence: 0.99,
      tasks: [
        { tool: 'network.bluetooth.on', entities: {} },
        { tool: 'network.bluetooth.connect', entities: { device: 'headphones' } }
      ]
    };

    recorder.record('SUCCESSFUL_MATCH', 'Turn on bluetooth and connect my headphones.', {
      confidence: 0.99,
      metadata: { plan: mockPlan }
    });

    recorder.record('TOOL_CORRECTION', 'enable bt', {
      originalTool: 'bluetooth.enable',
      correctedTool: 'network.bluetooth.on',
      confidence: 0.95
    });

    const generator = new DatasetGenerator(recorder);
    const jsonl = generator.generateJsonlDataset();
    const lines = jsonl.split('\n');

    expect(lines).toHaveLength(2);
    const item1 = JSON.parse(lines[0]);
    expect(item1.instruction).toContain('Cero Tool Registry');
    expect(item1.input).toBe('Turn on bluetooth and connect my headphones.');
    expect(JSON.parse(item1.output)).toEqual(mockPlan);
  });

  it('should provide benchmark evaluation test suite for model replacement tests', () => {
    const generator = new DatasetGenerator(new TelemetryRecorder());
    const benchmarks = generator.generateBenchmarkSuite();

    expect(benchmarks.length).toBeGreaterThanOrEqual(4);
    expect(benchmarks.some(b => b.expectedTool === 'network.bluetooth.on')).toBe(true);
  });
});
