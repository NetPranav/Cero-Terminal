# Sentinel Terminal Roadmap (v7)

This roadmap replaces the v6 roadmap (archived at [archive/ROADMAP_v6_legacy.md](archive/ROADMAP_v6_legacy.md)).
It was written after a full audit of the code on branch `linux-v2-update`. Every issue below was
confirmed by reading the code, running it, or checking it against an external source. None comes
from the old docs. Where the old roadmap marked an item complete but the code disagrees, the code wins.

Target platform: Linux (Arch, Fedora, Ubuntu/Debian, openSUSE), X11 and Wayland. macOS remains a
development host only.

Status legend: `DONE` = implemented, tested and committed. `PARTIAL` = some of the work is done
(see notes). `OPEN` = not started. `NEEDS DECISION` = waiting on the project owner.

---

## 1. Issue register

Each issue has an ID that the phases reference.

### Model accuracy and output quality

| ID | Issue | Evidence |
|---|---|---|
| I-01 | Hardcoded "Qwen" logit-bias token IDs were wrong. Every request banned ` an`, `Music`, `Book`, `-(`, `();` and boosted `the`, ` form`, ` File`, `view`. | Checked against the Qwen2.5 `tokenizer.json` vocabulary. |
| I-02 | `repeat_penalty: 1.1` on JSON and shell output penalises the quotes, dashes and braces that commands legitimately repeat. | `EmbeddedProvider.ts` |
| I-03 | Shadow speculation replaced correct commands with unrelated variations that print more output (e.g. `sw_vers` became `pgrep -fil macOS`, `ps ... \| head -n 2` became `ps aux`). | Reproduced by the failing `ShadowPtySimulator` test. |
| I-04 | Ollama chat requests sent no `think:false`, so reasoning models spent seconds to minutes per command. They also sent no JSON format and no `keep_alive` (the model unloads after 5 idle minutes), and hardcoded `num_thread: 8`. | `provider/OllamaProvider.ts` |
| I-05 | Every task needs a second LLM call just to summarise the output, and a heuristic replaces summaries shorter than 25 characters with raw stdout. | `AgentLoop.runLLMLoop` |
| I-06 | `ModelManager` auto-selects any Ollama model with a higher catalog score (`qwen3:4b`, 7B) over a working embedded engine. | `ModelManager.initialize` |
| I-07 | The default model is Qwen2.5-Coder-3B (2024). Qwen3-4B-Instruct-2507 (Apache-2.0, non-thinking, 2.5 GB Q4_K_M) is a stronger instruction and tool-calling model. | HuggingFace, hashes verified |
| I-08 | The 101-tool JSON registry (515 files) is eagerly bundled and indexed per tab, but the grammar only allows `execute`/`done`, so tool specs never reach the model. | `ToolLoader`, `SystemPrompt` |
| I-09 | `>fix` / Tab auto-heal gives the model only the remediation title. It gets neither the failing command nor its output. | `TerminalView.tsx` |

### Latency

| ID | Issue | Evidence |
|---|---|---|
| I-10 | When any AI engine is available, every request goes to the LLM, even "check battery". The deterministic answers only run offline. | `AgentLoop.run` |
| I-11 | `IntentModel` calls Ollama at 127.0.0.1:11434 with `qwen2.5:1.5b` before every request, with up to a 3 s timeout, even for users on the embedded engine or a cloud API. | `models/IntentModel.ts` |
| I-12 | A per-second timestamp at the top of the system prompt made the prompt prefix differ on every call, defeating the llama.cpp and Ollama prompt caches. | `SystemPrompt.ts` |
| I-13 | Two or more LLM calls per task (execute, then summarise). | `AgentLoop.runLLMLoop` |
| I-14 | While the provider is down, each request waits about 7 s (3x1 s plus 5x0.8 s retries) before failing. | `AgentLoop.runLLMLoop` |
| I-15 | Read-only commands ran twice: once in the shadow sandbox, then for real. | `AgentLoop`, `ShadowPtySimulator` |

### Self-hosted inference engine (llama.cpp)

| ID | Issue | Evidence |
|---|---|---|
| I-16 | The launcher passed `--flash-attn auto`, which only exists since llama.cpp PR #15434 (Aug 2025). The pinned build b4522 exits with "invalid argument", so the embedded engine never started in GPU mode. | `embedded_server.rs`, llama.cpp changelog |
| I-17 | The installer's pinned Linux checksum is the SHA-256 of an empty file, and the macOS one is not hex, so installation always fails verification. | `EmbeddedEngineManager.PINNED_MANIFEST` |
| I-18 | The installer copies only `llama-server`. Current releases need the `libllama`/`libggml*` shared libraries next to it. | Release tarball listing |
| I-19 | Releases ship as `.tar.gz`, but the installer runs `unzip`. | GitHub release b11227 |
| I-20 | llama-server stderr went to `/dev/null`, so a failed start was impossible to diagnose. | `embedded_server.rs` |
| I-21 | Only the CPU-only Linux asset is used. A Vulkan build (AMD, Intel and NVIDIA GPUs) exists. | GitHub release assets |
| I-22 | `-t <logical cores>` overrode llama.cpp's own core detection (hyper-threads slow generation), and newer builds auto-create multiple slots that split the context. | `embedded_server.rs` |

### Execution safety and security

| ID | Issue | Evidence |
|---|---|---|
| I-23 | `execute_command` had no timeout, blocked a tokio worker with synchronous `output()`, and inherited stdin. It also waited for stdout EOF, so `code . &` hung the agent until the editor was closed. | `process_cmds.rs` |
| I-24 | Replaying a workflow from the Workflow drawer uses `autoApprove: true` with no executor, so sensitive steps run through raw `execute_command` without consent. | `WorkflowManagerDrawer.tsx`, `DeterministicReplayEngine` |
| I-25 | Tauri CSP is `null`, the filesystem scope is `**` and HTTP is allowed to any URL. | `tauri.conf.json`, `capabilities/default.json` |
| I-26 | Nothing guarantees that an automatic fix is side-effect free before it runs unattended. This is a prerequisite for the watcher (Phase 7). | Design gap |

### Resource usage

| ID | Issue | Evidence |
|---|---|---|
| I-27 | The status bar spawns 2 shell processes every 2.5 s forever (`test -f` and `which`), about 69,000 per idle day. | `StatusBar.tsx`, `EmbeddedEngineManager.getStatus` |
| I-28 | The system scan spawns roughly 2,000 processes (grep/cut/awk per `.desktop` file) sequentially. Its 12 h TTL is defined but never checked, so the profile never refreshes. | `SystemKnowledgeScanner.ts` |
| I-29 | `PtyOutputObserver` runs the full 1,573-line rule oracle over the last 40 lines on every PTY chunk. It flags any output containing "failed" and hardcodes `os: 'macos'`. | `PtyOutputObserver.ts` |
| I-30 | The SERL idle worker can issue LLM calls (Reflexion) while the user is working or on battery. | `SentinelSerlCoordinator.onTerminalIdle` |
| I-31 | A single 2.1 MB JS chunk, and `ToolLoader` is re-created and re-indexed for every tab. | `npm run build`, `TerminalView.tsx` |

### Learning and personalisation

| ID | Issue | Evidence |
|---|---|---|
| I-32 | In the app webview, `fs` is aliased to a no-op polyfill. The DPO and deficit stores, steering vectors and `ProjectFingerprint` silently never persist or reload, so per-project memory scoping is broken in the real app. | `vite.config.ts`, `utils/fsPolyfill.ts` |
| I-33 | The system profile does not record the ROS distro, the GPU vendor needed to choose an engine build, or the preferred package manager. | `SystemKnowledgeScanner.ts` |

### Linux, ROS 2 and automation

| ID | Issue | Evidence |
|---|---|---|
| I-34 | Commands run in non-interactive `bash -c`, which does not source ROS. `ros2`, `colcon` and `rosdep` fail with "command not found". | `ShellSDKCapability.ts` |
| I-35 | There are no remediation rules for common ROS 2 failures: package not found, unsourced workspace, missing rosdep dependencies. | `DeterministicRuleOracle.ts` |
| I-36 | Desktop window automation from old roadmap Phase 2 does not exist (hyprctl/wmctrl window control, screenshots). Neither does macro recording from the v2.1 milestone. | Code search |
| I-37 | New feature: continuous file and service watching that detects errors and applies safe fixes automatically. | User request |

### Codebase, CI and documentation

| ID | Issue | Evidence |
|---|---|---|
| I-38 | 252 of 382 source files (about 23,800 lines) are unreachable from the app, CLI or benchmark entry points. 94 test files test only that unreachable code, which inflates test counts. | Import-graph analysis |
| I-39 | CI runs only `npm test`: no build, no `cargo check`, no Rust tests. | `.github/workflows/ci.yml` |
| I-40 | Docs are duplicated between the repo root and `docs/`. They contain stale or inaccurate claims: macOS-first README, "100% offline Metal", fixed test counts, a "450/450" benchmark that mostly exercises offline fast paths. | `README.md`, `docs/*` |
| I-41 | The `⚠` glyph in `OutputFormatter.ts` violates the no-emoji policy. | Emoji scan |
| I-42 | 6 tests failed on non-Linux hosts: platform-dependent installer tests, and a shadow test that exposed I-03. | `npx vitest run` |

### Carried over from the v6 roadmap (not implemented in code)

| ID | Item | v6 reference |
|---|---|---|
| L-01 | Desktop window controller (hyprctl, wmctrl/xdotool fallback) | Phase 2 item 1 |
| L-02 | Synthetic input (ydotool/wtype/xdotool) with a `UI_ACTION` consent tier and a never-type-into list | Phase 2 item 2 |
| L-03 | Screenshot capture (grim+slurp, scrot) | Phase 2 item 3 |
| L-04 | Window placement and tiling presets | Phase 2 item 4 |
| L-05 | Rice Studio UI (Hyprland/Waybar theme controls) | Phase 3 |
| L-06 | Docker smoke matrix across Ubuntu, Fedora, Debian and Arch | Phase 4 |
| L-07 | Macro recorder ("record workflow"), multi-app orchestration, hotkey bindings | v2.1 milestone |
| L-08 | `>why did you do that` decision explanation | Backlog F1 |
| L-09 | Session transcript export | Backlog F2 |
| L-10 | Risk-tolerance profiles (Cautious / Balanced / Trusted) | Backlog F3 |
| L-11 | Git-backed sync of workflows and learned patterns | Backlog F5 |
| L-12 | Remote/SSH agent mode | Backlog F6 |
| L-13 | Local telemetry dashboard (latency, retries, success rate) | Backlog F8 |
| L-14 | Dry plan preview before multi-phase plans | Backlog F9 |
| L-15 | Capability-tier model router (small local model, then larger local model, then cloud) | Backlog F10 |
| L-16 | Drag a log or stack trace into the terminal to ask about it | Backlog F11 |
| L-17 | Self-update and opt-in crash reports | Backlog F12 |
| L-18 | Encrypted secrets vault for workflows | Backlog F13 |

These v6 items were verified as already present and wired, so they are not repeated here: async
ConsentQueue, UndoLog with `>undo`, SecretRedactor, StdinHangDetector, PtyStateTracker
(safe `^C`), locale-neutral `LC_ALL=C` diagnostics, `<TOOL_OUTPUT>` prompt-injection delimiting,
observation truncation, failure classification before retry, ModelManifestManager with a
rollback command, workflow `schemaVersion`, terminal buffer search, session persistence, and the
GRPO decomposition reward.

---

## 2. Phases

The phases are ordered so that each one can be verified by the ones before it. Every phase ends
with `npm test`, `npm run build`, `cargo check` and `cargo test --lib`, plus a commit.

### Phase 1: Verification baseline and CI gate

Goal: a test run that means something on any host, and CI that checks everything a release needs.

| Task | Issues | Status |
|---|---|---|
| Pin platform detection in the Linux-only installer tests | I-42 | DONE (`3e869d3`) |
| CI runs `npm test`, `npm run build`, `cargo check` and `cargo test --lib` on Ubuntu with the Tauri system libraries | I-39 | OPEN |
| `scripts/engine_smoke.sh`: an opt-in script for a Linux box that installs the pinned engine, loads a model, and checks grammar acceptance, prompt-cache hits (`timings.cache_n`) and first-token latency | I-16..I-22 | OPEN |

Exit criteria: green CI on push. The smoke script prints PASS or FAIL per check.

### Phase 2: Model accuracy and output quality

Goal: correct commands and professional, grounded answers.

| Task | Issues | Status |
|---|---|---|
| Remove the logit bias from generation. Replace the token tables with verified IDs. | I-01 | DONE (`48dc532`) |
| `repeat_penalty` 1.0 | I-02 | DONE (`48dc532`) |
| Speculation may only repair a failing primary with a platform rewrite | I-03 | DONE (`3e869d3`) |
| Ollama: `think:false`, `keep_alive`, JSON schema `format`, no fixed thread count | I-04 | DONE (`48dc532`) |
| Cache-friendly prompt with answer-quality, package-manager and ROS rules | I-12 | DONE (`48dc532`) |
| Deterministic, grounded summaries for successful read-only commands, without a second LLM call | I-05, I-13 | OPEN |
| A working embedded engine wins over catalog-score auto-selection. An explicit user choice still wins over everything. | I-06 | OPEN |
| Add Qwen3-4B-Instruct-2507 Q4_K_M as the "accuracy" tier with a pinned SHA-256. Keep Qwen2.5-Coder-3B as the default and 1.5B as the low-RAM tier. | I-07 | OPEN |
| Auto-heal sends the failing command and its last output lines, not just a title | I-09 | OPEN |
| Replace `⚠` with plain text | I-41 | OPEN |

Exit criteria: unit tests cover the single-call path and the auto-heal context. No bias parameter
is sent to any provider.

### Phase 3: Inference latency

Goal: instant answers for common requests, and one model round-trip for everything else.

| Task | Issues | Status |
|---|---|---|
| Skip the Ollama intent probe unless an intent endpoint is explicitly configured | I-11 | OPEN |
| Answer a curated, high-precision set (battery, disk, memory, top CPU/RAM process, listening ports, IP, open a known app) deterministically even when AI is available | I-10 | OPEN |
| One LLM call for read-only inspection tasks (see Phase 2) | I-13 | OPEN |
| Cache provider availability for a few seconds and fail fast with guidance instead of about 7 s of blind retries | I-14 | OPEN |
| No double execution of read-only commands | I-15 | DONE (`3e869d3`) |
| Record per-request latency (routing, model, execution) for the telemetry view | L-13 | OPEN |

Exit criteria: the deterministic set never calls a provider (asserted in tests), and read-only
LLM tasks make exactly one provider call.

### Phase 4: Self-hosted engine (llama.cpp, no Ollama required)

Goal: Sentinel installs, starts and supervises its own model server.

| Task | Issues | Status |
|---|---|---|
| Launch flags that work on old and new llama.cpp: no `--flash-attn`, no `-t`, plus `-np 1`, `-c 8192`, `--cache-reuse 256`, bound to 127.0.0.1 | I-16, I-22 | DONE (`bcc3d07`) |
| stderr to `~/.sentinel/logs/llama-server.log`, with a log-tail command | I-20 | DONE (`bcc3d07`) |
| Pin llama.cpp b11227 with GitHub's published SHA-256 digests. Extract the full `.tar.gz` bundle to `~/.sentinel/engine/<build>` and point `current` at it. | I-17, I-18, I-19 | OPEN |
| Pick the Vulkan build when a Vulkan loader and GPU are present, otherwise the CPU build | I-21 | OPEN |
| Compute SHA-256 in Rust instead of shelling out to `sha256sum` | I-17 | OPEN |
| Show the last log lines in the UI when the engine fails to start | I-20 | OPEN |

Exit criteria: installer unit tests cover URL/digest selection and the extraction script. The
Phase 1 smoke script passes on a Linux machine.

### Phase 5: Execution safety and security

Goal: nothing runs longer, wider or with less consent than the user expects.

| Task | Issues | Status |
|---|---|---|
| Bounded `execute_command`: timeout, process-group kill, closed stdin, output cap, no hang on backgrounded apps | I-23 | DONE (`bcc3d07`) |
| Workflow drawer replays go through `ToolExecutor` and ConsentQueue; no raw auto-approve | I-24 | OPEN |
| A restrictive CSP. Narrow the fs scope to `$HOME` and `/tmp`. Narrow HTTP to the configured providers and download hosts. | I-25 | OPEN |
| An auto-remediation safety policy: only fixed-template rule-oracle fixes that classify SAFE may run unattended. Never run anything derived from watched content by a model. | I-26 | OPEN |
| Risk-tolerance profile setting (Cautious / Balanced / Trusted) on top of the policy engine | L-10 | OPEN |

### Phase 6: Low-footprint system knowledge and learning persistence

Goal: Sentinel knows the machine and learns the user, at near-zero idle cost.

| Task | Issues | Status |
|---|---|---|
| Status polling without process spawns: Rust reports model and engine presence via `stat`, polled every 10 s plus on events | I-27 | OPEN |
| Single batched scan script instead of about 2,000 processes. Enforce the TTL. Rescan only when a cheap fingerprint changes (app directories, package database mtimes, os-release). | I-28 | OPEN |
| Profile records the ROS distro, GPU vendor and preferred package manager | I-33 | OPEN |
| PTY observer: diagnose only error-looking output, debounced. Correct OS. No "0 failed" false positives. | I-29 | OPEN |
| SERL idle work: no model calls while the user is active or on battery | I-30 | OPEN |
| Rust-backed `~/.sentinel` store (read, write, append) replacing the no-op `fs` polyfill for the learning stores and ProjectFingerprint | I-32 | OPEN |

### Phase 7: Continuous error watcher and auto-remediation (new)

Goal: `>watch` a log file, build output or systemd unit. Sentinel detects errors as they appear
and fixes the ones that can be fixed safely with a command.

| Task | Issues | Status |
|---|---|---|
| Rust tailer: polling, bounded reads, rotation and truncation handling, UTF-8 safe, many files for little CPU | I-37 | OPEN |
| Commands: `>watch <path>`, `>watch service <unit>` (journalctl), `>watch list`, `>unwatch <id>` | I-37 | OPEN |
| Detection through the existing rule oracle, deduplicated and rate-limited | I-37 | OPEN |
| Remediation obeys the Phase 5 policy: SAFE template fixes run automatically and are logged to UndoLog. Everything else is proposed through consent. | I-26, I-37 | OPEN |
| Notifications in the terminal and status bar | I-37 | OPEN |

### Phase 8: Linux, ROS 2 and automation depth

| Task | Issues | Status |
|---|---|---|
| ROS environment preamble: source `/opt/ros/<distro>/setup.bash` and the workspace `install/setup.bash` for ros2/colcon/rosdep/ament commands | I-34 | OPEN |
| ROS 2 remediation rules: unsourced shell, package not found, missing dependencies via rosdep, stale build | I-35 | OPEN |
| Desktop window controller: list, focus, move to workspace, close (hyprctl, then swaymsg, then wmctrl) | L-01, I-36 | OPEN |
| Screenshot capability: grim+slurp, then scrot/import | L-03 | OPEN |
| Synthetic input with a `UI_ACTION` consent tier | L-02 | OPEN (after L-01 ships) |
| Tiling presets and multi-app orchestration | L-04, L-07 | OPEN |

### Phase 9: Codebase consolidation and performance

| Task | Issues | Status |
|---|---|---|
| Remove or quarantine the 252 unreachable files and the 94 tests that only cover them | I-38 | NEEDS DECISION |
| One shared `ToolLoader` state; stop eager-bundling tool JSON the model never sees; split the bundle | I-08, I-31 | OPEN |
| `>why` decision explanation from the last run's steps (L-08) and session transcript export (L-09) | L-08, L-09 | OPEN |

### Phase 10: Documentation and release

| Task | Issues | Status |
|---|---|---|
| Rewrite README, architecture, codebase map, user guide, AI and troubleshooting docs from the verified state | I-40 | OPEN |
| One copy of each doc (remove root duplicates) | I-40 | OPEN |
| Replace fixed test counts and benchmark claims with how to reproduce them | I-40 | OPEN |
| Release checklist: packaging, smoke matrix (L-06), self-update (L-17) | L-06, L-17 | OPEN |

---

## 3. Later (unscheduled)

Rice Studio UI (L-05), sync (L-11), SSH agent mode (L-12), model router (L-15), log drag-in
(L-16), secrets vault (L-18), dry plan preview (L-14). Each needs Phases 5 to 7 in place first.
