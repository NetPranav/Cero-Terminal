/**
 * WorkflowSharing.ts — Import/Export & Sharing Utilities
 *
 * Exports workflows as self-contained versioned JSON payloads.
 * Imports and validates external workflow definitions with version compatibility checking.
 */

import { UserWorkflow, WorkflowExportPayload } from '../models/WorkflowTypes';

export class WorkflowSharing {
  /**
   * Export a workflow as a self-contained payload for sharing.
   */
  public exportWorkflow(workflow: UserWorkflow): WorkflowExportPayload {
    return {
      format: 'cero-workflow-v1',
      exportedAt: Date.now(),
      workflow: JSON.parse(JSON.stringify(workflow)),
      templateId: workflow.templateId,
      checksum: this.computeChecksum(workflow),
    };
  }

  /**
   * Import a workflow from an export payload with validation.
   */
  public importWorkflow(payload: WorkflowExportPayload): {
    workflow?: UserWorkflow;
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (payload.format !== 'cero-workflow-v1') {
      errors.push(`Unsupported format: '${payload.format}'. Expected 'cero-workflow-v1'.`);
      return { valid: false, errors };
    }

    if (!payload.workflow || !payload.workflow.id) {
      errors.push('Invalid payload: missing workflow definition or ID.');
      return { valid: false, errors };
    }

    if (!payload.workflow.nodes || !Array.isArray(payload.workflow.nodes)) {
      errors.push('Invalid payload: workflow nodes must be an array.');
      return { valid: false, errors };
    }

    // Verify checksum integrity
    const computed = this.computeChecksum(payload.workflow);
    if (payload.checksum && computed !== payload.checksum) {
      errors.push(`Checksum mismatch: expected '${payload.checksum}', computed '${computed}'. Payload may have been corrupted.`);
      // Non-fatal: allow import with warning
    }

    // Assign a fresh ID to avoid collisions
    const now = Date.now();
    const imported: UserWorkflow = {
      ...payload.workflow,
      id: `wf-imported-${now}-${Math.random().toString(36).substring(2, 6)}`,
      metadata: {
        ...payload.workflow.metadata,
        updatedAt: now,
      },
      executionCount: 0,
      lastExecutedAt: undefined,
    };

    return { workflow: imported, valid: true, errors };
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
}

export const globalWorkflowSharing = new WorkflowSharing();
