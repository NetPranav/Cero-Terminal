import { describe, it, expect } from 'vitest';
import { formatAgentEvent, formatMarkdownTerminal, formatDataOutput, AgentEventRenderer, CLEAR_LINE } from './OutputFormatter';

const plain = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

describe('OutputFormatter — Terminal Markdown & CRLF Formatting', () => {
  it('formats multi-line markdown responses without any bare LF (staircase prevention)', () => {
    const markdown = `Yes, you can change your IP address on macOS by using the \`networksetup\` command. Here's how you can do it:

1. **Change Wi-Fi IP Address:**
\`\`\`sh
sudo networksetup -setmanual en0 192.168.1.100 255.255.255.0 192.168.1.1
\`\`\`
Replace \`en0\` with your Wi-Fi interface name.

2. **Change Ethernet IP Address:**
\`\`\`sh
sudo networksetup -setmanual en1 192.168.1.100 255.255.255.0 192.168.1.1
\`\`\`
`;

    const formatted = formatAgentEvent({ type: 'done', message: markdown });

    // Must not contain any bare LF (\n without preceding \r)
    expect(/(?<!\r)\n/.test(formatted)).toBe(false);

    // Every non-empty line should start with a 2-space margin
    const lines = formatted.split('\r\n').filter(l => Boolean(l.trim()));
    for (const line of lines) {
      expect(line.startsWith('  ')).toBe(true);
    }

    // Code blocks should be cleanly boxed
    expect(plain(formatted)).toContain('╭─ sh ─');
    expect(formatted).toContain('│');
    expect(formatted).toContain('╰──');
    // No SGR dim: it renders as an opaque box in the WebGL renderer
    expect(formatted).not.toMatch(/\x1b\[(?:[0-9;]*;)?2m/);
  });

  it('formats headers, lists, and inline code properly', () => {
    const sample = `### Network Setup
* Step 1: Run \`ifconfig\`
* Step 2: Check **active** interface`;

    const formatted = formatMarkdownTerminal(sample);
    expect(/(?<!\r)\n/.test(formatted)).toBe(false);
    expect(formatted).toContain('Network Setup');
    expect(formatted).toContain('•');
    expect(formatted).toContain('ifconfig');
    expect(formatted).toContain('active');
  });

  it('formats status events (thinking, tool_start, tool_done, error) with guaranteed CRLF', () => {
    const thinking = formatAgentEvent({ type: 'thinking', message: 'Analyzing configuration...' });
    expect(/(?<!\r)\n/.test(thinking)).toBe(false);
    expect(thinking.endsWith('\r\n')).toBe(true);

    const toolStart = formatAgentEvent({ type: 'tool_start', message: 'Running networksetup...' });
    expect(/(?<!\r)\n/.test(toolStart)).toBe(false);
    expect(toolStart.endsWith('\r\n')).toBe(true);

    const toolDone = formatAgentEvent({ type: 'tool_done', message: '✓ Network configured' });
    expect(/(?<!\r)\n/.test(toolDone)).toBe(false);
    expect(toolDone.endsWith('\r\n')).toBe(true);

    const error = formatAgentEvent({ type: 'error', message: 'Operation failed\nAccess denied' });
    expect(/(?<!\r)\n/.test(error)).toBe(false);
    expect(error.endsWith('\r\n')).toBe(true);
  });

  it('formats activeProcesses cleanly with PID, CPU%, and RAM%', () => {
    const out = formatDataOutput({
      sortedBy: 'cpu',
      activeProcesses: [
        { pid: 20485, name: 'spotify', cpuPercent: 19.7, ramPercent: 2.7 },
        { pid: 21581, name: 'WebKitWebProcess', cpuPercent: 10.3, ramPercent: 2.7 }
      ]
    });

    const text = plain(out);
    expect(text).toContain('Top processes by CPU');
    expect(text).toMatch(/PID\s+CPU%\s+MEM%\s+NAME/);
    expect(text).toMatch(/20485\s+19\.7\s+2\.7\s+spotify/);
    expect(/(?<!\r)\n/.test(out)).toBe(false);
  });

  it('formats storage volumes cleanly with mounts and free space', () => {
    const out = formatDataOutput({
      volumes: [
        { mount: '/', total: '261G', available: '64G', percentUsed: '75%', filesystem: '/dev/nvme0n1p6' }
      ]
    });

    const text = plain(out);
    expect(text).toContain('/dev/nvme0n1p6');
    expect(text).toContain('64G free of 261G');
    expect(text).toContain('75% used');
    expect(text).toContain('━');
    expect(/(?<!\r)\n/.test(out)).toBe(false);
  });

  it('formats battery status and ram status cleanly', () => {
    const batOut = formatDataOutput({
      percentage: 58,
      status: 'Not charging',
      powerSource: 'Battery (BAT1)'
    });
    expect(plain(batOut)).toContain('Battery');
    expect(plain(batOut)).toContain('58%');
    expect(plain(batOut)).toContain('not charging');
    expect(plain(batOut)).toContain('on battery (bat1) power');

    const ramOut = formatDataOutput({
      totalGb: 15.1,
      usedGb: 6.4,
      availableGb: 8.9,
      swapTotalGb: 7.7,
      swapUsedGb: 2.2
    });
    expect(plain(ramOut)).toContain('Memory');
    expect(plain(ramOut)).toContain('6.4 GB used of 15.1 GB');
    expect(plain(ramOut)).toContain('8.9 GB available');
    expect(plain(ramOut)).toContain('Swap      2.2 GB used of 7.7 GB');
  });

  it('formats single process card when singular query is requested', () => {
    const out = formatDataOutput({
      sortedBy: 'cpu',
      count: 1,
      singular: true,
      activeProcesses: [
        { pid: 52374, name: 'llama-server', cpuPercent: 196, ramPercent: 19.9 }
      ]
    });

    const text = plain(out);
    expect(text).toContain('Top process by CPU');
    expect(text).toContain('llama-server');
    expect(text).toContain('PID 52374 · CPU 196% · MEM 19.9%');
    expect(/(?<!\r)\n/.test(out)).toBe(false);
  });

  it('formats single process card when goal asks "which process is using the most cpu"', () => {
    const out = formatDataOutput({
      sortedBy: 'cpu',
      activeProcesses: [
        { pid: 52374, name: 'llama-server', cpuPercent: 196, ramPercent: 19.9 },
        { pid: 50208, name: 'Isolated Web Co', cpuPercent: 29.7, ramPercent: 4.3 }
      ]
    }, { goal: 'which process is using the most cpu' });

    expect(plain(out)).toContain('Top process by CPU');
    expect(out).toContain('llama-server');
    expect(out).not.toContain('Isolated Web Co');
  });

  it('formats a macOS battery reading with remaining time', () => {
    const out = plain(formatDataOutput({ percentage: 64, status: 'discharging', isCharging: false, powerSource: 'Battery Power', timeRemaining: '20:00' }));
    expect(out).toContain('Battery   64%');
    expect(out).toContain('discharging · 20:00 remaining · on battery power');
  });
});

describe('AgentEventRenderer', () => {
  it('rewrites thinking updates in place and opens the block on a new line', () => {
    const r = new AgentEventRenderer();
    const first = r.render({ type: 'thinking', message: 'Thinking...' });
    expect(first.startsWith('\r\n')).toBe(true);
    expect(first.endsWith('\r\n')).toBe(false);
    const second = r.render({ type: 'thinking', message: 'Intent routed: system.battery' });
    expect(second.startsWith(CLEAR_LINE)).toBe(true);
  });

  it('replaces the running step with its result and skips a redundant Done', () => {
    const r = new AgentEventRenderer();
    r.render({ type: 'tool_start', message: 'Battery charge and charging state' });
    const done = r.render({ type: 'tool_done', message: '✓ Battery charge and charging state' });
    expect(done.startsWith(CLEAR_LINE)).toBe(true);
    expect(plain(done)).toContain('✓ Battery charge and charging state');
    expect(plain(done)).not.toContain('›');
    expect(r.render({ type: 'done', message: 'Done.' })).toBe('');
  });

  it('keeps a step line when its command streams output', () => {
    const r = new AgentEventRenderer();
    r.render({ type: 'tool_start', message: 'Phase 1: build' });
    const out = plain(r.render({ type: 'step_output', message: 'compiling...' }));
    expect(out).toContain('› Phase 1: build');
    expect(out).toContain('compiling...');
  });

  it('shows Done when nothing succeeded before it, and truncates long status lines', () => {
    const r = new AgentEventRenderer(() => 40);
    const status = plain(r.render({ type: 'thinking', message: 'x'.repeat(200) }));
    expect(status.length).toBeLessThanOrEqual(40);
    expect(plain(r.render({ type: 'done', message: 'Done.' }))).toContain('✓ Done.');
    expect(r.finish()).toBe('');
  });

  it('never emits the SGR dim attribute', () => {
    const r = new AgentEventRenderer();
    const all = [
      r.render({ type: 'thinking', message: 'a' }),
      r.render({ type: 'tool_start', message: 'b' }),
      r.render({ type: 'tool_done', message: '✗ failed' }),
      r.render({ type: 'error', message: 'boom' }),
      r.render({ type: 'question', message: 'which one?' }),
    ].join('');
    expect(all).not.toMatch(/\x1b\[(?:[0-9;]*;)?2m/);
  });
});

describe('Long answers wrap under the text', () => {
  it('wraps at the terminal width with a hanging indent', () => {
    const text = plain(formatAgentEvent({ type: 'done', message: 'math.js exports a single function add that takes two numbers and returns their sum, and nothing else.' }, 40));
    const lines = text.split('\r\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every(l => l.length <= 40)).toBe(true);
    expect(lines[1].startsWith('    ')).toBe(true);
  });
});

describe('Battery wording', () => {
  it('says "until full" while charging and keeps AC in capitals', () => {
    const out = plain(formatDataOutput({ percentage: 79, status: 'charging', isCharging: true, powerSource: 'AC Power', timeRemaining: '1:52' }));
    expect(out).toContain('charging · 1:52 until full · on AC power');
  });
});

