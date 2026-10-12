import { describe, it, expect } from 'vitest';
import { planChain, splitChainClauses, resolveFolder } from './ChainPlanner';

describe('splitChainClauses', () => {
  it('splits on sequence words, commas and "and" that start a new action', () => {
    expect(splitChainClauses('create a folder called chain-demo here, go into it, initialize a git repository, create a package.json with npm init -y and then list the files')).toEqual([
      'create a folder called chain-demo here',
      'go into it',
      'initialize a git repository',
      'create a package.json with npm init -y',
      'list the files',
    ]);
  });

  it('keeps "and" inside a single action together', () => {
    expect(splitChainClauses('show cpu and memory usage')).toBeNull();
    expect(splitChainClauses('create a folder called rock and roll')).toBeNull();
  });
});

describe('planChain', () => {
  it('turns the classic project set-up chain into commands with the folder carried along', () => {
    const plan = planChain('create a folder called chain-demo here, go into it, initialize a git repository, create a package.json with npm init -y and then list the files', 'windows')!;
    expect(plan.steps.map(s => s.command ?? `(enter ${s.enter})`)).toEqual([
      'New-Item -ItemType Directory -Force -Path chain-demo | Out-Null',
      '(enter chain-demo)',
      'git init',
      'npm init -y',
      'Get-ChildItem -Force',
    ]);
    expect(plan.steps.every(s => !s.longRunning)).toBe(true);
  });

  it('clones, enters the clone, installs dependencies and opens it in VS Code', () => {
    const plan = planChain('clone https://github.com/sindresorhus/is into lib-is, go into it, install the dependencies and open it in vs code', 'windows')!;
    expect(plan.steps[0].command).toBe('git clone --depth 1 https://github.com/sindresorhus/is lib-is');
    expect(plan.steps[1].enter).toBe('lib-is');
    expect(plan.steps[2].command).toContain('npm install');
    expect(plan.steps[3].command).toBe('code .');
  });

  it('marks servers and log followers as long-running (they get a pane)', () => {
    const plan = planChain('go to site, then run `python -m http.server 8000`, then follow access.log', 'windows')!;
    expect(plan.steps[0].enter).toBe('site');
    expect(plan.steps[1]).toMatchObject({ command: 'python -m http.server 8000', longRunning: true });
    expect(plan.steps[2]).toMatchObject({ command: 'Get-Content -Wait -Tail 20 access.log', longRunning: true });
  });

  it('leaves unknown clauses to the model instead of running English', () => {
    const plan = planChain('create a folder called api, go into it, then scaffold an express server with a health route', 'windows')!;
    expect(plan.steps[2].command).toBeUndefined();
    expect(plan.steps[2].clause).toBe('scaffold an express server with a health route');
    for (const step of plan.steps) {
      if (step.command) expect(step.command).not.toMatch(/\b(?:scaffold|called|into it)\b/);
    }
  });

  it('opens folders in Explorer and URLs in the default browser', () => {
    expect(planChain('make a folder named out, then open it in the file manager', 'windows')!.steps[1].command).toBe('explorer .');
    expect(planChain('create a readme, then open https://example.com', 'windows')!.steps[1].command).toBe('Start-Process https://example.com');
  });

  it('returns null for single actions and for chains it understands nothing of', () => {
    expect(planChain('list the files', 'windows')).toBeNull();
    expect(planChain('summarize the logs and then email my boss', 'windows')).toBeNull();
  });
});

describe('planChain: folders, git and virtual environments', () => {
  const cmds = (goal: string) =>
    planChain(goal, 'windows')!.steps.map(s => s.command ?? `(enter ${s.enter})`);

  it('runs every step inside the folder named first', () => {
    expect(cmds("in demo-repo create a branch called feature/login, switch to it, make an empty commit with the message 'start login' and show the last 3 commits")).toEqual([
      '(enter demo-repo)',
      'git checkout -b feature/login',
      'git checkout feature/login',
      "git commit --allow-empty -m 'start login'",
      'git log --oneline -3',
    ]);
  });

  it('uses the virtual environment it just created', () => {
    expect(cmds('create a python virtual environment called venv-test and show the python version inside it')).toEqual([
      'python -m venv venv-test',
      "& venv-test\\Scripts\\python.exe --version",
    ]);
  });

  it('handles quoted names with spaces, several files and counting them', () => {
    expect(cmds("make a folder named 'meeting notes', create three files called a.txt, b.txt and c.txt inside it, then tell me how many files it has")).toEqual([
      "New-Item -ItemType Directory -Force -Path 'meeting notes' | Out-Null",
      "New-Item -ItemType File -Force -Path 'meeting notes/a.txt','meeting notes/b.txt','meeting notes/c.txt' | Out-Null",
      "(Get-ChildItem -File -LiteralPath 'meeting notes').Count",
    ]);
  });

  it('writes PowerShell steps on Windows', () => {
    expect(cmds('create a folder called api, go into it, create a readme and then list the files')).toEqual([
      'New-Item -ItemType Directory -Force -Path api | Out-Null',
      '(enter api)',
      "if (-not (Test-Path README.md)) { '# ' + (Split-Path -Leaf $PWD) | Out-File -Encoding utf8 README.md }",
      'Get-ChildItem -Force',
    ]);
    expect(planChain('go to logs, then follow app.log', 'windows')!.steps[1].command).toBe('Get-Content -Wait -Tail 20 app.log');
  });
});

describe('resolveFolder', () => {
  it('resolves relative, parent, absolute and home paths', () => {
    expect(resolveFolder('/tmp/a', 'b')).toBe('/tmp/a/b');
    expect(resolveFolder('/tmp/a', '../c')).toBe('/tmp/c');
    expect(resolveFolder('/tmp/a', '/opt/x/')).toBe('/opt/x');
    expect(resolveFolder('/tmp/a', '~/code')).toBe('~/code');
    expect(resolveFolder('~', 'proj')).toBe('~/proj');
    expect(resolveFolder('/', '..')).toBe('/');
  });
});

describe('"run <command>" clauses', () => {
  it('plans a known program with its arguments, so the one approval lists it', () => {
    const plan = planChain('create a folder demo-app, go into it, run git init, then npm init -y, then list the files', 'windows')!;
    expect(plan.steps.map(s => s.command ?? (s.enter ? `enter ${s.enter}` : null))).toEqual(['New-Item -ItemType Directory -Force -Path demo-app | Out-Null', 'enter demo-app', 'git init', 'npm init -y', 'Get-ChildItem -Force']);
  });

  it('leaves unknown programs and shell syntax to the model', () => {
    const plan = planChain('create a folder x, go into it, run the tests, then run npm test; rm -rf ~', 'windows')!;
    expect(plan.steps[2].command).toBeUndefined();
    expect(plan.steps.some(s => s.command?.includes('rm -rf'))).toBe(false);
  });
});
