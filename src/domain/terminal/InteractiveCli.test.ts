import { describe, expect, it } from 'vitest';
import { hasUnansweredPrompt, nonInteractiveForm, planScaffold } from './InteractiveCli';
import { isLongRunningCommand } from './TerminalWorkspace';
import { planChain } from '../../workflows/engine/ChainPlanner';

describe('hasUnansweredPrompt', () => {
  it('sees the create-next-app menu it printed before exiting 0 with stdin closed (captured output)', () => {
    const out = '\x1b[?25l\x1b[36m?\x1b[39m \x1b[1mWould you like to use the recommended Next.js defaults?\x1b[22m \x1b[90m›\x1b[39m \x1b[90m- Use arrow-keys. Return to submit.\x1b[39m\n\x1b[36m❯\x1b[39m   Yes, use recommended defaults\n    No, customize settings\n';
    expect(hasUnansweredPrompt(out)).toBe(true);
  });
  it('sees inquirer, clack and npx questions', () => {
    expect(hasUnansweredPrompt('? Which framework? (Use arrow keys)\n❯ react\n  vue')).toBe(true);
    expect(hasUnansweredPrompt('◇  Project name:\n│  web\n│\n◆  Select a framework:\n│  ● Vanilla\n│  ○ Vue\n│  ○ React\n└')).toBe(true);
    expect(hasUnansweredPrompt('Need to install the following packages:\ncreate-foo@1.0.0\nOk to proceed? (y)')).toBe(true);
    expect(hasUnansweredPrompt('Do you want to continue? [Y/n]')).toBe(true);
  });
  it('ignores normal output', () => {
    expect(hasUnansweredPrompt('Success! Created cero-test at /tmp/cero-test')).toBe(false);
    expect(hasUnansweredPrompt('added 312 packages in 14s')).toBe(false);
    expect(hasUnansweredPrompt('')).toBe(false);
  });
});

describe('nonInteractiveForm', () => {
  it('create-next-app takes its defaults (npx itself already assumes --yes without a TTY)', () => {
    expect(nonInteractiveForm('npx create-next-app@latest cero-test')).toBe('npx create-next-app@latest cero-test --yes');
    expect(nonInteractiveForm('npx create-next-app@latest cero-test && code cero-test')).toBe('npx create-next-app@latest cero-test --yes && code cero-test');
    expect(nonInteractiveForm('npx express-generator --no-view api')).toBe('npx express-generator --no-view api');
  });
  it('leaves commands that already say so, or have no questions, alone', () => {
    expect(nonInteractiveForm('npx --yes create-next-app@latest x --yes')).toBe('npx --yes create-next-app@latest x --yes');
    expect(nonInteractiveForm('ls -la')).toBe('ls -la');
    expect(nonInteractiveForm('npm init -y')).toBe('npm init -y');
    expect(nonInteractiveForm('npm init vite@latest web')).toBe('npm init vite@latest web');
  });
  it('npm init with no answers given gets -y', () => {
    expect(nonInteractiveForm('npm init')).toBe('npm init -y');
    expect(nonInteractiveForm('npm init && npm i express')).toBe('npm init -y && npm i express');
  });
});

describe('planScaffold', () => {
  it('reads the Next.js request from the report', () => {
    expect(planScaffold("create a NextJS project for me in the root folder named 'cero-test'"))
      .toEqual({ name: 'cero-test', command: 'npx --yes create-next-app@latest cero-test --yes' });
    expect(planScaffold('make a new next.js app called blog')?.name).toBe('blog');
  });
  it('needs a valid name', () => {
    expect(planScaffold('create a NextJS project')).toBeNull();
    expect(planScaffold('create a NextJS project named My App')).toBeNull();
    expect(planScaffold('create a react project named x')).toBeNull();
  });
});

describe('scaffolders are not long-running servers', () => {
  it('npm create vite is a one-off, npm run dev and vite stay servers', () => {
    expect(isLongRunningCommand('npm create vite@latest web')).toBe(false);
    expect(isLongRunningCommand('npx --yes create-next-app@latest x --yes')).toBe(false);
    expect(isLongRunningCommand('npm run dev')).toBe(true);
    expect(isLongRunningCommand('npx vite')).toBe(true);
  });
});

describe('planChain for the reported prompts', () => {
  it('Next.js + VS Code on the new project + Zen', () => {
    const plan = planChain("Please create a NextJS project for me in the root folder named 'cero-test' and open it in vscode and also open zen browser", 'linux')!;
    expect(plan.steps.map(s => s.command ?? (s.app ? `app:${s.app.app}` : s.open ? `open:${s.open.name}` : ''))).toEqual([
      'npx --yes create-next-app@latest cero-test --yes', 'code cero-test', 'app:zen browser',
    ]);
    expect(plan.steps[0].expectFolder).toBe('cero-test');
  });
  it('gitBrains folder in VS Code + Zen: the folder keeps its own place, Zen is its own step', () => {
    const plan = planChain('Please open a folder named gitBrains in VS Code. This folder is inside /padhai_in_linux/Projects/ and also open zen browser', 'linux')!;
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].open).toMatchObject({ kind: 'folder', name: 'gitBrains', locationHint: '/padhai_in_linux/Projects/', withApp: 'VS Code' });
    expect(plan.steps[1].app?.app).toBe('zen browser');
  });
  it('one open request stays one ("open vs code and open gitBrains in it")', () => {
    expect(planChain('open vs code and open gitBrains in it', 'linux')).toBeNull();
    expect(planChain('Please open a folder named gitBrains in VS Code. This folder is inside /padhai_in_linux/Projects/', 'linux')).toBeNull();
  });
  it('after entering the project, "open it" is the current folder again', () => {
    const plan = planChain("create a nextjs app named site, go into it and open it in vscode", 'linux')!;
    expect(plan.steps[2].command).toBe('code .');
  });
});
