# Sentinel Terminal: Master Implementation & Testing Checklist

> **Document Version:** 2.0.0  
> **Target OS:** Linux (Arch Linux, Hyprland, Wayland, X11, Systemd)  
> **Active Roadmap:** [`roadmap.md`](file:///home/overxpowered/padhai_in_linux/Projects/sentinal/roadmap.md) (v6.0.0) / [`docs/ROADMAP.md`](file:///home/overxpowered/padhai_in_linux/Projects/sentinal/docs/ROADMAP.md)  
> **Status:** Phase 0, 0.5, 0.75 & 1 Completed; Phase 2 Next Priority

---

## 1. High-Level Phase Progress Summary

| Phase | Description | Status | Pass Rate / Metric | Target Milestone |
|:---:|---|:---:|:---:|:---:|
| **Phase 0** | Benchmark Harness Automation (450 Prompts) | **Hardened & Verified (9/9 Domains)** | **450 / 450** (336 Real Native: 100%, 114 Simulated: 100%) | CI/Regression Safety Net |
| **Phase 0.5** | Core Reliability, Architecture & Hardening | **Completed & Certified** | **20 / 20 Items** (175/175 test suites, 1,214 tests passing) | Production Hardening |
| **Phase 0.75** | AI Model Intelligence — Intent/Coder Split, Latency & Learning | **Completed & Certified** | **12 / 12 Items** (73/73 tests passing across 5 suites, 8/8 GRPO rewards) | Model Specialization & Latency |
| **Phase 1** | Multi-Stage Workflow & Macro Recording Engine | **Completed & Certified** | **13/13 test suites passing** (56 tests) | 1-Word Macro Replays & Inline Save |
| **Comprehensive Feature Testing** | Every Feature & Prompt Archetype Matrix | **Fully Certified** | **60 / 60 tests** (Prompt Taxonomy, Feature Engines, CLI Harness) | Exhaustive Verification |
| **Phase 2** | Linux Desktop & System UI Automation | Pending | 0 / 50 Desktop Prompts | Hyprland/Wayland Control |
| **Phase 3** | Terminal Ecosystem & Wayland Rice Integration | Pending | 0 / 50 Rice Prompts | Rice Studio & Persistence |
| **Phase 4** | Production Hardening & Multi-Distro Release | **Completed & Certified** | **Cold-boot: 31ms** (< 1.5s budget), **Triple-Pass CI: 100% Pass** | Universal AppImage, DEB, RPM & AUR |
| **Phase 5** | System Knowledge Scanner, 8-Category Command Guardian & Multi-Model Engine | **Completed & Certified** | **188 / 188 test suites passed** (1,332 / 1,332 tests, zero-emoji policy verified) | Knowledge Profile, Capability Refusal, Hardware Tiers & Cloud APIs |

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

### Phase 0.75: AI Model Intelligence — Intent/Coder Split, Latency & Continuous Learning Pipeline (Completed)
#### A. Architectural Changes: The Intent/Coder Split
- [x] **0.75.1**: Implement `IntentModel.classify()` backed by a lightweight quantized 0.5B–1.5B model on CPU (`IntentModel.ts` / `IntentRouter.ts`).
- [x] **0.75.2**: Extend step-decomposition schema with explicit `precondition_check`, `if_precondition_true`, and `if_precondition_false` fields.
- [x] **0.75.3**: Route individual decomposed steps to coder model with `DynamicToolPruner` subset and precondition context.
- [x] **0.75.4**: Fix unconditional reinstall bug in `ApplicationCapability.ts` with `which "${target}"` check and explicit reinstall routing.
- [x] **0.75.5**: Add decomposition-correctness reward term to `scripts/train_sentinel_grpo.py` separate from execution outcome.

#### B. Latency Fixes (Sub-3s Execution)
- [x] **0.75.6**: Add regex fast-path in `AgentLoop.ts` for simple application launches (`open nvim`, `check battery`) to bypass model round-trips.
- [x] **0.75.7**: Boot and proactively pre-warm embedded `llama-server` at application startup with visible UI warming indicator.
- [x] **0.75.8**: Enforce hard ~3s latency budget on CPU-resident intent model.

#### C. Model Versioning, Resource Budget & Continuous Learning Without Regression
- [x] **0.75.9**: Resource budget partitioning: CPU for 0.5–1.5B intent model, GPU for 3B coder model.
- [x] **0.75.10**: Add replay buffer to nightly training loop (`SentinelSerlCoordinator.ts`) mixing new corrections with historical pairs.
- [x] **0.75.11**: Automated candidate adapter regression gate against `tests/tool_test_cases.json` and held-out eval set before promotion.
- [x] **0.75.12**: Model manifest (`~/.sentinel/models/manifest.json`), semantic versioning (`sentinel-intent-vX.Y.Z`), and instant rollback (`>rollback model intent`).

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

### Phase 4: Production Hardening & Multi-Distribution Linux Release (Completed & Certified)
- [x] **4.1**: Multi-Distribution Packaging & Bundling (Tauri v2):
  - [x] **4.1.a**: Universal AppImage bundle (`.AppImage`) configured in `tauri.conf.json`.
  - [x] **4.1.b**: Native Debian / Ubuntu package (`.deb`) with exact system library dependencies (`libwebkit2gtk-4.1-0`, `libappindicator3-1`, `openssl`).
  - [x] **4.1.c**: Native Fedora / RHEL / openSUSE package (`.rpm`) with `webkit2gtk4.1` dependencies.
  - [x] **4.1.d**: Arch Linux AUR recipe (`packaging/arch/PKGBUILD`).
  - [x] **4.1.e**: Modernize `package.json` build scripts (purged legacy macOS `build:app`, added `bundle:linux`, `bundle:deb`, `bundle:rpm`, `bundle:appimage`, and `check:triple`).
  - [x] **4.1.f**: XDG Desktop entry (`packaging/desktop/com.pranav.sentinel-terminal.desktop`), icon resolutions, and mime-type associations.
- [x] **4.2**: Cross-Distro System Capability Hardening:
  - [x] **4.2.a**: Multi-package-manager validation (`apt-get`, `dnf`, `pacman`, `zypper`, `flatpak`) in `ApplicationCapability.ts`.
  - [x] **4.2.b**: Universal XDG autostart desktop entry generation in `DotfileManager.ts` for GNOME/KDE/XFCE.
  - [x] **4.2.c**: Sanitized few-shot exemplars in `SystemPrompt.ts` (removed Hyprland-specific workspace dispatching and local path bias).
  - [x] **4.2.d**: Runtime distribution compatibility auditor (`scripts/verify_distro_compatibility.ts` — 100% host score).
- [x] **4.3**: Performance Optimization & Latency:
  - [x] **4.3.a**: Cold-boot to interactive prompt verified at **31ms** (well below 1,500ms budget via `scripts/benchmark_cold_boot.ts`).
  - [x] **4.3.b**: Non-blocking asynchronous AI engine warm-up.
  - [x] **4.3.c**: Idle memory footprint auditing (< 150MB RAM).
- [x] **4.4**: Production Quality Gate & Multi-Distro Smoke Verification:
  - [x] **4.4.a**: Triple-pass CI validation certified: `npm test` (183/183 suites, 1,292 tests passing), `npm run build` (`tsc && vite build` passing with zero errors), and `cargo check` (Rust core compiled in 0.54s).
  - [x] **4.4.b**: Multi-distro compatibility audit passed across all package management and init signals.

---

### Phase 5: Deep System Knowledge, Command Safety Guardian & Multi-Model Engine (Completed & Certified)
- [x] **5.1**: Deep System Knowledge Scanner & Persistent Profile:
  - [x] **5.1.a**: Non-blocking asynchronous 8-domain environmental scanner (`SystemKnowledgeScanner.ts` auditing apps, toolchains, hardware, mounts, dotfiles, network, services, and desktop session).
  - [x] **5.1.b**: Profile persistent disk caching at `~/.sentinel/knowledge/system_profile.json` and zero-latency in-memory lookup.
  - [x] **5.1.c**: Dynamic context injection into LLM system prompt in `SystemPrompt.ts`.
  - [x] **5.1.d**: 4/4 passing unit tests in `SystemKnowledgeScanner.test.ts`.
- [x] **5.2**: 8-Category Dangerous Command Guardian & Technical Consequence Explainer:
  - [x] **5.2.a**: Comprehensive AST and regex security inspector covering 8 catastrophic threat vectors (`CommandSafetyGuardian.ts`).
  - [x] **5.2.b**: Explicit capability refusal statement: *"Sentinel does not have the capability to execute '[command]'."*
  - [x] **5.2.c**: Detailed technical consequence analysis and safe alternative suggestions.
  - [x] **5.2.d**: Dual interception: keystrokes before PTY in `TerminalView.tsx` + AI tool invocations in `ToolExecutor.ts`.
  - [x] **5.2.e**: Strict No-Emoji ANSI terminal refusal banner using monospace glyphs `[!]`, `[i]`, `[+]`, `[#]`.
  - [x] **5.2.f**: 22/22 passing unit tests in `CommandSafetyGuardian.test.ts`.
- [x] **5.3**: Multi-Model Architecture, Hardware Tiers & Cloud API Keys:
  - [x] **5.3.a**: Physical hardware detection and tier recommendation engine (`ModelRecommendationEngine.ts` mapping to Budget, Balanced, Performance, and Workstation tiers).
  - [x] **5.3.b**: Cloud API Key provider (`CloudApiProvider.ts`) for OpenAI, Anthropic, Groq, DeepSeek, OpenRouter, and Custom Endpoints with zero local memory overhead.
  - [x] **5.3.c**: Real-time interactive connection verification probe before provider activation.
  - [x] **5.3.d**: Dual-tab grayscale interface in `AiSettingsPage.tsx`.
  - [x] **5.3.e**: 7/7 passing unit tests across `ModelRecommendationEngine.test.ts` and `CloudApiProvider.test.ts`.
- [x] **5.4**: Intelligent Natural Language Directory Navigation:
  - [x] **5.4.a**: Multi-level workspace directory scanner with exact and substring matching (`DirectoryNavigationEngine.ts`).
  - [x] **5.4.b**: Levenshtein distance fuzzy matching for folder name typos with interactive "Did you mean?" disambiguation.
  - [x] **5.4.c**: Automatic missing directory creation prompt with confirmed `mkdir -p` and automatic terminal navigation.
  - [x] **5.4.d**: Passing tests in `DirectoryNavigationEngine.test.ts` and `AgentLoopDirectoryNavigation.test.ts`.
- [x] **5.5**: Streamlined UI & Onboarding Experience:
  - [x] **5.5.a**: Realistic wireframe terminal skeletons for Zen Mode and Visual Mode in `InstallerWizard.tsx`.
  - [x] **5.5.b**: Post-onboarding Zen Mode keybind guidance callout (`ZenModeHelpCallout.tsx`) highlighting `[F1 help]`.
  - [x] **5.5.c**: Streamlined UI by removing redundant Process Port Manager Drawer and Workspace Switcher Drawer in favor of direct terminal natural language.
- [x] **5.6**: Strict Zero-Emoji Policy:
  - [x] **5.6.a**: Purged all consumer emojis from UI components, error diagnostics, tool outputs, and terminal banners.
  - [x] **5.6.b**: Enforced monospace glyph standards (`[!]`, `[i]`, `[+]`, `[#]`, `•`, `✓`, `✕`, `->`, `[DIR]`, `[FILE]`, `[AC]`, `[BAT]`).
- [x] **5.7**: Production Gate & Visual Verification:
  - [x] **5.7.a**: 188 / 188 test suites passing (1,332 / 1,332 tests passed, 0 failures).
  - [x] **5.7.b**: Clean `tsc`, Vite bundle build, and Rust `cargo check`.
  - [x] **5.7.c**: Interactive browser subagent visual verification of blocked commands and model settings.

---
*Updated automatically by Sentinel Development & Test Harness.*
