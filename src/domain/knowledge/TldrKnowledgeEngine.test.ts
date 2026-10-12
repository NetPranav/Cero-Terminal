/**
 * TldrKnowledgeEngine.test.ts — Comprehensive Test Suite for TLDR Knowledge Engine
 * 
 * Verifies Phase 5.1: Offline tldr-pages Ground-Truth CLI Knowledge Base & Fast-Path Retrieval.
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
    it('initializes embedded ground-truth catalog with rich macOS & Unix coverage', () => {
      const stats = engine.getStats();
      expect(stats.totalPages).toBeGreaterThanOrEqual(15);
      expect(stats.totalExamples).toBeGreaterThanOrEqual(40);
      expect(stats.platforms.osx).toBeGreaterThan(0);
      expect(stats.platforms.common).toBeGreaterThan(0);
      expect(stats.source).toBe('embedded');

      expect(engine.hasCommand('dscacheutil')).toBe(true);
      expect(engine.hasCommand('lsof')).toBe(true);
      expect(engine.hasCommand('networksetup')).toBe(true);
      expect(engine.hasCommand('pmset')).toBe(true);
      expect(engine.hasCommand('defaults')).toBe(true);
      expect(engine.hasCommand('tar')).toBe(true);
      expect(engine.hasCommand('rsync')).toBe(true);
      expect(engine.hasCommand('mdfind')).toBe(true);
    });
  });

  describe('2. Canonical Recipe Goal Matching', () => {
    it('matches macOS DNS flush intent to canonical dscacheutil recipe with high confidence', () => {
      const match = engine.matchGoal('flush dns cache', 'osx');
      expect(match).not.toBeNull();
      expect(match?.page.name).toBe('dscacheutil');
      expect(match?.interpolatedCommand).toBe('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');
      expect(match?.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('matches open/listening ports intent to canonical lsof recipe on macOS', () => {
      const match = engine.matchGoal('list listening ports', 'osx');
      expect(match).not.toBeNull();
      expect(match?.page.name).toBe('lsof');
      expect(match?.interpolatedCommand).toBe('lsof -iTCP -sTCP:LISTEN -P -n');
      expect(match?.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('interpolates specific port number into port inspection recipe', () => {
      const match = engine.matchGoal('check port 8080', 'osx');
      expect(match).not.toBeNull();
      expect(match?.page.name).toBe('lsof');
      expect(match?.interpolatedCommand).toBe('lsof -i :8080');
      expect(match?.confidence).toBeGreaterThanOrEqual(0.90);
    });

    it('matches battery and power status queries to pmset on macOS', () => {
      const match = engine.matchGoal('check battery status', 'osx');
      expect(match).not.toBeNull();
      expect(match?.page.name).toBe('pmset');
      expect(match?.interpolatedCommand).toBe('pmset -g batt');
      expect(match?.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('matches Finder show hidden files request to defaults write command', () => {
      const match = engine.matchGoal('show hidden files', 'osx');
      expect(match).not.toBeNull();
      expect(match?.page.name).toBe('defaults');
      expect(match?.interpolatedCommand).toContain('AppleShowAllFiles -bool true');
      expect(match?.interpolatedCommand).toContain('killall Finder');
    });

    it('matches Finder hide hidden files request to defaults write command', () => {
      const match = engine.matchGoal('hide hidden files', 'osx');
      expect(match).not.toBeNull();
      expect(match?.page.name).toBe('defaults');
      expect(match?.interpolatedCommand).toContain('AppleShowAllFiles -bool false');
      expect(match?.interpolatedCommand).toContain('killall Finder');
    });

    it('interpolates filename into Spotlight mdfind search', () => {
      const match = engine.matchGoal('spotlight search config.json', 'osx');
      expect(match).not.toBeNull();
      expect(match?.page.name).toBe('mdfind');
      expect(match?.interpolatedCommand).toBe('mdfind -name config.json');
    });

    it('interpolates archive filename into tar extraction command', () => {
      const match = engine.matchGoal('extract project_backup.tar.gz', 'osx');
      expect(match).not.toBeNull();
      expect(match?.page.name).toBe('tar');
      expect(match?.interpolatedCommand).toBe('tar -xzvf project_backup.tar.gz');
    });

    it('matches physical network hardware ports request to networksetup', () => {
      const match = engine.matchGoal('list network hardware ports', 'osx');
      expect(match).not.toBeNull();
      expect(match?.page.name).toBe('networksetup');
      expect(match?.interpolatedCommand).toBe('networksetup -listallhardwareports');
    });
  });

  describe('3. Command Examples & Platform Filtering', () => {
    it('retrieves platform-tailored recipes for a command', () => {
      const osxExamples = engine.getExamplesForCommand('lsof', 'osx');
      expect(osxExamples.length).toBeGreaterThanOrEqual(3);
      expect(osxExamples.some(e => e.command.includes('lsof -iTCP -sTCP:LISTEN -P -n'))).toBe(true);

      const linuxExamples = engine.getExamplesForCommand('lsof', 'linux');
      expect(linuxExamples.length).toBeGreaterThanOrEqual(2);
      expect(linuxExamples.every(e => e.platform !== 'osx')).toBe(true);
    });

    it('formats few-shot prompt exemplars with descriptions and commands', () => {
      const exemplar = engine.formatFewShotExemplar('tar', 'osx');
      expect(exemplar).toContain('Ground-Truth CLI Recipes for "tar":');
      expect(exemplar).toContain('$ tar -czvf');
      expect(exemplar).toContain('$ tar -xzvf');
    });

    it('returns empty string for non-existent commands in formatFewShotExemplar', () => {
      const exemplar = engine.formatFewShotExemplar('nonexistent_tool_xyz', 'osx');
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
        'inspect files and sockets',
        'lsof',
        { os: 'mac', cwd: '/' }
      );

      expect(hypotheses.length).toBeGreaterThan(1);
      const tldrBranches = hypotheses.filter(h => h.id.startsWith('branch_tldr_lsof'));
      expect(tldrBranches.length).toBeGreaterThanOrEqual(1);
      expect(tldrBranches[0].explanation).toContain('Canonical recipe:');
    });
  });
});
