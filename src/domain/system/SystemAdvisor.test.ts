import { describe, it, expect } from 'vitest';
import { parseAdviceRequest, parseSnapshot, adviseFrom, formatAdvice } from './SystemAdvisor';

describe('parseAdviceRequest', () => {
  for (const t of ['any improvement you would like to recommend me for my computer for better performance', 'how can I speed up my mac', 'what can I delete to free up space', 'why is my laptop so slow', 'recommend something to clean up my disk', 'I am running out of storage', 'optimize my system']) {
    it(`reads: ${t}`, () => expect(parseAdviceRequest(t)).not.toBeNull());
  }
  for (const t of ['write a script to clean up temp files', 'explain what swap is', 'what is a computer', 'open safari', 'recommend a good book', 'how does RAM work']) {
    it(`ignores: ${t}`, () => expect(parseAdviceRequest(t)).toBeNull());
  }
  it('picks a focus', () => {
    expect(parseAdviceRequest('what can I delete to free up space')?.focus).toBe('storage');
    expect(parseAdviceRequest('speed up my mac')?.focus).toBe('performance');
  });
});

const OUTPUT = `##arch
arm64
##ram
8589934592
##swap
total = 6144.00M  used = 5120.50M  free = 1023.50M  (encrypted)
##disk
/dev/disk3s5 239362496 196000000 19000000 92% /System/Volumes/Data
##sizes
2400000\t/Users/me/Library/Caches
900000\t/Users/me/.npm
5200000\t/Users/me/Library/Developer/Xcode/DerivedData
300000\t/Users/me/.Trash
450000\t/tmp
##nodemodules
900000\t/Users/me/Project Folder/A/node_modules
600000\t/Users/me/Project Folder/B/node_modules
200000\t/Users/me/Project Folder/C/node_modules
##procs
45.2 3.1 /Applications/Antigravity.app/Contents/MacOS/Electron
2.0 9.5 /Applications/Claude.app/Contents/MacOS/Claude
##uptime
11:20  up 21 days,  3:04, 2 users, load averages: 2.0 2.1 2.2
##battery
      Cycle Count: 412
      Condition: Normal
##downloads
1500000\t/Users/me/Downloads/old.iso`;

describe('adviseFrom (a snapshot of a real-looking 8 GB Apple Silicon Mac)', () => {
  const snap = parseSnapshot(OUTPUT, 'macos');
  const text = formatAdvice(adviseFrom(snap));
  it('reads the numbers', () => {
    expect(snap.ramBytes).toBe(8 * 1024 ** 3);
    expect(snap.swapUsedBytes!).toBeGreaterThan(4.9 * 1024 ** 3);
    expect(snap.disk!.availKb).toBe(19000000);
    expect(snap.nodeModules[0].kb).toBe(900000);
    expect(snap.procs[0].name).toBe('Electron');
  });
  it('talks about this machine, with its own numbers', () => {
    expect(text).toContain('8 GB of memory, 5.0 GB of it spilled to disk');
    expect(text).toContain('cannot be upgraded');
    expect(text).toContain('8% free');
    expect(text).toContain('3 node_modules folders take');
    expect(text).toContain("rm -rf '/Users/me/Project Folder/A/node_modules'");
    expect(text).toContain('Safe to clear, about');
    expect(text).toContain('Xcode build data, 5.0 GB');
    expect(text).toContain('npm cache clean --force');
    expect(text).toContain('21 days since the last restart');
    expect(text).toContain('Electron is using 45%');
  });
  it('puts the most pressing item first and deletes nothing', () => {
    expect(text.split('\n\n')[1]).toMatch(/^1\. Storage is almost full/);
    expect(text).toContain('Nothing was changed');
  });
  it('a healthy machine gets no invented advice', () => {
    const ok = parseSnapshot(`##arch\nx86_64\n##ram\n34359738368\n##disk\n/dev/x 500000000 100000000 400000000 20% /\n##procs\n1.0 1.0 zsh\n##uptime\nup 2 days`, 'linux');
    const advice = adviseFrom(ok);
    expect(advice.lines[0]).toContain('Nothing stands out');
  });
  it('a storage question lists only storage items', () => {
    const storage = adviseFrom(snap, 'storage').lines.join('\n');
    expect(storage).not.toContain('CPU:');
    expect(storage).toContain('node_modules');
  });
});
