/**
 * WorkflowStorage.ts — Versioned JSON Persistence Layer
 *
 * Responsible ONLY for persistence. Discovery is handled by WorkflowRegistry.
 * Supports save with version snapshots, load, list, delete, rollback, and migration.
 */

import { UserWorkflow, WorkflowVersion } from '../models/WorkflowTypes';

export class WorkflowStorage {
  private workflows: Map<string, UserWorkflow> = new Map();
  private versionHistory: Map<string, WorkflowVersion[]> = new Map();

  /**
   * Save a workflow, creating a new version snapshot.
   */
  public save(workflow: UserWorkflow, changeDescription = 'Updated'): void {
    const existing = this.workflows.get(workflow.id);
    if (existing) {
      // Create version snapshot of current state before overwriting
      const versions = this.versionHistory.get(workflow.id) || [];
      versions.push({
        version: existing.metadata.version,
        snapshot: JSON.parse(JSON.stringify(existing)),
        savedAt: Date.now(),
        changeDescription,
      });
      this.versionHistory.set(workflow.id, versions);
    }

    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Load a workflow by ID.
   */
  public load(id: string): UserWorkflow | undefined {
    return this.workflows.get(id);
  }

  /**
   * List all stored workflow IDs and metadata summaries.
   */
  public list(): Array<{ id: string; description: string; version: string; updatedAt: number }> {
    return Array.from(this.workflows.values()).map(w => ({
      id: w.id,
      description: w.metadata.description,
      version: w.metadata.version,
      updatedAt: w.metadata.updatedAt,
    }));
  }

  /**
   * Delete a workflow and its version history.
   */
  public delete(id: string): boolean {
    this.versionHistory.delete(id);
    return this.workflows.delete(id);
  }

  /**
   * Get version history for a workflow.
   */
  public getVersionHistory(id: string): WorkflowVersion[] {
    return this.versionHistory.get(id) || [];
  }

  /**
   * Rollback a workflow to a specific version.
   */
  public rollback(id: string, version: string): UserWorkflow | undefined {
    const versions = this.versionHistory.get(id) || [];
    const target = versions.find(v => v.version === version);
    if (!target) return undefined;

    this.save(target.snapshot, `Rollback to version ${version}`);
    return target.snapshot;
  }

  /**
   * Export a workflow as a self-contained JSON string.
   */
  public exportAsJSON(id: string): string | undefined {
    const wf = this.workflows.get(id);
    if (!wf) return undefined;
    return JSON.stringify({
      format: 'cero-workflow-v1',
      exportedAt: Date.now(),
      workflow: wf,
      checksum: this.computeChecksum(wf),
    }, null, 2);
  }

  /**
   * Import a workflow from a JSON string.
   */
  public importFromJSON(jsonStr: string): UserWorkflow | undefined {
    try {
      const payload = JSON.parse(jsonStr);
      if (payload.format !== 'cero-workflow-v1' || !payload.workflow) {
        return undefined;
      }
      const wf = payload.workflow as UserWorkflow;
      this.save(wf, 'Imported from external source');
      return wf;
    } catch {
      return undefined;
    }
  }

  private computeChecksum(wf: UserWorkflow): string {
    const str = JSON.stringify(wf);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  public clear(): void {
    this.workflows.clear();
    this.versionHistory.clear();
  }
}

export const globalWorkflowStorage = new WorkflowStorage();
