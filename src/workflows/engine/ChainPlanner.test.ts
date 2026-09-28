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
    const plan = planChain('create a folder called chain-demo here, go into it, initialize a git repository, create a package.json with npm init -y and then list the files', 'macos')!;
    expect(plan.steps.map(s => s.command ?? `(enter ${s.enter})`)).toEqual([
      'mkdir -p chain-demo',
      '(enter chain-demo)',
      'git init',
      'npm init -y',
      'ls -la',
    ]);
    expect(plan.steps.every(s => !s.longRunning)).toBe(true);
  });

  it('clones, enters the clone, installs dependencies and opens it in VS Code', () => {
    const plan = planChain('clone https://github.com/sindresorhus/is into lib-is, go into it, install the dependencies and open it in vs code', 'macos')!;
    expect(plan.steps[0].command).toBe('git clone --depth 1 https://github.com/sindresorhus/is lib-is');
    expect(plan.steps[1].enter).toBe('lib-is');
    expect(plan.steps[2].command).toContain('npm install');
    expect(plan.steps[3].command).toBe('code . 2>/dev/null || open -a "Visual Studio Code" .');
  });

  it('marks servers and log followers as long-running (they get a pane)', () => {
    const plan = planChain('go to site, then run `python3 -m http.server 8000`, then follow access.log', 'linux')!;
    expect(plan.steps[0].enter).toBe('site');
    expect(plan.steps[1]).toMatchObject({ command: 'python3 -m http.server 8000', longRunning: true });
    expect(plan.steps[2]).toMatchObject({ command: 'tail -f access.log', longRunning: true });
  });

  it('leaves unknown clauses to the model instead of running English', () => {
    const plan = planChain('create a folder called api, go into it, then scaffold an express server with a health route', 'linux')!;
    expect(plan.steps[2].command).toBeUndefined();
    expect(plan.steps[2].clause).toBe('scaffold an express server with a health route');
    for (const step of plan.steps) {
      if (step.command) expect(step.command).not.toMatch(/\b(?:scaffold|called|into it)\b/);
    }
  });

  it('opens folders and URLs per platform', () => {
    expect(planChain('make a folder named out, then open it in finder', 'macos')!.steps[1].command).toBe('open .');
    expect(planChain('make a folder named out, then open it in the file manager', 'linux')!.steps[1].command).toBe('xdg-open .');
    expect(planChain('create a readme, then open https://example.com', 'linux')!.steps[1].command).toBe('xdg-open https://example.com');
  });

  it('returns null for single actions and for chains it understands nothing of', () => {
    expect(planChain('list the files', 'linux')).toBeNull();
    expect(planChain('summarize the logs and then email my boss', 'linux')).toBeNull();
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
