/**
 * MacSystemParsers.ts — parse macOS system tool output (pmset, vm_stat, sysctl, df, ps).
 *
 * Pure functions so the parsing is unit-tested; SystemSDKCapability runs the commands.
 * Every parser returns null when the text does not look like the expected output, so the
 * driver can report an honest error instead of inventing values.
 */

export interface BatteryReading {
  percentage: number;
  status: string;
  isCharging: boolean;
  powerSource: string;
  timeRemaining?: string;
  noBattery?: boolean;
}

/** `pmset -g batt` */
export function parsePmsetBatt(out: string): BatteryReading | null {
  const source = out.match(/Now drawing from '([^']+)'/)?.[1];
  const line = out.split('\n').find(l => /InternalBattery/i.test(l));
  if (!line) {
    // Desktop Macs report only the power source
    return source ? { percentage: 100, status: 'No battery', isCharging: false, powerSource: source, noBattery: true } : null;
  }
  const pct = line.match(/(\d{1,3})%/);
  if (!pct) return null;
  const fields = line.slice(line.indexOf(pct[0]) + pct[0].length).split(';').map(s => s.trim());
  const status = (fields[1] || '').replace(/\s*present:.*$/, '').trim() || 'unknown';
  const remainingField = fields[2] || '';
  const remaining = remainingField.match(/(\d+:\d{2}) remaining/)?.[1];
  return {
    percentage: parseInt(pct[1], 10),
    status,
    isCharging: /^(charging|finishing charge)/i.test(status),
    powerSource: source || 'Battery Power',
    ...(remaining && remaining !== '0:00' ? { timeRemaining: remaining } : {}),
  };
}

export interface MemoryReading {
  totalGb: number;
  usedGb: number;
  availableGb: number;
  swapTotalGb?: number;
  swapUsedGb?: number;
}

const GB = 1024 ** 3;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * `vm_stat` + `sysctl -n hw.memsize` (+ optional `sysctl -n vm.swapusage`).
 * "Used" follows Activity Monitor: app memory (anonymous - purgeable) + wired + compressed.
 */
export function parseVmStat(vmStat: string, memsize: string, swapUsage = ''): MemoryReading | null {
  const total = Number(memsize.trim());
  const pageSize = Number(vmStat.match(/page size of (\d+) bytes/)?.[1]);
  if (!total || !pageSize) return null;
  const pages = (label: string) => Number(vmStat.match(new RegExp(`${label}:\\s+(\\d+)`))?.[1] || 0);
  const anonymous = pages('Anonymous pages');
  const purgeable = pages('Pages purgeable');
  const wired = pages('Pages wired down');
  const compressed = pages('Pages occupied by compressor');
  const appMemory = anonymous ? Math.max(0, anonymous - purgeable) : pages('Pages active');
  const used = (appMemory + wired + compressed) * pageSize;
  const reading: MemoryReading = {
    totalGb: round1(total / GB),
    usedGb: round1(used / GB),
    availableGb: round1(Math.max(0, total - used) / GB),
  };
  const swap = swapUsage.match(/total = ([\d.]+)M\s+used = ([\d.]+)M/);
  if (swap) {
    reading.swapTotalGb = round1(Number(swap[1]) / 1024);
    reading.swapUsedGb = round1(Number(swap[2]) / 1024);
  }
  return reading;
}

export interface VolumeReading {
  filesystem: string;
  total: string;
  used: string;
  available: string;
  percentUsed: string;
  mount: string;
}

/** Mounts that are APFS system internals, not places a user stores files */
const HIDDEN_MAC_MOUNTS = /^\/System\/Volumes\/(?:VM|Preboot|Update|xarts|iSCPreboot|Hardware)|^\/private\/var\/vm|^\/dev$/;

/** Kilobytes → "228 GB" style size */
export function humanSizeKb(kb: number): string {
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = kb;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : round1(value)} ${units[unit]}`;
}

/** `df -Pk -l` — keeps the data volume and user-visible disks, drops APFS internals */
export function parseMacDf(out: string): VolumeReading[] {
  return out.trim().split('\n').slice(1).map(line => {
    const parts = line.trim().split(/\s+/);
    const [total, used, avail] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    return {
      filesystem: parts[0],
      total: Number.isFinite(total) ? humanSizeKb(total) : '',
      used: Number.isFinite(used) ? humanSizeKb(used) : '',
      available: Number.isFinite(avail) ? humanSizeKb(avail) : '',
      percentUsed: parts[4],
      mount: parts.slice(5).join(' '),
    };
  }).filter(v => v.mount && v.total && v.filesystem !== 'devfs' && !v.filesystem.startsWith('map') && !HIDDEN_MAC_MOUNTS.test(v.mount))
    // "/" is the sealed system snapshot; the data volume holds the user's files and real usage
    .filter((v, _i, all) => !(v.mount === '/' && all.some(o => o.mount === '/System/Volumes/Data')));
}

/** `sysctl -n kern.boottime` → human uptime, e.g. "3 days, 2 hours, 14 minutes" */
export function parseBootTime(out: string, nowMs: number = Date.now()): string | null {
  const sec = Number(out.match(/sec = (\d+)/)?.[1]);
  if (!sec) return null;
  return formatDuration(Math.max(0, Math.floor(nowMs / 1000) - sec));
}

export function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes || parts.length === 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  return parts.join(', ');
}

/** `sysctl -n vm.loadavg` → [1m, 5m, 15m] */
export function parseLoadAvg(out: string): number[] | null {
  const nums = out.replace(/[{}]/g, ' ').trim().split(/\s+/).map(Number).filter(n => !Number.isNaN(n));
  return nums.length >= 3 ? nums.slice(0, 3) : null;
}

/** Process name from a `ps -o comm` value, which is a full path on macOS */
export function processDisplayName(comm: string): string {
  const appMatch = comm.match(/\/([^/]+)\.app\//);
  if (appMatch) {
    const exe = comm.split('/').pop() || appMatch[1];
    // "Google Chrome Helper (Renderer)" is more useful than "Google Chrome"
    return exe.startsWith(appMatch[1]) ? exe : appMatch[1];
  }
  return comm.includes('/') ? comm.split('/').pop() || comm : comm;
}
