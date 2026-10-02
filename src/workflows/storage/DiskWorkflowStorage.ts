/**
 * DiskWorkflowStorage.ts — File Persistence for .flow Workflows and Legacy Migration
 *
 * Persists and loads workflows to/from `~/.sentinel/workflows/<name>.flow`.
 * Uses canonical FlowActionDocument (.flow) format, provides automatic legacy .json
 * migration, and deduplicates workflows so .flow always takes precedence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { invoke } from '@tauri-apps/api/core';
import {
  SavedWorkflowDefinition,
  WorkflowStepDefinition,
  CURRENT_WORKFLOW_SCHEMA_VERSION
} from '../models/WorkflowTypes';
import { getStarterWorkflowById } from '../templates/StarterWorkflows';
import { flowToWorkflow } from './FlowImport';
import { workflowToFlow, slug } from '../flow/FlowExport';
import { getPlatform } from '../../shared/platform';

export class DiskWorkflowStorage {
  private static instance?: DiskWorkflowStorage;
  private customBaseDir?: string;
  private migrationChecked: boolean = false;

  public static getInstance(): DiskWorkflowStorage {
    if (!DiskWorkflowStorage.instance) {
      DiskWorkflowStorage.instance = new DiskWorkflowStorage();
    }
    return DiskWorkflowStorage.instance;
  }

  constructor(customBaseDir?: string) {
    this.customBaseDir = customBaseDir;
  }

  public setCustomBaseDir(customBaseDir?: string): void {
    this.customBaseDir = customBaseDir;
  }

  /**
   * Get the directory where workflows are stored (~/.sentinel/workflows)
   */
  public getWorkflowsDir(): string {
    if (this.customBaseDir) {
      return this.customBaseDir;
    }
    const home = (typeof process !== 'undefined' && process.env && (process.env.HOME || process.env.USERPROFILE)) || '~';
    return path.join(home, '.sentinel', 'workflows');
  }

  /**
   * Slugify a workflow name to a lowercase filesystem-safe string.
   */
  public slugOf(name: string): string {
    return slug(name);
  }

  /**
   * Resolve canonical full path to a .flow workflow file given its name.
   */
  public getWorkflowFilePath(name: string): string {
    const cleanName = this.slugOf(name);
    return path.join(this.getWorkflowsDir(), `${cleanName}.flow`);
  }

  /**
   * Convert path to a shell-safe path expanding ~/ to $HOME/ inside quotes
   */
  public toShellPath(p: string): string {
    const quote = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
    if (p.startsWith('~/') || p.startsWith('~\\')) {
      return `"$HOME"/${quote(p.slice(2).replace(/\\/g, '/'))}`;
    }
    if (p === '~') {
      return '"$HOME"';
    }
    return quote(p);
  }

  /**
   * Check if a file exists on disk across Node, Tauri plugin-fs, or shell.
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      if (fs && fs.existsSync) {
        return fs.existsSync(filePath);
      }
    } catch {
      // Fallback
    }

    try {
      const { exists } = await import('@tauri-apps/plugin-fs');
      if (await exists(filePath)) {
        return true;
      }
    } catch {
      // Fallback
    }

    try {
      const res = await invoke<{ code: number }>('execute_command', {
        command: 'sh',
        args: ['-c', `test -f ${this.toShellPath(filePath)}`]
      });
      return res.code === 0;
    } catch {
      return false;
    }
  }

  /**
   * Read text content of a file across environments.
   */
  private async readFileText(filePath: string): Promise<string | null> {
    try {
      if (fs && fs.readFileSync && fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
    } catch {
      // Fallback
    }

    try {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      if (await exists(filePath)) {
        return await readTextFile(filePath);
      }
    } catch {
      // Fallback
    }

    try {
      const res = await invoke<{ stdout: string; code: number }>('execute_command', {
        command: 'sh',
        args: ['-c', `cat ${this.toShellPath(filePath)} 2>/dev/null`]
      });
      if (res.code === 0 && res.stdout) {
        return res.stdout;
      }
    } catch {
      // Fallback
    }

    return null;
  }

  /**
   * Write text content to a file across environments.
   */
  private async writeFileText(filePath: string, content: string): Promise<void> {
    await this.ensureDirExists();

    try {
      if (fs && fs.writeFileSync) {
        fs.writeFileSync(filePath, content, 'utf8');
        return;
      }
    } catch {
      // Fallback
    }

    try {
      const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
      const parentDir = path.dirname(filePath);
      if (!(await exists(parentDir))) {
        await mkdir(parentDir, { recursive: true });
      }
      await writeTextFile(filePath, content);
      return;
    } catch {
      // Fallback
    }

    const b64 = typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(content)))
      : Buffer.from(content, 'utf8').toString('base64');

    await invoke('execute_command', {
      command: 'sh',
      args: ['-c', `mkdir -p "$(dirname ${this.toShellPath(filePath)})" && echo "${b64}" | base64 -d > ${this.toShellPath(filePath)}`]
    });
  }

  /**
   * Ensure ~/.sentinel/workflows directory exists.
   */
  private async ensureDirExists(): Promise<void> {
    const dir = this.getWorkflowsDir();
    try {
      if (fs && fs.mkdirSync) {
        fs.mkdirSync(dir, { recursive: true });
        return;
      }
    } catch {
      // Fallback
    }

    try {
      const { mkdir, exists } = await import('@tauri-apps/plugin-fs');
      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
        return;
      }
    } catch {
      // Fallback
    }

    try {
      await invoke('execute_command', {
        command: 'sh',
        args: ['-c', `mkdir -p ${this.toShellPath(dir)}`]
      });
    } catch {
      // Ignore
    }
  }

  /**
   * List file names currently residing in the workflows directory.
   */
  private async listDirectoryFileNames(): Promise<string[]> {
    await this.ensureDirExists();
    const dir = this.getWorkflowsDir();

    let files: string[] = [];
    try {
      if (fs && fs.readdirSync) {
        files = fs.readdirSync(dir);
      }
    } catch {
      // Fallback
    }

    if (files.length === 0) {
      try {
        const { readDir, exists } = await import('@tauri-apps/plugin-fs');
        if (await exists(dir)) {
          const entries = await readDir(dir);
          files = entries.filter(e => e.isFile).map(e => e.name as string);
        }
      } catch {
        // Fallback
      }
    }

    if (files.length === 0) {
      try {
        const res = await invoke<{ stdout: string }>('execute_command', {
          command: 'sh',
          args: ['-c', `ls -1 ${this.toShellPath(dir)} 2>/dev/null`]
        });
        if (res.stdout.trim()) {
          files = res.stdout.trim().split('\n').map(p => path.basename(p.trim()));
        }
      } catch {
        return [];
      }
    }

    return files;
  }

  /**
   * Find an existing workflow file path for a name, comparing slug of name against
   * slug of file names. Prefers .flow over legacy .json.
   */
  private async findWorkflowFile(name: string): Promise<string | null> {
    const targetSlug = this.slugOf(name);
    const dir = this.getWorkflowsDir();

    // 1. Direct match: <targetSlug>.flow
    const directFlow = path.join(dir, `${targetSlug}.flow`);
    if (await this.fileExists(directFlow)) {
      return directFlow;
    }

    // 2. Scan directory files for slug match with .flow
    const allFiles = await this.listDirectoryFileNames();
    for (const f of allFiles) {
      if (f.toLowerCase().endsWith('.flow')) {
        const base = f.slice(0, -5);
        if (this.slugOf(base) === targetSlug) {
          return path.join(dir, f);
        }
      }
    }

    // 3. Direct match: <targetSlug>.json (legacy)
    const directJson = path.join(dir, `${targetSlug}.json`);
    if (await this.fileExists(directJson)) {
      return directJson;
    }

    // 4. Scan directory files for slug match with .json
    for (const f of allFiles) {
      if (f.toLowerCase().endsWith('.json') && !f.endsWith('.json.bak')) {
        const base = f.slice(0, -5);
        if (this.slugOf(base) === targetSlug) {
          return path.join(dir, f);
        }
      }
    }

    return null;
  }

  /**
   * Save a workflow definition to disk as a canonical .flow document.
   */
  public async saveWorkflow(workflow: SavedWorkflowDefinition): Promise<string> {
    await this.ensureDirExists();
    const filePath = this.getWorkflowFilePath(workflow.name);

    const versionedWorkflow: SavedWorkflowDefinition = {
      ...workflow,
      schemaVersion: workflow.schemaVersion || CURRENT_WORKFLOW_SCHEMA_VERSION,
      updatedAt: Date.now()
    };

    const flowDoc = workflowToFlow(versionedWorkflow);
    const content = JSON.stringify(flowDoc, null, 2) + '\n';

    await this.writeFileText(filePath, content);
    return filePath;
  }

  /**
   * Load a workflow definition from disk by name.
   * Checks for <slug>.flow first, then legacy <slug>.json.
   * Parses either format into a full SavedWorkflowDefinition.
   */
  public async loadWorkflow(name: string): Promise<SavedWorkflowDefinition | null> {
    const filePath = await this.findWorkflowFile(name);
    if (!filePath) {
      return null;
    }

    const text = await this.readFileText(filePath);
    if (!text || !text.trim()) {
      return null;
    }

    const baseName = path.basename(filePath).replace(/\.(?:flow|json)$/i, '');
    return this.parseAndMigrate(text, baseName);
  }

  /**
   * Parse workflow JSON and migrate if schemaVersion is missing, legacy, or .flow actions.
   */
  public parseAndMigrate(rawJson: string, defaultName?: string): SavedWorkflowDefinition {
    const raw = JSON.parse(rawJson);

    // 1. Actions document (.flow format)
    if (Array.isArray(raw.actions)) {
      const os = getPlatform() === 'linux' ? 'linux' : getPlatform() === 'windows' ? 'windows' : 'macos';
      const parsedFlow = flowToWorkflow(raw, defaultName || raw.metadata?.name || 'unnamed-workflow', os);
      if (parsedFlow) {
        return parsedFlow;
      }
    }

    // 2. Check for future unsupported schema
    if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > CURRENT_WORKFLOW_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported workflow schema version ${raw.schemaVersion} for workflow "${raw.name}". Sentinel supports up to version ${CURRENT_WORKFLOW_SCHEMA_VERSION}.`
      );
    }

    // 3. SchemaVersion 1 steps array format
    if (raw.schemaVersion === CURRENT_WORKFLOW_SCHEMA_VERSION && Array.isArray(raw.steps)) {
      const validatedSteps: WorkflowStepDefinition[] = raw.steps.map((s: any, idx: number) => {
        if (typeof s === 'string') {
          return {
            id: `step-${idx + 1}`,
            name: `Step ${idx + 1}`,
            command: s
          };
        }
        return {
          id: s.id || `step-${idx + 1}`,
          name: s.name || `Step ${idx + 1}`,
          command: s.command || '',
          cwd: s.cwd,
          timeoutMs: s.timeoutMs,
          expectedExitCode: s.expectedExitCode,
          validationCriteria: s.validationCriteria,
          dependsOn: s.dependsOn,
          isDestructive: s.isDestructive,
          precondition_check: s.precondition_check,
          if_precondition_true: s.if_precondition_true,
          if_precondition_false: s.if_precondition_false,
          platformCommands: s.platformCommands
        };
      });

      return {
        schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
        name: raw.name || defaultName || 'unnamed-workflow',
        description: raw.description,
        steps: validatedSteps,
        parameters: raw.parameters || [],
        environmentPrerequisites: raw.environmentPrerequisites,
        createdAt: raw.createdAt || Date.now(),
        updatedAt: raw.updatedAt || Date.now(),
        author: raw.author,
        tags: raw.tags || []
      };
    }

    // 4. Auto-migration from legacy unversioned structure
    const migratedSteps: WorkflowStepDefinition[] = Array.isArray(raw.steps)
      ? raw.steps.map((s: any, idx: number) => ({
          id: `step-${idx + 1}`,
          name: typeof s === 'object' && s.name ? s.name : `Step ${idx + 1}`,
          command: typeof s === 'string' ? s : s.command || ''
        }))
      : [];

    return {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      name: raw.name || defaultName || 'unnamed-workflow',
      description: raw.description || 'Migrated from legacy unversioned workflow',
      steps: migratedSteps,
      parameters: [],
      createdAt: raw.createdAt || Date.now(),
      updatedAt: Date.now(),
      tags: ['migrated']
    };
  }

  /**
   * Check if a workflow exists by name or slug.
   */
  public async hasWorkflow(name: string): Promise<boolean> {
    const file = await this.findWorkflowFile(name);
    return file !== null;
  }

  /**
   * List all saved workflows.
   * Handles both .flow and legacy .json; when both exist for one name,
   * the .flow wins and the list shows it only once.
   */
  public async listWorkflows(): Promise<SavedWorkflowDefinition[]> {
    // Run one-time legacy migration check if needed
    if (!this.migrationChecked) {
      this.migrationChecked = true;
      try {
        await this.migrateLegacyJsonWorkflows();
      } catch {
        // Migration errors should not block listing
      }
    }

    const allFiles = await this.listDirectoryFileNames();
    const candidateFiles = allFiles.filter(f => /\.(?:flow|json)$/i.test(f) && !f.endsWith('.json.bak'));

    // Map: targetSlug -> { fileName, isFlow }
    const chosen = new Map<string, { fileName: string; isFlow: boolean }>();

    for (const f of candidateFiles) {
      const isFlow = f.toLowerCase().endsWith('.flow');
      const base = f.replace(/\.(?:flow|json)$/i, '');
      const s = this.slugOf(base);

      const existing = chosen.get(s);
      if (!existing) {
        chosen.set(s, { fileName: f, isFlow });
      } else if (isFlow && !existing.isFlow) {
        // .flow wins over .json
        chosen.set(s, { fileName: f, isFlow });
      }
    }

    const results: SavedWorkflowDefinition[] = [];
    const dir = this.getWorkflowsDir();

    for (const { fileName } of chosen.values()) {
      const filePath = path.join(dir, fileName);
      const text = await this.readFileText(filePath);
      if (text && text.trim()) {
        try {
          const baseName = fileName.replace(/\.(?:flow|json)$/i, '');
          const wf = this.parseAndMigrate(text, baseName);
          results.push(wf);
        } catch {
          // Skip unparseable files
        }
      }
    }

    return results;
  }

  /**
   * Delete a saved workflow by name (removes both .flow and legacy .json if present).
   */
  public async deleteWorkflow(name: string): Promise<boolean> {
    const targetSlug = this.slugOf(name);
    const dir = this.getWorkflowsDir();
    const allFiles = await this.listDirectoryFileNames();

    let anyDeleted = false;
    for (const f of allFiles) {
      if (/\.(?:flow|json)$/i.test(f)) {
        const base = f.replace(/\.(?:flow|json)$/i, '');
        if (this.slugOf(base) === targetSlug) {
          const fullPath = path.join(dir, f);
          try {
            if (fs && fs.unlinkSync) {
              fs.unlinkSync(fullPath);
              anyDeleted = true;
              continue;
            }
          } catch {
            // fallback
          }

          try {
            const { remove, exists } = await import('@tauri-apps/plugin-fs');
            if (await exists(fullPath)) {
              await remove(fullPath);
              anyDeleted = true;
              continue;
            }
          } catch {
            // fallback
          }

          try {
            const res = await invoke<{ code: number }>('execute_command', {
              command: 'sh',
              args: ['-c', `rm -f ${this.toShellPath(fullPath)}`]
            });
            if (res.code === 0) anyDeleted = true;
          } catch {
            // ignore
          }
        }
      }
    }

    return anyDeleted;
  }

  /**
   * Purge all saved workflows in the workflows directory.
   */
  public async purgeAllWorkflows(): Promise<number> {
    const list = await this.listWorkflows();
    let deletedCount = 0;
    for (const wf of list) {
      const ok = await this.deleteWorkflow(wf.name);
      if (ok) deletedCount++;
    }
    return deletedCount;
  }

  /**
   * Purge known test and benchmark stub workflows.
   */
  public async purgeTestStubs(): Promise<string[]> {
    const list = await this.listWorkflows();
    const deletedNames: string[] = [];

    const KNOWN_TEST_STUBS = new Set([
      'desktop-reset',
      'db-sync',
      'dev-boot',
      'release-gate',
      'dry-run-pipeline',
      'param-test-workflow',
      'test-port-replay',
      'cargo-build-flow',
      'cargo-build',
      'curl-check-pipeline',
      'deploy-service',
      'get-date',
      'get-time-wf',
      'my-ci-pipeline',
      'my-scoped-pipeline',
      'scoped-pipeline',
      'productive'
    ]);

    for (const wf of list) {
      const isKnownStub = KNOWN_TEST_STUBS.has(wf.name.toLowerCase());
      const hasEmptySteps = !wf.steps || wf.steps.length === 0;
      const isAutoRecorded = wf.description?.includes('Auto-recorded workflow for task') || false;
      const isMigratedEmpty = wf.tags?.includes('migrated') && wf.steps.length === 0;

      if (isKnownStub || hasEmptySteps || isAutoRecorded || isMigratedEmpty) {
        const ok = await this.deleteWorkflow(wf.name);
        if (ok) {
          deletedNames.push(wf.name);
        }
      }
    }

    return deletedNames;
  }

  /**
   * Initialize starter workflows from the curated catalog.
   */
  public async initializeStarterWorkflows(
    selectedWorkflowIds: string[],
    purgeExisting: boolean = false
  ): Promise<SavedWorkflowDefinition[]> {
    if (purgeExisting) {
      await this.purgeAllWorkflows();
    }

    const saved: SavedWorkflowDefinition[] = [];

    for (const id of selectedWorkflowIds) {
      const starter = getStarterWorkflowById(id);
      if (starter) {
        await this.saveWorkflow(starter.definition);
        saved.push(starter.definition);
      }
    }

    return saved;
  }

  /**
   * Migration of old files:
   * Guarded by marker file ~/.sentinel/workflows/.migrated-flow.
   * For every x.json in the workflows folder that parses as a workflow and has no
   * x.flow next to it: write x.flow, then rename the original to x.json.bak. Never delete.
   * Returns count of converted workflows.
   */
  public async migrateLegacyJsonWorkflows(): Promise<number> {
    await this.ensureDirExists();
    const dir = this.getWorkflowsDir();
    const markerPath = path.join(dir, '.migrated-flow');

    if (await this.fileExists(markerPath)) {
      return 0;
    }

    const allFiles = await this.listDirectoryFileNames();
    const jsonFiles = allFiles.filter(f => f.toLowerCase().endsWith('.json') && !f.endsWith('.json.bak'));

    let converted = 0;

    for (const jf of jsonFiles) {
      const baseName = jf.slice(0, -5);
      const flowName = `${this.slugOf(baseName)}.flow`;
      const flowPath = path.join(dir, flowName);
      const jsonPath = path.join(dir, jf);

      // Only convert if no .flow already exists
      if (!(await this.fileExists(flowPath))) {
        const content = await this.readFileText(jsonPath);
        if (content && content.trim()) {
          try {
            const parsed = this.parseAndMigrate(content, baseName);
            if (parsed && parsed.steps) {
              const flowDoc = workflowToFlow(parsed);
              const flowText = JSON.stringify(flowDoc, null, 2) + '\n';
              await this.writeFileText(flowPath, flowText);

              // Rename original to x.json.bak
              const bakPath = path.join(dir, `${jf}.bak`);
              try {
                if (fs && fs.renameSync) {
                  fs.renameSync(jsonPath, bakPath);
                } else {
                  await invoke('execute_command', {
                    command: 'sh',
                    args: ['-c', `mv ${this.toShellPath(jsonPath)} ${this.toShellPath(bakPath)}`]
                  });
                }
              } catch {
                // If rename fails, keep going
              }

              converted++;
            }
          } catch {
            // Not a valid workflow json, skip
          }
        }
      }
    }

    // Write marker file
    try {
      await this.writeFileText(markerPath, `migrated_at=${Date.now()}\nconverted=${converted}\n`);
    } catch {
      // ignore
    }

    return converted;
  }
}
