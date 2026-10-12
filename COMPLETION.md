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
| 1 | Bring the windows branch up to date | 1 / 6 | In progress |
| 2 | Rust backend for Windows | 0 / 10 | Not started |
| 3 | Frontend platform layer | 0 / 8 | Not started |
| 4 | AI agent and security for Windows | 0 / 7 | Not started |
| 5 | UI and UX for Windows | 0 / 6 | Not started |
| 6 | Packaging and installers | 0 / 6 | Not started |
| 7 | CI and release pipeline | 0 / 4 | Not started |
| 8 | Verification on real Windows | 0 / 8 | Not started |
| 9 | Documentation and release | 0 / 3 | Not started |
| 10 | After release (optional) | 0 / 4 | Not started |
| **Total** | | **3 / 67** | |

---

## Phase 0: Groundwork and baseline
- [ ] **Phase 0 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [x] | 0.1 | Branch strategy (`windows` branch in worktree `../Cero-windows`) | 2026-10-12 | | Recorded in ROADMAP "Branches and folders" |
| [x] | 0.2 | Audit of existing Windows work (`origin/windows`, `v2.2.0-windows`, `cfg(windows)` code, CI) | 2026-10-12 | | Findings are in the ROADMAP "Starting point" section |
| [ ] | 0.3 | Windows development and test environment (VM or PC, toolchain, `cargo xwin`) | | | |
| [ ] | 0.4 | Green baseline (fix `escapeKey.test.ts`, root `check:triple` green) | | | |
| [ ] | 0.5 | Definition of done and test matrix | | | |

## Phase 1: Bring the windows branch up to date
- [ ] **Phase 1 complete**

| Done | # | Subphase | Date | Commit | Notes |
|---|---|---|---|---|---|
| [ ] | 1.1 | Archive the early port (tag `windows-legacy`) | | | Tagged locally 2026-10-12; waiting for push |
| [x] | 1.2 | Worktree for the Windows branch (`../Cero-windows`) | 2026-10-12 | | |
| [ ] | 1.3 | Merge `linux-v2-update` into `windows` | | `0342a4f` | Merged and verified locally (2600 tests, build, cargo check); waiting for push and CI |
| [ ] | 1.4 | Windows configuration overlay and scripts (`tauri.windows.conf.json`, `package.json`, `Cargo.toml`) | | | |
| [ ] | 1.5 | Keeping up with Linux (merge routine documented and used once more) | | | |
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
| [ ] | 7.4 | Automatic merge pull requests from Linux (and `sync-shared.yml` no longer targets `windows`) | | | |

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
| [ ] | 10.4 | Reuse the branch-and-worktree model for macOS | | | |
