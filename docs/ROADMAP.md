# Sentinel Terminal Roadmap (v7)

This roadmap replaces the v6 roadmap (archived at [archive/ROADMAP_v6_legacy.md](archive/ROADMAP_v6_legacy.md)).
It was written after a full audit of the code on branch `linux-v2-update`. Every issue below was
confirmed by reading the code, running it, or checking it against an external source. None comes
from the old docs. Where the old roadmap marked an item complete but the code disagrees, the code wins.

Target platform: Linux (Arch, Fedora, Ubuntu/Debian, openSUSE), X11 and Wayland. macOS remains a
development host only.

Status legend: `DONE` = implemented, tested and committed. `PARTIAL` = some of the work is done
(see notes). `OPEN` = not started. `NEEDS DECISION` = waiting on the project owner.

**Progress (2026-09-28):** all ten phases were worked through on branch `linux-v2-update`. Every
item marked DONE has unit tests and passed `npm test`, `npm run build`, `cargo check` and
`cargo test --lib` before its commit. Items that need a real Linux desktop to confirm (CSP at
runtime, llama.cpp on Linux GPUs, Wayland window control) are called out as such. The remaining
work is listed under "What is left" at the end.

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

### Found while implementing the phases

| ID | Issue | Evidence |
|---|---|---|
| I-43 | 459 of 463 offline fast-path entries were anchored regexes for the exact benchmark prompts. 93 only echoed canned "success" text (for example "Screenshot file saved", "Synthetic mouse click dispatched"), 116 fabricated data when the real command failed, and 25 appended canned confirmations. Historical "450/450" benchmark results measured this table, not the model. | `AgentLoop.ts` FAST_PATHS |
| I-44 | The heuristic fallback (also used when AI is available) matched substrings. "show wifi connections" turned Wi-Fi on, "export" listed ports, "stopping" pinged, "closest" attempted a kill. | `AgentLoop.tryHeuristicFallback` |
| I-45 | SecurityEngine decided SAFE (no consent) from the first word only: `ls && <anything>`, `echo x >> ~/.bashrc`, `ip link set wlan0 down`, `hostname pwned`, `awk 'BEGIN{system()}'`, `env bash -c` and `npm run <script>` all ran without asking. | `SecurityEngine.analyzeCommand` |
| I-46 | The system scanner invented values when data was missing (8 GB RAM, 4 cores, a 256 GB ext4 root, a hardcoded app list) and fed them to the model as facts. `awk "{print $1}"` inside double quotes also broke port, service and IP parsing. | `SystemKnowledgeScanner.ts` |
| I-47 | `npm test` wrote fixtures into the developer's real `~/.sentinel` (fake adapter manifest entries, a "prod-cluster" saved session). | Test runs on the dev machine |
| I-48 | The rule oracle ranked matches by confidence only, so generic rules (any "Permission denied") beat specific ones. | `DeterministicRuleOracle.getAllMatches` |
| I-49 | The dream scheduler's power and idle checks used macOS `pmset`/`ioreg`; on Linux every laptop looked like it was on AC, and idle time read as 0. | `DreamStateScheduler.ts` |
| I-50 | The repository has no LICENSE file although the README declares MIT. | Repository root |

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
| CI runs `npm test`, `npm run build`, `cargo check` and `cargo test --lib` on Ubuntu with the Tauri system libraries | I-39 | DONE (`1a433a9`) |
| `npm run smoke:engine` (`scripts/engine_smoke.ts`): starts a real llama-server with Sentinel's flags, prompt and grammar and checks start-up, grammar acceptance, valid action JSON and prompt-cache reuse. Passed against llama.cpp build 10792 + Qwen2.5-Coder-3B (15.4 s cold prefix, 2.6 s warm) | I-16..I-22 | DONE (`1a433a9`) |
| Tests run with a throwaway HOME so they never touch the real `~/.sentinel` | I-47 | DONE (`1a433a9`) |

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
| Deterministic, grounded summaries for successful read-only commands, without a second LLM call | I-05, I-13 | DONE (`29b8774`) |
| A working embedded engine wins over catalog-score auto-selection. An explicit user choice still wins over everything. | I-06 | DONE (`29b8774`) |
| Add Qwen3-4B-Instruct-2507 Q4_K_M as the "accuracy" tier with a pinned SHA-256. Keep Qwen2.5-Coder-3B as the default and 1.5B as the low-RAM tier. | I-07 | DONE (`4531e17`) |
| Auto-heal sends the failing command and its last output lines, not just a title | I-09 | DONE (`29b8774`) |
| Replace `⚠` with plain text | I-41 | DONE (`29b8774`) |
| Remove fabricated fast-path outputs; whole-word matching in the heuristic fallback | I-43, I-44 | DONE (`837ace9`) |

Exit criteria: unit tests cover the single-call path and the auto-heal context. No bias parameter
is sent to any provider.

### Phase 3: Inference latency

Goal: instant answers for common requests, and one model round-trip for everything else.

| Task | Issues | Status |
|---|---|---|
| Skip the Ollama intent probe unless an intent endpoint is explicitly configured | I-11 | DONE (`837ace9`) |
| Answer a curated, high-precision set (battery, disk, memory, top CPU/RAM process, listening ports, port owner, IP, uptime, kernel, distro, windows, screenshots) deterministically even when AI is available; app launches finish after one model call | I-10 | DONE (`837ace9`, `2150da7`) |
| One LLM call for read-only inspection tasks (see Phase 2) | I-13 | DONE (`29b8774`) |
| Fail fast with guidance instead of about 7 s of blind retries; wait visibly only while a local model loads; bounded Ollama probes | I-14 | DONE (`837ace9`) |
| No double execution of read-only commands | I-15 | DONE (`3e869d3`) |
| Record per-request latency (total, model calls, model time) | L-13 | PARTIAL (`837ace9`): recorded on every result and in `AgentLoop.recentMetrics`; no UI view yet |

Exit criteria: the deterministic set never calls a provider (asserted in tests), and read-only
LLM tasks make exactly one provider call.

### Phase 4: Self-hosted engine (llama.cpp, no Ollama required)

Goal: Sentinel installs, starts and supervises its own model server.

| Task | Issues | Status |
|---|---|---|
| Launch flags that work on old and new llama.cpp: no `--flash-attn`, no `-t`, plus `-np 1`, `-c 8192`, `--cache-reuse 256`, bound to 127.0.0.1 | I-16, I-22 | DONE (`bcc3d07`) |
| stderr to `~/.sentinel/logs/llama-server.log`, with a log-tail command | I-20 | DONE (`bcc3d07`) |
| Pin llama.cpp b11227 with GitHub's published SHA-256 digests. Extract the full `.tar.gz` bundle to `~/.sentinel/engine/<build>` and point `current` at it. Installed automatically after a model download (nothing called the installer before). | I-17, I-18, I-19 | DONE (`4531e17`); not yet run end to end on a Linux machine |
| Pick the Vulkan build when a Vulkan loader and GPU are present, otherwise the CPU build | I-21 | DONE (`4531e17`) |
| Compute SHA-256 in Rust instead of shelling out to `sha256sum` | I-17 | DONE (`085ea96`) |
| Show the last log lines in the UI when the engine fails to start | I-20 | DONE (`085ea96`) |

Exit criteria: installer unit tests cover URL/digest selection and the extraction script. The
Phase 1 smoke script passes on a Linux machine.

### Phase 5: Execution safety and security

Goal: nothing runs longer, wider or with less consent than the user expects.

| Task | Issues | Status |
|---|---|---|
| Bounded `execute_command`: timeout, process-group kill, closed stdin, output cap, no hang on backgrounded apps | I-23 | DONE (`bcc3d07`) |
| Workflow drawer replays go through `ToolExecutor` and ConsentQueue; no raw auto-approve | I-24 | DONE (`776fdae`) |
| AST-based read-only policy for the SAFE tier (every command in the line must be read-only) | I-45 | DONE (`d67df23`) |
| A restrictive CSP. Narrow the fs scope to `$HOME` and `/tmp`. Narrow HTTP to the configured providers and download hosts. | I-25 | PARTIAL (`776fdae`): CSP and fs scope done, unused shell grants removed; HTTP scope still open because custom OpenAI-compatible endpoints can be any host. CSP needs a launch check on Linux |
| An auto-remediation safety policy: only vetted fixed-template fixes may run unattended. Never run anything derived from watched content by a model. | I-26 | DONE (`776fdae`) |
| Risk-tolerance profile setting (Cautious / Balanced / Trusted) on top of the policy engine | L-10 | OPEN |

### Phase 6: Low-footprint system knowledge and learning persistence

Goal: Sentinel knows the machine and learns the user, at near-zero idle cost.

| Task | Issues | Status |
|---|---|---|
| Status polling without process spawns: Rust reports model and engine presence via `stat`, polled every 10 s plus on events | I-27 | DONE (`4ea2391`) |
| Single batched scan script instead of about 2,000 processes. Enforce the TTL. Rescan only when a cheap fingerprint changes (app directories, package database mtimes, os-release). No invented values. | I-28, I-46 | DONE (`4ea2391`) |
| Profile records the ROS distro, GPU vendor and preferred package manager | I-33 | DONE (`4ea2391`) |
| PTY observer: diagnose only error-looking output. Correct OS. No "0 failed" false positives. | I-29 | DONE (`4ea2391`) |
| SERL idle work: no model calls while the user is active or on battery | I-30, I-49 | DONE (`4ea2391`) |
| Rust-backed `~/.sentinel` store (read, write, append) replacing the no-op `fs` polyfill for the learning stores and ProjectFingerprint | I-32 | PARTIAL (`4ea2391`): all `~/.sentinel` stores persist and reload; ProjectFingerprint still cannot see project files from the webview, so memory is scoped per directory rather than per project |

### Phase 7: Continuous error watcher and auto-remediation (new)

Goal: `>watch` a log file, build output or systemd unit. Sentinel detects errors as they appear
and fixes the ones that can be fixed safely with a command.

| Task | Issues | Status |
|---|---|---|
| Rust tailer: polling, bounded reads, rotation and truncation handling, UTF-8 safe, many files for little CPU | I-37 | DONE (`7120243`) |
| Commands: `>watch <path>`, `>watch service <unit>` (journalctl), `>watch list`, `>unwatch <id>` | I-37 | DONE (`7120243`) |
| Detection through the existing rule oracle, deduplicated and rate-limited | I-37 | DONE (`7120243`) |
| Remediation obeys the Phase 5 policy: SAFE template fixes run automatically and are logged to UndoLog. Everything else is proposed through consent. | I-26, I-37 | DONE (`7120243`) |
| Notifications in the terminal and status bar | I-37 | PARTIAL (`7120243`): terminal notices in the owning tab; no status-bar indicator yet |

### Phase 8: Linux, ROS 2 and automation depth

| Task | Issues | Status |
|---|---|---|
| ROS environment preamble: source `/opt/ros/<distro>/setup.bash` and the workspace `install/setup.bash` for ros2/colcon/rosdep/ament commands; bound streaming commands | I-34 | DONE (`2150da7`) |
| ROS 2 remediation rules: unsourced shell, package not found, missing dependencies via rosdep, rosdep init; Linux Docker rules; rule ranking fix | I-35, I-48 | DONE (`2150da7`) |
| Desktop window controller: list, focus, move to workspace, close (hyprctl, swaymsg, wmctrl) | L-01, I-36 | DONE (`2150da7`); needs a check on real Hyprland/Sway/X11 sessions |
| Screenshot capability: grim+slurp, gnome-screenshot, spectacle, scrot | L-03 | DONE (`2150da7`) |
| Synthetic input with a `UI_ACTION` consent tier | L-02 | OPEN (after L-01 ships) |
| Tiling presets and multi-app orchestration | L-04, L-07 | OPEN |

### Phase 9: Codebase consolidation and performance

| Task | Issues | Status |
|---|---|---|
| Remove or quarantine the 251 unreachable files and the 94 tests that only cover them (list in docs/CODEBASE_MAP.md) | I-38 | NEEDS DECISION |
| Remove the remaining 373 exact-prompt fast-path regexes (benchmark memorisation; they now run real commands but only match one exact sentence each) | I-43 | NEEDS DECISION |
| One shared `ToolLoader` state; split the bundle | I-08, I-31 | PARTIAL (`59d79a4`): shared registry, five screens lazy-loaded (startup bundle 2.15 MB -> 1.99 MB); tool JSON is still bundled because the loader validates it |
| `>why` decision explanation from the last run's steps (L-08) and session transcript export (L-09) | L-08, L-09 | DONE (`59d79a4`) |

### Phase 10: Documentation and release

| Task | Issues | Status |
|---|---|---|
| Rewrite README, architecture, codebase map, user guide, AI and troubleshooting docs from the verified state | I-40 | PARTIAL: roadmap, codebase map, index and archive done; README, ARCHITECTURE, USER_GUIDE, AI, SECURITY, TROUBLESHOOTING still describe the pre-audit state |
| One copy of each doc (remove root duplicates) | I-40 | DONE (historical docs in docs/archive/) |
| Replace fixed test counts and benchmark claims with how to reproduce them | I-40 | OPEN |
| Release checklist: packaging, smoke matrix (L-06), self-update (L-17) | L-06, L-17 | OPEN |
| Add a LICENSE file matching the declared license | I-50 | NEEDS DECISION |

---

## 3. Later (unscheduled)

Rice Studio UI (L-05), sync (L-11), SSH agent mode (L-12), model router (L-15), log drag-in
(L-16), secrets vault (L-18), dry plan preview (L-14). Each needs Phases 5 to 7 in place first.

---

## 4. What is left

In order of value:

1. **Decisions for the owner:** delete the unreachable code (I-38) and the exact-prompt fast paths
   (I-43); choose and add a LICENSE (I-50).
2. **Verify on real Linux desktops:** run `npm run smoke:engine` after installing the engine from
   the app (CPU and Vulkan builds), launch the packaged app to confirm the CSP, and try window
   control on Hyprland, Sway and X11.
3. **Phase 5:** risk-tolerance profiles (L-10); an HTTP scope that still allows custom endpoints.
4. **Phase 6:** project fingerprinting from the webview (ask Rust for the project root).
5. **Phase 7:** a status-bar indicator for active watches and pending fixes.
6. **Phase 8:** synthetic input with a `UI_ACTION` consent tier (L-02); tiling presets and
   multi-app orchestration (L-04, L-07).
7. **Phase 9:** a latency view over `AgentLoop.recentMetrics` (L-13); load tool JSON lazily.
8. **Phase 10:** Docker smoke matrix for Ubuntu, Fedora, Debian and Arch (L-06); self-update (L-17).
9. **Model training:** the LoRA/DPO/GRPO scripts exist but no adapter has gone through the
   regression gate; train on real transcripts only after the benchmark is re-baselined (see I-43).


---

## 5. macOS GUI test pass (release build, 2026-09-28)

The release bundle (`npm run bundle:mac`) was launched and driven through its real window:
keystrokes, clicks and screenshots, no headless mode. All side effects stayed in a throwaway
sandbox. The local engine was Qwen2.5-Coder-3B served by `~/.sentinel/bin/llama-server`.

**Found and fixed (each commit is named after the fix):**

| Area | Problem seen in the window | Fix |
|---|---|---|
| Input routing | A `>` request typed while another ran, or one containing `$ % #`, went to zsh as a `>file` redirect | Keystroke shadow and input anchor (`InputLineTracker`); requests are queued |
| Wrong data | The macOS battery, CPU, RAM, disk, uptime and temperature readings were hard-coded sample values | Real `pmset`/`vm_stat`/`sysctl`/`df` readings; honest errors otherwise |
| Folder | `cd X && clear` became the folder "X && clear", so the agent ran git in the wrong place | The shell's real cwd from the OS (`get_pty_cwd`) |
| Consent | Enter typed while a dialog opened approved `screencapture`, which captured the screen | Enter arms after 0.8 s with no typing; screen, camera and mic capture always ask |
| Declines | After "Cancel" the model tried another way (`git init`, a second screenshot) | A declined command ends the request |
| Questions | A failed read-only question escalated to `git init` | Questions never run modifying follow-ups |
| Learning | `ls build` after declining "delete the build folder" was learned as how to delete it | Plausibility gate; declined requests are not unresolved |
| OS labels | "darwin" contains "win": Mac samples were labelled Windows and Windows rules applied | `isWindowsName()` exact match |
| Accuracy | "explain math.js" described the npm library; "111 lines" was invented; multi-part questions stopped early | Named files are read; figures must appear in command output; multi-part questions continue |
| Watcher | An unrelated error re-applied an old fix to the wrong repo | Each error diagnosed on its own; the fix targets the repo in the error line |
| Auto-heal | `git statsu` offered the fix `status`, printed above the git output | `git status`, printed after the output, above a fresh prompt |
| Engine | A killed instance left llama-server (2 GB) running | An orphaned Sentinel server is stopped at the next start |
| Look | Saturated colors, dim text drawn as black boxes, repeated status lines, "/16GB" RAM, broken breadcrumbs | Grayscale truecolor renderer, in-place status line, real totals, compact path |

**Prompts and their result on the final build** (re-run after the fixes unless marked):

| Prompt | Result |
|---|---|
| `how much battery is left`, `what's eating my RAM`, `how full is my disk`, `what's my ip` | Correct, instant, real data |
| `what's my battery and uptime`, `check disk, memory and uptime` | Correct, instant (each part answered) |
| `what changed in the last commit here` | Correct, instant (`git show --stat`) |
| `explain what math.js does` | Correct, answered from the file |
| `which node version do I have and where is it installed` | Correct (not re-run after the last changes) |
| `how many javascript files ... and how many lines ...` | Line total correct (5); the file count was not measured, so the grounding check showed the raw output instead of an unverified figure |
| `show listening ports` | Correct, compact table |
| `delete the build folder`, `take a screenshot` | Declined: "Not run", nothing changed, no second attempt, no file written |
| `create an empty file called hello.txt here` while typing `ls` + Enter | The dialog stayed open through the stray Enters; nothing created until a deliberate choice |
| `watch file`, `watch mode auto-safe`, two repo lock errors, a crafted `Cannot find module 'evil-pkg'` line | Each lock removed in its own repo only; `evil-pkg` proposed, never installed |
| `watch list`, `unwatch 1`, `why`, `export session` | Correct |
| `git statsu` then Tab | Fix `git status` shown after the output and applied |

**Unexplained:** once, right after relaunching the app, the typed `cd ... && clear` line opened three
split panes and never reached the shell, as if a Command modifier were held. The audit log and the
shell history show nothing unexpected ran; the cause is not known.

**Still open after this pass:**

1. The 3B model sometimes writes a correct-looking but wrong pipeline (it summed `wc -l`'s own
   total line). Rule 14 addresses that case; a larger tier (Qwen3-4B) is more reliable.
2. The line parser in `ReadOnlyCommandPolicy` misreads `"$i"` followed by `2>/dev/null` inside
   `$(...)`. It errs toward asking for consent, never toward skipping it.
3. `>watch list` and `>why` print long absolute paths; shorten them with `~` and middle ellipsis.
4. Window listing on macOS needs Accessibility rights; only screenshots are covered today.

---

## 6. Complex features and release check (2026-09-29)

Tested in the release build's window (and last on the exact app inside the DMG):

| Feature | Before | After |
|---|---|---|
| Workflow Manager "Run" | Dialog opened behind the drawer; the run hung | Runs in the focused terminal; one dialog lists every command |
| Workflow steps | Ran in the app's folder; `cd` did not carry over; `tail -f` blocked 5 min | Start in the terminal's folder; `cd` carries over; long steps open a pane |
| Opening a workflow file | Opened a tab at the file path | Previews every command, runs after approval; `.flow` is a registered file type |
| `.flow` files | Never listed | Listed and runnable (browser/app/folder/command actions, macOS and Linux) |
| "create folder, go into it, git init, npm init, list files" | The English sentence was sent to the shell | Planned into commands, one approval, shell ends in the new folder |
| "follow app.log and serve this folder" | Blocked the agent | Two panes; the agent reports both and knows what they print |
| "what is running in my other terminals" | No knowledge of other panes | Correct answer, including an error line from another pane |
| ROS 2 pipelines | One process at a time, blocking | Each node / launch / echo in its own pane after one approval, then `ros2 node list` / `topic list`; clear message when ROS is missing (the only result verifiable on this Mac) |
| Auto-heal with several panes | Fix shown in every pane; timing-dependent misses | Only in the pane that failed; errors split across chunks are found |
| Restored screens after splitting | Doubled text; stale fix popups | Drawn once, never re-diagnosed |

**Distribution status:** `npm run bundle:dmg` produces `Sentinel Terminal_2.0.0_aarch64.dmg`
(Apple Silicon only), ad-hoc signed with a valid bundle signature. It is not notarized, so on
another Mac Gatekeeper blocks the first launch until the user allows it (System Settings, Privacy
& Security, Open Anyway). Intel Macs need a universal build; Linux packages must be built on Linux
(the CI workflow can do this). A clean machine has no engine or model: the in-app installer
downloads them (about 2 GB); that download path has unit tests but was not run end to end here.
