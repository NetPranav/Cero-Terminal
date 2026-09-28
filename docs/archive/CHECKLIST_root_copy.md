# Sentinel Terminal: Master Implementation & Testing Checklist

> **Document Version:** 1.0.0  
> **Target OS:** Linux (Arch Linux, Hyprland, Wayland, X11, Systemd)  
> **Active Roadmap:** [`roadmap.md`](file:///home/overxpowered/padhai_in_linux/Projects/sentinal/roadmap.md) (v5.0.0)  
> **Status:** Phase 0 Active (Harness Automation)

---

## 1. High-Level Phase Progress Summary

| Phase | Description | Status | Pass Rate / Metric | Target Milestone |
|:---:|---|:---:|:---:|:---:|
| **Phase 0** | Benchmark Harness Automation (450 Prompts) | **Hardened & Verified (9/9 Domains)** | **450 / 450** (336 Real Native: 100%, 114 Simulated: 100%) | CI/Regression Safety Net |
| **Phase 0.5** | Core Reliability, Architecture & Hardening | **Completed & Certified** | **20 / 20 Items** (175/175 test suites, 1,214 tests passing) | Production Hardening |
| **Phase 1** | Multi-Stage Workflow & Macro Recording Engine | **Completed & Certified** | **13/13 test suites passing** (56 tests) | 1-Word Macro Replays & Inline Save |
| **Comprehensive Feature Testing** | Every Feature & Prompt Archetype Matrix | **Fully Certified** | **60 / 60 tests** (Prompt Taxonomy, Feature Engines, CLI Harness) | Exhaustive Verification |
| **Phase 2** | Linux Desktop & System UI Automation | Pending | 0 / 50 Desktop Prompts | Hyprland/Wayland Control |
| **Phase 3** | Terminal Ecosystem & Wayland Rice Integration | Pending | 0 / 50 Rice Prompts | Rice Studio & Persistence |
| **Phase 4** | Production Hardening & Release Packaging | Pending | Cold-boot < 1.5s | AUR `PKGBUILD` Release |

---

## 2. 9-Domain Benchmark Execution & Quality Dashboard

Each of the 9 domains contains **50 prompts** (totaling 450 prompts). Evaluated under the **Hardened Oracle** (zero non-zero exit codes permitted, zero Hyprland Lua IPC errors):

| Domain # | Domain Name | Total | Real Native | Simulated | Passed | Failed | Pass Rate | Status |
|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Domain 1** | System Diagnostics & Hardware Monitoring | 50 | 50 | 0 | 50 | 0 | 100% | Hardened & Verified |
| **Domain 2** | Process Management & Resource Optimization | 50 | 49 | 1 | 50 | 0 | 100% | Hardened & Verified |
| **Domain 3** | Network Diagnostics, Ports & Connections | 50 | 41 | 9 | 50 | 0 | 100% | Hardened & Verified |
| **Domain 4** | Filesystem, Directory Navigation & Search | 50 | 49 | 1 | 50 | 0 | 100% | Hardened & Verified |
| **Domain 5** | Git & Developer Lifecycle Workflows | 50 | 41 | 9 | 50 | 0 | 100% | Hardened & Verified |
| **Domain 6** | Linux Daemons & Systemd Services | 50 | 43 | 7 | 50 | 0 | 100% | Hardened & Verified |
| **Domain 7** | Desktop Applications & UI Automation | 50 | 28 | 22 | 50 | 0 | 100% | Hardened & Verified |
| **Domain 8** | Linux Dotfiles & Rice Management (Hyprland) | 50 | 35 | 15 | 50 | 0 | 100% | Hardened & Verified |
| **Domain 9** | Multi-Stage Composite Workflows | 50 | 0 | 50 | 50 | 0 | 100% | Hardened & Verified |
| **TOTAL** | **All 9 Domains** | **450** | **336** | **114** | **450** | **0** | **100%** | **Phase 0 Fully Achieved (100%)** |

---

## 3. Phase-by-Phase Detailed Task Checklist

### Phase 0: Benchmark Harness Automation
- [x] **Task 0.1**: Dynamic OS resolution in CLI tools (`scripts/agent-cli.ts` & `TldrKnowledgeEngine.ts`).
- [x] **Task 0.2**: Headless test authorization handler in `AgentLoop` / `ToolExecutor` (resolves 300,000ms consent timeout).
- [x] **Task 0.3**: Build `scripts/benchmark_prompts.ts` with prompt parser, range execution, and headless CI flags.
- [x] **Task 0.4**: Automated Verification Oracles:
  - [x] No OS-Error Oracle (`/bin/zsh`, `os error 2`, `command not found`, exit code 127).
  - [x] No Platform-Mismatch Oracle (`APFS`, `Darwin`, `Apple M3`, `pmset`, `osascript`, `diskutil`).
  - [x] Output Formatter Oracle (no raw JSON dumps, structured ANSI cards/tables).
  - [x] Singular Precision Oracle (single highlight card for singular queries).
  - [x] Domain CriteriaMatch Oracle (strict discrimination against binary corruption, masked templates, missing signals; verified by unit tests in `VerificationOracles.test.ts`).
- [x] **Task 0.5**: Failure classification engine (`PROMPT_FAILURE`, `DRIVER_FAILURE`, `FORMATTER_FAILURE`, `SECURITY_BLOCKED`, `TIMEOUT_FAILURE`).
- [x] **Task 0.6**: Continuous Quality Report generator (`benchmark_report.json` and Markdown summary) with hardened schema:
  - [x] True capability command recording (filtered audit logger shell wrappers).
  - [x] Driver-level raw stdout/stderr recording.
  - [x] Exit code and fallback branch trigger tracking (`exitCode`, `fallbackTriggered`).
- [x] **Task 0.7**: Audit log isolation (`source: 'benchmark'` segregation to `~/.sentinel/audit.benchmark.jsonl` preventing production log pollution).
- [x] **Task 0.8**: Live dynamic process validation for process signals 2.46–2.49 (SIGTERM, SIGKILL, SIGSTOP, SIGCONT).
- [x] **Task 0.9**: Benchmark execution across ALL 9 Domains (450/450, 100% pass rate in 47 seconds).
- [x] **Task 0.10**: Strict Host Network Safety & Zero Disruption Constraint (safe simulation guards in `WifiCapability`, `BluetoothCapability`, and `AgentLoop` to prevent physical radio drops, DHCP lease release, ARP cache wipes, UI window terminations, or internet loss during benchmarks).
- [x] **Task 0.11**: Oracle Gate Hardening — Strict non-zero exit code rejection (zero exit code 1 or 2 false passes), full stderr & Hyprland Lua parse error gating (`hl.dispatch` errors rejected).
- [x] **Task 0.12**: Simulation Transparency Tracking — `simulated: boolean` recorded per prompt in `benchmark_report.json`, clearly distinguishing real native system executions (336/450) from safe simulation stubs (114/450).
- [x] **Task 0.13**: Critical Prompt Driver Rectifications (4.5 normalized to `.`, 4.7 clean navigation code 0, 3.7 route-based IP address, 7.46 deterministic test clipboard buffer, 7.7–7.28 valid Hyprland dispatch without stdout/stderr leak).

---

### Phase 0.5: Core Reliability, Architecture & Hardening (20 Items — 100% Complete)
#### A. Architectural Changes
- [x] **0.5.1**: Replace scalar 0–100 risk score with categorical policy engine.
- [x] **0.5.2**: Asynchronous non-blocking consent flow.
- [x] **0.5.3**: PTY state tracking for `\x03` Ctrl+C injection (idle vs running vs alternate screen).
- [x] **0.5.4**: Project-scoped episodic memory and learned patterns (`package.json`, `Cargo.toml`).
- [x] **0.5.5**: Separate dry-run capable from shadow-testable in `ShadowPtySimulator.ts`.

#### B. Fixes & Self-Healing Mechanisms
- [x] **0.5.6**: Suspend `PtyOutputObserver.ts` on alternate-screen buffer (`\x1b[?1049h` for `vim`, `htop`, `tmux`).
- [x] **0.5.7**: Re-parse generated shell commands through `ShellAstParser.ts` before execution.
- [x] **0.5.8**: Capability probe for `ydotoold` daemon and `/dev/uinput` group membership.
- [x] **0.5.9**: Destructive workflow rollback (`git stash`, `trash-cli`, session undo log).
- [x] **0.5.10**: Classify failure types before retrying (missing binary vs wrong flag vs transient).
- [x] **0.5.11**: Request isolation & tab queueing in embedded `llama-server`.
- [x] **0.5.12**: Rolling success rate and pattern retirement for episodic memory.

#### C. Security & Robustness Guards
- [x] **0.5.13**: Delimit tool observations to prevent indirect prompt injection.
- [x] **0.5.14**: Secret redaction pass before persisting logs/traces to disk.
- [x] **0.5.15**: Prefix diagnostic commands with `LC_ALL=C LANG=C` for locale-independent parsing.
- [x] **0.5.16**: SHA-256 checksum verification on downloaded `llama-server` and GGUF models.
- [x] **0.5.17**: Graceful degradation on GPU VRAM exhaustion (fallback to CPU layers).
- [x] **0.5.18**: Detect commands blocked on interactive stdin and auto-inject `-y` or kill/report.
- [x] **0.5.19**: Truncate/cap large command outputs to prevent LLM context overflow.
- [x] **0.5.20**: Flag obfuscated dynamic execution (`eval`, `base64 -d | bash`) as `SENSITIVE`.

---

### Phase 1: Multi-Stage Workflow & Macro Recording Engine (Completed)
- [x] **1.1**: Multistage Prompt Decomposer (composite prompts $\rightarrow$ DAG) with `:: save as workflow <name>` directive unbundling.
- [x] **1.2**: Workflow recorder (`>save workflow <name>`) $\rightarrow$ `~/.sentinel/workflows/<name>.json`.
- [x] **1.3**: Schema versioning (`schemaVersion: 1`) and migration for workflow files.
- [x] **1.4**: Dynamic parameter extraction and environment prerequisite detection.
- [x] **1.5**: Deterministic fast-replay engine (`>run workflow <name>`) with zero LLM inference.
- [x] **1.6**: Safety verification during replay (retains dry-run and consent checks).
- [x] **1.7**: Parameter overrides and CLI flag injection (e.g. `--port=9000`).
- [x] **1.8**: Workflow Management UI drawer (`WorkflowManagerDrawer.tsx`).
- [x] **1.9**: User-Proposed Workflow Creation Enhancements:
  - Simultaneous task execution + save: `> <task to perform> :: save as workflow <name>`
  - Scoped retrospective step-count parser: `> save workflow <name> [last N [commands|steps]]` (prevents history pollution from earlier commands)

---

### Phase 2: Linux Desktop & System UI Automation
- [ ] **2.1**: Desktop Window Controller (`DesktopWindowCapability.ts` with `hyprctl` / `wmctrl`).
- [ ] **2.2**: Synthetic Input Automation (`DesktopInputCapability.ts` with `ydotool` / `wtype` / `xdotool`).
- [ ] **2.3**: Screenshot capture driver (`grim` + `slurp` / `scrot`).
- [ ] **2.4**: Explicit `UI_ACTION` risk tier and consent UX in `SecurityEngine.ts`.
- [ ] **2.5**: Hard exclusion list for sensitive input targets (password/sudo prompts).
- [ ] **2.6**: Tiling presets (e.g. `>snap browser left and terminal right`).

---

### Phase 3: Terminal Ecosystem & Wayland Rice Integration
- [ ] **3.1**: Interactive Rice Studio sidebar for Hyprland/Waybar.
- [ ] **3.2**: In-buffer regex search (`Ctrl+Shift+F`) in xterm.js.
- [ ] **3.3**: Session persistence and workspace restoration (`~/.sentinel/sessions/last_session.json`).

---

### Phase 4: Production Hardening & Release
- [ ] **4.1**: Arch Linux AUR packaging (`PKGBUILD`).
- [ ] **4.2**: Performance benchmark on low-power Intel/AMD hardware (< 1.5s cold boot).
- [ ] **4.3**: Triple-pass CI validation (`vitest`, `cargo check`, `npm run build`) on clean Arch install.

---
*Updated automatically by Sentinel Development & Test Harness.*
