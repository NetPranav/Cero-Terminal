import { describe, it, expect } from 'vitest';
import { flowToWorkflow, parseWorkflowFile, isWorkflowFilePath } from './FlowImport';

const MORNING = {
  schemaVersion: '1.0',
  metadata: { id: 'morning_ai_workspace', name: 'Morning AI Workspace', description: 'Opens AI tools', tags: ['daily'] },
  actions: [
    { type: 'browser', name: 'Open AI Assistant Suite in Safari', app: 'safari', urls: ['https://claude.ai', 'https://chatgpt.com'], tabs: true },
    { type: 'browser', name: 'Open YouTube in Google Chrome', app: 'chrome', urls: ['https://www.youtube.com'] },
    { type: 'app', name: 'Launch Antigravity Application', app: 'Antigravity' },
    { type: 'mystery', name: 'Unknown' },
  ]
};

describe('flowToWorkflow', () => {
  it('maps browser and app actions to macOS commands', () => {
    const wf = flowToWorkflow(MORNING, 'x', 'macos')!;
    expect(wf.name).toBe('morning_ai_workspace');
    expect(wf.steps.map(s => s.command)).toEqual([
      "open -a 'Safari' 'https://claude.ai' 'https://chatgpt.com'",
      "open -a 'Google Chrome' 'https://www.youtube.com'",
      "open -a 'Antigravity'",
    ]);
    expect(wf.tags).toContain('flow');
  });

  it('maps the same actions to Linux commands', () => {
    const wf = flowToWorkflow(MORNING, 'x', 'linux')!;
    expect(wf.steps[0].command).toBe("xdg-open 'https://claude.ai' && xdg-open 'https://chatgpt.com'");
    expect(wf.steps[1].command).toBe("setsid -f google-chrome 'https://www.youtube.com' >/dev/null 2>&1");
    expect(wf.steps[2].command).toBe("setsid -f 'antigravity' >/dev/null 2>&1");
  });

  it('maps the same actions to Windows commands', () => {
    const wf = flowToWorkflow(MORNING, 'x', 'windows')!;
    expect(wf.steps.map(s => s.command)).toEqual([
      "Start-Process 'https://claude.ai'; Start-Process 'https://chatgpt.com'",
      "Start-Process chrome -ArgumentList 'https://www.youtube.com'",
      "Start-Process 'Antigravity'",
    ]);
  });

  it('drops non-web URLs and quotes app names so a file cannot inject commands', () => {
    const wf = flowToWorkflow({ actions: [
      { type: 'browser', urls: ['javascript:alert(1)', 'file:///etc/passwd'] },
      { type: 'app', app: "Evil'; rm -rf ~; '" },
    ] }, 'x', 'macos')!;
    expect(wf.steps).toHaveLength(1);
    expect(wf.steps[0].command).toBe("open -a 'Evil'\\''; rm -rf ~; '\\'''");
  });
});

describe('parseWorkflowFile', () => {
  it('reads both formats and rejects anything else', () => {
    expect(parseWorkflowFile(JSON.stringify(MORNING), '/x/morning.flow', 'macos')?.steps).toHaveLength(3);
    const steps = parseWorkflowFile(JSON.stringify({ name: 'deploy', steps: [{ command: 'npm run build' }] }), '/x/deploy.workflow.json', 'linux')!;
    expect(steps.steps[0]).toMatchObject({ id: 'step-1', name: 'Step 1', command: 'npm run build' });
    expect(parseWorkflowFile('{"steps":[{"cmd":1}]}', 'a.json', 'linux')).toBeNull();
    expect(parseWorkflowFile('not json', 'a.flow', 'linux')).toBeNull();
  });

  it('recognises workflow file paths', () => {
    expect(isWorkflowFilePath('/Users/u/Downloads/morning.flow')).toBe(true);
    expect(isWorkflowFilePath('/tmp/deploy.workflow.json')).toBe(true);
    expect(isWorkflowFilePath('/Users/u/.sentinel/workflows/git-quick-sync.json')).toBe(true);
    expect(isWorkflowFilePath('/Users/u/package.json')).toBe(false);
  });
});
