import { describe, it, expect } from 'vitest';
import { parseWorkflowRequest, matchWorkflowNames } from './WorkflowRequest';

describe('parseWorkflowRequest', () => {
  it('recognises workflow files and saved names', () => {
    expect(parseWorkflowRequest('run the workflow in wf/build.workflow.json')).toEqual({ kind: 'file', path: 'wf/build.workflow.json' });
    expect(parseWorkflowRequest('run morning.flow')).toEqual({ kind: 'file', path: 'morning.flow' });
    expect(parseWorkflowRequest('execute the deploy.json workflow')).toEqual({ kind: 'file', path: 'deploy.json' });
    expect(parseWorkflowRequest('run my nightly workflow')).toEqual({ kind: 'name', name: 'nightly' });
    expect(parseWorkflowRequest("run the workflow called 'git quick sync'")).toEqual({ kind: 'name', name: 'git quick sync' });
  });

  it('leaves other requests alone', () => {
    for (const goal of ['run npm test', 'run the tests', 'create a workflow', 'run ls in tab 2', 'run package.json scripts', 'open a new tab']) {
      expect(parseWorkflowRequest(goal), goal).toBeNull();
    }
  });

  it('matches saved names loosely but reports ambiguity', () => {
    expect(matchWorkflowNames('git quick sync', ['git-quick-sync', 'deploy'])).toEqual(['git-quick-sync']);
    expect(matchWorkflowNames('deploy', ['deploy-staging', 'deploy-prod'])).toEqual(['deploy-staging', 'deploy-prod']);
  });
});
