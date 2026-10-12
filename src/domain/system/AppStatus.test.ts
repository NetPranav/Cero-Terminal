import { describe, it, expect } from 'vitest';
import { parseAppStatus, findRunningApp, describeStatus } from './AppStatus';

const running = [
  { name: 'Amphetamine', app: true }, { name: 'Safari', app: true }, { name: 'Claude', app: true },
  { name: 'amphetamine', app: false }, { name: 'zsh', app: false },
];

describe('parseAppStatus', () => {
  const rows: Array<[string, string]> = [
    ['Hey there tell me is the amphetmine application running or not', 'amphetmine'],
    ['is safari running?', 'safari'],
    ['is the Claude app open', 'Claude'],
    ['check if slack is running', 'slack'],
    ['whether spotify is running or not', 'spotify'],
    ['tell me about the amphetmine application status', 'amphetmine'],
    ['what is the status of discord', 'discord'],
    ['is there a docker app running', 'docker'],
  ];
  for (const [input, name] of rows) it(`${input} -> ${name}`, () => expect(parseAppStatus(input)?.name).toBe(name));

  it('leaves everything else alone', () => {
    for (const t of ['is port 3000 running', 'is the server running', 'is it running', 'is wifi on', 'is bluetooth running', 'tell me about the amphetmine', 'what is a closure']) {
      expect(parseAppStatus(t)).toBeNull();
    }
  });
});

describe('findRunningApp', () => {
  it('finds the real app behind a misspelling and says so', () => {
    const m = findRunningApp('amphetmine', running);
    expect(m.kind).toBe('running');
    if (m.kind === 'running') { expect(m.item).toEqual({ name: 'Amphetamine', app: true }); expect(m.exact).toBe(false); }
    expect(describeStatus('amphetmine', m)).toBe('Amphetamine is running. (You wrote "amphetmine"; that is the closest running app.)');
  });
  it('an exact or differently cased name is simply running', () => {
    const m = findRunningApp('SAFARI', running);
    expect(describeStatus('SAFARI', m)).toBe('Safari is running.');
  });
  it('nothing like it is reported, with the installed app when there is one', () => {
    const m = findRunningApp('photoshop', running);
    expect(m.kind).toBe('not-running');
    expect(describeStatus('photoshop', m, 'Adobe Photoshop')).toContain('installed but not running');
    expect(describeStatus('photoshop', m)).toContain('did not find one installed');
  });
});
