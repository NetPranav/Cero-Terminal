/**
 * ToolLoader.ts
 * 
 * Discovers, validates, and loads all tool folders into the registry.
 * 
 * Responsibilities:
 * - Discover tool folders under the tools/ directory
 * - Validate every JSON file against Zod schemas
 * - Build the in-memory ToolIndex + all secondary indexes
 * - Detect duplicate tool IDs
 * - Cache tool metadata (workflow.json loaded lazily on demand)
 * - Generate meaningful diagnostics for invalid tools
 */

import {
  ToolDefinitionSchema,
  ToolWorkflowSchema,
  ToolKnowledgeSchema,
  ToolExamplesSchema,
  ToolTestsSchema,
  LoadedTool,
  ToolDefinition,
  ToolWorkflow,
  ToolKnowledge,
  ToolExamples,
  ToolTests,
} from '../schemas/ToolDefinitionSchema';

import { ToolIndex } from '../registry/ToolIndex';
import { DomainIndex } from '../registry/DomainIndex';
import { EntityIndex } from '../registry/EntityIndex';
import { TagIndex } from '../registry/TagIndex';
import { AliasIndex } from '../registry/AliasIndex';
import { KnowledgeIndex } from '../registry/KnowledgeIndex';

// Keep the desktop bundle browser-safe. Node 20.18+ exposes built-in modules
// through process without requiring a statically imported Node-only module.
const nodeRequire = typeof process !== 'undefined'
  ? (process as any).getBuiltinModule?.('node:module')?.createRequire(import.meta.url) ?? null
  : null;

export interface LoadDiagnostic {
  toolPath: string;
  file: string;
  level: 'error' | 'warning';
  message: string;
}

export interface LoadResult {
  success: boolean;
  toolsLoaded: number;
  toolsFailed: number;
  diagnostics: LoadDiagnostic[];
}

export interface ToolRegistryState {
  toolIndex: ToolIndex;
  domainIndex: DomainIndex;
  entityIndex: EntityIndex;
  tagIndex: TagIndex;
  aliasIndex: AliasIndex;
  knowledgeIndex: KnowledgeIndex;
}

export interface RawToolBundle {
  tool: any;
  workflow: any;
  knowledge: any;
  examples: any;
  tests: any;
  folderPath: string;
}

export class ToolLoader {
  private state: ToolRegistryState;
  private static sharedState: ToolRegistryState | null = null;

  /**
   * The tool registry is identical for every terminal tab; load and validate it once instead of
   * re-indexing all tool bundles per tab.
   */
  public static getSharedState(): ToolRegistryState {
    if (!ToolLoader.sharedState) {
      const loader = new ToolLoader();
      loader.loadAll(true);
      ToolLoader.sharedState = loader.getState();
    }
    return ToolLoader.sharedState;
  }

  constructor() {
    this.state = {
      toolIndex: new ToolIndex(),
      domainIndex: new DomainIndex(),
      entityIndex: new EntityIndex(),
      tagIndex: new TagIndex(),
      aliasIndex: new AliasIndex(),
      knowledgeIndex: new KnowledgeIndex(),
    };
  }

  /**
   * Load all dynamically discovered tools, validate schemas, and build indexes.
   */
  public loadAll(silent?: boolean): LoadResult {
    const diagnostics: LoadDiagnostic[] = [];
    let loaded = 0;
    let failed = 0;

    // Clear all indexes for fresh load
    this.state.toolIndex.clear();
    this.state.domainIndex.clear();
    this.state.entityIndex.clear();
    this.state.tagIndex.clear();
    this.state.aliasIndex.clear();
    this.state.knowledgeIndex.clear();

    let bundles: Record<string, RawToolBundle> = {};

    if (typeof (import.meta as any).glob === 'function') {
      const toolModules = (import.meta as any).glob('../../../tools/**/tool.json', { eager: true });
      const workflowModules = (import.meta as any).glob('../../../tools/**/workflow.json', { eager: true });
      const knowledgeModules = (import.meta as any).glob('../../../tools/**/knowledge.json', { eager: true });
      const examplesModules = (import.meta as any).glob('../../../tools/**/examples.json', { eager: true });
      const testsModules = (import.meta as any).glob('../../../tools/**/tests.json', { eager: true });

      for (const [path, module] of Object.entries(toolModules)) {
        const dirPath = path.substring(0, path.lastIndexOf('/'));
        const folderPath = dirPath.replace('../../../', '');
        const getDef = (mod: any) => mod?.default !== undefined ? mod.default : mod;

        bundles[dirPath] = {
          tool: getDef(module),
          workflow: getDef(workflowModules[`${dirPath}/workflow.json`]),
          knowledge: getDef(knowledgeModules[`${dirPath}/knowledge.json`]),
          examples: getDef(examplesModules[`${dirPath}/examples.json`]),
          tests: getDef(testsModules[`${dirPath}/tests.json`]),
          folderPath
        };
      }
    } else if (nodeRequire) {
      // Node.js CLI runtime fallback
      try {
        const fs = nodeRequire('node:fs');
        const path = nodeRequire('node:path');
        const rootDir = process.cwd();
        const toolsDir = path.resolve(rootDir, 'tools');

        if (fs.existsSync(toolsDir)) {
          const findToolDirs = (dir: string): string[] => {
            let results: string[] = [];
            const list = fs.readdirSync(dir, { withFileTypes: true });
            for (const dirent of list) {
              if (dirent.isDirectory()) {
                const full = path.join(dir, dirent.name);
                if (fs.existsSync(path.join(full, 'tool.json'))) {
                  results.push(full);
                } else {
                  results = results.concat(findToolDirs(full));
                }
              }
            }
            return results;
          };

          const toolDirs = findToolDirs(toolsDir);
          for (const dir of toolDirs) {
            const readJsonSafe = (file: string) => {
              try {
                const p = path.join(dir, file);
                if (fs.existsSync(p)) {
                  return JSON.parse(fs.readFileSync(p, 'utf-8'));
                }
              } catch {}
              return undefined;
            };

            const relPath = path.relative(rootDir, dir);
            bundles[dir] = {
              tool: readJsonSafe('tool.json'),
              workflow: readJsonSafe('workflow.json'),
              knowledge: readJsonSafe('knowledge.json'),
              examples: readJsonSafe('examples.json'),
              tests: readJsonSafe('tests.json'),
              folderPath: relPath
            };
          }
        }
      } catch (e) {
        console.warn('[ToolLoader] Node.js directory scan error:', e);
      }
    }

    for (const bundle of Object.values(bundles)) {
      const result = this.loadSingleTool(bundle, diagnostics);
      if (result) {
        loaded++;
      } else {
        failed++;
      }
    }

    if (!silent) {
      console.log(`[ToolLoader] Loaded ${loaded} tools, ${failed} failed.`);
      for (const d of diagnostics) {
        const prefix = d.level === 'error' ? '[x]' : '[!]';
        console.warn(`${prefix} [${d.toolPath}/${d.file}] ${d.message}`);
      }
    }

    return { success: failed === 0, toolsLoaded: loaded, toolsFailed: failed, diagnostics };
  }

  private loadSingleTool(bundle: RawToolBundle, diagnostics: LoadDiagnostic[]): LoadedTool | null {
    const path = bundle.folderPath;

    // 1. Validate tool.json
    const toolResult = ToolDefinitionSchema.safeParse(bundle.tool);
    if (!toolResult.success) {
      diagnostics.push({
        toolPath: path, file: 'tool.json', level: 'error',
        message: `Schema validation failed: ${toolResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      });
      return null;
    }
    const definition: ToolDefinition = toolResult.data;

    // 2. Duplicate check
    if (this.state.toolIndex.has(definition.id)) {
      diagnostics.push({
        toolPath: path, file: 'tool.json', level: 'error',
        message: `Duplicate tool ID: ${definition.id}`
      });
      return null;
    }

    // 3. Validate workflow.json
    const workflowResult = ToolWorkflowSchema.safeParse(bundle.workflow);
    if (!workflowResult.success) {
      diagnostics.push({
        toolPath: path, file: 'workflow.json', level: 'error',
        message: `Schema validation failed: ${workflowResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      });
      return null;
    }
    const workflow: ToolWorkflow = workflowResult.data;

    // 4. Validate knowledge.json
    const knowledgeResult = ToolKnowledgeSchema.safeParse(bundle.knowledge);
    if (!knowledgeResult.success) {
      diagnostics.push({
        toolPath: path, file: 'knowledge.json', level: 'warning',
        message: `Schema validation failed: ${knowledgeResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      });
    }
    const knowledge: ToolKnowledge = knowledgeResult.success ? knowledgeResult.data : {
      toolId: definition.id, aliases: [], synonyms: [], commonUserWording: [],
      commonMistakes: [], entityHints: {}, deviceNamingPatterns: [],
      commonAbbreviations: {}, languageVariations: [], relatedTools: []
    };

    // 5. Validate examples.json
    const examplesResult = ToolExamplesSchema.safeParse(bundle.examples);
    if (!examplesResult.success) {
      diagnostics.push({
        toolPath: path, file: 'examples.json', level: 'warning',
        message: `Schema validation failed: ${examplesResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      });
    }
    const examples: ToolExamples = examplesResult.success ? examplesResult.data : {
      toolId: definition.id, examples: []
    };

    // 6. Validate tests.json
    const testsResult = ToolTestsSchema.safeParse(bundle.tests);
    if (!testsResult.success) {
      diagnostics.push({
        toolPath: path, file: 'tests.json', level: 'warning',
        message: `Schema validation failed: ${testsResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      });
    }
    const tests: ToolTests = testsResult.success ? testsResult.data : {
      toolId: definition.id, tests: []
    };

    // 7. Build loaded tool
    const loadedTool: LoadedTool = {
      definition,
      workflow,
      knowledge,
      examples,
      tests,
      folderPath: path,
    };

    // 8. Index it
    this.state.toolIndex.add(loadedTool);
    this.state.domainIndex.add(loadedTool);
    this.state.entityIndex.add(loadedTool);
    this.state.tagIndex.add(loadedTool);
    this.state.aliasIndex.add(loadedTool);
    this.state.knowledgeIndex.add(loadedTool);

    return loadedTool;
  }

  public getState(): ToolRegistryState {
    return this.state;
  }
}
