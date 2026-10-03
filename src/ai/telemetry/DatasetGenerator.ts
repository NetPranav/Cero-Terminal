/**
 * DatasetGenerator.ts — SFT / LoRA Training Dataset Builder
 * 
 * Converts self-improvement telemetry and validated execution plans into structured JSONL records
 * suitable for supervised fine-tuning (SFT), LoRA adaptation, and evaluation benchmarks.
 */

import { TelemetryRecorder, TelemetryRecord } from './TelemetryRecorder';
import { StructuredPlan } from '../intent/Planner';

export interface LoRATrainingRecord {
  instruction: string;
  input?: string;
  output: string; // JSON string representation of StructuredPlan or target action
  split: 'train' | 'eval';
}

export class DatasetGenerator {
  constructor(private telemetry: TelemetryRecorder) {}

  /**
   * Generates formatted JSONL dataset string from recorded telemetry and validated plans.
   */
  public generateJsonlDataset(): string {
    const records = this.telemetry.getRecords();
    const trainingItems: LoRATrainingRecord[] = [];

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const split = i % 5 === 0 ? 'eval' : 'train';

      if (rec.type === 'SUCCESSFUL_MATCH' && rec.metadata && rec.metadata.plan) {
        trainingItems.push({
          instruction: `Convert natural language into a structured Cero Tool Registry execution plan.`,
          input: rec.userQuery,
          output: JSON.stringify(rec.metadata.plan),
          split
        });
      } else if (rec.type === 'TOOL_CORRECTION' && rec.correctedTool) {
        // Build positive reinforcement record for corrected tool selection
        const correctedOutput: StructuredPlan = {
          goal: `Execute ${rec.correctedTool}`,
          confidence: 0.95,
          tasks: [{ tool: rec.correctedTool, entities: {} }]
        };
        trainingItems.push({
          instruction: `Select the exact canonical Tool Registry capability for the user's intent.`,
          input: rec.userQuery,
          output: JSON.stringify(correctedOutput),
          split
        });
      }
    }

    return trainingItems.map(item => JSON.stringify(item)).join('\n');
  }

  /**
   * Generates evaluation benchmark records for automated quality validation when replacing models.
   */
  public generateBenchmarkSuite(): Array<{ query: string; expectedTool: string; expectedConfidenceMin: number }> {
    return [
      { query: "Turn on bluetooth and connect my headphones.", expectedTool: "network.bluetooth.on", expectedConfidenceMin: 0.95 },
      { query: "Show me all the bluetooth devices", expectedTool: "network.bluetooth.list", expectedConfidenceMin: 0.95 },
      { query: "Scan for wireless networks", expectedTool: "network.wifi.scan", expectedConfidenceMin: 0.95 },
      { query: "What are my computer specs?", expectedTool: "system.info", expectedConfidenceMin: 0.90 }
    ];
  }
}
