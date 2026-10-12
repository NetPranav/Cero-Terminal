/**
 * SystemAdvisor.ts: "any improvement you would recommend for my computer?"
 *
 * Cero is a terminal, so it can look. The answer is built from what this computer really has (its memory, how full its
 * disk is, what is taking the space, what is using the CPU), never from a generic checklist. Reading is read-only; every
 * cleanup is offered as an exact command and nothing is deleted.
 */

export interface AdviceRequest { focus: 'performance' | 'storage' | 'general' }

const SUBJECT = String.raw`(?:my\s+)?(?:computer|mac|macbook|laptop|pc|desktop|system|machine|storage|disk|drive|space|ram|memory)`;
const PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b(?:recommend|suggest|advice|advise|improve|improvement|speed\s+up|optimi[sz]e|tune|boost|upgrade|clean\s*up|free\s+up|declutter)\b.{0,60}\b${SUBJECT}\b`, 'i'),
  new RegExp(String.raw`\b${SUBJECT}\b.{0,40}\b(?:performance|faster|speed|slow|lag|laggy|sluggish|clean(?:er)?|cleanup)\b`, 'i'),
  /\bwhy\s+is\s+(?:my\s+)?(?:computer|mac|macbook|laptop|pc|system|machine)\s+(?:so\s+)?(?:slow|lagging|laggy|sluggish|hot|noisy)\b/i,
  /\bwhat\s+can\s+i\s+(?:delete|remove|clean|clear|free)\b/i,
  /\b(?:running\s+out\s+of|low\s+on)\s+(?:disk\s+)?(?:space|storage)\b/i,
  /\bany\s+(?:improvements?|tips?|suggestions?|recommendations?)\b.{0,60}\b(?:computer|mac|laptop|pc|system|performance)\b/i,
];

export function parseAdviceRequest(goal: string): AdviceRequest | null {
  const text = goal.trim().replace(/\s+/g, ' ');
  if (text.length > 220) return null;
  // writing code or asking about a concept is not a request to look at this machine
  if (/\b(?:write|code|script|function|algorithm|explain|define|what\s+is\s+a)\b/i.test(text) && !/\bmy\s+(?:computer|mac|laptop|pc|system)\b/i.test(text)) return null;
  if (!PATTERNS.some(p => p.test(text))) return null;
  const focus = /\b(?:space|storage|disk|drive|delete|clean|clear|free\s+up|full)\b/i.test(text) ? 'storage' : /\b(?:slow|speed|fast|performance|lag|memory|ram|cpu)\b/i.test(text) ? 'performance' : 'general';
  return { focus };
}

export interface Snapshot {
  os: 'macos' | 'linux' | 'windows';
  arch?: string;
  ramBytes?: number;
  swapUsedBytes?: number;
  disk?: { sizeKb: number; usedKb: number; availKb: number };
  /** label -> size in KB, for the places that commonly fill up */
  sizes: Record<string, number>;
  nodeModules: Array<{ path: string; kb: number }>;
  procs: Array<{ cpu: number; mem: number; name: string }>;
  uptimeDays?: number;
  battery?: { cycles?: number; condition?: string; maxCapacity?: string };
  bigDownloads: Array<{ path: string; kb: number }>;
}

/** The one read-only script that collects everything above on macOS and Linux */
export function snapshotScript(): string {
  return [
    "echo '##arch'; uname -m",
    "echo '##ram'; (sysctl -n hw.memsize 2>/dev/null || awk '/MemTotal/{print $2*1024}' /proc/meminfo 2>/dev/null)",
    "echo '##swap'; (sysctl -n vm.swapusage 2>/dev/null || free -b 2>/dev/null | awk '/Swap/{print \"used = \" $3 \" B\"}')",
    "echo '##disk'; df -k \"$HOME\" | tail -1",
    "echo '##sizes'; for p in \"$HOME/Library/Caches\" \"$HOME/.cache\" \"$HOME/.npm\" \"$HOME/.cargo/registry\" \"$HOME/.gradle/caches\" \"$HOME/Library/Developer/Xcode/DerivedData\" \"$HOME/Library/Developer/CoreSimulator\" \"$HOME/.Trash\" \"$HOME/.local/share/Trash\" \"$HOME/Downloads\" \"$HOME/.docker\" \"/tmp\" \"/var/tmp\"; do [ -e \"$p\" ] && du -sk \"$p\" 2>/dev/null; done",
    "echo '##nodemodules'; find \"$HOME\" -mindepth 1 -maxdepth 6 \\( -name Library -o -name '.*' -o -name Applications -o -name Movies -o -name Music -o -name Pictures -o -name Desktop -o -name Documents -o -name Downloads \\) -prune -o -type d -name node_modules -print -prune 2>/dev/null | head -60 | while read d; do du -sk \"$d\" 2>/dev/null; done",
    "echo '##procs'; if [ \"$(uname)\" = Darwin ]; then ps -Ao pcpu=,pmem=,comm= -r | head -7; else ps -eo pcpu=,pmem=,comm= --sort=-pcpu | head -7; fi",
    "echo '##uptime'; uptime",
    "echo '##battery'; system_profiler SPPowerDataType 2>/dev/null | grep -E 'Cycle Count|Condition|Maximum Capacity'",
    "echo '##downloads'; find \"$HOME/Downloads\" -maxdepth 1 -type f -size +100M -exec du -k {} + 2>/dev/null | sort -rn | head -5",
  ].join('; ');
}

const GB = 1024 * 1024 * 1024;
const fmtKb = (kb: number) => (kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)} GB` : kb >= 1024 ? `${Math.round(kb / 1024)} MB` : `${kb} KB`);

function sections(output: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let current = '';
  for (const raw of output.split(/\r?\n/)) {
    const m = raw.match(/^##(\w+)$/);
    if (m) { current = m[1]; out[current] = []; continue; }
    if (current && raw.trim()) out[current].push(raw.trim());
  }
  return out;
}

const home = (p: string) => p;
const LABELS: Array<[RegExp, string]> = [
  [/Library\/Caches$/, 'App caches'], [/\/\.cache$/, 'User cache'], [/\.npm$/, 'npm cache'], [/\.cargo\/registry$/, 'Cargo registry'],
  [/\.gradle\/caches$/, 'Gradle cache'], [/DerivedData$/, 'Xcode build data'], [/CoreSimulator$/, 'iOS simulators'], [/\.Trash$|Trash$/, 'Trash'],
  [/Downloads$/, 'Downloads'], [/\.docker$/, 'Docker data'], [/^\/tmp$/, 'Temporary files (/tmp)'], [/^\/var\/tmp$/, 'Temporary files (/var/tmp)'],
];
const labelOf = (p: string) => LABELS.find(([re]) => re.test(p))?.[1] ?? p;

export function parseSnapshot(output: string, os: Snapshot['os']): Snapshot {
  const s = sections(output);
  const snap: Snapshot = { os, sizes: {}, nodeModules: [], procs: [], bigDownloads: [] };
  snap.arch = s.arch?.[0];
  const ram = Number(s.ram?.[0]);
  if (Number.isFinite(ram) && ram > 0) snap.ramBytes = ram;
  const swap = (s.swap ?? []).join(' ').match(/used\s*=\s*([\d.]+)\s*([KMGB]?)/i);
  if (swap) {
    const n = parseFloat(swap[1]); const unit = swap[2].toUpperCase();
    snap.swapUsedBytes = n * (unit === 'G' ? GB : unit === 'M' ? 1024 * 1024 : unit === 'K' ? 1024 : 1);
  }
  const disk = (s.disk?.[0] ?? '').split(/\s+/);
  if (disk.length >= 4 && /^\d+$/.test(disk[1])) snap.disk = { sizeKb: +disk[1], usedKb: +disk[2], availKb: +disk[3] };
  for (const line of s.sizes ?? []) {
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) snap.sizes[labelOf(home(m[2]))] = +m[1];
  }
  for (const line of s.nodemodules ?? []) {
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) snap.nodeModules.push({ kb: +m[1], path: m[2] });
  }
  snap.nodeModules.sort((a, b) => b.kb - a.kb);
  for (const line of s.procs ?? []) {
    const m = line.match(/^([\d.]+)\s+([\d.]+)\s+(.+)$/);
    if (m) snap.procs.push({ cpu: +m[1], mem: +m[2], name: (m[3].split('/').pop() || m[3]).replace(/\.app$/, '') });
  }
  const up = (s.uptime?.[0] ?? '').match(/up\s+(?:(\d+)\s+days?)/i);
  snap.uptimeDays = up ? +up[1] : 0;
  const bat = (s.battery ?? []).join('\n');
  if (bat) {
    snap.battery = {
      cycles: Number(bat.match(/Cycle Count:\s*(\d+)/)?.[1]) || undefined,
      condition: bat.match(/Condition:\s*(.+)/)?.[1]?.trim(),
      maxCapacity: bat.match(/Maximum Capacity:\s*(.+)/)?.[1]?.trim(),
    };
  }
  for (const line of s.downloads ?? []) {
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) snap.bigDownloads.push({ kb: +m[1], path: m[2] });
  }
  return snap;
}

export interface Advice { headline: string; lines: string[] }

/** Recommendations from what was found, most useful first, each with the real numbers and the exact command */
export function adviseFrom(snap: Snapshot, focus: AdviceRequest['focus'] = 'general'): Advice {
  const facts: string[] = [];
  const tips: Array<{ weight: number; text: string }> = [];
  const add = (weight: number, text: string) => tips.push({ weight, text });

  const ramGb = snap.ramBytes ? Math.round(snap.ramBytes / GB) : undefined;
  const swapGb = snap.swapUsedBytes ? snap.swapUsedBytes / GB : 0;
  const soldered = snap.os === 'macos' && /arm|aarch/i.test(snap.arch ?? '');
  if (ramGb) facts.push(`${ramGb} GB of memory${swapGb >= 0.5 ? `, ${swapGb.toFixed(1)} GB of it spilled to disk (swap)` : ''}`);
  if (snap.disk) {
    const freePct = (snap.disk.availKb / snap.disk.sizeKb) * 100;
    facts.push(`${fmtKb(snap.disk.availKb)} free of ${fmtKb(snap.disk.sizeKb)} (${freePct.toFixed(0)}% free)`);
  }

  // memory
  if (ramGb && ramGb <= 8) {
    const heavy = snap.procs.filter(p => p.mem >= 4).slice(0, 3).map(p => `${p.name} (${p.mem.toFixed(0)}% of memory)`);
    add(swapGb >= 1 ? 100 : 70, `Memory: ${ramGb} GB is tight for development${swapGb >= 1 ? `, and your Mac is already using ${swapGb.toFixed(1)} GB of swap, which is what makes it feel slow` : ''}. ${soldered ? 'On an Apple Silicon Mac the memory is part of the chip and cannot be upgraded, so the real fix is to use less of it' : 'Adding memory is the most effective upgrade'}.${heavy.length ? ` Right now the biggest users are ${heavy.join(', ')}.` : ''} Close what you are not using, and keep one editor and one browser open instead of several.`);
  } else if (ramGb && swapGb >= 2) {
    add(80, `Memory: ${swapGb.toFixed(1)} GB of swap is in use even with ${ramGb} GB of memory. Something is holding a lot: ${snap.procs.slice(0, 2).map(p => p.name).join(', ')}.`);
  }

  // CPU hogs
  const hog = snap.procs.find(p => p.cpu >= 40);
  if (hog) add(85, `CPU: ${hog.name} is using ${hog.cpu.toFixed(0)}% of a core right now. If you are not using it, quit it (say "quit ${hog.name.toLowerCase()}").`);

  // disk
  const totalNm = snap.nodeModules.reduce((n, d) => n + d.kb, 0);
  const lowDisk = snap.disk && (snap.disk.availKb / snap.disk.sizeKb < 0.2 || snap.disk.availKb < 30 * 1024 * 1024);
  if (snap.nodeModules.length && totalNm >= 300 * 1024) {
    const top = snap.nodeModules.slice(0, 3).map(d => `${d.path.replace(/^.*?\/(?=[^/]+\/[^/]+\/node_modules$)/, '')} (${fmtKb(d.kb)})`).join(', ');
    add(lowDisk ? 95 : 60, `Project folders: ${snap.nodeModules.length >= 60 ? '60 or more' : snap.nodeModules.length} node_modules folders take ${fmtKb(totalNm)}${snap.nodeModules.length >= 60 ? ' (the first 60 found)' : ''}. The biggest: ${top}. For projects you are not working on, delete them (they come back with npm install): rm -rf '${snap.nodeModules[0].path}'`);
  }
  // things that rebuild themselves or are already thrown away: one list, biggest first, each with its command
  const clean: Array<{ kb: number; text: string }> = [];
  const put = (label: string, min: number, text: (size: string) => string) => {
    const kb = snap.sizes[label];
    if (kb && kb >= min) clean.push({ kb, text: text(fmtKb(kb)) });
  };
  put('Xcode build data', 500 * 1024, z => `Xcode build data, ${z} (Xcode rebuilds it): rm -rf ~/Library/Developer/Xcode/DerivedData`);
  put('iOS simulators', 1024 * 1024, z => `iOS simulators, ${z}: xcrun simctl delete unavailable`);
  put('App caches', 1024 * 1024, z => `App caches, ${z} (apps rebuild them): look first with du -sh ~/Library/Caches/* | sort -h | tail`);
  put('User cache', 1024 * 1024, z => `User cache, ${z}: look first with du -sh ~/.cache/* | sort -h | tail`);
  put('npm cache', 200 * 1024, z => `npm cache, ${z}: npm cache clean --force`);
  put('Cargo registry', 500 * 1024, z => `Cargo registry, ${z}: rm -rf ~/.cargo/registry/cache`);
  put('Docker data', 1024 * 1024, z => `Docker, ${z}: docker system prune`);
  put('Trash', 200 * 1024, z => `Trash, ${z}, waiting to be emptied`);
  const tmpKb = (snap.sizes['Temporary files (/tmp)'] ?? 0) + (snap.sizes['Temporary files (/var/tmp)'] ?? 0);
  if (tmpKb >= 200 * 1024) clean.push({ kb: tmpKb, text: `Temporary files, ${fmtKb(tmpKb)} in /tmp and /var/tmp (they clear on restart): find /tmp -type f -mtime +3 -delete` });
  if (clean.length) {
    clean.sort((x, y) => y.kb - x.kb);
    const total = clean.reduce((n, c) => n + c.kb, 0);
    add(lowDisk ? 92 : 62, `Safe to clear, about ${fmtKb(total)} in all:\n${clean.slice(0, 6).map(c => `   - ${c.text}`).join('\n')}`);
  }
  if (snap.bigDownloads.length) {
    add(lowDisk ? 70 : 45, `Downloads: large files you may be done with: ${snap.bigDownloads.slice(0, 3).map(d => `${d.path.split('/').pop()} (${fmtKb(d.kb)})`).join(', ')}.`);
  }
  if (snap.disk) {
    const freePct = (snap.disk.availKb / snap.disk.sizeKb) * 100;
    if (freePct < 10) add(110, `Storage is almost full (${freePct.toFixed(0)}% free). A nearly full disk slows everything down, because the system has no room to swap or cache. Start with the items below.`);
    else if (freePct < 20) add(90, `Storage: only ${freePct.toFixed(0)}% free. Keep at least 15 to 20% free for the system to run well.`);
  }

  // habits and hardware
  if ((snap.uptimeDays ?? 0) >= 14) add(35, `It has been ${snap.uptimeDays} days since the last restart. A restart clears memory leaks and applies updates.`);
  if (snap.battery?.condition && !/normal/i.test(snap.battery.condition)) add(50, `Battery: condition is "${snap.battery.condition}"${snap.battery.maxCapacity ? `, maximum capacity ${snap.battery.maxCapacity}` : ''}. It may be time for a replacement.`);
  else if (snap.battery?.cycles && snap.battery.cycles >= 800) add(30, `Battery: ${snap.battery.cycles} charge cycles. Capacity falls with age; check Settings > Battery for its health.`);

  const order = tips.sort((a, b) => b.weight - a.weight);
  const wanted = focus === 'storage' ? order.filter(t => /Storage|node_modules|Safe to clear|Downloads/i.test(t.text)) : order;
  const shown = (wanted.length ? wanted : order).slice(0, 7);
  const headline = facts.length ? `Looking at this computer: ${facts.join('; ')}.` : 'Looking at this computer.';
  if (shown.length === 0) return { headline, lines: ['Nothing stands out. Memory, storage and processes all look healthy, so there is no recommendation to make.'] };
  return { headline, lines: shown.map((t, i) => `${i + 1}. ${t.text}`) };
}

export function formatAdvice(a: Advice): string {
  return `${a.headline}\n\n${a.lines.join('\n\n')}\n\nNothing was changed. Tell me which of these you want done and I will show the exact command and ask first.`;
}
