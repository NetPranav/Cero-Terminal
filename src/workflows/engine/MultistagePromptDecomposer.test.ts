import { describe, it, expect, beforeEach } from 'vitest';
import { MultistagePromptDecomposer } from './MultistagePromptDecomposer';

describe('MultistagePromptDecomposer', () => {
  let decomposer: MultistagePromptDecomposer;

  beforeEach(() => {
    decomposer = new MultistagePromptDecomposer();
  });

  it('correctly identifies multi-stage composite prompts', () => {
    expect(decomposer.isMultistagePrompt('deploy staging: build frontend, package container, and verify health check')).toBe(true);
    expect(decomposer.isMultistagePrompt('first clean target directory, then compile with cargo, after that run tests')).toBe(true);
    expect(decomposer.isMultistagePrompt('step 1: git pull step 2: npm test')).toBe(true);
    expect(decomposer.isMultistagePrompt('1. build frontend 2. docker build 3. health check')).toBe(true);

    // Single simple commands are NOT multi-stage
    expect(decomposer.isMultistagePrompt('show disk usage')).toBe(false);
    expect(decomposer.isMultistagePrompt('git status')).toBe(false);
    expect(decomposer.isMultistagePrompt('what is my ip')).toBe(false);
  });

  it('decomposes composite staging deployment prompt into structured DAG', () => {
    const prompt = 'deploy staging: build frontend, package container, push to registry, run migration, and verify health check on port 8080';
    const plan = decomposer.decompose(prompt, { cwd: '/home/user/project' });

    expect(plan.name).toBe('deploy-staging');
    expect(plan.stages.length).toBeGreaterThanOrEqual(4);

    // Dependencies chain sequentially
    expect(plan.stages[0].dependencies).toEqual([]);
    expect(plan.stages[1].dependencies).toEqual(['stage-1']);
    expect(plan.stages[2].dependencies).toEqual(['stage-2']);

    // Parameters extracted
    const portParam = plan.detectedParameters.find(p => p.name === 'PORT');
    expect(portParam).toBeDefined();
    expect(portParam?.defaultValue).toBe(8080);

    // Prerequisites extracted
    expect(plan.prerequisites.requiredPorts).toContain(8080);
    expect(plan.prerequisites.requiredBinaries).toContain('curl');
  });

  it('decomposes sequential "first... then... after that..." connectives', () => {
    const prompt = 'first clean build, then build backend with cargo, after that run test with cargo';
    const plan = decomposer.decompose(prompt);

    expect(plan.stages).toHaveLength(3);
    expect(plan.stages[0].name).toContain('Clean');
    expect(plan.stages[0].isDestructive).toBe(true);
    expect(plan.stages[1].inferredCommand).toContain('cargo build');
    expect(plan.stages[2].inferredCommand).toContain('cargo test');
  });

  it('converts decomposed plan to a valid SavedWorkflowDefinition with schemaVersion 1', () => {
    const prompt = 'deploy staging: build frontend, package container, and verify health check on port 9000';
    const plan = decomposer.decompose(prompt);
    const savedWorkflow = decomposer.toSavedWorkflow(plan);

    expect(savedWorkflow.schemaVersion).toBe(1);
    expect(savedWorkflow.name).toBe('deploy-staging');
    expect(savedWorkflow.steps.length).toBeGreaterThanOrEqual(2);
    expect(savedWorkflow.steps[0].command).toBeTruthy();
    expect(savedWorkflow.environmentPrerequisites?.requiredPorts).toContain(9000);
  });

  describe('Workflow Creation Directives & Scoped Parsers', () => {
    it('extracts ":: save as workflow <name>" and ":: save workflow <name>" directives', () => {
      const res1 = decomposer.extractSaveAsDirective('build frontend, package container :: save as workflow my-ci');
      expect(res1.isSaveAsWorkflow).toBe(true);
      expect(res1.taskPrompt).toBe('build frontend, package container');
      expect(res1.workflowName).toBe('my-ci');

      const res2 = decomposer.extractSaveAsDirective('cargo build :: save workflow rust-build');
      expect(res2.isSaveAsWorkflow).toBe(true);
      expect(res2.taskPrompt).toBe('cargo build');
      expect(res2.workflowName).toBe('rust-build');

      const res3 = decomposer.extractSaveAsDirective('> npm test :: save as workflow "test-suite"');
      expect(res3.isSaveAsWorkflow).toBe(true);
      expect(res3.taskPrompt).toBe('npm test');
      expect(res3.workflowName).toBe('test-suite');

      const res4 = decomposer.extractSaveAsDirective('just a normal command');
      expect(res4.isSaveAsWorkflow).toBe(false);
      expect(res4.taskPrompt).toBe('just a normal command');
      expect(res4.workflowName).toBeUndefined();
    });

    it('parses scoped retrospective save syntax "save [as] workflow <name> [last N [commands|steps]]"', () => {
      const p1 = decomposer.parseScopedWorkflowSave('save workflow deploy-stg');
      expect(p1).toEqual({ isSaveWorkflow: true, workflowName: 'deploy-stg', maxSteps: 10 });

      const p2 = decomposer.parseScopedWorkflowSave('save as workflow deploy-stg last 3 commands');
      expect(p2).toEqual({ isSaveWorkflow: true, workflowName: 'deploy-stg', maxSteps: 3 });

      const p3 = decomposer.parseScopedWorkflowSave('save workflow custom-flow 5 steps');
      expect(p3).toEqual({ isSaveWorkflow: true, workflowName: 'custom-flow', maxSteps: 5 });

      const p4 = decomposer.parseScopedWorkflowSave('save as workflow prod-flow with last 4 steps');
      expect(p4).toEqual({ isSaveWorkflow: true, workflowName: 'prod-flow', maxSteps: 4 });

      const p5 = decomposer.parseScopedWorkflowSave('> save workflow my-pipeline -n 2');
      expect(p5).toEqual({ isSaveWorkflow: true, workflowName: 'my-pipeline', maxSteps: 2 });

      const p6 = decomposer.parseScopedWorkflowSave('not a save command');
      expect(p6).toBeNull();
    });

    it('decomposes composite prompt with trailing ":: save as workflow <name>" into clean DAG without directive pollution', () => {
      const prompt = 'deploy staging: build frontend, package container, and verify health check on port 8080 :: save as workflow staging-deploy-v1';
      
      expect(decomposer.isMultistagePrompt(prompt)).toBe(true);

      const plan = decomposer.decompose(prompt);
      expect(plan.name).toBe('staging-deploy-v1');
      expect(plan.stages.length).toBeGreaterThanOrEqual(3);

      // Verify no stage contains directive syntax
      for (const stage of plan.stages) {
        expect(stage.rawPrompt).not.toContain('save as workflow');
        expect(stage.inferredCommand).not.toContain('save as workflow');
      }

      const saved = decomposer.toSavedWorkflow(plan);
      expect(saved.name).toBe('staging-deploy-v1');
      expect(saved.schemaVersion).toBe(1);
    });

    it('infers explicit precondition checks and handlers (Task 0.75.2)', () => {
      const prompt = 'first install neovim, then build frontend, after that free port 3000';
      const plan = decomposer.decompose(prompt);

      expect(plan.stages).toHaveLength(3);

      // Stage 1: Install neovim -> should have precondition check 'which neovim' with if_precondition_true = 'skip'
      const installStage = plan.stages[0];
      expect(installStage.precondition_check).toContain('neovim');
      expect(installStage.if_precondition_true).toBe('skip');
      expect(installStage.if_precondition_false).toBe('continue');

      // Stage 2: Build frontend -> should have precondition check 'test -f package.json' with if_precondition_false = 'abort'
      const buildStage = plan.stages[1];
      expect(buildStage.precondition_check).toBe('test -f package.json');
      expect(buildStage.if_precondition_true).toBe('continue');
      expect(buildStage.if_precondition_false).toBe('abort');

      // Stage 3: Free port 3000 -> precondition check port listener, if_precondition_false = 'skip'
      const portStage = plan.stages[2];
      expect(portStage.precondition_check).toContain('3000');
      expect(portStage.if_precondition_false).toBe('skip');

      // Verify persistence mapping
      const saved = decomposer.toSavedWorkflow(plan);
      expect(saved.steps[0].precondition_check).toBe(installStage.precondition_check);
      expect(saved.steps[0].if_precondition_true).toBe('skip');
      expect(saved.steps[1].precondition_check).toBe(buildStage.precondition_check);
      expect(saved.steps[1].if_precondition_false).toBe('abort');
    });
  });
});
