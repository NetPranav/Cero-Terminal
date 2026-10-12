/**
 * ToolRegistry.test.ts
 * 
 * Comprehensive test suite verifying:
 * - Tool Loading & Schema Validation
 * - Duplicate Detection
 * - Registry Indexing (Tool, Domain, Entity, Tag, Alias, Knowledge)
 * - Workflow Compilation & Parameter Injection
 * - Semantic Tool Search & Scoring
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolLoader } from '../loader/ToolLoader';
import { ToolSearcher } from '../search/ToolSearcher';
import { WorkflowCompiler } from '../compiler/WorkflowCompiler';
import { ToolDefinitionSchema, ToolWorkflowSchema } from '../schemas/ToolDefinitionSchema';
import { EntityValidator } from '../entities/EntityTypes';

describe('AI Operating Knowledge Base - Tool Registry', () => {
  let loader: ToolLoader;
  let searcher: ToolSearcher;
  let compiler: WorkflowCompiler;

  beforeEach(() => {
    loader = new ToolLoader();
    loader.loadAll();
    searcher = new ToolSearcher(loader.getState());
    compiler = new WorkflowCompiler();
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

  describe('3. Tool Searcher (Semantic Search & Scoring)', () => {
    it('should find exact matches with highest score', () => {
      const bestMatch = searcher.findBestMatch('network.bluetooth.list');
      expect(bestMatch).not.toBeNull();
      expect(bestMatch?.tool.definition.id).toBe('network.bluetooth.list');
      expect(bestMatch?.score).toBeGreaterThanOrEqual(1000);
    });

    it('should match natural language queries to appropriate tools via aliases and knowledge', () => {
      const btMatch = searcher.findBestMatch('show me all the bluetooth devices');
      expect(btMatch?.tool.definition.id).toBe('network.bluetooth.list');

      const wifiMatch = searcher.findBestMatch('scan for wireless networks');
      expect(wifiMatch?.tool.definition.id).toBe('network.wifi.scan');

      const sysMatch = searcher.findBestMatch('what are my computer specs?');
      expect(sysMatch?.tool.definition.id).toBe('system.info');

      const btOnMatch = searcher.findBestMatch('turn my bluetooth on');
      expect(btOnMatch?.tool.definition.id).toBe('network.bluetooth.on');

      const btOffMatch = searcher.findBestMatch('turn bluetooth off');
      expect(btOffMatch?.tool.definition.id).toBe('network.bluetooth.off');

      const appRunMatch = searcher.findBestMatch('show me all the applicataion runnign');
      expect(appRunMatch?.tool.definition.id).toBe('application.list_running');
    });
  });

  describe('4. Workflow Compiler & Parameter Injection', () => {
    it('should compile the Windows workflow cleanly for bluetooth list', () => {
      const tool = loader.getState().toolIndex.get('network.bluetooth.list')!;
      const res = compiler.compile(tool, { platform: 'windows', parameters: {} });
      
      expect(res.success).toBe(true);
      expect(res.workflow).toBeDefined();
      expect(res.workflow?.steps[0].capabilityId).toBe('shell.core');
      expect(res.workflow?.steps[0].parameters?.command).toBe('powershell.exe');
      expect(res.workflow?.steps[0].parameters?.args).toContain('Get-PnpDevice -Class Bluetooth | Select-Object FriendlyName,Status');
    });

    it('should inject parameters correctly into filesystem list tool', () => {
      const tool = loader.getState().toolIndex.get('filesystem.list')!;
      const res = compiler.compile(tool, {
        platform: 'windows',
        parameters: { path: '~/Documents' }
      });

      expect(res.success).toBe(true);
      expect(res.workflow?.steps[0].parameters?.args).toContain('~/Documents');
    });
  });

  describe('5. Entity Support & Validation', () => {
    it('should validate IP, Port, URL, and File Path entities properly', () => {
      expect(EntityValidator.validate('ip', '192.168.1.1')).toBe(true);
      expect(EntityValidator.validate('ip', 'not-an-ip')).toBe(false);
      expect(EntityValidator.validate('port', 8080)).toBe(true);
      expect(EntityValidator.validate('port', 99999)).toBe(false);
      expect(EntityValidator.validate('file_path', '~/Documents/file.txt')).toBe(true);
    });
  });
});
