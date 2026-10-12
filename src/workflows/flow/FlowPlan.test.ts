import { describe, it, expect } from 'vitest';
import { planFlow, planFlowFile, isDesktopCommand, withCwd, absolutizeCwd } from './FlowPlan';

const MORNING = {
  metadata: { name: 'Morning' },
  actions: [
    { type: 'app', app: 'Google Chrome' },
    { type: 'browser', app: 'chrome', urls: ['https://www.youtube.com'] },
    { type: 'app', app: 'VS Code' },
  ],
};

const NODE_TUTORIAL = {
  metadata: { name: 'Set up the demo app' },
  actions: [
    { type: 'install', package: 'nodejs' },
    { type: 'install', package: 'git' },
    { type: 'clone', repo: 'https://github.com/example/demo.git', into: '~/demo' },
    { type: 'command', command: 'npm install', cwd: '~/demo' },
    { type: 'command', command: 'npm run dev', windows: 'npm.cmd run dev', cwd: '~/demo' },
    { type: 'browser', url: 'http://localhost:3000' },
  ],
};

describe('planFlow', () => {
  it('a flow that only opens apps and links needs no terminal', () => {
    const plan = planFlow(MORNING, 'm', 'windows')!;
    expect(plan.needsTerminal).toBe(false);
    expect(plan.steps.every(s => s.kind === 'desktop')).toBe(true);
    expect(plan.steps.map(s => s.command)).toEqual([
      "Start-Process 'chrome'",
      "Start-Process chrome -ArgumentList 'https://www.youtube.com'",
      "Start-Process 'code'",
    ]);
    expect(plan.steps[0].platformCommands).toEqual({ windows: "Start-Process 'chrome'" });
  });

  it('a tutorial that installs and runs things needs the terminal', () => {
    const win = planFlow(NODE_TUTORIAL, 't', 'windows')!;
    expect(win.needsTerminal).toBe(true);
    expect(win.steps.map(s => s.kind)).toEqual(['terminal', 'terminal', 'terminal', 'terminal', 'terminal', 'desktop']);
    expect(win.steps[0].command).toMatch(/^if \(-not \(Get-Command node -ErrorAction SilentlyContinue\)\) \{ winget install -e --id OpenJS\.NodeJS\.LTS/);
    expect(win.steps[0].command).toContain("$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine')");
    expect(win.steps[2].command).toBe("git clone 'https://github.com/example/demo.git' (Join-Path $HOME 'demo')");
    expect(win.steps[4].command).toBe('npm.cmd run dev');
    expect(withCwd(win.steps[3], 'windows')).toBe("Set-Location -LiteralPath (Join-Path $HOME 'demo'); npm install");
  });

  it('skips what it does not understand and refuses unsafe values', () => {
    const plan = planFlow({ actions: [
      { type: 'browser', urls: ['javascript:alert(1)'] },
      { type: 'install', package: 'node; rm -rf ~' },
      { type: 'clone', repo: 'file:///etc' },
      { type: 'teleport' },
      { type: 'app', app: 'Slack' },
    ] }, 'x', 'windows')!;
    expect(plan.steps).toHaveLength(1);
    expect(plan.skipped).toEqual(['1: browser', '2: install', '3: clone', '4: teleport']);
  });

  it('reads Cero workflow files too, and only simple launches count as desktop', () => {
    const plan = planFlowFile(JSON.stringify({ name: 'mix', steps: [{ command: "Start-Process 'notepad'" }, { command: 'npm test' }] }), 'C:\\Users\\me\\mix.workflow.json', 'windows')!;
    expect(plan.name).toBe('mix');
    expect(plan.steps.map(s => s.kind)).toEqual(['desktop', 'terminal']);
    expect(isDesktopCommand("Start-Process 'calc'; Remove-Item C:\\ -Recurse")).toBe(false);
    expect(isDesktopCommand("Invoke-Item 'C:\\Users\\me\\notes.txt'")).toBe(true);
    expect(isDesktopCommand('Start-Process $(Invoke-WebRequest evil)')).toBe(false);
    expect(planFlowFile('not json', 'a.flow', 'windows')).toBeNull();
  });

  it('prefers a step\'s Windows variant in a workflow file', () => {
    const plan = planFlowFile(JSON.stringify({ steps: [{ command: 'ls -la', platformCommands: { linux: 'ls -la', windows: 'Get-ChildItem -Force' } }] }), 'w.workflow.json', 'windows')!;
    expect(plan.steps[0].command).toBe('Get-ChildItem -Force');
  });
});

describe('example flows', () => {
  it('every file in examples/flows plans on Windows without skipping anything', async () => {
    const fs = await import('node:fs');
    const dir = `${process.cwd()}/examples/flows`;
    const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.flow'));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const plan = planFlowFile(fs.readFileSync(`${dir}/${file}`, 'utf8'), file, 'windows');
      expect(plan, file).not.toBeNull();
      expect(plan!.skipped, file).toEqual([]);
    }
    expect(planFlowFile(fs.readFileSync(`${dir}/morning.flow`, 'utf8'), 'morning.flow', 'windows')!.needsTerminal).toBe(false);
    expect(planFlowFile(fs.readFileSync(`${dir}/node-project.flow`, 'utf8'), 'node-project.flow', 'windows')!.needsTerminal).toBe(true);
  });
});

describe('absolutizeCwd', () => {
  const plan = (cwds: (string | undefined)[]) => ({ name: 'x', needsTerminal: true, skipped: [], steps: cwds.map((cwd, i) => ({ name: `s${i}`, kind: 'terminal' as const, command: 'echo ok', platformCommands: { windows: 'echo ok' }, cwd })) });

  it('resolves relative folders against the folder the terminal starts in, so a repeated Set-Location is harmless', () => {
    const out = absolutizeCwd(plan([undefined, 'demo-project', 'demo-project', './sub/dir']), 'C:\\Users\\me\\work\\', 'windows');
    expect(out.steps.map(s => s.cwd)).toEqual([undefined, 'C:\\Users\\me\\work\\demo-project', 'C:\\Users\\me\\work\\demo-project', 'C:\\Users\\me\\work\\sub\\dir']);
  });

  it('leaves absolute, home and drive folders, and steps without a folder, alone; no base changes nothing', () => {
    const p = plan(['~/app', '\\\\server\\share', 'C:\\x', '~', undefined]);
    expect(absolutizeCwd(p, 'C:\\base', 'windows').steps.map(s => s.cwd)).toEqual(['~/app', '\\\\server\\share', 'C:\\x', '~', undefined]);
    expect(absolutizeCwd(plan(['a']), undefined, 'windows').steps[0].cwd).toBe('a');
  });

  it('what is typed for step 3 matches step 2 after the shell moved into the folder', () => {
    const out = absolutizeCwd(plan(['demo-project', 'demo-project']), 'C:\\w', 'windows');
    expect(withCwd(out.steps[0], 'windows')).toBe(withCwd(out.steps[1], 'windows'));
    expect(withCwd(out.steps[1], 'windows')).toBe("Set-Location -LiteralPath 'C:\\w\\demo-project'; echo ok");
  });
});
