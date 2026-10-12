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
| 1 | Bring the windows branch up to date | 3 / 6 | In progress |
| 2 | Rust backend for Windows | 0 / 10 | Not started |
| 3 | Frontend platform layer | 0 / 8 | Not started |
| 4 | AI agent and security for Windows | 0 / 7 | Not started |
| 5 | UI and UX for Windows | 0 / 6 | Not started |
| 6 | Packaging and installers | 0 / 6 | Not started |
| 7 | CI and release pipeline | 0 / 4 | Not started |
| 8 | Verification on real Windows | 0 / 8 | Not started |
| 9 | Documentation and release | 0 / 3 | Not started |
| 10 | After release (optional) | 0 / 4 | Not started |
| **Total** | | **5 / 67** | |

---

## Phase 0: Groundwork and baseline
- [ ] **Phase 0 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [x] | 0.1 | Branch strategy (`windows` branch in worktree `../Cero-windows`) | 2026-10-12 | | Recorded in ROADMAP "Branches and folders" |
| [x] | 0.2 | Audit of existing Windows work (`origin/windows`, `v2.2.0-windows`, `cfg(windows)` code, CI) | 2026-10-12 | | Findings are in the ROADMAP "Starting point" section |
| [ ] | 0.3 | Windows development and test environment (VM or PC, toolchain, `cargo xwin`) | | | Linux side done 2026-10-12: `cargo xwin check` passes. Still open: a Windows PC or VM where `npm run tauri dev` starts. Setup notes below the table |
| [ ] | 0.4 | Green baseline (fix `escapeKey.test.ts`, root `check:triple` green) | | `1de1eb8` | Fix committed on `windows` only (Node 22 ignores a bare `true` capture flag on remove). Open: CI result after push, and the same fix on `linux-v2-update` |
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

## Phase 1: Bring the windows branch up to date
- [ ] **Phase 1 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [x] | 1.1 | Archive the early port (tag `windows-legacy`) | 2026-10-12 | | Tag pushed to origin |
| [x] | 1.2 | Worktree for the Windows branch (`../Cero-windows`) | 2026-10-12 | | |
| [x] | 1.3 | Merge `linux-v2-update` into `windows` (one time only) | 2026-10-12 | `0342a4f` | Pushed (`4631b4e..1ed7fe6`); 2600 tests, build, cargo check passed on Linux; CI result to be checked |
| [ ] | 1.4 | Make the branch Windows-only (remove Linux and macOS code, 9 steps) | | | Needs `cargo xwin` (0.3) first |
| [ ] | 1.5 | Porting Linux changes (`LINUX_PORT_LOG.md`, cherry-pick / port / skip routine) | | | |
| [ ] | 1.6 | Feature parity matrix | | | |

## Phase 2: Rust backend for Windows
- [ ] **Phase 2 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 2.1 | PTY on ConPTY: shell resolution, arguments, exit detection, kill, fallback | | | |
| [ ] | 2.2 | Shell working directory through OSC 9;9 / OSC 7 | | | |
| [ ] | 2.3 | Shell discovery command (`list_available_shells`) | | | |
| [ ] | 2.4 | Process execution and cleanup (Job Objects, encoding, ported tests) | | | |
| [ ] | 2.5 | Embedded model server (engine asset choice, extraction, parent death, orphan reaping) | | | |
| [ ] | 2.6 | `.flow` file association (registry status and toggle, argv paths) | | | |
| [ ] | 2.7 | Secrets in Credential Manager | | | |
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
