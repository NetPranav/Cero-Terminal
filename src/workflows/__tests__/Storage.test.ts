import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowStorage } from '../storage/WorkflowStorage';
import { WorkflowRegistry } from '../registry/WorkflowRegistry';
import { WorkflowSharing } from '../sharing/WorkflowSharing';
import { WorkflowBuilder } from '../builder/WorkflowBuilder';

describe('WorkflowStorage, Registry & Sharing — Versioned Persistence & Discovery', () => {
  let storage: WorkflowStorage;
  let registry: WorkflowRegistry;
  let sharing: WorkflowSharing;

  beforeEach(() => {
    storage = new WorkflowStorage();
    registry = new WorkflowRegistry(true);
    sharing = new WorkflowSharing();
  });

  it('should save, load, list, and delete workflows with versioned history snapshots', () => {
    const wf = new WorkflowBuilder('Versioned Workflow')
      .addAction('s', 'Step', 'system.noop')
      .build();

    storage.save(wf, 'Initial save');
    expect(storage.load(wf.id)).toBeDefined();
    expect(storage.list().length).toBe(1);

    // Update the workflow — old version should be preserved
    const updated = { ...wf, metadata: { ...wf.metadata, version: '2.0.0', updatedAt: Date.now() } };
    storage.save(updated, 'Bumped version');

    const versions = storage.getVersionHistory(wf.id);
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe('1.0.0');

    // Rollback
    const rolled = storage.rollback(wf.id, '1.0.0');
    expect(rolled).toBeDefined();
    expect(rolled!.metadata.version).toBe('1.0.0');

    storage.delete(wf.id);
    expect(storage.load(wf.id)).toBeUndefined();
  });

  it('should register 6 built-in templates and support instantiation into UserWorkflows via Registry', () => {
    const templates = registry.getAllTemplates();
    expect(templates.length).toBe(6);

    const userWf = registry.instantiateFromTemplate('tpl-morning-development');
    expect(userWf).toBeDefined();
    expect(userWf!.templateId).toBe('tpl-morning-development');
    expect(userWf!.nodes.length).toBeGreaterThan(0);
  });

  it('should export and import workflows with checksum validation and fresh ID assignment', () => {
    const wf = new WorkflowBuilder('Shared Workflow')
      .addAction('s', 'Step', 'system.noop')
      .build();

    const payload = sharing.exportWorkflow(wf);
    expect(payload.format).toBe('cero-workflow-v1');
    expect(payload.checksum).toBeDefined();

    const result = sharing.importWorkflow(payload);
    expect(result.valid).toBe(true);
    expect(result.workflow).toBeDefined();
    expect(result.workflow!.id).not.toBe(wf.id); // Fresh ID
  });

  it('should support JSON string export and import via WorkflowStorage', () => {
    const wf = new WorkflowBuilder('JSON Workflow')
      .addAction('s', 'Step', 'system.noop')
      .build();

    storage.save(wf);
    const json = storage.exportAsJSON(wf.id);
    expect(json).toBeDefined();

    storage.clear();
    const imported = storage.importFromJSON(json!);
    expect(imported).toBeDefined();
    expect(storage.load(imported!.id)).toBeDefined();
  });

  it('should search across templates, user workflows, and plugin workflows via Registry', () => {
    const wf = new WorkflowBuilder('Custom Docker Setup')
      .setDescription('Custom Docker Setup')
      .addTag('docker')
      .addAction('s', 'Step', 'system.noop')
      .build();
    registry.registerUserWorkflow(wf);

    const results = registry.search('docker');
    expect(results.length).toBeGreaterThanOrEqual(2); // built-in template + user workflow
    expect(results.some(r => r.type === 'template')).toBe(true);
    expect(results.some(r => r.type === 'user')).toBe(true);
  });
});
