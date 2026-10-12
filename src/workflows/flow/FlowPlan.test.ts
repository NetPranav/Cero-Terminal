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
    for (const os of ['macos', 'linux', 'windows'] as const) {
      const plan = planFlow(MORNING, 'm', os)!;
      expect(plan.needsTerminal).toBe(false);
      expect(plan.steps.every(s => s.kind === 'desktop')).toBe(true);
    }
    expect(planFlow(MORNING, 'm', 'macos')!.steps.map(s => s.command)).toEqual([
      "open -a 'Google Chrome'",
      "open -a 'Google Chrome' 'https://www.youtube.com'",
      "open -a 'Visual Studio Code'",
    ]);
    expect(planFlow(MORNING, 'm', 'windows')!.steps.map(s => s.command)).toEqual([
      "Start-Process 'chrome'",
      "Start-Process chrome -ArgumentList 'https://www.youtube.com'",
      "Start-Process 'code'",
    ]);
  });

  it('a tutorial that installs and runs things needs the terminal, on every OS', () => {
    const mac = planFlow(NODE_TUTORIAL, 't', 'macos')!;
    expect(mac.needsTerminal).toBe(true);
    expect(mac.steps.map(s => s.kind)).toEqual(['terminal', 'terminal', 'terminal', 'terminal', 'terminal', 'desktop']);
    expect(mac.steps[0].command).toBe('command -v node >/dev/null 2>&1 || { command -v brew >/dev/null 2>&1 || { echo "Homebrew is needed: https://brew.sh" >&2; false; } && brew install node; }');
    const linux = planFlow(NODE_TUTORIAL, 't', 'linux')!;
    expect(linux.steps[0].command).toContain('sudo apt-get install -y nodejs npm');
    expect(linux.steps[0].command).toContain('sudo pacman -S --needed --noconfirm nodejs npm');
    expect(linux.steps[0].command).toContain('sudo dnf install -y nodejs npm');
    expect(linux.steps[0].command.startsWith('command -v node >/dev/null 2>&1 ||')).toBe(true);
    const win = planFlow(NODE_TUTORIAL, 't', 'windows')!;
    expect(win.steps[0].command).toMatch(/^if \(-not \(Get-Command node -ErrorAction SilentlyContinue\)\) \{ winget install -e --id OpenJS\.NodeJS\.LTS/);
    expect(win.steps[0].command).toContain("$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine')");
    expect(win.steps[4].command).toBe('npm.cmd run dev');
    expect(withCwd(mac.steps[3], 'macos')).toBe('cd "$HOME/demo" && npm install');
    expect(withCwd(win.steps[3], 'windows')).toBe("Set-Location -LiteralPath (Join-Path $HOME 'demo'); npm install");
    expect(mac.steps[2].command).toBe(`git clone 'https://github.com/example/demo.git' "$HOME/demo"`);
  });

  it('skips what it does not understand and refuses unsafe values', () => {
    const plan = planFlow({ actions: [
      { type: 'browser', urls: ['javascript:alert(1)'] },
      { type: 'install', package: 'node; rm -rf ~' },
      { type: 'clone', repo: 'file:///etc' },
      { type: 'teleport' },
      { type: 'app', app: 'Slack' },
    ] }, 'x', 'linux')!;
    expect(plan.steps).toHaveLength(1);
    expect(plan.skipped).toEqual(['1: browser', '2: install', '3: clone', '4: teleport']);
  });

  it('reads Cero workflow files too, and only simple launches count as desktop', () => {
    const plan = planFlowFile(JSON.stringify({ name: 'mix', steps: [{ command: "open -a 'Safari'" }, { command: 'npm test' }] }), 'C:\\Users\\me\\mix.workflow.json', 'macos')!;
    expect(plan.name).toBe('mix');
    expect(plan.steps.map(s => s.kind)).toEqual(['desktop', 'terminal']);
    expect(isDesktopCommand("open -a 'Calculator'; rm -rf ~")).toBe(false);
    expect(isDesktopCommand('xdg-open https://example.com')).toBe(true);
    expect(isDesktopCommand('open $(curl evil)')).toBe(false);
    expect(planFlowFile('not json', 'a.flow', 'linux')).toBeNull();
  });
});

describe('example flows', () => {
  it('every file in examples/flows plans on macOS, Linux and Windows without skipping anything', async () => {
    const fs = await import('node:fs');
    const dir = `${process.cwd()}/examples/flows`;
    const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.flow'));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      for (const os of ['macos', 'linux', 'windows'] as const) {
        const plan = planFlowFile(fs.readFileSync(`${dir}/${file}`, 'utf8'), file, os);
        expect(plan, `${file} on ${os}`).not.toBeNull();
        expect(plan!.skipped, `${file} on ${os}`).toEqual([]);
      }
    }
    expect(planFlowFile(fs.readFileSync(`${dir}/morning.flow`, 'utf8'), 'morning.flow', 'windows')!.needsTerminal).toBe(false);
    expect(planFlowFile(fs.readFileSync(`${dir}/node-project.flow`, 'utf8'), 'node-project.flow', 'linux')!.needsTerminal).toBe(true);
  });
});

describe('absolutizeCwd', () => {
  const plan = (cwds: (string | undefined)[]) => ({ name: 'x', needsTerminal: true, skipped: [], steps: cwds.map((cwd, i) => ({ name: `s${i}`, kind: 'terminal' as const, command: 'true', platformCommands: { macos: 'true', linux: 'true', windows: 'true' }, cwd })) });

  it('resolves relative folders against the folder the terminal starts in, so a repeated cd is harmless', () => {
    const out = absolutizeCwd(plan([undefined, 'demo-project', 'demo-project', './sub/dir']), '/Users/me/work/', 'macos');
    expect(out.steps.map(s => s.cwd)).toEqual([undefined, '/Users/me/work/demo-project', '/Users/me/work/demo-project', '/Users/me/work/sub/dir']);
    const win = absolutizeCwd(plan(['app']), 'C:\\Users\\me', 'windows');
    expect(win.steps[0].cwd).toBe('C:\\Users\\me\\app');
  });

  it('leaves absolute, home and drive folders, and steps without a folder, alone; no base changes nothing', () => {
    const p = plan(['~/app', '/opt/x', 'C:\\x', '~', undefined]);
    expect(absolutizeCwd(p, '/base', 'linux').steps.map(s => s.cwd)).toEqual(['~/app', '/opt/x', 'C:\\x', '~', undefined]);
    expect(absolutizeCwd(plan(['a']), undefined, 'macos').steps[0].cwd).toBe('a');
  });

  it('what is typed for step 3 matches step 2 after the shell moved into the folder', () => {
    const out = absolutizeCwd(plan(['demo-project', 'demo-project']), '/tmp/w', 'macos');
    expect(withCwd(out.steps[0], 'macos')).toBe(withCwd(out.steps[1], 'macos'));
    expect(withCwd(out.steps[1], 'macos')).toBe("cd '/tmp/w/demo-project' && true");
  });
});
