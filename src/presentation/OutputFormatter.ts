/**
 * OutputFormatter.ts — Clean Terminal Output for Agent Events
 * 
 * Converts agent events into clean, minimal ANSI terminal output.
 * No debug spam, no confidence percentages, no tool IDs.
 * Just clean, human-readable messages.
 */

// ANSI color codes
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  boldGreen: '\x1b[1;32m',
  boldCyan: '\x1b[1;36m',
  boldRed: '\x1b[1;31m',
  boldYellow: '\x1b[1;33m',
  boldMagenta: '\x1b[1;35m',
  boldWhite: '\x1b[1;37m',
};

export interface AgentEventFormatted {
  type: 'thinking' | 'plan' | 'question' | 'tool_start' | 'tool_done' | 'done' | 'error' | 'step_output';
  message: string;
  data?: any;
}

/**
 * Renders Markdown-like AI text responses cleanly for raw terminal buffers (xterm.js).
 * Converts headers, bold, inline code, lists, and code blocks into ANSI terminal sequences
 * with guaranteed CRLF (\r\n) line endings and consistent column-0 indentation.
 */
export function formatMarkdownTerminal(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  let inCodeBlock = false;
  const formattedLines: string[] = [];

  for (let rawLine of lines) {
    const line = rawLine;

    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        const lang = line.trim().replace(/^```/, '').trim();
        formattedLines.push(`  ${C.gray}┌──${lang ? ' ' + lang + ' ' : ''}─────────────────────────────────────────${C.reset}`);
      } else {
        formattedLines.push(`  ${C.gray}└────────────────────────────────────────────────${C.reset}`);
      }
      continue;
    }

    if (inCodeBlock) {
      formattedLines.push(`  ${C.gray}│${C.reset}  ${C.cyan}${line}${C.reset}`);
      continue;
    }

    if (!line.trim()) {
      formattedLines.push('');
      continue;
    }

    if (/^#{1,4}\s+/.test(line.trim())) {
      const headerText = line.trim().replace(/^#{1,4}\s+/, '');
      formattedLines.push(`  ${C.boldCyan}${headerText}${C.reset}`);
      continue;
    }

    let formatted = line
      .replace(/\*\*([^*]+)\*\*/g, `${C.bold}$1${C.reset}`)
      .replace(/__([^_]+)__/g, `${C.bold}$1${C.reset}`)
      .replace(/`([^`]+)`/g, `${C.cyan}$1${C.reset}`)
      .replace(/^(\s*)(\d+\.)\s+/, `$1${C.boldCyan}$2${C.reset} `)
      .replace(/^(\s*)[-*•]\s+/, `$1${C.cyan}•${C.reset} `);

    formattedLines.push(`  ${formatted}`);
  }

  return formattedLines.join('\r\n');
}

/**
 * Format an agent event into a clean terminal string.
 */
export function formatAgentEvent(event: AgentEventFormatted): string {
  switch (event.type) {
    case 'thinking':
      return `\r\n${C.dim}${C.cyan}● ${event.message.replace(/\r?\n/g, '\r\n')}${C.reset}\r\n`;

    case 'plan':
      // The interactive execution plan is presented via the floating HUD dropdown in the UI.
      // Do not duplicate or dump multi-line ASCII blocks into the main terminal buffer.
      return '';

    case 'question':
      return `\r\n${C.boldYellow}  ? ${event.message.replace(/\r?\n/g, '\r\n  ')}${C.reset}\r\n${C.dim}  Type your answer to continue, or /cancel to stop this workflow.${C.reset}\r\n`;

    case 'tool_start':
      return `${C.dim}${C.white}  ▸ ${event.message.replace(/\r?\n/g, '\r\n  ')}${C.reset}\r\n`;

    case 'tool_done':
      if (event.message.startsWith('✓')) {
        return `${C.green}  ${event.message.replace(/\r?\n/g, '\r\n  ')}${C.reset}\r\n`;
      } else if (event.message.startsWith('Warning:')) {
        return `${C.yellow}  ${event.message.replace(/\r?\n/g, '\r\n  ')}${C.reset}\r\n`;
      }
      return `${C.white}  ${event.message.replace(/\r?\n/g, '\r\n  ')}${C.reset}\r\n`;

    case 'done':
      if (event.message.includes('\n') || event.message.includes('**') || event.message.includes('```')) {
        return `\r\n${formatMarkdownTerminal(event.message)}\r\n`;
      }
      return `${C.boldGreen}  ${event.message}${C.reset}\r\n`;

    case 'error':
      return `${C.boldRed}  ✗ ${event.message.replace(/\r?\n/g, '\r\n  ')}${C.reset}\r\n`;

    case 'step_output':
      return `${C.white}${event.message.replace(/\r?\n/g, '\r\n')}${C.reset}\r\n`;

    default:
      return `${event.message.replace(/\r?\n/g, '\r\n')}\r\n`;
  }
}

/**
 * Format structured data (like file lists, device lists, etc.) for clean terminal display.
 */
export function formatDataOutput(data: any, options?: { goal?: string }): string {
  if (!data) return '';

  // File/directory listing
  if (data.entries && Array.isArray(data.entries)) {
    return formatFileList(data.entries);
  }
  if (data.files && Array.isArray(data.files)) {
    return formatFileList(data.files);
  }

  // Bluetooth devices
  if (data.devices && Array.isArray(data.devices)) {
    return formatDeviceList(data.devices);
  }

  // WiFi networks
  if (data.networks && Array.isArray(data.networks)) {
    return formatNetworkList(data.networks);
  }

  // Search results
  if (data.matches && Array.isArray(data.matches)) {
    return formatSearchResults(data.matches);
  }
  if (data.results && Array.isArray(data.results)) {
    return formatSearchResults(data.results);
  }

  // Process list
  const procs = data.activeProcesses || data.processes;
  if (procs && Array.isArray(procs)) {
    const isSingular = data.singular === true 
      || data.count === 1 
      || procs.length === 1 
      || /\b(?:which\s+process|what\s+process|single\s+process|top\s+process|highest\s+(?:cpu|ram|memory)|most\s+(?:cpu|ram|memory))\b/i.test(options?.goal || '');
    const sortBy = data.sortedBy ? ` (sorted by ${String(data.sortedBy).toUpperCase()})` : '';
    return formatProcessList(procs, sortBy, isSingular);
  }

  // Storage volumes
  if (data.volumes && Array.isArray(data.volumes)) {
    return formatVolumeList(data.volumes);
  }

  // Battery status
  if (typeof data === 'object' && ('percentage' in data || 'batteryLevel' in data) && ('powerSource' in data || 'status' in data || 'isCharging' in data)) {
    return formatBatteryStatus(data);
  }

  // RAM status
  if (typeof data === 'object' && ('totalGb' in data || 'total' in data) && ('usedGb' in data || 'used' in data) && ('freeGb' in data || 'availableGb' in data)) {
    return formatRamStatus(data);
  }

  // System Uptime
  if (typeof data === 'object' && (data.uptimeString || ('uptime' in data && !data.os))) {
    const up = data.uptimeString || data.uptime;
    return `\r\n  ${C.boldCyan}▶ System Uptime:${C.reset} ${C.boldGreen}${up}${C.reset}\r\n`;
  }

  // CPU Info & Load Average
  if (typeof data === 'object' && (data.loadAverage || (data.model && !data.os))) {
    const model = data.model ? `\r\n  ${C.boldCyan}Model:${C.reset} ${data.model}` : '';
    const cores = data.cores ? `\r\n  ${C.boldCyan}Cores:${C.reset} ${data.cores}` : '';
    const load = data.loadAverage ? `\r\n  ${C.boldCyan}Load Average:${C.reset} ${Array.isArray(data.loadAverage) ? data.loadAverage.join(', ') : data.loadAverage}` : '';
    return `\r\n  ${C.boldCyan}CPU Information:${C.reset}${model}${cores}${load}\r\n`;
  }

  // System info
  if (typeof data === 'object' && data.os && (data.kernel || data.arch || data.cpus)) {
    return formatSystemInfo(data);
  }

  // Command stdout
  if (typeof data === 'object' && ('code' in data || 'stdout' in data)) {
    if (data.stdout && typeof data.stdout === 'string' && data.stdout.trim()) {
      return `\r\n${data.stdout.trim().replace(/\r?\n/g, '\r\n')}\r\n`;
    }
    return '';
  }

  // Generic object — show key-value pairs cleanly
  if (typeof data === 'object' && Object.keys(data).length > 0) {
    const skip = new Set(['commandExecuted', 'dryRun', 'rollbackPayload', 'stdout', 'stderr', 'code']);
    const lines = Object.entries(data)
      .filter(([k]) => !skip.has(k))
      .map(([k, v]) => {
        if (typeof v === 'object' && v !== null) return `  ${C.dim}${k}:${C.reset} ${JSON.stringify(v)}`;
        return `  ${C.dim}${k}:${C.reset} ${v}`;
      });
    if (lines.length > 0) {
      return `\r\n${lines.join('\r\n')}\r\n`;
    }
  }

  return '';
}

function formatFileList(files: any[]): string {
  if (files.length === 0) return `\r\n${C.dim}  (empty directory)${C.reset}\r\n`;
  
  const lines = files.slice(0, 50).map(f => {
    const name = typeof f === 'string' ? f : (f.name || f.path || String(f));
    const isDir = typeof f === 'object' && (f.isDirectory || f.type === 'directory');
    const marker = isDir ? `${C.dim}d${C.reset}` : `${C.dim}-${C.reset}`;
    const size = typeof f === 'object' && f.size ? ` ${C.dim}(${formatSize(f.size)})${C.reset}` : '';
    return `  ${marker} ${isDir ? C.boldCyan : C.white}${name}${isDir ? '/' : ''}${C.reset}${size}`;
  });

  if (files.length > 50) {
    lines.push(`${C.dim}  ... and ${files.length - 50} more${C.reset}`);
  }

  return `\r\n${lines.join('\r\n')}\r\n`;
}

function formatDeviceList(devices: any[]): string {
  if (devices.length === 0) return `\r\n${C.dim}  No devices found${C.reset}\r\n`;
  
  const lines = devices.map(d => {
    const name = d.name || d.address || String(d);
    const connected = d.connected ? `${C.green} (connected)${C.reset}` : '';
    const addr = d.address ? ` ${C.dim}${d.address}${C.reset}` : '';
    return `  • ${C.white}${name}${C.reset}${addr}${connected}`;
  });

  return `\r\n${lines.join('\r\n')}\r\n`;
}

function formatNetworkList(networks: any[]): string {
  if (networks.length === 0) return `\r\n${C.dim}  No networks found${C.reset}\r\n`;
  
  const lines = networks.map(n => {
    const name = n.ssid || n.name || String(n);
    const signal = n.signal ? ` ${C.dim}(${n.signal})${C.reset}` : '';
    const secured = n.security ? ` ${C.dim}[secured]${C.reset}` : '';
    return `  • ${C.white}${name}${C.reset}${signal}${secured}`;
  });

  return `\r\n${lines.join('\r\n')}\r\n`;
}

function formatSearchResults(results: any[]): string {
  if (results.length === 0) return `\r\n${C.dim}  No results found${C.reset}\r\n`;
  
  const lines = results.slice(0, 30).map(r => {
    const path = typeof r === 'string' ? r : (r.path || r.name || String(r));
    const isDir = typeof r === 'object'
      ? (r.isDirectory || r.type === 'directory')
      : (!path.split('/').pop()?.includes('.') || path.endsWith('/'));
    const marker = isDir ? `${C.dim}d${C.reset}` : `${C.dim}-${C.reset}`;
    const color = isDir ? C.boldCyan : C.white;
    const size = typeof r === 'object' && r.size ? ` ${C.dim}(${formatSize(r.size)})${C.reset}` : '';
    return `  ${marker} ${color}${path}${isDir ? '/' : ''}${C.reset}${size}`;
  });

  if (results.length > 30) {
    lines.push(`${C.dim}  ... and ${results.length - 30} more${C.reset}`);
  }

  return `\r\n${lines.join('\r\n')}\r\n`;
}

function formatProcessList(processes: any[], titleExtra: string = '', isSingular: boolean = false): string {
  if (processes.length === 0) return `\r\n${C.dim}  No processes found${C.reset}\r\n`;

  if (isSingular) {
    const p = processes[0];
    const name = p.name || p.command || String(p);
    const pid = p.pid !== undefined ? `${C.dim}PID:${p.pid}${C.reset}` : '';
    const cpuVal = p.cpuPercent ?? p.cpu;
    const cpu = cpuVal !== undefined ? `${C.boldYellow}CPU: ${cpuVal}%${C.reset}` : '';
    const ramVal = p.ramPercent ?? (p.ramMb ? `${p.ramMb}MB` : undefined);
    const ram = ramVal !== undefined ? `${C.boldMagenta}RAM: ${typeof ramVal === 'number' ? `${ramVal}%` : ramVal}${C.reset}` : '';

    const details = [pid, cpu, ram].filter(Boolean).join(` ${C.dim}|${C.reset} `);
    const label = titleExtra ? `Top Process${titleExtra}` : 'Top Process';
    return `\r\n  ${C.boldCyan}▶ ${label}:${C.reset} ${C.boldWhite}${name}${C.reset}${details ? `  (${details})` : ''}\r\n`;
  }
  
  const header = titleExtra ? `\r\n${C.boldCyan}Top Processes${titleExtra}:${C.reset}\r\n` : '\r\n';
  const lines = processes.slice(0, 20).map(p => {
    const name = p.name || p.command || String(p);
    const pid = p.pid !== undefined ? `${C.dim}PID:${p.pid}${C.reset}` : '';
    const cpuVal = p.cpuPercent ?? p.cpu;
    const cpu = cpuVal !== undefined ? `${C.yellow}CPU: ${cpuVal}%${C.reset}` : '';
    const ramVal = p.ramPercent ?? (p.ramMb ? `${p.ramMb}MB` : undefined);
    const ram = ramVal !== undefined ? `${C.magenta}RAM: ${typeof ramVal === 'number' ? `${ramVal}%` : ramVal}${C.reset}` : '';
    
    const details = [pid, cpu, ram].filter(Boolean).join(` ${C.dim}|${C.reset} `);
    return `  • ${C.boldWhite}${name}${C.reset}${details ? `  ${details}` : ''}`;
  });

  return `${header}${lines.join('\r\n')}\r\n`;
}

function formatVolumeList(volumes: any[]): string {
  if (volumes.length === 0) return `\r\n${C.dim}  No storage volumes detected${C.reset}\r\n`;

  const header = `\r\n${C.boldCyan}Storage Mounts & Disk Usage:${C.reset}\r\n`;
  const lines = volumes.map(v => {
    const mount = v.mount || v.mountedOn || '/';
    const total = v.total ?? (v.totalGb ? `${v.totalGb} GB` : 'unknown');
    const avail = v.available ?? (v.availableGb ? `${v.availableGb} GB` : '');
    const pct = v.percentUsed ?? (v.usePercent ? `${v.usePercent}` : '');
    const fs = v.filesystem ? `${C.dim}(${v.filesystem})${C.reset}` : '';
    
    const spaceInfo = avail && total ? `${C.green}${avail} free${C.reset} of ${total}` : `${total}`;
    const pctInfo = pct ? ` [${C.yellow}${pct} used${C.reset}]` : '';

    return `  • ${C.boldWhite}${mount}${C.reset} ${fs} — ${spaceInfo}${pctInfo}`;
  });

  return `${header}${lines.join('\r\n')}\r\n`;
}

function formatBatteryStatus(data: any): string {
  const pct = data.percentage ?? data.batteryLevel;
  const status = data.status || (data.isCharging ? 'Charging' : (data.noBattery ? 'AC Power' : 'Discharging'));
  const source = data.powerSource ? ` (${data.powerSource})` : '';
  const icon = data.isCharging ? '[AC]' : '[BAT]';
  return `\r\n  ${C.boldCyan}${icon} Battery:${C.reset} ${C.boldGreen}${pct}%${C.reset} — ${status}${source}\r\n`;
}

function formatRamStatus(data: any): string {
  const total = data.totalGb ? `${data.totalGb} GB` : data.total;
  const used = data.usedGb ? `${data.usedGb} GB` : data.used;
  const avail = data.availableGb ? `${data.availableGb} GB` : (data.freeGb ? `${data.freeGb} GB free` : data.free);
  const swap = data.swapTotalGb ? ` | Swap: ${data.swapUsedGb || 0} GB used of ${data.swapTotalGb} GB` : '';
  return `\r\n  ${C.boldCyan}System Memory (RAM):${C.reset} ${C.boldGreen}${used} used${C.reset} / ${total} total (${avail} available)${swap}\r\n`;
}

function formatSystemInfo(data: any): string {
  const os = `${C.boldWhite}${data.os}${C.reset}`;
  const kernel = data.kernel ? ` | Kernel: ${C.dim}${data.kernel}${C.reset}` : '';
  const arch = data.arch ? ` (${data.arch})` : '';
  const cpu = data.model ? `\r\n  ${C.boldCyan}CPU:${C.reset} ${data.model} (${data.cpus} cores)` : (data.cpus ? `\r\n  ${C.boldCyan}CPUs:${C.reset} ${data.cpus} cores` : '');
  const mem = data.memoryGb ? `\r\n  ${C.boldCyan}Memory:${C.reset} ${data.memoryGb} GB` : '';
  const uptime = data.uptime ? `\r\n  ${C.boldCyan}Uptime:${C.reset} ${data.uptime}` : '';
  return `\r\n  ${C.boldCyan}OS:${C.reset} ${os}${arch}${kernel}${cpu}${mem}${uptime}\r\n`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

/** Terminal notice for an error-watcher event (CRLF line endings for xterm). */
export function formatWatchEvent(event: import('../domain/watch/ErrorWatchService').WatchEvent): string {
  const where = event.watch.kind === 'file' ? event.watch.target.split('/').pop() : event.watch.target;
  const head = `\r\n${C.dim}[watch #${event.watch.id} ${where}]${C.reset} `;
  const line = event.errorLine.length > 200 ? `${event.errorLine.slice(0, 200)}...` : event.errorLine;
  switch (event.type) {
    case 'auto-fixed':
      return `${head}${C.yellow}${line}${C.reset}\r\n  ${event.exitCode === 0 ? C.green : C.red}${event.exitCode === 0 ? '✓ Fixed automatically' : '✗ Automatic fix failed'}: ${event.suggestion.title}${C.reset} ${C.dim}(${event.command})${C.reset}\r\n`;
    case 'proposal':
      return `${head}${C.yellow}${line}${C.reset}\r\n  Fix available: ${event.suggestion.title} ${C.dim}(${event.suggestion.fixedCommand})${C.reset}\r\n  ${C.dim}Type >watch fix to run it.${C.reset}\r\n`;
    case 'error':
      return `${head}${C.yellow}${line}${C.reset}\r\n  ${C.dim}Type >watch fix to have Sentinel diagnose it.${C.reset}\r\n`;
  }
}
