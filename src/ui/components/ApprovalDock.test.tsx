import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { ApprovalDock } from './ApprovalDock';

const noop = () => {};
const render = (plan: any) => renderToStaticMarkup(<ApprovalDock plan={plan} onApprove={noop} onDeny={noop} />);

describe('ApprovalDock: the one approval presentation', () => {
  it('shows what the old centred dialog showed: title, risk, kind of action, command and reason', () => {
    const html = render({ capabilityId: 'shell.execute', riskLevel: 'HIGH', parameters: { command: 'rm -r build', explanation: 'Clean the build folder' } });
    expect(html).toContain('Run this command?');
    expect(html).toContain('high risk');
    expect(html).toContain('Command');
    expect(html).toContain('rm -r build');
    expect(html).toContain('Clean the build folder');
    expect(html).toContain('Nothing runs until you approve.');
  });

  it('several commands from a batch and commands from a file read as such', () => {
    expect(render({ capabilityId: 'workflow.batch', parameters: { command: 'npm ci\nnpm test' } })).toContain('Run these commands?');
    expect(render({ capabilityId: 'shell.execute', requiresClick: true, parameters: { command: 'make' } })).toContain('come from a file');
    expect(render({ capabilityId: 'shell.execute', requiresPassword: true, parameters: { command: 'systemctl stop x' } })).toContain('never asks for your password');
  });

  it('never takes the keyboard: not modal, no backdrop, nothing focusable by default', () => {
    const html = render({ capabilityId: 'shell.execute', parameters: { command: 'ls' } });
    expect(html).toContain('aria-modal="false"');
    expect(html).not.toMatch(/tabindex="0"|autofocus/i);
    expect(html).not.toMatch(/backdrop-filter|inset:\s*0/i);
  });

  it('TerminalView has no second, full-screen approval dialog any more', () => {
    const view = readFileSync(new URL('../../presentation/TerminalView.tsx', import.meta.url), 'utf8');
    expect(view).not.toMatch(/securityModalPlan\.docked/);
    expect(view).not.toMatch(/decideApprovalPresentation|decideModalKey/);
    expect((view.match(/<ApprovalDock\b/g) || [])).toHaveLength(1);
  });
});
