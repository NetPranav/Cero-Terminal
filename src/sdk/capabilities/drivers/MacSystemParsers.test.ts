import { describe, it, expect } from 'vitest';
import { parsePmsetBatt, parseVmStat, parseMacDf, parseBootTime, parseLoadAvg, processDisplayName, formatDuration, humanSizeKb } from './MacSystemParsers';

// Captured on an 8 GB Apple silicon MacBook (macOS 26)
const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                     3589.
Pages active:                                  39499.
Pages inactive:                                35352.
Pages wired down:                             290863.
Pages purgeable:                                   0.
Anonymous pages:                               48250.
Pages occupied by compressor:                 121875.`;

describe('MacSystemParsers', () => {
  it('parses pmset battery output', () => {
    const b = parsePmsetBatt(`Now drawing from 'Battery Power'\n -InternalBattery-0 (id=22610019)\t64%; discharging; 20:00 remaining present: true`);
    expect(b).toEqual({ percentage: 64, status: 'discharging', isCharging: false, powerSource: 'Battery Power', timeRemaining: '20:00' });
  });

  it('parses charging and no-estimate states', () => {
    const b = parsePmsetBatt(`Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t80%; charging; (no estimate) present: true`);
    expect(b).toMatchObject({ percentage: 80, status: 'charging', isCharging: true, powerSource: 'AC Power' });
    expect(b?.timeRemaining).toBeUndefined();
    expect(parsePmsetBatt(`Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true`)).toMatchObject({ status: 'charged', isCharging: false });
  });

  it('reports desktop Macs without a battery and rejects unrelated text', () => {
    expect(parsePmsetBatt(`Now drawing from 'AC Power'`)).toMatchObject({ noBattery: true, powerSource: 'AC Power' });
    expect(parsePmsetBatt('command not found')).toBeNull();
  });

  it('computes memory like Activity Monitor (app + wired + compressed)', () => {
    const m = parseVmStat(VM_STAT, '8589934592', 'total = 10240.00M  used = 8742.19M  free = 1497.81M  (encrypted)');
    expect(m).toEqual({ totalGb: 8, usedGb: 7, availableGb: 1, swapTotalGb: 10, swapUsedGb: 8.5 });
    expect(parseVmStat('garbage', '8589934592')).toBeNull();
  });

  it('keeps user-visible volumes and hides APFS internals', () => {
    const vols = parseMacDf(`Filesystem     1024-blocks      Used Available Capacity  Mounted on
/dev/disk3s1s1   239311296  12337316    911364    94%    /
devfs                  207       207         0   100%    /dev
/dev/disk3s6     239311296  10487568    911364    93%    /System/Volumes/VM
/dev/disk3s5     239311296 204981792    911364   100%    /System/Volumes/Data
map auto_home            0         0         0   100%    /System/Volumes/Data/home
/dev/disk5s1      61024000  30512000  30512000    50%    /Volumes/My Drive`);
    expect(vols.map(v => v.mount)).toEqual(['/System/Volumes/Data', '/Volumes/My Drive']);
    expect(vols[0]).toMatchObject({ total: '228 GB', available: '890 MB', percentUsed: '100%' });
  });

  it('formats sizes, durations, load and process names', () => {
    expect(humanSizeKb(512)).toBe('512 KB');
    expect(humanSizeKb(1536)).toBe('1.5 MB');
    expect(formatDuration(0)).toBe('0 minutes');
    expect(formatDuration(3 * 86400 + 2 * 3600 + 14 * 60)).toBe('3 days, 2 hours, 14 minutes');
    expect(parseBootTime('{ sec = 1000, usec = 35522 } Mon Sep 28', 1000_000 + 3_660_000)).toBe('1 hour, 1 minute');
    expect(parseLoadAvg('{ 5.58 5.08 4.51 }')).toEqual([5.58, 5.08, 4.51]);
    expect(processDisplayName('/Applications/Antigravity IDE.app/Contents/Frameworks/Antigravity IDE Helper (Renderer).app/Contents/MacOS/Antigravity IDE Helper (Renderer)')).toBe('Antigravity IDE Helper (Renderer)');
    expect(processDisplayName('/Applications/Safari.app/Contents/MacOS/Safari')).toBe('Safari');
    expect(processDisplayName('/usr/sbin/mDNSResponder')).toBe('mDNSResponder');
    expect(processDisplayName('claude')).toBe('claude');
  });
});
