/**
 * OutputFormatter.ts — terminal rendering for agent events and structured results.
 *
 * Visual language: a grayscale ramp for hierarchy (primary text, secondary, muted labels, faint
 * rules) plus three muted glyph accents for outcome (success, warning, failure). Colors are
 * 24-bit foregrounds, never the SGR "dim" attribute: xterm's WebGL renderer draws dim cells on an
 * opaque box when the terminal background is transparent. Every line ends in CRLF and starts at
 * a 2-column margin so agent output reads as one block under the request.
 */

const fg = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;

export const S = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  text: fg(228, 230, 235),
  soft: fg(168, 173, 182),
  muted: fg(112, 118, 128),
  faint: fg(74, 79, 88),
  code: fg(212, 216, 224),
  ok: fg(143, 203, 155),
  warn: fg(217, 184, 112),
  err: fg(229, 115, 115),
};

/** Erases the current row (used for transient status lines) */
export const CLEAR_LINE = '\r\x1b[2K';

const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n');
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

export interface AgentEventFormatted {
  type: 'thinking' | 'plan' | 'question' | 'tool_start' | 'tool_done' | 'done' | 'error' | 'step_output';
  message: string;
  data?: any;
}

/** "  label     value" with an aligned, muted label */
function kv(label: string, value: string, width = 10): string {
  return `  ${S.muted}${label.padEnd(width)}${S.reset}${S.text}${value}${S.reset}`;
}

/** Ten-cell usage bar, e.g. ━━━━━━━───; high usage is highlighted */
function bar(percent: number, cells = 10, color?: string): string {
  const p = Math.max(0, Math.min(100, percent));
  const filled = Math.round((p / 100) * cells);
  const c = color ?? (p >= 90 ? S.err : p >= 75 ? S.warn : S.soft);
  return `${c}${'━'.repeat(filled)}${S.faint}${'─'.repeat(cells - filled)}${S.reset}`;
}

/** Glyph line: "  ✓ text" with continuation lines indented under the text */
function glyphLine(glyph: string, glyphColor: string, message: string, textColor = S.text): string {
  const [first, ...rest] = message.replace(/\r/g, '').split('\n');
  const more = rest.length ? `\r\n${rest.map(l => `    ${S.soft}${l}${S.reset}`).join('\r\n')}` : '';
  return `  ${glyphColor}${glyph}${S.reset} ${textColor}${first}${S.reset}${more}`;
}

/**
 * Renders Markdown-like AI text for the terminal: headers, bold, inline code, lists and fenced
 * code blocks, with CRLF line endings and a consistent 2-column margin.
 */
export function formatMarkdownTerminal(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  let inCodeBlock = false;
  const out: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        const lang = line.trim().replace(/^```/, '').trim();
        out.push(`  ${S.faint}╭─${lang ? ` ${S.muted}${lang}${S.faint} ` : ''}${'─'.repeat(Math.max(4, 36 - lang.length))}${S.reset}`);
      } else {
        out.push(`  ${S.faint}╰${'─'.repeat(39)}${S.reset}`);
      }
      continue;
    }

    if (inCodeBlock) {
      out.push(`  ${S.faint}│${S.reset} ${S.code}${line}${S.reset}`);
      continue;
    }

    if (!line.trim()) {
      out.push('');
      continue;
    }

    if (/^#{1,4}\s+/.test(line.trim())) {
      out.push(`  ${S.bold}${S.text}${line.trim().replace(/^#{1,4}\s+/, '')}${S.reset}`);
      continue;
    }

    const formatted = line
      .replace(/\*\*([^*]+)\*\*/g, `${S.bold}$1${S.reset}`)
      .replace(/__([^_]+)__/g, `${S.bold}$1${S.reset}`)
      .replace(/`([^`]+)`/g, `${S.code}$1${S.reset}`)
      .replace(/^(\s*)(\d+\.)\s+/, `$1${S.soft}$2${S.reset} `)
      .replace(/^(\s*)[-*•]\s+/, `$1${S.muted}•${S.reset} `);

    out.push(`  ${formatted}`);
  }

  return out.join('\r\n');
}

const isMarkdown = (m: string) => m.includes('\n') || m.includes('**') || m.includes('```');

/** Format one agent event as a self-contained block (always ends in CRLF). */
export function formatAgentEvent(event: AgentEventFormatted): string {
  const message = event.message || '';
  switch (event.type) {
    case 'thinking':
      return `  ${S.muted}◦ ${crlf(message).split('\r\n')[0]}${S.reset}\r\n`;

    case 'plan':
      // The execution plan is shown in the floating HUD, not the terminal buffer
      return '';

    case 'question':
      return `\r\n${glyphLine('?', S.warn, message)}\r\n  ${S.muted}Type your answer to continue, or /cancel to stop.${S.reset}\r\n`;

    case 'tool_start':
      return `${glyphLine('›', S.muted, message, S.soft)}\r\n`;

    case 'tool_done':
      if (message.startsWith('✓')) return `${glyphLine('✓', S.ok, message.replace(/^✓\s*/, ''))}\r\n`;
      if (message.startsWith('✗')) return `${glyphLine('✗', S.err, message.replace(/^✗\s*/, ''))}\r\n`;
      if (message.startsWith('Warning:')) return `${glyphLine('!', S.warn, message.replace(/^Warning:\s*/, ''))}\r\n`;
      return `${glyphLine('✓', S.ok, message)}\r\n`;

    case 'done':
      if (isMarkdown(message)) return `\r\n${formatMarkdownTerminal(message)}\r\n`;
      return `${glyphLine('✓', S.ok, message)}\r\n`;

    case 'error':
      return `${glyphLine('✗', S.err, message)}\r\n`;

    case 'step_output':
      return `${crlf(message)}\r\n`;

    default:
      return `${crlf(message)}\r\n`;
  }
}

/**
 * Format structured data (file lists, processes, volumes, ...) for terminal display.
 */
export function formatDataOutput(data: any, options?: { goal?: string }): string {
  if (!data) return '';

  if (data.entries && Array.isArray(data.entries)) return formatFileList(data.entries);
  if (data.files && Array.isArray(data.files)) return formatFileList(data.files);
  if (data.devices && Array.isArray(data.devices)) return formatDeviceList(data.devices);
  if (data.networks && Array.isArray(data.networks)) return formatNetworkList(data.networks);
  if (data.matches && Array.isArray(data.matches)) return formatSearchResults(data.matches);
  if (data.results && Array.isArray(data.results)) return formatSearchResults(data.results);

  const procs = data.activeProcesses || data.processes;
  if (procs && Array.isArray(procs)) {
    const isSingular = data.singular === true
      || data.count === 1
      || procs.length === 1
      || /\b(?:which\s+process|what\s+process|single\s+process|top\s+process|highest\s+(?:cpu|ram|memory)|most\s+(?:cpu|ram|memory))\b/i.test(options?.goal || '');
    return formatProcessList(procs, data.sortedBy ? String(data.sortedBy) : '', isSingular);
  }

  if (data.volumes && Array.isArray(data.volumes)) return formatVolumeList(data.volumes);

  if (typeof data === 'object' && ('percentage' in data || 'batteryLevel' in data) && ('powerSource' in data || 'status' in data || 'isCharging' in data)) {
    return formatBatteryStatus(data);
  }

  if (typeof data === 'object' && ('totalGb' in data || 'total' in data) && ('usedGb' in data || 'used' in data) && ('freeGb' in data || 'availableGb' in data)) {
    return formatRamStatus(data);
  }

  if (typeof data === 'object' && (data.uptimeString || ('uptime' in data && !data.os))) {
    const up = String(data.uptimeString || data.uptime).replace(/^up\s+/, '');
    return `\r\n${kv('Uptime', up)}\r\n`;
  }

  if (typeof data === 'object' && (data.loadAverage || (data.model && !data.os))) {
    const rows: string[] = [];
    if (data.model) rows.push(kv(data.cores !== undefined || data.loadAverage ? 'CPU' : 'Model', String(data.model)));
    if (data.cores) rows.push(kv('Cores', String(data.cores)));
    if (data.loadAverage) {
      const load = Array.isArray(data.loadAverage) ? data.loadAverage.map((n: number) => Number(n).toFixed(2)).join('  ') : String(data.loadAverage);
      rows.push(`${kv('Load', load)}  ${S.muted}(1, 5, 15 min)${S.reset}`);
    }
    return `\r\n${rows.join('\r\n')}\r\n`;
  }

  if (typeof data === 'object' && data.os && (data.kernel || data.arch || data.cpus)) return formatSystemInfo(data);

  if (typeof data === 'object' && ('code' in data || 'stdout' in data)) {
    if (data.stdout && typeof data.stdout === 'string' && data.stdout.trim()) {
      return `\r\n${crlf(data.stdout.replace(/\s+$/, ''))}\r\n`;
    }
    return '';
  }

  if (typeof data === 'object' && Object.keys(data).length > 0) {
    const skip = new Set(['commandExecuted', 'dryRun', 'rollbackPayload', 'stdout', 'stderr', 'code']);
    const entries = Object.entries(data).filter(([k]) => !skip.has(k));
    const width = Math.min(18, Math.max(8, ...entries.map(([k]) => k.length + 2)));
    const lines = entries.map(([k, v]) => kv(k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v), width));
    if (lines.length > 0) return `\r\n${lines.join('\r\n')}\r\n`;
  }

  return '';
}

function formatFileList(files: any[]): string {
  if (files.length === 0) return `\r\n  ${S.muted}(empty directory)${S.reset}\r\n`;
  const lines = files.slice(0, 50).map(f => {
    const name = typeof f === 'string' ? f : (f.name || f.path || String(f));
    const isDir = typeof f === 'object' && (f.isDirectory || f.type === 'directory');
    const size = typeof f === 'object' && f.size ? `  ${S.muted}${formatSize(f.size)}${S.reset}` : '';
    return `  ${isDir ? `${S.bold}${S.text}${name}/` : `${S.soft}${name}`}${S.reset}${size}`;
  });
  if (files.length > 50) lines.push(`  ${S.muted}… and ${files.length - 50} more${S.reset}`);
  return `\r\n${lines.join('\r\n')}\r\n`;
}

function formatDeviceList(devices: any[]): string {
  if (devices.length === 0) return `\r\n  ${S.muted}No devices found${S.reset}\r\n`;
  const lines = devices.map(d => {
    const name = d.name || d.address || String(d);
    const addr = d.address && d.address !== name ? `  ${S.muted}${d.address}${S.reset}` : '';
    const connected = d.connected ? `  ${S.ok}connected${S.reset}` : '';
    return `  ${S.muted}•${S.reset} ${S.text}${name}${S.reset}${addr}${connected}`;
  });
  return `\r\n${lines.join('\r\n')}\r\n`;
}

function formatNetworkList(networks: any[]): string {
  if (networks.length === 0) return `\r\n  ${S.muted}No networks found${S.reset}\r\n`;
  const lines = networks.map(n => {
    const name = n.ssid || n.name || String(n);
    const signal = n.signal ? `  ${S.muted}${n.signal}${S.reset}` : '';
    const secured = n.security ? `  ${S.muted}secured${S.reset}` : '';
    return `  ${S.muted}•${S.reset} ${S.text}${name}${S.reset}${signal}${secured}`;
  });
  return `\r\n${lines.join('\r\n')}\r\n`;
}

function formatSearchResults(results: any[]): string {
  if (results.length === 0) return `\r\n  ${S.muted}No results found${S.reset}\r\n`;
  const lines = results.slice(0, 30).map(r => {
    const path = typeof r === 'string' ? r : (r.path || r.name || String(r));
    const isDir = typeof r === 'object'
      ? (r.isDirectory || r.type === 'directory')
      : (!path.split('/').pop()?.includes('.') || path.endsWith('/'));
    const size = typeof r === 'object' && r.size ? `  ${S.muted}${formatSize(r.size)}${S.reset}` : '';
    return `  ${isDir ? `${S.bold}${S.text}${path.replace(/\/$/, '')}/` : `${S.soft}${path}`}${S.reset}${size}`;
  });
  if (results.length > 30) lines.push(`  ${S.muted}… and ${results.length - 30} more${S.reset}`);
  return `\r\n${lines.join('\r\n')}\r\n`;
}

function formatProcessList(processes: any[], sortedBy = '', isSingular = false): string {
  if (processes.length === 0) return `\r\n  ${S.muted}No processes found${S.reset}\r\n`;
  const by = sortedBy ? (sortedBy.toLowerCase() === 'ram' || sortedBy.toLowerCase() === 'mem' ? 'memory' : sortedBy.toUpperCase()) : '';
  const cpuOf = (p: any) => p.cpuPercent ?? p.cpu;
  const memOf = (p: any) => (p.ramPercent !== undefined ? `${p.ramPercent}%` : p.ramMb ? `${p.ramMb} MB` : '');

  if (isSingular) {
    const p = processes[0];
    const facts = [
      p.pid !== undefined ? `PID ${p.pid}` : '',
      cpuOf(p) !== undefined ? `CPU ${cpuOf(p)}%` : '',
      memOf(p) ? `MEM ${memOf(p)}` : '',
    ].filter(Boolean).join(` ${S.faint}·${S.reset} ${S.soft}`);
    return `\r\n  ${S.muted}Top process${by ? ` by ${by}` : ''}${S.reset}  ${S.bold}${S.text}${p.name || p.command || String(p)}${S.reset}  ${S.soft}${facts}${S.reset}\r\n`;
  }

  const rows = processes.slice(0, 20).map(p => {
    const cpu = cpuOf(p) !== undefined ? `${cpuOf(p)}` : '';
    return `  ${S.muted}${String(p.pid ?? '').padStart(7)}${S.reset}  ${S.soft}${cpu.padStart(6)}  ${memOf(p).replace('%', '').padStart(6)}${S.reset}  ${S.text}${p.name || p.command || String(p)}${S.reset}`;
  });
  const title = by ? `\r\n  ${S.muted}Top processes by ${by}${S.reset}` : '';
  const header = `  ${S.muted}${'PID'.padStart(7)}  ${'CPU%'.padStart(6)}  ${'MEM%'.padStart(6)}  NAME${S.reset}`;
  return `${title}\r\n${header}\r\n${rows.join('\r\n')}\r\n`;
}

function formatVolumeList(volumes: any[]): string {
  if (volumes.length === 0) return `\r\n  ${S.muted}No storage volumes detected${S.reset}\r\n`;
  const width = Math.min(28, Math.max(...volumes.map(v => String(v.mount || v.mountedOn || '/').length)));
  const lines = volumes.map(v => {
    const mount = String(v.mount || v.mountedOn || '/');
    const total = v.total ?? (v.totalGb ? `${v.totalGb} GB` : '');
    const avail = v.available ?? (v.availableGb ? `${v.availableGb} GB` : '');
    const pct = String(v.percentUsed ?? (v.usePercent ? `${v.usePercent}` : ''));
    const pctNum = parseFloat(pct);
    const shownMount = mount.length > width ? `…${mount.slice(-(width - 1))}` : mount.padEnd(width);
    const usage = Number.isFinite(pctNum) ? `${bar(pctNum)}  ${S.text}${pct.padStart(4)} used${S.reset}` : '';
    const space = avail && total ? `  ${S.soft}${avail} free of ${total}${S.reset}` : total ? `  ${S.soft}${total}${S.reset}` : '';
    const fs = v.filesystem ? `  ${S.muted}${v.filesystem}${S.reset}` : '';
    return `  ${S.text}${shownMount}${S.reset}  ${usage}${space}${fs}`;
  });
  return `\r\n${lines.join('\r\n')}\r\n`;
}

function formatBatteryStatus(data: any): string {
  const pct = Number(data.percentage ?? data.batteryLevel);
  if (data.noBattery) return `\r\n${kv('Power', `${data.powerSource || 'AC Power'} (no battery)`)}\r\n`;
  const status = data.status || (data.isCharging ? 'charging' : 'discharging');
  const facts = [
    String(status).toLowerCase(),
    data.timeRemaining ? `${data.timeRemaining} remaining` : '',
    data.powerSource ? `on ${String(data.powerSource).replace(/ Power$/, '').toLowerCase()} power` : '',
  ].filter(Boolean).join(` ${S.faint}·${S.reset} ${S.soft}`);
  return `\r\n  ${S.muted}${'Battery'.padEnd(10)}${S.reset}${S.bold}${S.text}${pct}%${S.reset}  ${bar(pct, 10, pct <= 10 ? S.err : pct <= 20 ? S.warn : S.soft)}  ${S.soft}${facts}${S.reset}\r\n`;
}

function formatRamStatus(data: any): string {
  const total = data.totalGb ?? data.total;
  const used = data.usedGb ?? data.used;
  const avail = data.availableGb ?? data.freeGb ?? data.free;
  const pct = Number(used) / Number(total) * 100;
  const lines = [
    `  ${S.muted}${'Memory'.padEnd(10)}${S.reset}${S.bold}${S.text}${used} GB${S.reset}${S.soft} used of ${total} GB${S.reset}  ${Number.isFinite(pct) ? bar(pct) : ''}  ${S.soft}${avail !== undefined ? `${avail} GB available` : ''}${S.reset}`,
  ];
  if (data.swapTotalGb) lines.push(kv('Swap', `${data.swapUsedGb || 0} GB used of ${data.swapTotalGb} GB`));
  return `\r\n${lines.join('\r\n')}\r\n`;
}

function formatSystemInfo(data: any): string {
  const rows = [kv('OS', `${data.os}${data.arch ? ` (${data.arch})` : ''}`)];
  if (data.kernel) rows.push(kv('Kernel', String(data.kernel)));
  if (data.model || data.cpus) rows.push(kv('CPU', [data.model, data.cpus ? `${data.cpus} cores` : ''].filter(Boolean).join(' · ')));
  if (data.memoryGb) rows.push(kv('Memory', `${data.memoryGb} GB`));
  if (data.uptime) rows.push(kv('Uptime', String(data.uptime).replace(/^up\s+/, '')));
  return `\r\n${rows.join('\r\n')}\r\n`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Terminal notice for an error-watcher event (CRLF line endings for xterm). */
export function formatWatchEvent(event: import('../domain/watch/ErrorWatchService').WatchEvent): string {
  const where = event.watch.kind === 'file' ? event.watch.target.split('/').pop() : event.watch.target;
  const line = event.errorLine.length > 200 ? `${event.errorLine.slice(0, 200)}…` : event.errorLine;
  const head = `\r\n  ${S.warn}!${S.reset} ${S.muted}watch #${event.watch.id} · ${where}${S.reset}\r\n    ${S.text}${line}${S.reset}\r\n`;
  switch (event.type) {
    case 'auto-fixed':
      return `${head}    ${event.exitCode === 0 ? `${S.ok}✓ Fixed automatically` : `${S.err}✗ Automatic fix failed`}${S.reset}${S.soft}: ${event.suggestion.title}${S.reset}  ${S.muted}${event.command}${S.reset}\r\n`;
    case 'proposal':
      return `${head}    ${S.soft}Fix available: ${event.suggestion.title}${S.reset}  ${S.muted}${event.suggestion.fixedCommand}${S.reset}\r\n    ${S.muted}Run >watch fix to apply it.${S.reset}\r\n`;
    case 'error':
      return `${head}    ${S.muted}Run >watch fix to have Sentinel diagnose it.${S.reset}\r\n`;
  }
}

/** Notice shown when a failed terminal command has a suggested fix. */
export function formatRemediationNotice(cause: string, actionTitle: string): string {
  return `\r\n  ${S.warn}!${S.reset} ${S.text}${cause}${S.reset}\r\n    ${S.soft}Suggested fix: ${actionTitle}${S.reset}\r\n    ${S.muted}Press Tab or type >fix to apply it.${S.reset}\r\n\r\n`;
}

/** Plain-text width of a rendered string (for tests and truncation) */
export function visibleLength(s: string): number {
  return stripAnsi(s).length;
}

/**
 * Stateful renderer for one agent request. "Thinking" and "running" updates share a single
 * status row that is rewritten in place, so a request prints its outcome, not every internal step.
 */
export class AgentEventRenderer {
  private status: { kind: 'thinking' | 'tool_start'; text: string } | null = null;
  private lastWasSuccess = false;
  private started = false;

  constructor(private readonly columns: () => number = () => 100) {}

  private fit(message: string): string {
    const first = (message || '').replace(/\r/g, '').split('\n')[0].trim();
    const max = Math.max(20, this.columns() - 6);
    return first.length > max ? `${first.slice(0, max - 1)}…` : first;
  }

  private show(kind: 'thinking' | 'tool_start', message: string): string {
    const text = this.fit(message);
    const clear = this.status ? CLEAR_LINE : '';
    this.status = { kind, text };
    return clear + (kind === 'thinking'
      ? `  ${S.muted}◦ ${text}${S.reset}`
      : `  ${S.muted}›${S.reset} ${S.soft}${text}${S.reset}`);
  }

  /** Removes the status row; a running step can be kept as a permanent line instead. */
  private settle(keepStep: boolean): string {
    if (!this.status) return '';
    const s = this.status;
    this.status = null;
    if (keepStep && s.kind === 'tool_start') return `${CLEAR_LINE}${formatAgentEvent({ type: 'tool_start', message: s.text })}`;
    return CLEAR_LINE;
  }

  public render(event: AgentEventFormatted): string {
    // The plan is shown in the HUD; it must not open the output block
    if (event.type === 'plan') return '';
    const lead = this.started ? '' : '\r\n';
    this.started = true;
    let out: string;
    switch (event.type) {
      case 'thinking':
        out = this.show('thinking', event.message);
        break;
      case 'tool_start':
        // Consecutive steps stay visible as a trail; thinking lines are replaced
        out = this.settle(true) + this.show('tool_start', event.message);
        break;
      case 'step_output':
        out = this.settle(true) + formatAgentEvent(event);
        break;
      case 'tool_done':
        out = this.settle(false) + formatAgentEvent(event);
        this.lastWasSuccess = !/^(✗|Warning:)/.test(event.message || '');
        break;
      case 'done': {
        const pre = this.settle(false);
        const ack = !isMarkdown(event.message || '') && /^(done|launched|completed|ok)\.?$/i.test((event.message || '').trim());
        out = pre + (ack && this.lastWasSuccess ? '' : formatAgentEvent(event));
        break;
      }
      default:
        out = this.settle(false) + formatAgentEvent(event);
    }
    return lead + out;
  }

  /**
   * A finished step whose structured result is printed right after it: clear the status row
   * and count it as a success without printing a summary line.
   */
  public settleForData(event: AgentEventFormatted): string {
    const lead = this.started ? '' : '\r\n';
    this.started = true;
    this.lastWasSuccess = !/^(✗|Warning:)/.test(event.message || '');
    return lead + this.settle(false);
  }

  /** Clears a status row left on screen when the request ends. */
  public finish(): string {
    return this.settle(false);
  }
}
