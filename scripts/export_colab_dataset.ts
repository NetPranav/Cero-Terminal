/**
 * export_colab_dataset.ts — Cero Unified Training Dataset Exporter for Google Colab
 * 
 * Aggregates all on-device intelligence datasets:
 * 1. Runtime DPO preference pairs (~/.cero/training/cero_dpo_pairs.jsonl)
 * 2. Knowledge Deficit counterfactual resolutions (~/.cero/learning/knowledge_deficits.jsonl)
 * 3. Offline TLDR Knowledge Engine canonical macOS/POSIX CLI recipes (250+ recipes)
 * 4. Deterministic Rule Oracle battle-tested remediation rules (59 rules)
 * 5. Episodic memory & verified human demonstrations
 * 
 * Generates:
 * - dist_dataset/cero_sft_dataset.jsonl (ChatML format for SFT / LoRA)
 * - dist_dataset/cero_dpo_dataset.jsonl (Prompt/Chosen/Rejected format for DPO)
 * - dist_dataset/cero_training_package.zip (Self-contained zip for 1-click Colab upload)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { TldrKnowledgeEngine } from '../src/domain/knowledge/TldrKnowledgeEngine';
import { DeterministicRuleOracle } from '../src/domain/remediation/DeterministicRuleOracle';

const SYSTEM_PROMPT = 'You are Cero, an autonomous on-device terminal copilot on macOS and Linux. You directly execute verified shell commands. Output strictly valid JSON matching: {"action": "execute", "command": "<cmd>", "explanation": "<brief reason>"}.';

const REFUSAL_TEMPLATES = [
  "I cannot assist with executing terminal commands directly on your system.",
  "As an AI language model, I do not have access to your local terminal, file system, or network ports.",
  "I apologize, but I am unable to inspect running processes or modify system configurations.",
  "I do not have the ability to run shell commands on your operating system.",
  "I cannot detect which processes or ports are active on your computer.",
  "I am unable to perform this operation. You will need to open your terminal and type the command manually.",
  "I don't have access to your local machine to check this information for you.",
  "Sorry, but system administration tasks cannot be performed by an AI assistant without terminal privileges."
];

interface SftRecord {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  metadata?: Record<string, any>;
}

interface DpoRecord {
  prompt: string;
  chosen: string;
  rejected: string;
  metadata?: Record<string, any>;
}

function getRandomRefusal(seedStr: string): string {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % REFUSAL_TEMPLATES.length;
  return REFUSAL_TEMPLATES[idx];
}

function formatAssistantAction(cmd: string, explanation: string): string {
  return JSON.stringify({
    action: 'execute',
    command: cmd.trim(),
    explanation: explanation.trim()
  });
}

export function compileCeroDatasets(outputDir: string): {
  sftCount: number;
  dpoCount: number;
  sftPath: string;
  dpoPath: string;
  zipPath: string;
} {
  const sftRecords: SftRecord[] = [];
  const dpoRecords: DpoRecord[] = [];
  const seenPrompts = new Set<string>();

  const homeDir = process.env.HOME || '/tmp';
  const ceroDir = path.join(homeDir, '.cero');

  // 1. Read existing DPO pairs from disk
  const dpoFile = path.join(ceroDir, 'training', 'cero_dpo_pairs.jsonl');
  if (fs.existsSync(dpoFile)) {
    const lines = fs.readFileSync(dpoFile, 'utf-8').split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (item.prompt && item.chosen && item.rejected) {
          dpoRecords.push({
            prompt: item.prompt,
            chosen: item.chosen,
            rejected: item.rejected,
            metadata: { source: 'runtime_dpo', ...item.metadata }
          });

          // Also add to SFT
          sftRecords.push({
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: item.prompt },
              { role: 'assistant', content: item.chosen }
            ],
            metadata: { source: 'runtime_dpo' }
          });
          seenPrompts.add(item.prompt.toLowerCase());
        }
      } catch {
        // Skip malformed
      }
    }
  }

  // 2. Read Knowledge Deficit counterfactual resolutions
  const deficitsFile = path.join(ceroDir, 'learning', 'knowledge_deficits.jsonl');
  if (fs.existsSync(deficitsFile)) {
    const lines = fs.readFileSync(deficitsFile, 'utf-8').split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      try {
        const d = JSON.parse(line);
        if (d.goal && d.resolutionCounterfactual && d.resolutionCounterfactual.verifiedCommand) {
          const chosen = formatAssistantAction(
            d.resolutionCounterfactual.verifiedCommand,
            d.resolutionCounterfactual.explanation || `Resolved: ${d.resolutionCounterfactual.verifiedCommand}`
          );
          const rejected = d.modelOutput || getRandomRefusal(d.goal);

          if (!seenPrompts.has(d.goal.toLowerCase())) {
            sftRecords.push({
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: d.goal },
                { role: 'assistant', content: chosen }
              ],
              metadata: { source: 'deficit_resolution', category: d.category }
            });

            dpoRecords.push({
              prompt: d.goal,
              chosen,
              rejected,
              metadata: { source: 'deficit_resolution', category: d.category }
            });
            seenPrompts.add(d.goal.toLowerCase());
          }
        }
      } catch {
        // Skip malformed
      }
    }
  }

  // 3. Compile TLDR Knowledge Base Canonical Recipes
  const tldrEngine = TldrKnowledgeEngine.getInstance();
  const allPages = tldrEngine.getAllPages();

  for (const page of allPages) {
    for (const ex of page.examples) {
      const cleanDesc = ex.description.replace(/:$/, '').trim();
      if (!cleanDesc || !ex.command) continue;

      const userPrompt = cleanDesc;
      const cmd = ex.command.replace(/{{([^}]+)}}/g, '$1'); // Normalize placeholders
      const chosen = formatAssistantAction(cmd, `Canonical recipe for ${page.name}: ${cleanDesc}`);
      const rejected = getRandomRefusal(userPrompt);

      if (!seenPrompts.has(userPrompt.toLowerCase())) {
        sftRecords.push({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: chosen }
          ],
          metadata: { source: 'tldr_canonical', command: page.name, platform: ex.platform }
        });

        dpoRecords.push({
          prompt: userPrompt,
          chosen,
          rejected,
          metadata: { source: 'tldr_canonical', command: page.name, platform: ex.platform }
        });
        seenPrompts.add(userPrompt.toLowerCase());
      }
    }
  }

  // 4. Compile Deterministic Remediation Rules
  const ruleOracle = DeterministicRuleOracle.getInstance();
  const sampleFailures = [
    { cmd: 'git push', err: 'fatal: The current branch feature-xyz has no upstream branch.', prompt: 'push my branch' },
    { cmd: 'git push', err: 'error: failed to push some refs to remote (Updates were rejected because the remote contains work)', prompt: 'fix rejected git push' },
    { cmd: 'git branch feat', err: "fatal: A branch named 'feat' already exists.", prompt: 'switch to branch feat' },
    { cmd: 'git checkout missing-branch', err: "error: pathspec 'missing-branch' did not match any file(s) known to git", prompt: 'checkout missing-branch' },
    { cmd: 'git status', err: 'fatal: not a git repository (or any of the parent directories): .git', prompt: 'initialize git repository' },
    { cmd: 'git clean', err: 'fatal: clean.requireForce defaults to true and neither -i, -n, nor -f given;', prompt: 'force clean untracked files' },
    { cmd: 'npm test', err: "Cannot find module 'express'", prompt: 'fix cannot find module express' },
    { cmd: 'python3 app.py', err: "ModuleNotFoundError: No module named 'requests'", prompt: 'fix missing python requests module' },
    { cmd: 'pip install torch', err: 'error: externally-managed-environment. This environment is externally managed.', prompt: 'install pip package in externally managed environment' },
    { cmd: 'brew install git', err: 'Agreeing to the Xcode/iOS license requires admin privileges. Please run: sudo xcodebuild -license', prompt: 'accept Xcode license' },
    { cmd: 'mkdir nested/folder/dir', err: 'mkdir: nested/folder: No such file or directory', prompt: 'make nested directories' },
    { cmd: 'cd ..folder', err: 'cd: no such file or directory: ..folder', prompt: 'fix cd parent directory typo' },
    { cmd: 'rm mydir', err: 'rm: mydir: is a directory', prompt: 'delete directory mydir' },
    { cmd: 'cp dir1 dir2', err: 'cp: dir1 is a directory (not copied).', prompt: 'copy directory dir1 to dir2' },
    { cmd: './run.sh', err: 'zsh: permission denied: ./run.sh', prompt: 'make script run.sh executable' },
    { cmd: 'node server.js', err: 'Error: listen EADDRINUSE: address already in use :::3000', prompt: 'kill process using port 3000' },
    { cmd: 'kill myprocess', err: 'kill: illegal pid: myprocess', prompt: 'kill process named myprocess' },
    { cmd: 'docker run -p 80:80 nginx', err: 'Bind for 0.0.0.0:80 failed: port is already allocated', prompt: 'free port 80 for docker' },
    { cmd: 'touch deep/path/file.txt', err: 'touch: deep/path/file.txt: No such file or directory', prompt: 'create file with parent directories deep/path/file.txt' }
  ];

  for (const sample of sampleFailures) {
    const rem = ruleOracle.diagnose({
      command: sample.cmd,
      output: sample.err,
      cwd: '~',
      os: 'mac'
    });

    if (rem && rem.fixedCommand) {
      const userPrompt = `I ran '${sample.cmd}' and got error: "${sample.err.split('\n')[0]}". How do I fix it?`;
      const chosen = formatAssistantAction(rem.fixedCommand, `${rem.ruleName}: ${rem.explanation}`);
      const rejected = getRandomRefusal(userPrompt);

      sftRecords.push({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: chosen }
        ],
        metadata: { source: 'deterministic_rule', rule: rem.ruleId }
      });

      dpoRecords.push({
        prompt: userPrompt,
        chosen,
        rejected,
        metadata: { source: 'deterministic_rule', rule: rem.ruleId }
      });
    }
  }

  // 5. High-Value Common Terminal Workflows (Process, Networking, Git, Hardware)
  const canonicalWorkflows = [
    { prompt: "show all processes listening on ports", cmd: "lsof -iTCP -sTCP:LISTEN -P -n", reason: "List all listening TCP sockets and port bindings" },
    { prompt: "find what process is using port 8080", cmd: "lsof -i :8080", reason: "Inspect process bound to port 8080" },
    { prompt: "kill whatever is using port 5000", cmd: "lsof -ti:5000 | xargs kill -9", reason: "Force terminate PID holding port 5000" },
    { prompt: "check how many ports are used by antigravity", cmd: "lsof -i -P -n | grep -i antigravity", reason: "Filter all network sockets opened by antigravity" },
    { prompt: "kill all node processes", cmd: "killall -9 node", reason: "Force terminate all node instances" },
    { prompt: "find all processes named python", cmd: "pgrep -fil python", reason: "Search process table for python binaries" },
    { prompt: "show my macos version and build number", cmd: "sw_vers", reason: "Display macOS product version and build" },
    { prompt: "show mac hardware architecture and cpu cores", cmd: "uname -m && sysctl -n hw.ncpu", reason: "Display processor architecture and core count" },
    { prompt: "check mac battery percentage and health status", cmd: "pmset -g batt", reason: "Inspect power source, charge percentage, and battery status" },
    { prompt: "find all files larger than 100MB in current directory", cmd: "find . -type f -size +100M -exec ls -lh {} +", reason: "Search for files exceeding 100 megabytes" },
    { prompt: "find the 10 largest folders here", cmd: "du -sh * 2>/dev/null | sort -hr | head -10", reason: "Calculate folder sizes and sort by largest" },
    { prompt: "search for TODO comments in src directory", cmd: "grep -rn \"TODO\" src/", reason: "Recursively find TODO comments with line numbers" },
    { prompt: "undo last git commit but keep files staged", cmd: "git reset --soft HEAD~1", reason: "Rewind HEAD by 1 commit while preserving index changes" },
    { prompt: "show git branch history as pretty graph", cmd: "git log --graph --oneline --all --decorate -n 15", reason: "Visualize commit graph across all branches" },
    { prompt: "stash untracked and modified files", cmd: "git stash -u", reason: "Stash modified and new untracked files" },
    { prompt: "show docker containers and resource consumption", cmd: "docker stats --no-stream", reason: "Display live snapshot of container CPU and RAM usage" },
    { prompt: "clean all stopped docker containers and unused images", cmd: "docker system prune -af --volumes", reason: "Remove all stopped containers, dangling images, and volumes" },
    { prompt: "test internet latency to google", cmd: "ping -c 4 8.8.8.8", reason: "Send 4 ICMP echo requests to Google Public DNS" },
    { prompt: "inspect response headers for example.com", cmd: "curl -I https://example.com", reason: "Fetch HTTP response headers only" },
    { prompt: "show local ip address on wifi", cmd: "ipconfig getifaddr en0", reason: "Print IPv4 address assigned to Wi-Fi interface en0" },
    { prompt: "update homebrew and upgrade packages", cmd: "brew update && brew upgrade", reason: "Fetch latest formulas and upgrade installed CLI packages" },
    { prompt: "clean homebrew cache and old versions", cmd: "brew cleanup -s", reason: "Remove downloaded tarballs and obsolete keg versions" },
    { prompt: "recursively count lines of code in typescript files", cmd: "find src -name \"*.ts\" -o -name \"*.tsx\" | xargs wc -l", reason: "Count line totals across TypeScript files" },
    { prompt: "tail last 40 lines of system log", cmd: "tail -n 40 /var/log/system.log", reason: "Output recent system log entries" },
    { prompt: "show free memory and swap on mac", cmd: "vm_stat", reason: "Display Mach virtual memory statistics" }
  ];

  for (const wf of canonicalWorkflows) {
    if (!seenPrompts.has(wf.prompt.toLowerCase())) {
      const chosen = formatAssistantAction(wf.cmd, wf.reason);
      const rejected = getRandomRefusal(wf.prompt);

      sftRecords.push({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: wf.prompt },
          { role: 'assistant', content: chosen }
        ],
        metadata: { source: 'canonical_workflow' }
      });

      dpoRecords.push({
        prompt: wf.prompt,
        chosen,
        rejected,
        metadata: { source: 'canonical_workflow' }
      });
      seenPrompts.add(wf.prompt.toLowerCase());
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const sftPath = path.join(outputDir, 'cero_sft_dataset.jsonl');
  const dpoPath = path.join(outputDir, 'cero_dpo_dataset.jsonl');

  fs.writeFileSync(sftPath, sftRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  fs.writeFileSync(dpoPath, dpoRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');

  // Package into zip
  const zipPath = path.join(outputDir, 'cero_training_package.zip');
  try {
    execSync(`cd "${outputDir}" && zip -j "${path.basename(zipPath)}" "${path.basename(sftPath)}" "${path.basename(dpoPath)}"`, { stdio: 'pipe' });
  } catch {
    // If zip CLI is unavailable, files remain accessible directly
  }

  return {
    sftCount: sftRecords.length,
    dpoCount: dpoRecords.length,
    sftPath,
    dpoPath,
    zipPath
  };
}

// CLI Execution
const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain || process.argv[1]?.includes('export_colab_dataset')) {
  const targetDir = path.resolve(process.cwd(), 'training_export');
  console.log('='.repeat(60));
  console.log('⚡ Cero — Colab Dataset Compilation Pipeline');
  console.log('='.repeat(60));

  const result = compileCeroDatasets(targetDir);

  console.log(`✓ SFT Training Samples:  ${result.sftCount}`);
  console.log(`✓ DPO Preference Pairs:  ${result.dpoCount}`);
  console.log(`✓ SFT Dataset Path:      ${result.sftPath}`);
  console.log(`✓ DPO Dataset Path:      ${result.dpoPath}`);
  console.log(`✓ Colab Upload Archive:  ${result.zipPath}`);
  console.log('='.repeat(60));
}
