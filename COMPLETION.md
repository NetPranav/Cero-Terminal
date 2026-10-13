# Cero for Windows: Completion Tracker

This file tracks progress on [ROADMAP.md](ROADMAP.md). The numbers match the roadmap sections.

**How to update it**
- When a subphase meets its "Done when" criteria in the roadmap, change `[ ]` to `[x]`, and fill in the date
  (YYYY-MM-DD) and the commit hash.
- A phase is complete only when all its subphases are checked. Then check the phase line and set its status to
  `Complete`.
- Status values: `Not started`, `In progress`, `Blocked (<reason>)`, `Complete`.
- An item that was only built or tested in CI, not run on a real Windows PC, gets the note `CI only`.
- Update the summary table at the top in the same commit.

---

## Summary

| Phase | Title | Subphases done | Status |
|---|---|---|---|
| 0 | Groundwork and baseline | 2 / 5 | In progress |
| 1 | Bring the windows branch up to date | 5 / 6 | In progress |
| 2 | Rust backend for Windows | 0 / 10 | Not started |
| 3 | Frontend platform layer | 0 / 8 | Not started |
| 4 | AI agent and security for Windows | 0 / 7 | Not started |
| 5 | UI and UX for Windows | 0 / 6 | Not started |
| 6 | Packaging and installers | 0 / 6 | Not started |
| 7 | CI and release pipeline | 0 / 4 | Not started |
| 8 | Verification on real Windows | 0 / 8 | Not started |
| 9 | Documentation and release | 0 / 3 | Not started |
| 10 | After release (optional) | 0 / 4 | Not started |
| **Total** | | **7 / 67** | |

---

## Phase 0: Groundwork and baseline
- [ ] **Phase 0 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [x] | 0.1 | Branch strategy (`windows` branch in worktree `../Cero-windows`) | 2026-10-12 | | Recorded in ROADMAP "Branches and folders" |
| [x] | 0.2 | Audit of existing Windows work (`origin/windows`, `v2.2.0-windows`, `cfg(windows)` code, CI) | 2026-10-12 | | Findings are in the ROADMAP "Starting point" section |
| [ ] | 0.3 | Windows development and test environment (VM or PC, toolchain, `cargo xwin`) | | | Linux side done 2026-10-12: `cargo xwin check` passes. Still open: a Windows PC or VM where `npm run tauri dev` starts. Setup notes below the table |
| [ ] | 0.4 | Green baseline (fix `escapeKey.test.ts`, root `check:triple` green) | | `1de1eb8` | Fix committed on `windows` only (Node 22 ignores a bare `true` capture flag on remove). `npm run check:triple` is green on Linux since `a0e419e`. The same fix is on `linux-v2-update` as `2b1b561` (cherry-pick -x, 9/9 on Node 22). Open: CI result after push |
| [ ] | 0.5 | Definition of done and test matrix | | | |

**Linux cross-check setup (0.3).** The machine has Arch's system Rust (no rustup), so a user-space toolchain was added
without touching the system one:
- `rustup` in `~/.rustup` and `~/.cargo/bin` (installed with `--no-modify-path`), target `x86_64-pc-windows-msvc`,
  component `llvm-tools`; `cargo install cargo-xwin --locked` (0.23.1).
- `~/.local/share/cero-win-tools/` holds `llvm-rc`, `llvm-ar`, `llvm-lib` (a link to `llvm-ar`), `llvm-cvtres` and
  `llvm-mt`, extracted from the Arch `llvm` 23.1.1 package. `ring` needs `llvm-lib` and `tauri-winres` needs `llvm-rc`.
  `sudo pacman -S llvm` would replace this folder.
- Run the check with
  `PATH="$HOME/.local/share/cero-win-tools:$HOME/.cargo/bin:$PATH" cargo xwin check --target x86_64-pc-windows-msvc --manifest-path src-tauri/Cargo.toml`.
  The first run downloads the Windows SDK and CRT into the cargo-xwin cache.
- CI runs Node 22; this machine has Node 26. For CI-only test failures, run Vitest with a Node 22 binary.
- Since 1.4 step 6, `npm run check:triple` does this: `npm run check:rust` runs `cargo xwin check` on Linux and
  `cargo check` on Windows (`scripts/check-rust.mjs`). `scripts/windows/check-triple.ps1` is the PowerShell version.

## Phase 1: Bring the windows branch up to date
- [ ] **Phase 1 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [x] | 1.1 | Archive the early port (tag `windows-legacy`) | 2026-10-12 | | Tag pushed to origin |
| [x] | 1.2 | Worktree for the Windows branch (`../Cero-windows`) | 2026-10-12 | | |
| [x] | 1.3 | Merge `linux-v2-update` into `windows` (one time only) | 2026-10-12 | `0342a4f` | Pushed (`4631b4e..1ed7fe6`); 2600 tests, build, cargo check passed on Linux; CI result to be checked |
| [ ] | 1.4 | Make the branch Windows-only (remove Linux and macOS code, 9 steps) | | `7dd555b` | All nine steps committed 2026-10-13: 1 `a2b58d7`, 2 `03f5ce8`, 3 `af7926a`, 4 in five parts `9e3b762` `060c3d2` `789c916` `15a49a5` `87fa05c`, 5 `062ee46`, 6 `a0e419e`, 7 `9e1c009`, 8 `0c12f54`, 9 `7dd555b`. `npm run check:triple` passes on Linux (cargo xwin). Open: the Windows CI run after the push. Removed features are listed below the table |
| [x] | 1.5 | Porting Linux changes (`LINUX_PORT_LOG.md`, cherry-pick / port / skip routine) | 2026-10-13 | | Log starts at `77fd178`; first review covered the one new Linux commit (`2b1b561`, the escapeKey fix, which started on `windows`) |
| [x] | 1.6 | Feature parity matrix | 2026-10-13 | | `docs/windows/FEATURE_MATRIX.md`: every `docs/FEATURES.md` feature plus the 1.4 removals; nothing verified on Windows yet. FEATURES.md and the integration docs now describe Windows |

**Removed or stubbed in 1.4 (input for the 1.6 matrix).** Stubs answer "not available on Windows yet" and carry a
`TODO(<subphase>)`.
- Removed (Linux or macOS only): the ROS environment, the Hyprland/dotfile "rice" helpers, systemd service watching
  (2.8 replaces it), Finder/Nautilus integrations, the AppImage file-association prompt, Linux desktop and systemd fast
  paths, macOS rules in the deterministic oracle (and the brew typo rule), macOS/POSIX tldr pages, the macOS Spotlight
  search, the `developer.xcode` tool, SystemAdvisor ("improve my computer", POSIX snapshot; 3.7 ports it),
  ProcessPortManager (unused; PortControl covers ports), MacSystemParsers, DesktopCommands, InputDaemonProbe,
  the FileAssociationPrompt, the MLX fine-tuning script (4.6), the headless stress harness (POSIX pty relay), and the
  Linux/macOS packaging, release and sync scripts.
- Stubbed until a Windows version exists: the system drivers for Wi-Fi, Bluetooth radio, brightness, volume, dark mode,
  battery, lock and settings pages (3.7), the installer service (3.8), the system knowledge scan (4.1), the tldr
  Windows recipes (4.5), the Shadow-PTY sandbox and its platform rewrites (4.3), Reflexion and Dream-State self-play
  (PowerShell templates written, sandbox still POSIX: 4.6), and the legacy `src/sdk/<domain>` modules (decide in 3.7).
- Still POSIX and marked: most `FAST_PATHS` shell entries in `AgentLoop.ts` (4.3), the workflow decomposer's step
  preconditions (4.7), WorkspaceRegistry's project scanner (3.7), and the benchmark prompt set (4.6).

## Phase 2: Rust backend for Windows
- [ ] **Phase 2 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 2.1 | PTY on ConPTY: shell resolution, arguments, exit detection, kill, fallback | | | Code written 2026-10-13: `shell.rs` (order pwsh, Windows PowerShell, `%ComSpec%`; `PATHEXT` walk; args per shell; 22 tests, run on Linux), `home.rs` (`USERPROFILE` before `HOME`, used everywhere), `pty.rs` (fallback with `pty-fallback` notice, waiter thread for `pty-exit` within 2 s, kill, no `LANG`/`LC_ALL`/`-l`), 11 `#[cfg(windows)]` PTY tests (cmd, PowerShell, pwsh, Git Bash, UTF-8, exit, kill, resize, fallback, home). Open: those tests have only been compiled (`cargo xwin check --tests`), not run; they need `windows-latest` CI and a real PC. Job Objects are 2.4, the integration scripts 3.3 |
| [ ] | 2.2 | Shell working directory through OSC 9;9 / OSC 7 | | | Rust side written 2026-10-13: `osc.rs` scanner (OSC 9;9 and OSC 7, split reads, UNC and POSIX forms; 13 tests, run on Linux) feeds a per-session folder in `pty.rs`; `get_pty_cwd` returns it (the start folder until the first report). Open: the shells must send the reports (`cero.ps1`, `cero.cmd`, bash: 3.3) and the four-shell check on a real PC; one `cfg(windows)` test sets a cmd `PROMPT` and is only compiled so far |
| [ ] | 2.3 | Shell discovery command (`list_available_shells`) | | | Written 2026-10-13: `shell::list_shells` (PowerShell 7, Windows PowerShell, cmd, Git Bash from the registry key and standard folders, one entry per WSL distribution with `-d <name>`) with a fake-`PATH` test of the order; `wsl.exe -l -q` decoded from UTF-16LE (Docker helper distributions and the "no distributions" message ignored); the command runs off the UI thread with a 4 s limit for `wsl.exe`. 31 `shell.rs` tests run on Linux; 2 `cfg(windows)` tests of the real machine only compiled. Open: Settings lists the shells (5.5); Developer PowerShell for VS (optional) not done; `get_default_shell` already returns the resolved shell (2.1) |
| [ ] | 2.4 | Process execution and cleanup (Job Objects, encoding, ported tests) | | | Code written 2026-10-13: `job.rs` (kill-on-close job per run; `terminate` on cancel or timeout, `taskkill /T /F` without a console window as fallback, `release` after a normal finish so programs the command started on purpose keep running), `encoding.rs` (UTF-8, UTF-16 with BOM, else OEM code page via `MultiByteToWideChar`; 5 tests run on Linux), `expand_tilde` also handles `%USERPROFILE%` and `$env:USERPROFILE` (6 `home.rs` tests run on Linux), llama-server joins an app-wide job so it dies with Cero. 10 `run_command` tests (output and exit code, timeout and cancel kill the tree, background child, closed stdin, one run cancelled while another continues, PowerShell UTF-8) and 4 job tests are only compiled so far. **Deviation:** the PTY shell is not put in a kill-on-close job (roadmap 2.1 said to): closing a tab would also kill editors and other programs started from it, losing unsaved work. Decide at 8.5. Open: `windows-latest` CI result and the no-console-flash check on a real PC |
| [ ] | 2.5 | Embedded model server (engine asset choice, extraction, parent death, orphan reaping) | | | Written 2026-10-13: zip fallback when `tar` is missing or fails (own extractor; `\` separators accepted, paths that leave the folder refused), antivirus handling (engine gone 1.5 s after extraction, or start error 225/226, gives the Windows Security exclusion steps; the reason now reaches the install screens through `getLastInstallError`), orphan reaping through `GetExtendedTcpTable` (only a `llama-server.exe` under `%USERPROFILE%\.cero` is ended), engine search also in the winget links folder, parent death through the app job (2.4), test that the server binds `127.0.0.1`. 6 `engine_support.rs` tests run on Linux; zip, TCP-table and engine tests only compiled. **Not done:** the CUDA build (Vulkan covers NVIDIA for now) and the VC++ runtime check, which need pinned release hashes (follow-up). Open: a clean VM downloads, extracts, starts and stops the engine; killing Cero leaves no `llama-server.exe` |
| [ ] | 2.6 | `.flow` file association (registry status and toggle, argv paths) | | | Written 2026-10-13: status read from the merged `HKEY_CLASSES_ROOT` view (`registered`, `registered-elsewhere`, `missing`, plus `machine_wide`), Settings toggle writes or removes `HKCU\Software\Classes\.flow` and `Cero.Flow` and calls `SHChangeNotify`, launch arguments accept quoted paths, `file:///C:/...`, `file://server/share/...` and UNC paths. 21 pure tests (assoc, file_uri, osc) run on Linux, 3 Vitest tests; the registry tests use a throwaway `HKCU\Software\CeroTest` key and are only compiled so far. Not done: asking once on first run when the installer registration is missing (portable builds); the user's "Open with" choice (UserChoice) is not read. Open: double-click on Windows 10 and 11, closed and running |
| [ ] | 2.7 | Secrets in Credential Manager | | | Written 2026-10-13: entry names unchanged from 2.2.0 (`service`, `key`), plaintext file helpers removed (no fallback: Credential Manager is always there). **Finding:** the `keyring` crate stores a password as UTF-16 and refuses more than 2560 bytes, about 1280 characters, so a 2000-character key failed; values over 1000 UTF-16 units are now split over `<key>#chunk0..n` with a marker entry written last (8 `secret_chunks.rs` tests run on Linux). 9 `cfg(windows)` Credential Manager tests (2000-character key, emoji, replace long by short, missing piece, marker lookalike, services apart) are only compiled. Open: they must pass on `windows-latest`; a key surviving a restart and an upgrade from 2.2.0 |
| [ ] | 2.8 | Log and service watching (file identity, share modes, Event Log) | | | |
| [ ] | 2.9 | Other modules (`path_search`, migration, logger, data location, `lib.rs`) | | | |
| [ ] | 2.10 | Smoke-test mode (`--smoke-test`) | | | |

## Phase 3: Frontend platform layer
- [ ] **Phase 3 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 3.1 | One source of truth for the platform (`src/platform/os.ts`) | | | |
| [ ] | 3.2 | Shell profiles (pwsh, powershell, cmd, Git Bash, WSL) | | | |
| [ ] | 3.3 | Shell integration scripts (`cero.ps1`, `cero.cmd`, OSC 133) | | | |
| [ ] | 3.4 | Prompt detection and terminal state with ConPTY fixtures | | | |
| [ ] | 3.5 | Command history and ghost-text autocomplete with PSReadLine | | | |
| [ ] | 3.6 | Paths in the frontend (`src/platform/paths.ts`) | | | |
| [ ] | 3.7 | Capability drivers with Windows parsers and fixture tests | | | |
| [ ] | 3.8 | Onboarding, installer wizard and settings text | | | |

## Phase 4: AI agent and security for Windows
- [ ] **Phase 4 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 4.1 | System prompt and context for Windows | | | |
| [ ] | 4.2 | Agent command execution (PowerShell invocation, encoding, exit codes) | | | |
| [ ] | 4.3 | Command portability and fast paths (40+ cases) | | | |
| [ ] | 4.4 | Security engine for Windows (80+ tests, security review) | | | |
| [ ] | 4.5 | Tool knowledge: Windows examples for all 103 tools | | | |
| [ ] | 4.6 | Model reliability on Windows (eval results recorded) | | | |
| [ ] | 4.7 | `.flow` workflows across operating systems | | | |

## Phase 5: UI and UX for Windows
- [ ] **Phase 5 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 5.1 | Window chrome (controls, drag, resize, snap) | | | |
| [ ] | 5.2 | Keyboard shortcuts (copy on selection, AltGr) | | | |
| [ ] | 5.3 | Fonts and rendering (Cascadia, DPI) | | | |
| [ ] | 5.4 | Clipboard and line endings | | | |
| [ ] | 5.5 | Settings and onboarding (shell picker, toggles) | | | |
| [ ] | 5.6 | Windows theme integration (High Contrast, dark native parts) | | | |

## Phase 6: Packaging and installers
- [ ] **Phase 6 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 6.1 | Bundle configuration (NSIS per-user, MSI per-machine, branding) | | | |
| [ ] | 6.2 | `.flow` file association, only once | | | |
| [ ] | 6.3 | Upgrades from 2.2.0 | | | |
| [ ] | 6.4 | Uninstall (keep or delete user data) | | | |
| [ ] | 6.5 | Portable build (optional) | | | |
| [ ] | 6.6 | Code signing decision (and setup if chosen) | | | |

## Phase 7: CI and release pipeline
- [ ] **Phase 7 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 7.1 | CI on the `windows` branch (build and `cargo test` on Windows) | | | |
| [ ] | 7.2 | Installer smoke test in CI | | | |
| [ ] | 7.3 | Release workflow (smoke test before upload, merge `windows` into `release/windows`) | | | |
| [ ] | 7.4 | Linux changes report (weekly issue listing commits to port) | | | |

## Phase 8: Verification on real Windows
- [ ] **Phase 8 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 8.1 | Test report document (`WINDOWS_TEST_REPORT.md`) | | | |
| [ ] | 8.2 | Install and first run | | | |
| [ ] | 8.3 | Terminal (all shells) | | | |
| [ ] | 8.4 | AI and workflows | | | |
| [ ] | 8.5 | System and robustness | | | |
| [ ] | 8.6 | Display and input | | | |
| [ ] | 8.7 | Performance | | | |
| [ ] | 8.8 | Beta round (GitHub pre-release) | | | |

## Phase 9: Documentation and release
- [ ] **Phase 9 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 9.1 | Documentation | | | |
| [ ] | 9.2 | Release notes with "Verified on" and "Not verified" lists | | | |
| [ ] | 9.3 | Version bump, release, final check on a clean VM | | | |

## Phase 10: After release (optional)
- [ ] **Phase 10 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 10.1 | Distribution channels (winget, Scoop) | | | |
| [ ] | 10.2 | Auto-update | | | |
| [ ] | 10.3 | ARM64 | | | |
| [ ] | 10.4 | Reuse this model (separate branch, worktree, port log) for macOS | | | |
