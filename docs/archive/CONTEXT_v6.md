# Sentinel Terminal: Master AI Agent & Architecture Context

> **Target Audience:** AI Coding Assistants, Subagents, Autonomous Evaluators, and Core Contributors.  
> **Purpose:** Serves as the complete, authoritative knowledge base for the Sentinel Terminal codebase. Any AI agent reading this document should understand every subsystem, design pattern, IPC interface, data contract, Linux quirk, and architectural decision.

---

## 1. Product Vision & Architectural Thesis

**Sentinel Terminal** is an autonomous, AI-native terminal emulator and operating system copilot engineered specifically for Linux power users and developers.

Unlike passive terminal assistants (which merely echo shell commands for the user to copy-paste), Sentinel is an **active execution agent**:
1. **Direct Execution Authority:** Sentinel plans, approves through security, and executes terminal commands and native OS capabilities directly.
2. **Deterministic & Self-Healing:** If a command fails (e.g. exit code $\ne 0$, missing dependency, wrong flag), Sentinel captures `stderr`, diagnoses the failure via self-healing loops, and retries with corrected alternatives (up to 3 attempts) before falling back to native deterministic capabilities.
3. **Dual AI Inference Engines:** Sentinel does not require third-party cloud APIs or even an external Ollama install. It features an embedded, native `llama-server` sidecar that downloads and runs local GGUF models (e.g. Qwen 2.5 Coder 3B, Qwen3 4B) directly on CPU or GPU with zero configuration, while maintaining seamless support for external Ollama instances.
4. **Safety Sandbox:** Every command is inspected by an Abstract Syntax Tree (AST) parser and multi-tier security engine before execution, preventing catastrophic actions (`rm -rf /`, device overwrites, fork bombs) while granting instant pass-through for read-only diagnostics.
5. **Continuous Learning:** When the AI is uncertain and the human runs a command, Sentinel observes and learns the trigger-to-command mapping (`~/.sentinel/learned_patterns.json`), feeds it into an episodic memory vector store, and integrates with a sample-efficient Reinforcement Learning loop (`Sentinel-SERL`).

---

## 2. High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SENTINEL TERMINAL                                    │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
               ┌────────────────────────────┴────────────────────────────┐
               ▼                                                         ▼
┌──────────────────────────────┐                         ┌──────────────────────────────┐
│  Presentation Layer (React)  │                         │     Rust Core (Tauri v2)     │
│ • xterm.js (WebGL renderer)  │ ◄──── IPC Invokes ────► │ • pty.rs (portable-pty)      │
│ • TerminalView.tsx           │      (Tauri Events)     │ • embedded_server.rs (llama) │
│ • OutputFormatter.ts (ANSI)  │                         │ • command execution sandbox  │
│ • Dropdown Adaptive Plan UI  │                         │ • platform sysfs bindings    │
└──────────────┬───────────────┘                         └──────────────┬───────────────┘
               │                                                        │
               ▼                                                        ▼
┌──────────────────────────────┐                         ┌──────────────────────────────┐
│       AI Agent Subsystem     │                         │   Linux Operating System     │
│ • AgentLoop.ts (ReAct loop)  │                         │ • /bin/bash execution        │
│ • AdaptivePlanEngine.ts      │                         │ • /sys/class/power_supply    │
│ • SecurityEngine.ts (AST)    │                         │ • /proc/cpuinfo, /proc/mem   │
│ • GBNF Grammar Decoding      │                         │ • systemd (systemctl)        │
│ • Embedded & Ollama Provider │                         │ • Hyprland (hyprctl socket)  │
│ • Episodic Memory & SERL RL  │                         │ • nmcli, bluetoothctl, ss    │
└──────────────────────────────┘                         └──────────────────────────────┘
```

---

## 3. Technology Stack & Dependencies

| Component | Technology | Rationale & Configuration |
|---|---|---|
| **Application Shell** | Tauri v2.0 (`tauri-app`) | Native Linux windowing, minimal RAM footprint (<40MB idle), Rust security. |
| **Frontend Framework** | React 19 + TypeScript | Strict typing, reactive state, component isolation. |
| **Styling & Theme** | Vanilla CSS / Custom tokens | Absolute control over ANSI terminal typography, glassmorphism, Hyprland rice cohesion. |
| **Terminal Emulator** | `xterm.js` + WebGL addon | Hardware-accelerated terminal canvas, custom themes, PTY escape parsing. |
| **PTY Backend** | Rust `portable-pty` | Direct fork/exec of `/bin/bash` with true pseudo-terminal behavior and resize signals. |
| **Embedded AI Engine** | `llama-server` (llama.cpp) | Direct GGUF model execution on Linux x86_64, zero external dependencies. |
| **External AI Engine** | Ollama API | HTTP streaming API (`/api/chat`, `/api/generate`), Qwen/DeepSeek/Llama models. |
| **Grammar Constraining** | GBNF Grammar | Constrains local model sampling to valid JSON action contracts. |
| **Test Suite** | Vitest (`v4.1.10`) | Unit, integration, and capability test suites (155+ test suites, 980+ tests). |

---

## 4. Deep-Dive Subsystem Architecture

### 4.1 Terminal & Shell PTY Architecture
- **Location:** `src-tauri/src/pty.rs` and `src/presentation/TerminalView.tsx`
- **PTY Lifecycle:**
  1. Tauri spawns `/bin/bash` (or user's `$SHELL`) inside a true Linux pseudo-terminal via `portable-pty`.
  2. Raw binary output streams asynchronously over Tauri event `pty-data` to `xterm.js`.
  3. Terminal dimensions (rows/columns) synchronize dynamically via `resize_pty` IPC.
- **AI Command Interception:**
  - When the user prefixes a prompt with `>` (e.g. `>check battery status`), `TerminalView.tsx` writes `\x03` (Ctrl+C) to the PTY to cancel the pending bash prompt, suppresses command echo, and routes the goal to `agentLoop.run()`.
- **Output Observers & Real-Time Auto-Healing:**
  - `PtyOutputObserver.ts` monitors raw shell stdout/stderr in the background.
  - Detects build failures (e.g. `npm error`, `gcc: error`, `cargo: error`, `port already in use`).
  - Automatically offers interactive remediation prompts (`>fix` / `>heal`).
- **Shadow PTY Simulator (`ShadowPtySimulator.ts`):**
  - Spawns a non-rendered virtual PTY to dry-run speculative or high-risk commands and verify exit codes before exposing them to the user.

---

### 4.2 Autonomous AI Agent Loop (`AgentLoop.ts`)
The core orchestrator implements an augmented **ReAct (Reason + Act + Observe)** loop:

```
                  ┌──────────────────────────────┐
                  │       User Goal (>)          │
                  └──────────────┬───────────────┘
                                 │
                   Is AI Model Running & Available?
                     ├─── NO ──► Check TLDR ground-truth knowledge base
                     │           ├── Match found ──► Run verified recipe
                     │           └── No match ────► Run tryFastPath regex
                     │
                     └─── YES ─► Adaptive Planning Required?
                                 ├── YES ──► AdaptivePlanEngine (multi-phase DAG)
                                 └── NO ───► runLLMLoop (Core ReAct Cycle)
```

#### The ReAct Execution Cycle (`runLLMLoop`):
1. **Prompt Construction:** `buildSystemPrompt()` builds a context-aware system prompt containing current OS (`linux`), current working directory (`cwd`), shell (`/bin/bash`), ISO timestamp, dynamic tool definitions, and native Linux few-shot exemplars.
2. **Sampling with Activation Steering & GBNF:**
   - Evaluates the prompt through `provider.generate()`.
   - Injects negative logit bias (`refusalPenalty: -100.0`) on conversational refusal tokens ("As an AI...", "I cannot manipulate...").
   - Enforces GBNF grammar (`GbnfGrammarManager.ts`) ensuring the LLM outputs strict JSON matching the action schema:
     ```json
     {"action": "execute", "command": "<linux_command>", "explanation": "<1-line reason>"}
     ```
     or
     ```json
     {"action": "done", "summary": "<final_answer>"}
     ```
3. **Refusal Interception (Tier 2):**
   - If the model emits a canned chatbot refusal, Sentinel intercepts it, logs a refusal penalty to `SentinelSerlCoordinator`, extracts any backticked command in the refusal, or re-prompts the model with strict execution enforcement.
4. **Action Execution:**
   - Routes shell commands through `ToolExecutor.ts` $\rightarrow$ `SecurityEngine.ts` $\rightarrow$ `ShellSDKCapability.ts`.
5. **Self-Healing Loop:**
   - If execution fails (exit code $\ne 0$ or stderr), Sentinel feeds the failure back into the LLM context:
     `"Command failed (error). Diagnosing failure and retrying (Attempt X/3)..."`
   - Retries up to 3 times with diagnosed corrections.
   - If all 3 attempts fail, Sentinel activates its **Deterministic Safety Net Fallback**, invoking native TypeScript capability drivers (`system.processes`, `system.storage`, etc.).

---

### 4.3 AI Engine & Model Management

#### A. Embedded Standalone Engine (`llama-server`)
- **Location:** `src-tauri/src/embedded_server.rs` & `src/ai/models/EmbeddedEngineManager.ts`
- **Linux Execution Path:** Searches for `llama-server` in `/usr/lib/ollama/`, `/usr/bin/`, `/usr/local/bin/`, or downloads the static Linux x86_64 release from GitHub to `~/.sentinel/bin/`.
- **Model Discovery:** Discovers GGUF weights in `~/.sentinel/models/`, `~/.ollama/models/blobs/`, or `/var/lib/ollama/blobs/`.
- **Startup Parameters:**
  ```bash
  llama-server -m <gguf_path> --port 11435 --ctx-size 8192 --threads 6 --flash-attn auto
  ```
- **Zero Configuration:** Sentinel automatically checks if a local engine is running. If not, it can boot its embedded sidecar in <1.5 seconds.

#### B. Ollama Provider (`OllamaProvider.ts`)
- Connects to local Ollama on `http://127.0.0.1:11434`.
- **Reasoning Model Support (`data.thinking`):**
  - Models like `qwen3:4b` and `deepseek-r1` output reasoning tokens inside `data.thinking` before emitting final response text.
  - If `data.response` is empty, Sentinel automatically extracts the answer from `data.thinking`.
  - For standard fast command inference, passes `think: false` to disable thinking latency.

---

### 4.4 Linux Capabilities & System Drivers

All native OS probes live in `src/sdk/capabilities/drivers/`:

```
src/sdk/capabilities/drivers/
├── SystemSDKCapability.ts    # CPU, RAM, disk, battery, uptime, processes, services
├── ShellSDKCapability.ts     # Platform-detected shell execution (/bin/bash on Linux)
├── ApplicationCapability.ts  # Desktop app launch & running detection via .desktop / pgrep
├── NetworkCapability.ts      # Active listening ports (ss), free port search, ping, IP
├── WifiCapability.ts         # nmcli scanning and radio toggling
├── BluetoothCapability.ts    # bluetoothctl device listing and pairing
├── BrowserCapability.ts      # Default browser navigation and web search via xdg-open
└── NodeCapability.ts         # Node.js project inspection and script execution
```

#### Native Linux Hardware Metric Extraction:
- **Storage:** Executes `df -h -P -x tmpfs -x devtmpfs -x squashfs -x efivarfs` and parses physical mount points, total capacity, used space, available space, and percentage utilization.
- **Memory (RAM):** Executes `free -m` and parses total, used, free, available RAM, and swap partition utilization.
- **Battery:** Direct inspection of `/sys/class/power_supply/BAT*/capacity` and `status`, falling back to `upower` or desktop AC power reporting.
- **CPU & Kernel:** Inspects `uname -srm`, `/etc/os-release`, `lscpu`, and `/proc/loadavg`.
- **Processes:**
  - Supports singular mode (`count: 1`, `singular: true`) for top offender queries (`which process is using the most cpu`).
  - Supports batch mode for full diagnostic lists (`list running processes`).
  - Sorts by `--sort=-pcpu` for CPU and `--sort=-pmem` for memory.

---

### 4.5 Security Engine & Safety Sandbox

- **Location:** `src/domain/security/SecurityEngine.ts` & `src/domain/security/ShellAstParser.ts`
- **4-Tier Classification:**
  1. `SAFE` (Risk Score 0–20): Read-only inspection commands (`ls`, `pwd`, `df`, `free`, `ip`, `ss`, `lscpu`, `git status`, `git log`, `npm test`). Executes instantly with **zero user prompts or timeouts**.
  2. `SENSITIVE` (Risk Score 21–60): Commands modifying local state or configuration (`pkill`, `git checkout`, `mkdir`, `npm install`, screen lock). Displays a plain English confirmation card.
  3. `DANGEROUS` (Risk Score 61–85): System package installation, daemon restarts, file deletions (`rm`, `systemctl restart`, `kill -9`). Requires explicit user confirmation.
  4. `CRITICAL` (Risk Score 86–100): Catastrophic commands (`rm -rf /`, `mkfs`, `dd if=... of=/dev/...`, fork bombs `:(){ :|:& };:`). Blocked unconditionally.

---

### 4.6 Presentation & Output Formatting (`OutputFormatter.ts`)

Converts raw tool outputs into clean ANSI terminal presentations with guaranteed CRLF (`\r\n`) endings to prevent xterm.js staircase effects:

1. **Singular Process Cards:**
   When a user asks `>which process is using the most cpu`, Sentinel isolates the #1 process and displays:
   ```text
     ▶ Top Process (sorted by CPU): llama-server  (PID:52374 | CPU: 196% | RAM: 19.9%)
   ```
2. **Multi-Process Tables:**
   When the user asks `>list running processes`, Sentinel formats the full batch:
   ```text
   Top Processes (sorted by CPU):
     • llama-server  PID:52374 | CPU: 196% | RAM: 19.9%
     • firefox-bin  PID:50063 | CPU: 24.6% | RAM: 3.8%
     • Hyprland  PID:1098 | CPU: 2.6% | RAM: 0.7%
   ```
3. **Storage Mounts:**
   ```text
   Storage Mounts & Disk Usage:
     • / (/dev/nvme0n1p6) — 64G free of 261G [75% used]
     • /mnt/windows (/dev/nvme0n1p3) — 95G free of 195G [52% used]
   ```
4. **Battery & RAM Cards:**
   - `🔋 Battery: 58% — Not charging (Battery (BAT1))`
   - `System Memory (RAM): 6.4 GB used / 15.1 GB total (8.9 GB available) | Swap: 2.2 GB used of 7.7 GB`

---

### 4.7 Continuous Learning & SERL Reinforcement Learning
- **Demonstration Engine (`DemonstrationLearningEngine.ts`):**
  - If Sentinel fails to resolve an AI goal and the human manually executes the solution in the terminal within 3 minutes, Sentinel automatically pairs the goal with the demonstrated command and writes it to `~/.sentinel/learned_patterns.json`.
  - Manual learning: `/learn <trigger> -> <command>`.
  - Unlearning: `/forget <trigger>`.
- **Episodic Memory (`EpisodicMemoryEngine.ts`):**
  - Vector similarity search over past successful command executions.
  - Dynamically injects the most relevant historical demonstrations into the prompt as few-shot exemplars.
- **Sentinel-SERL Coordinator (`SentinelSerlCoordinator.ts`):**
  - Implements a sample-efficient reinforcement learning loop.
  - Logs reward signals: successful task completion (+1.0), self-healing recovery (+0.5), human demonstration (+2.0), model refusal (-1.0), execution error (-0.8).
  - Prepares training data for local LoRA fine-tuning.

---

### 4.8 Linux Rice & Dotfile Manager (`DotfileManager.ts`)
- Direct integration with Linux window managers and desktop rice configurations:
  - **Hyprland:** `~/.config/hypr/hyprland.conf` (queries and toggles `exec-once` autostart directives).
  - **Waybar:** `~/.config/waybar/config` & `style.css`.
  - **Kitty & Alacritty:** Terminal font, opacity, and padding configurations.
  - **Tmux & Neovim:** Dotfile verification and synchronization.

---

## 5. File Map & Codebase Guide

```
sentinal/
├── src/
│   ├── ai/
│   │   ├── agent/
│   │   │   ├── AgentLoop.ts             # Main ReAct loop, self-healing, fast-paths
│   │   │   ├── AdaptivePlanEngine.ts    # Multi-phase planning & execution DAGs
│   │   │   ├── SystemPrompt.ts          # Prompt builder with Linux few-shots
│   │   │   ├── ToolExecutor.ts          # Tool authorization & execution pipeline
│   │   │   └── ShadowPtySimulator.ts    # Virtual shell dry-run simulator
│   │   ├── models/
│   │   │   ├── EmbeddedEngineManager.ts # Standalone llama-server manager
│   │   │   ├── GbnfGrammarManager.ts    # JSON schema GBNF grammar definitions
│   │   │   └── ActivationSteeringManager.ts # Logit bias refusal suppressor
│   │   ├── provider/
│   │   │   ├── OllamaProvider.ts        # Ollama streaming client & reasoning extractor
│   │   │   └── LlamaCppProvider.ts      # Direct llama-server HTTP client
│   │   └── knowledge/
│   │       └── TldrKnowledgeEngine.ts   # Offline ground-truth CLI database
│   ├── domain/
│   │   ├── security/
│   │   │   ├── SecurityEngine.ts        # Risk scoring (0–100) & safe allowlists
│   │   │   └── ShellAstParser.ts        # AST parser for shell command tokens
│   │   ├── learning/
│   │   │   ├── DemonstrationLearningEngine.ts # Human demonstration watcher
│   │   │   ├── EpisodicMemoryEngine.ts        # Persistent episodic memory storage
│   │   │   └── SentinelSerlCoordinator.ts    # Reinforcement learning reward tracker
│   │   ├── services/
│   │   │   └── SystemServiceManager.ts  # Systemd service manager
│   │   └── rice/
│   │       ├── DotfileManager.ts        # Hyprland / Waybar autostart manager
│   │       └── DotfileSyncEngine.ts     # Dotfile sync and backup engine
│   ├── presentation/
│   │   ├── TerminalView.tsx             # Main React view, xterm.js terminal, tabs, splits
│   │   ├── OutputFormatter.ts           # Clean ANSI terminal formatter (cards, tables)
│   │   └── OutputFormatter.test.ts      # Formatter unit test suite
│   ├── sdk/
│   │   └── capabilities/
│   │       ├── CapabilitySDK.ts         # Base capability driver contracts
│   │       ├── CapabilityRegistrySDK.ts # Capability registration & lookup
│   │       └── drivers/
│   │           ├── SystemSDKCapability.ts   # Linux CPU, RAM, storage, battery probes
│   │           ├── ShellSDKCapability.ts    # /bin/bash shell execution driver
│   │           ├── NetworkCapability.ts     # ss port inspector & IP discovery
│   │           ├── ApplicationCapability.ts # Desktop application launcher
│   │           ├── WifiCapability.ts        # nmcli wireless manager
│   │           └── BluetoothCapability.ts   # bluetoothctl device manager
│   └── workflows/                       # Complete multi-stage workflow DAG engine
│       ├── engine/                      # Workflow graph and IR compilers
│       ├── models/                      # Workflow node types and variable definitions
│       └── registry/                    # Workflow template & instance registry
└── src-tauri/
    ├── src/
    │   ├── main.rs                      # Tauri v2 entry point and command registration
    │   ├── pty.rs                       # Rust portable-pty process manager
    │   └── embedded_server.rs           # Rust llama-server subprocess manager
    └── Cargo.toml
```

---

## 6. Protocols & Data Contracts

### 6.1 LLM JSON Action Contract
Every model generation MUST satisfy the GBNF-enforced action contract:

```json
// To execute a terminal command:
{
  "action": "execute",
  "command": "ps -eo pid,%cpu,%mem,comm --sort=-%cpu | head -n 2",
  "explanation": "Display the top CPU-consuming process"
}

// To answer a conversational query or complete an explanation:
{
  "action": "done",
  "summary": "Process llama-server (PID 52374) is using 196% CPU."
}
```

### 6.2 Capability Driver Execution Result
```typescript
export interface CapabilityExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  commandExecuted?: string;
  cancelled?: boolean;
}
```

### 6.3 Structured Hardware Metric Payloads
- **Processes (`system.processes`):**
  ```json
  {
    "sortedBy": "cpu",
    "count": 1,
    "singular": true,
    "activeProcesses": [
      { "pid": 52374, "name": "llama-server", "cpuPercent": 196.0, "ramPercent": 19.9 }
    ]
  }
  ```
- **Storage (`system.storage`):**
  ```json
  {
    "volumes": [
      { "mount": "/", "total": "261G", "used": "184G", "available": "64G", "percentUsed": "75%", "filesystem": "/dev/nvme0n1p6" }
    ]
  }
  ```
- **Battery (`system.battery`):**
  ```json
  {
    "percentage": 58,
    "status": "Not charging",
    "isCharging": false,
    "powerSource": "Battery (BAT1)"
  }
  ```

---

## 7. Linux Quirks & Historical Gotchas (Lessons Learned)

When building or modifying code in Sentinel, keep these critical historical rules in mind:

1. **Never Hardcode Shell Paths:** Always detect Linux and use `/bin/bash` with `['-c', commandLine]`. Never hardcode `/bin/zsh` (which does not exist by default on Arch/Debian/Fedora).
2. **Never Return Mock macOS Data:** Avoid hardcoded Darwin values (`APFS`, `Apple M3`, `pmset`). Always read from `/sys/class/power_supply/`, `/proc/`, `df -h -P`, or `free -m`.
3. **Always Include Read-Only Diagnostic Commands in `safeCommands`:** In `SecurityEngine.ts`, any command not in `safeCommands` defaults to `level: 'SENSITIVE'`, triggering a consent modal. If running headless or in an automated benchmark, this results in a **5-minute timeout (300,000ms)**.
4. **Prevent Staircase Terminal Effects:** In `OutputFormatter.ts` and `TerminalView.tsx`, always format lines with CRLF (`\r\n`). Bare LF (`\n`) without preceding `\r` causes xterm.js to render staircase-indented text.
5. **Differentiate Singular vs. Plural Process Queries:** If the user asks `which process is using the most cpu`, return a single-process card (`llama-server`, PID, CPU%, RAM%). Do not dump a 15-process batch table unless the user explicitly asks to `list processes`.
6. **Extract Reasoning Tokens for Local Models:** Small reasoning models (`qwen3:4b`, `deepseek-r1`) frequently output text inside `data.thinking` with an empty `data.response`. Always check both properties in `OllamaProvider.ts`.

---

## 8. Development & Verification Guide

```bash
# 1. Run local development mode with hot reloading
npm run tauri dev

# 2. Run the entire unit and capability test suite (980+ tests)
npx vitest run

# 3. Run specific OutputFormatter or Capability tests
npx vitest run src/presentation/OutputFormatter.test.ts
npx vitest run src/sdk/capabilities/

# 4. Compile production frontend bundle (validates TypeScript & Vite)
npm run build

# 5. Check Rust backend compilation
cargo check --manifest-path src-tauri/Cargo.toml
```

---
*Maintained by the Sentinel Terminal Core Architecture Team.*
