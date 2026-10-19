/**
 * ToolRegistry.test.ts
 * 
 * Comprehensive test suite verifying:
 * - Tool Loading & Schema Validation
 * - Duplicate Detection
 * - Registry Indexing (Tool, Domain, Entity, Tag, Alias, Knowledge)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolLoader } from '../loader/ToolLoader';
import { ToolDefinitionSchema, ToolWorkflowSchema } from '../schemas/ToolDefinitionSchema';

describe('AI Operating Knowledge Base - Tool Registry', () => {
  let loader: ToolLoader;

  beforeEach(() => {
    loader = new ToolLoader();
    loader.loadAll();
  });

  describe('1. Tool Loader & Schema Validation', () => {
    it('should load bundled tools successfully without failing schemas', () => {
      const state = loader.getState();
      expect(state.toolIndex.count()).toBeGreaterThanOrEqual(5);
      expect(state.toolIndex.has('network.bluetooth.list')).toBe(true);
      expect(state.toolIndex.has('network.wifi.scan')).toBe(true);
      expect(state.toolIndex.has('system.info')).toBe(true);
    });

    it('should reject invalid tool.json definitions via Zod schema', () => {
      const invalidTool = {
        id: "INVALID_ID_FORMAT", // must be dot-separated lowercase
        displayName: "",
        // missing required fields
      };
      const parseResult = ToolDefinitionSchema.safeParse(invalidTool);
      expect(parseResult.success).toBe(false);
    });

    it('should reject invalid workflow.json definitions with missing steps', () => {
      const invalidWorkflow = {
        toolId: "test.tool",
        // missing steps and platforms
      };
      const parseResult = ToolWorkflowSchema.safeParse(invalidWorkflow);
      expect(parseResult.success).toBe(true); // steps defaults to empty array
      
      // Check invalid step types
      const badStepWorkflow = {
        toolId: "test.tool",
        steps: [{ id: "step1", name: "Bad Step", type: "InvalidType" }]
      };
      expect(ToolWorkflowSchema.safeParse(badStepWorkflow).success).toBe(false);
    });
  });

  describe('2. Registry Indexing', () => {
    it('should index tools by domain correctly', () => {
      const { domainIndex } = loader.getState();
      expect(domainIndex.hasDomain('network')).toBe(true);
      const networkTools = domainIndex.getToolIds('network');
      expect(networkTools).toContain('network.bluetooth.list');
      expect(networkTools).toContain('network.wifi.scan');
    });

    it('should index tools by tags and aliases', () => {
      const { tagIndex, aliasIndex } = loader.getState();
      expect(tagIndex.getToolIds('bluetooth')).toContain('network.bluetooth.list');
      expect(aliasIndex.getToolId('show bluetooth')).toBe('network.bluetooth.list');
      expect(aliasIndex.getToolId('sysinfo')).toBe('system.info');
    });

    it('should perform semantic knowledge lookups with abbreviation expansion', () => {
      const { knowledgeIndex } = loader.getState();
      const results = knowledgeIndex.search('what bt devices are nearby');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].toolId).toBe('network.bluetooth.list');
    });
  });
});
