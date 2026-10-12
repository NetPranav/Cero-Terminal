/**
 * TldrKnowledgeEngine.test.ts — Comprehensive Test Suite for TLDR Knowledge Engine
 * 
 * Verifies Phase 5.1: Offline tldr-pages Ground-Truth CLI Knowledge Base & Fast-Path Retrieval (Windows catalog).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TldrKnowledgeEngine } from './TldrKnowledgeEngine';
import { ShadowPtySimulator } from '../../ai/agent/ShadowPtySimulator';

describe('TldrKnowledgeEngine (Phase 5.1)', () => {
  let engine: TldrKnowledgeEngine;

  beforeEach(() => {
    engine = new TldrKnowledgeEngine();
  });

  describe('1. Catalog Integrity & Stats', () => {
    it('ships only recipes that run on Windows', () => {
      const stats = engine.getStats();
      expect(stats.totalPages).toBeGreaterThanOrEqual(4);
      expect(stats.totalExamples).toBeGreaterThanOrEqual(12);
      expect(stats.platforms.common).toBeGreaterThan(0);
      expect(stats.source).toBe('embedded');

      for (const cmd of ['tar', 'curl', 'git', 'docker']) expect(engine.hasCommand(cmd)).toBe(true);
      for (const cmd of ['dscacheutil', 'networksetup', 'pmset', 'defaults', 'mdfind', 'lsof', 'rsync', 'ifconfig', 'brew']) {
        expect(engine.hasCommand(cmd)).toBe(false);
      }
      // Windows PowerShell aliases curl to Invoke-WebRequest, so the recipes name the real program
      expect(engine.getExamplesForCommand('curl').every(e => e.command.startsWith('curl.exe '))).toBe(true);
    });
  });

  describe('2. Canonical Recipe Goal Matching', () => {
    it('returns no match until there are Windows recipes, so the request goes on to the other routes', () => {
      expect(engine.matchGoal('flush dns cache', 'windows')).toBeNull();
      expect(engine.matchGoal('list listening ports', 'windows')).toBeNull();
      expect(engine.matchGoal('extract project_backup.tar.gz', 'windows')).toBeNull();
      expect(engine.matchGoal('', 'windows')).toBeNull();
    });

    it('matches a registered Windows recipe', () => {
      engine.registerPage({
        name: 'ipconfig',
        description: 'Show and renew the IP configuration.',
        platforms: ['windows'],
        tags: ['dns', 'network'],
        examples: [{ description: 'Flush the DNS resolver cache:', command: 'ipconfig /flushdns', platform: 'windows', tags: ['flush', 'dns', 'cache'] }],
      });
      const match = engine.matchGoal('flush dns cache', 'windows');
      expect(match?.page.name).toBe('ipconfig');
      expect(match?.interpolatedCommand).toBe('ipconfig /flushdns');
      expect(match?.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('3. Command Examples & Platform Filtering', () => {
    it('retrieves the recipes for a command', () => {
      const examples = engine.getExamplesForCommand('git', 'windows');
      expect(examples.length).toBeGreaterThanOrEqual(3);
      expect(examples.some(e => e.command === 'git status --short --branch')).toBe(true);
      expect(engine.getExamplesForCommand('lsof', 'windows')).toEqual([]);
    });

    it('formats few-shot prompt exemplars with descriptions and commands', () => {
      const exemplar = engine.formatFewShotExemplar('tar', 'windows');
      expect(exemplar).toContain('Ground-Truth CLI Recipes for "tar":');
      expect(exemplar).toContain('$ tar -czvf');
      expect(exemplar).toContain('$ tar -xzvf');
    });

    it('returns empty string for non-existent commands in formatFewShotExemplar', () => {
      const exemplar = engine.formatFewShotExemplar('nonexistent_tool_xyz', 'windows');
      expect(exemplar).toBe('');
    });
  });

  describe('4. Dynamic Runtime Registration', () => {
    it('allows registering custom verified pages and queries them', () => {
      engine.registerPage({
        name: 'mycustomtool',
        description: 'Internal development pipeline tool.',
        platforms: ['common'],
        tags: ['pipeline', 'custom'],
        examples: [
          {
            description: 'Run deployment pipeline for staging:',
            command: 'mycustomtool deploy --stage staging',
            platform: 'common',
            tags: ['deploy', 'staging']
          }
        ]
      });

      expect(engine.hasCommand('mycustomtool')).toBe(true);
      const examples = engine.getExamplesForCommand('mycustomtool');
      expect(examples.length).toBe(1);
      expect(examples[0].command).toBe('mycustomtool deploy --stage staging');
    });
  });

  describe('5. ShadowPtySimulator Integration', () => {
    it('expands candidate hypotheses with canonical TLDR recipes', () => {
      const simulator = new ShadowPtySimulator();
      const hypotheses = simulator.generateHypotheses(
        'show repository status',
        'git',
        { os: 'windows', cwd: 'C:\\' }
      );

      expect(hypotheses.length).toBeGreaterThan(1);
      const tldrBranches = hypotheses.filter(h => h.id.startsWith('branch_tldr_git'));
      expect(tldrBranches.length).toBeGreaterThanOrEqual(1);
      expect(tldrBranches[0].explanation).toContain('Canonical recipe:');
    });
  });
});
