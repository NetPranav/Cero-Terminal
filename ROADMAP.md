# Cero for Windows: Implementation Roadmap

This document plans the native Windows version of Cero. The Windows version is developed on the **`windows` branch**,
which is checked out in its own folder through a git worktree (`../Cero-windows`). The Linux branch (`linux-v2-update`)
stays the reference implementation and never holds Windows-only work. Progress is tracked in
[COMPLETION.md](COMPLETION.md).

- **Target:** Windows 10 22H2 and Windows 11 (23H2, 24H2), x64. ARM64 comes later (Phase 10).
- **Reference code:** `linux-v2-update` (Cero 2.2.3). It was merged into `windows` on 2026-10-12 (commit `0342a4f`).
- **Output:** a `.msi` installer and a per-user setup `.exe` (NSIS), published as GitHub release `v<version>-windows`.

> **Merging is not porting.** After the merge, the `windows` branch has every Linux feature and fix, but many of them
> still assume Linux: bash-oriented shortcuts, prompt detection, security rules and system drivers. On Windows they
> would fail or run the wrong commands. Phases 2 to 8 make each feature correct on Windows and prove it on a real PC.

---

## Table of contents

- [Starting point: what already exists](#starting-point-what-already-exists)
- [Guiding principles](#guiding-principles)
- [Branches and folders](#branches-and-folders)
- [Which Claude model for which phase](#which-claude-model-for-which-phase)
- [Phase 0: Groundwork and baseline](#phase-0-groundwork-and-baseline)
- [Phase 1: Bring the windows branch up to date](#phase-1-bring-the-windows-branch-up-to-date)
- [Phase 2: Rust backend for Windows](#phase-2-rust-backend-for-windows-src-tauri)
- [Phase 3: Frontend platform layer](#phase-3-frontend-platform-layer-src)
- [Phase 4: AI agent and security for Windows](#phase-4-ai-agent-and-security-for-windows)
- [Phase 5: UI and UX for Windows](#phase-5-ui-and-ux-for-windows)
- [Phase 6: Packaging and installers](#phase-6-packaging-and-installers)
- [Phase 7: CI and release pipeline](#phase-7-ci-and-release-pipeline)
- [Phase 8: Verification on real Windows](#phase-8-verification-on-real-windows)
- [Phase 9: Documentation and release](#phase-9-documentation-and-release)
- [Phase 10: After release](#phase-10-after-release-optional)
- [Risks and open decisions](#risks-and-open-decisions)

---

## Starting point: what already exists

I audited this on 2026-10-12, before planning. Several pieces of Windows work already exist, and the plan builds on
them instead of starting from zero.

| Item | State | What it means for this plan |
|---|---|---|
| GitHub release `v2.2.0-windows` (2026-10-03) | `Cero_2.2.0_x64_en-US.msi` and `Cero_2.2.0_x64-setup.exe` were built by CI from `release/windows`. The release notes say: **"Not run on a Windows PC for this release"**. | A Windows build compiles and packages, but no one has used it. Users who installed 2.2.0 must be able to upgrade in place (same `identifier`, see 6.3). |
| Branch `origin/release/windows` | Points at `376538b`, a commit on `main` (macOS-first). It is not the Linux line. | It does not have the 24 Linux fixes on `linux-v2-update` (history OSC markers, Right-arrow accept, queue and Ctrl+C state, approval cards, and so on). |
| Branch `origin/windows` before 2026-10-12 | A stale early port by another contributor: `docs/WINDOWS_PORT_TRACKER.md`, `src-tauri/src/pty_windows.rs`, and an SDK refactor (`netsh wlan`, `Get-Process`, `systeminfo`). It branched from `748a913` and was 232 commits behind `linux-v2-update`. | **Done:** tagged as `windows-legacy`, then `linux-v2-update` was merged in (`0342a4f`) with every conflict resolved to the Linux version. The old SDK changes were dropped: they used `process.platform` (undefined in the web view), reported simulated success for Bluetooth and Wi-Fi, and parsed PIDs with a broken regex. Phase 3.7 redoes them properly. |
| `cfg(windows)` code already in `src-tauri/src` | `pty.rs` uses `powershell.exe` as the default shell. `process_cmds.rs` and `watcher.rs` use `CREATE_NO_WINDOW` and kill process trees with `taskkill /T /F`. `embedded_server.rs` uses `llama-server.exe`. `downloads.rs` extracts with `tar.exe`. `secrets.rs` stores keys in Credential Manager (`keyring` `windows-native`). `launch.rs` handles `file://` argv. `legacy_migration.rs` uses `%APPDATA%`/`%LOCALAPPDATA%`. | Much of the plumbing exists, but it is shallow: there is no working-directory tracking, no ConPTY exit handling, no Job Objects, and no Windows file-association status. |
| `src-tauri/windows/installer-hooks.nsh` | Writes the `.flow` registration (`HKCU`/`HKLM` `Software\Classes`) on NSIS install and removes it on uninstall. | It may overlap with Tauri's own `bundle.fileAssociations`, so this needs checking (6.2). |
| Frontend | 62 non-test files already branch on Windows (`isWindows`, `powershell`, `win32`). `CommandPortability.ts` maps `python3` to `python` on Windows. `ShellSDKCapability.ts` runs agent commands through `powershell.exe`. All 103 `tools/*/tool.json` list `windows`. | The work is mostly about correctness and depth, not new structure. Platform detection is inconsistent: some code sniffs `navigator.userAgent`. |
| CI (`.github/workflows/ci.yml`) | `cargo check` and tests pass on `windows-latest`. The Vitest suite fails on **all three** OSes in CI because of one test: `src/presentation/escapeKey.test.ts` > "stops listening once removed (Settings closed)". It passes locally (2600 passed on 2026-10-12), so it fails only in CI. | Fix it first (0.4), so the Windows work starts from a green baseline. `ci.yml` already runs on pushes to `windows`. |
| `release.yml` / `build-installers.yml` | These already have a `windows-latest` job: `npx tauri build --bundles msi,nsis`, then publish to `v<version>-windows`. | Reuse them as they are. A release is a merge of `windows` into `release/windows` (Phase 7). |
| Code signing | None. SmartScreen shows "Windows protected your PC". | Decide in 6.6. |

---

## Guiding principles

1. **`linux-v2-update` is the reference, `windows` is the product.** Windows work happens only on the `windows` branch.
   Fixes that are not specific to Windows (AI, workflows, tools, shared UI) are made on `linux-v2-update` first, then
   reach `windows` through a regular merge (1.5). That keeps the two branches from drifting.
2. **Add, do not replace.** On the `windows` branch, Windows behaviour is **added next to** the Linux and macOS code,
   never written over it:
   - in Rust, use `#[cfg(windows)]`;
   - in TypeScript, use the platform check from 3.1;
   - for configuration, use `src-tauri/tauri.windows.conf.json`, which Tauri merges over `tauri.conf.json` only on
     Windows.
   Deleting Linux code on this branch would make every future merge from Linux conflict. A bonus: OS-gated changes can
   later be merged back into Linux, and the branches move closer together over time.
3. **The tests come first.** Every behaviour change gets a failing Vitest spec or Rust test before the fix (`tdd-guide`).
   Windows-only Rust tests use `#[cfg(windows)]` and run on the `windows-latest` CI runner.
4. **Nothing is "verified" until it has run on a real Windows machine.** CI builds prove that the code compiles. Only
   the Phase 8 checklist proves that it works. Release notes say exactly which items were run on real hardware.
5. **The AGENTS.md rules apply:** no emoji, the grayscale palette (`#090b10`, `#0c0d12`), full-screen Settings and
   onboarding, `check:triple` before every commit, and one Conventional Commit per finished subphase.

---

## Branches and folders

```
Projects/
├── Cero/            git worktree on linux-v2-update   (Linux reference; no Windows-only work)
└── Cero-windows/    git worktree on windows            (Windows product; this roadmap)
```

Both folders are checkouts of **one** repository (`git worktree list`), so they share the history and merging between
them is ordinary git. Created with: `git worktree add ../Cero-windows windows`.

| Branch or tag | Role |
|---|---|
| `linux-v2-update` | Linux line and the reference. Shared fixes start here. |
| `windows` | Windows development. Receives `linux-v2-update` through regular merges. |
| `release/windows` | What CI builds and publishes as `v<version>-windows`. Updated by merging `windows` into it. |
| `windows-legacy` (tag) | The early port, as it was before the 2026-10-12 merge. Reference only. |

New Windows-only files on the `windows` branch:

```
ROADMAP.md  COMPLETION.md              (this plan and its progress)
src-tauri/tauri.windows.conf.json      (Windows config, merged over tauri.conf.json by Tauri on Windows)
src-tauri/src/job.rs  ...              (new #[cfg(windows)] modules)
src-tauri/resources/shell-integration/ (cero.ps1, cero.cmd)
src-tauri/windows/                     (NSIS hooks, WiX fragments, installer bitmaps; already exists)
src/platform/os.ts  src/platform/paths.ts
scripts/windows/                       (check-triple.ps1, helper scripts)
docs/windows/                          (README, WINDOWS_TEST_REPORT, FEATURE_MATRIX, ...)
```

---

## Which Claude model for which phase

| Phase | Recommended model | Reason |
|---|---|---|
| 0, 1 | Sonnet 5.5 (Opus 5.5 for large merges from Linux with many conflicts) | Mostly setup and git work. |
| 2 | Opus 5.5 (Fable 5.1 for 2.1 and 2.4 if bugs persist) | ConPTY, Job Objects, and the Win32 APIs carry the highest risk of subtle bugs. |
| 3 | Opus 5.5 | Shell integration and prompt parsing are subtle. The parsers are mostly patterns, which Sonnet can do. |
| 4 | Opus 5.5 for prompts and agent; **Fable 5.1 for 4.4 (security)** | A wrong security pattern can delete a user's files. |
| 5 | Sonnet 5.5 | Well-scoped UI edits. |
| 6, 7 | Sonnet 5.5 (Opus 5.5 for signing) | Mostly standard configuration. |
| 8 | You, on a real Windows PC, with Sonnet 5.5 triaging the failures | The model cannot run Windows. |
| 9 | Sonnet 5.5 or Haiku 5.5 | Documentation. |
| Reviews | Run a different model or a fresh session with `/code-review` after each phase, plus the `rust-reviewer`, `react-reviewer` and `security-reviewer` subagents. | A fresh reviewer catches what the author missed. |

---

## Phase 0: Groundwork and baseline

**Goal:** a branch, a working Windows environment, a green test baseline, and an agreed definition of done.

### 0.1 Branch strategy
- All Windows work happens on the existing `windows` branch, checked out as the worktree `../Cero-windows`.
- `linux-v2-update` never receives Windows-only work. It only gets fixes that Linux wants too, and those flow on to
  `windows` by merge.
- The early port is kept as the tag `windows-legacy`.
- When Windows is ready, `windows` is merged into `release/windows` (Phase 7.3).
- **Done when:** the worktree exists, `windows-legacy` is tagged, and this strategy is recorded here ("Branches and
  folders"). Pushing the branch and the tag to `origin` is part of 1.3.

### 0.2 Audit of existing Windows work (done while writing this roadmap)
- Read `origin/windows`: `docs/WINDOWS_PORT_TRACKER.md`, `pty_windows.rs`, and commits `1301171`, `60b071e` and
  `95edfb2`.
- List the `cfg(windows)` code in the current `src-tauri/src` and the Windows-aware frontend files.
- Check the `v2.2.0-windows` release assets and the notes ("Not run on a Windows PC").
- Check CI: Rust passes on Windows. Vitest fails everywhere because of `escapeKey.test.ts`.
- **Done when:** the findings are recorded in the "Starting point" section above.

### 0.3 Windows development and test environment
- **A real machine or VM is needed.** Options:
  - a Windows 11 PC or laptop (best: a real GPU, real Wi-Fi and Bluetooth for the driver tests);
  - a Windows 11 VM on Arch through QEMU/KVM with `virt-manager` (Microsoft offers a free evaluation VM image). Wi-Fi
    and Bluetooth cannot be tested there;
  - a Windows 10 22H2 VM for the second target.
- Install on Windows: Git for Windows, Node.js 22 LTS, Rust stable (`x86_64-pc-windows-msvc`), Visual Studio 2022 Build
  Tools with the "Desktop development with C++" workload, the WebView2 Runtime (included in Windows 11), PowerShell 7
  (`winget install Microsoft.PowerShell`), and optionally Windows Terminal to compare behaviour.
- On Linux, add a type check of the Windows Rust code that runs without a VM:
  - `rustup target add x86_64-pc-windows-msvc`
  - `cargo install cargo-xwin`
  - then `cargo xwin check --target x86_64-pc-windows-msvc --manifest-path src-tauri/Cargo.toml`
- **Done when:** `npm run tauri dev` starts Cero from a clone of the `windows` branch on a Windows machine, and
  `cargo xwin check` passes on Linux.

### 0.4 Green baseline
- Fix the test `src/presentation/escapeKey.test.ts` > "stops listening once removed (Settings closed)". It fails on
  all three OSes in CI run `37209730598` but passes locally, which points to a timing or environment difference in CI.
  The test is shared code, so fix it on `linux-v2-update`, then merge into `windows`.
- Run `npm run check:triple`. The result must be 100% green.
- **Done when:** CI is green on both `linux-v2-update` and `windows`, with a commit
  `fix(test): escape listener is removed when Settings closes`.

### 0.5 Definition of done and test matrix
- **Operating systems:** Windows 11 24H2 (primary) and Windows 10 22H2.
- **Shells:** Windows PowerShell 5.1 (always present), PowerShell 7 (`pwsh`), `cmd.exe`, Git Bash, and WSL
  (`wsl.exe`, only to launch it, not for deep integration).
- **Accounts:** a standard (non-admin) user and an admin user. Test user names with a space and with non-ASCII
  characters (for example `C:\Users\José Ram`), and a OneDrive-redirected `Documents` folder.
- **Displays:** 100%, 125%, 150% and 200% scaling, plus multiple monitors with mixed DPI.
- **A Windows release is "done"** when every Phase 8 checklist row is either passed or listed as a known issue in the
  release notes.
- **Done when:** this matrix is copied into `docs/windows/WINDOWS_TEST_REPORT.md` as an empty checklist.

---

## Phase 1: Bring the windows branch up to date

**Goal:** the `windows` branch has all the current Linux code and fixes, has its own working folder, and has a
repeatable way to receive future Linux changes. Nothing in this phase makes features Windows-correct; that is Phases
2 to 8.

### 1.1 Archive the early port
- Tag the old branch tip: `git tag -a windows-legacy origin/windows`.
- **Done when:** the tag exists locally and on `origin` (it is pushed with 1.3).

### 1.2 Worktree for the Windows branch
- `git worktree add ../Cero-windows windows` (local branch `windows` tracking `origin/windows`).
- Install the dependencies inside it (`npm ci`). To save disk space and build time when checking on Linux, it can
  share the Rust build folder with the Linux checkout (`CARGO_TARGET_DIR=../Cero/src-tauri/target`).
- **Done when:** `git worktree list` shows both folders, and `npm test` runs in `../Cero-windows`.

### 1.3 Merge `linux-v2-update` into `windows`
- `git merge --no-ff linux-v2-update` inside the worktree.
- Conflict rule for this first merge: take the Linux version. It is newer and already contains the Windows handling
  the early port added (the PowerShell default shell, the macOS-only `PATH` additions, the macOS-only `RunEvent::Opened`).
- Review every file that still differs from `linux-v2-update` after the merge, and keep only correct, tested work.
- Verify: `npm test`, `npm run build`, `cargo check`.
- Push `windows` and the `windows-legacy` tag. Check that `ci.yml` runs on the push, including the `windows-latest`
  jobs.
- **Status (2026-10-12):** merged locally as `0342a4f`. 19 conflicts were resolved to Linux. `pty_windows.rs`, the
  old SDK driver changes and three old docs were dropped (reasons are in the commit message). Tests (2600 passed),
  build and `cargo check` passed on Linux. **Not pushed yet.**
- **Done when:** the merge is on `origin/windows`, and CI has run on it.

### 1.4 Windows configuration overlay and scripts (additive)
- `src-tauri/tauri.windows.conf.json` (Tauri merges it over `tauri.conf.json` on Windows only):
  - window: `"decorations": false`, `"shadow": true` (today this is done at runtime in `lib.rs`; doing it in config
    avoids a flash of the native frame);
  - `bundle.targets: ["msi", "nsis"]`, plus the NSIS and WiX settings from Phase 6.
  - **Keep `identifier: "org.cero.terminal"`** (it stays in the shared file), so that users of 2.2.0 upgrade in place
    and keep their Credential Manager keys and WebView2 storage.
- `package.json`: add `bundle:windows` (`tauri build --bundles msi,nsis`), `bundle:msi` and `bundle:nsis`. Leave the
  Linux and macOS scripts in place.
- `src-tauri/Cargo.toml`: under `[target.'cfg(windows)'.dependencies]`, add `windows-sys` (features
  `Win32_Foundation`, `Win32_System_JobObjects`, `Win32_System_Threading`, `Win32_Storage_FileSystem`,
  `Win32_System_Console`, `Win32_NetworkManagement_IpHelper`) and `winreg`.
- `scripts/windows/check-triple.ps1`: runs the same three checks as `npm run check:triple` and stops at the first
  failure, for PowerShell users.
- **Done when:** `npm run check:triple` passes on Linux, `cargo xwin check` passes, and `npm run tauri dev` on Windows
  opens a window without the native frame.

### 1.5 Keeping up with Linux
- **Routine:** after every Linux release, and before every Windows release, run
  `git -C ../Cero-windows merge linux-v2-update`.
- **Conflict rules:**
  - in shared code, take the Linux change, then re-apply the Windows addition beside it;
  - in Windows-only files (the list in "Branches and folders"), keep the Windows version.
- After each merge, run `npm run check:triple`, and commit as
  `merge: linux-v2-update into windows (<linux version>)`.
- Fixes that are not Windows-specific, found while working on Windows, go to `linux-v2-update` first (a small commit
  there), then come back with the next merge. Do not fix shared bugs only on `windows`.
- `main` (macOS) reaches `windows` through `linux-v2-update`, which already merges `main` from time to time.
- **Done when:** this routine is written in `docs/windows/README.md`, and one more merge from Linux has been done with
  it.

### 1.6 Feature parity matrix
- Create `docs/windows/FEATURE_MATRIX.md`, listing every user-facing feature from `docs/FEATURES.md` with these
  columns: Linux status, Windows plan (same / adapted / not available), phase, and verified-on-Windows (yes / no).
- Features that cannot work on Windows (for example the ROS environment and the Hyprland "rice" helpers) are hidden at
  runtime on Windows, or show a clear "not available on Windows" message. They are never deleted from the branch.
- **Done when:** every feature in `docs/FEATURES.md` has a row.

---

## Phase 2: Rust backend for Windows (`src-tauri`)

**Goal:** every Tauri command works correctly on Windows, with no console windows, no orphaned processes, and no
Linux assumptions.

### 2.1 PTY on ConPTY (`pty.rs`)
- `portable-pty` uses ConPTY on Windows 10 1809 and later. Check that its version (0.9) handles resize and UTF-8 output.
- **Shell resolution (`resolve_shell`), in this order:**
  1. the shell chosen in Settings, if it exists;
  2. `pwsh.exe` (PowerShell 7) on `PATH`;
  3. `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`;
  4. `%ComSpec%` (`cmd.exe`).
- Resolve bare names to full paths by walking `PATH` and `PATHEXT`. Do not rely on `contains('/')`.
- **Arguments per shell:**
  - PowerShell: `-NoLogo -NoExit -File <shell-integration>\cero.ps1`; the script dot-sources the user's `$PROFILE` (see 3.3);
  - cmd: `/K <cero.cmd>`;
  - Git Bash: `--login -i`;
  - WSL: none.
  - Remove the Unix `-l` login flag.
- **Environment:** keep `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=Cero` and `CERO_TERMINAL=1`. Drop
  `LANG` and `LC_ALL`, which have no effect on Windows and confuse Git Bash locale detection. Never rewrite `PATH`
  (no `:` joins).
- **Process exit:** ConPTY does not always close the output pipe when the shell exits, so the reader thread can block
  forever. Keep the `Child` handle in `PtySession`, and run a waiter thread that calls `child.wait()`, emits
  `pty-exit` and drops the master. Add a test for a `pty-exit` event within 2 s of sending `exit`.
- **kill_pty:** call `child.kill()` and drop the master (closing the ConPTY ends the attached processes). Put the
  shell in a Job Object (2.4), so that programs started from it die with it.
- **Fallback:** if spawning fails, try the next shell in the order above, log both errors, and report the fallback to
  the UI. This mirrors the Linux fallback block.
- **Home directory:** prefer `USERPROFILE` over `HOME`, because Git Bash and MSYS set `HOME` to other places. Do the
  same in `embedded_server::get_home_dir` and `process_cmds::expand_tilde`.
- **Tests (`#[cfg(windows)]`):** spawning each shell; output round-trip with UTF-8 (`echo héllo ✓`); resize; exit
  event; kill leaves no `powershell.exe` child (check with `sysinfo`).
- **Done when:** the tests pass on the `windows-latest` CI runner, and typing in each shell works on a real PC.

### 2.2 Shell working directory (`get_pty_cwd`)
- Windows has no `/proc/<pid>/cwd`, and reading another process's PEB is fragile and needs elevated rights for some
  processes.
- **Plan:** shell integration reports the working directory. The PowerShell `prompt` function emits
  `OSC 9;9;"<path>"` (the Windows Terminal convention) and `OSC 7;file://host/<path>`. The frontend already parses
  OSC sequences (`PtyStateTracker`). Store the last reported working directory per session in Rust, from the
  frontend through a new `set_pty_cwd` command, or parse it in the reader thread.
- `get_pty_cwd` returns the last reported path, or `None`.
- **Done when:** `cd C:\Temp`, then an AI request, uses `C:\Temp` as the working directory in all four shells (cmd
  through its `PROMPT` with `$e]9;9;$P$e\`).

### 2.3 Shell discovery command
- Add `list_available_shells() -> Vec<ShellInfo { id, name, path, version }>`. It detects PowerShell 7, Windows
  PowerShell, cmd, Git Bash (`C:\Program Files\Git\bin\bash.exe`, the registry `HKLM\SOFTWARE\GitForWindows`
  `InstallPath`), WSL distributions (`wsl.exe -l -q`, decoded as UTF-16LE) and Developer PowerShell for VS
  (optional).
- `get_default_shell` returns the resolved shell from 2.1, not a hardcoded `powershell.exe`.
- **Done when:** a unit test with a fake `PATH` covers the resolution order, and Settings lists the detected shells
  (5.5).

### 2.4 Process execution and cleanup (`process_cmds.rs`, `watcher.rs`)
- **Job Objects:** add `job.rs`, which creates a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Every command
  started by `run_command`, the PTY shell, and `llama-server` is assigned to a job. Cancelling closes the job
  handle, which kills the whole tree, including grandchildren. This replaces `taskkill /PID /T /F` as the main path;
  keep `taskkill` as the fallback.
- Use a separate job per run (`run_id`) so cancelling one run does not stop the others.
- **Output encoding:** the output of native console programs may be in the OEM code page (for example 437 or 850).
  Decode stdout and stderr as UTF-8 first; if that fails, fall back to `MultiByteToWideChar(CP_OEMCP)`. PowerShell
  commands set `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()` (see 4.2).
- **Port the Unix-only tests in `process_cmds.rs`** as `#[cfg(windows)]` versions: captures output and exit code;
  timeout kills the whole tree; a background child holding stdout does not block; stdin is closed so prompts do not
  hang; cancel stops the process; cancel kills grandchildren (`cmd /c start /b ping -n 30 127.0.0.1`).
- `expand_tilde` must handle `~\`, `~/`, `%USERPROFILE%` and `$env:USERPROFILE` forms.
- **Done when:** all six ported tests pass on `windows-latest`, and no console window flashes during an AI request.

### 2.5 Embedded model server (`embedded_server.rs`, `downloads.rs`)
- **Engine asset choice:** pick the llama.cpp Windows release zip that fits the machine:
  - `win-cuda-12.x-x64` if `nvidia-smi.exe` exists or `Win32_VideoController` reports an NVIDIA GPU;
  - `win-vulkan-x64` for AMD or Intel GPUs;
  - `win-cpu-x64` (AVX2) otherwise.
  - Keep the CPU build as the fallback when the GPU build fails to start. Also check for the VC++ runtime DLLs the CUDA
    build needs.
- **Extraction:** `tar.exe` ships with Windows 10 1803 and later and reads `.zip`. Keep it, and add a fallback with
  the `zip` crate if `tar` is missing or fails. Paths inside the zip may use `\`.
- **Parent death:** Linux uses `PR_SET_PDEATHSIG`. On Windows, assign `llama-server.exe` to a
  `KILL_ON_JOB_CLOSE` job held by Cero (2.4), so a crash of Cero also ends the server.
- **Orphan reaping:** `reap_orphaned_server` is `cfg(unix)` (`lsof`). Write a Windows version: find the listener on
  port 8847 with `GetExtendedTcpTable`, or `sysinfo` plus `netstat -ano` parsing; check that the process image path
  is under `%USERPROFILE%\.cero`; then terminate it.
- **Firewall:** always bind `--host 127.0.0.1`, which keeps Windows Defender Firewall from prompting. Add a test that
  the args contain it.
- **Antivirus:** downloaded `llama-server.exe` and its DLLs can be quarantined. Detect a missing binary right after
  extraction and show a clear message with the folder to allow in Defender.
- **Done when:** a clean Windows VM downloads, extracts, starts and stops the engine from onboarding; killing Cero in
  Task Manager leaves no `llama-server.exe`.

### 2.6 `.flow` file association (`file_association.rs`, `launch.rs`)
- `get_association_status` and `set_association_status` are Linux-only today (`.desktop` and MIME files). Windows
  version:
  - read and write `HKCU\Software\Classes\.flow` and `HKCU\Software\Classes\Cero.Flow` with `winreg`;
  - call `SHChangeNotify(SHCNE_ASSOCCHANGED)` after any change;
  - status values: `registered` (points at this exe), `registered-elsewhere` (an older install path), `missing`.
- On first run, if the installer registration is missing (for example a portable or zip build), ask once using the
  existing decision-state machine (`evaluate_decision_state`).
- Opening a `.flow` while Cero runs: `tauri-plugin-single-instance` passes argv, and `launch::filter_flow_argv`
  already handles it. Add tests for Windows paths (`C:\Users\a b\x.flow`, quoted, with `file:///C:/...`, and UNC
  `\\server\share\x.flow`).
- **Done when:** double-clicking a `.flow` file opens Cero (closed or running) on Windows 10 and 11, and the Settings
  toggle adds and removes the association.

### 2.7 Secrets (`secrets.rs`)
- The `keyring` `windows-native` backend uses Credential Manager. Check:
  - the target name stays the same as in 2.2.0;
  - long API keys fit (the credential blob limit is 2560 bytes);
  - reading after writing works for a standard user;
  - legacy migration from browser storage works.
- **Done when:** a Rust test round-trips a 2000-character key on `windows-latest`, and an API key survives an
  app restart and an upgrade.

### 2.8 Log and service watching (`watcher.rs`)
- `file_identity` returns a constant on non-Unix systems, so log rotation is not detected. Use
  `GetFileInformationByHandle` (volume serial + file index), or `std::os::windows::fs::MetadataExt::file_index`
  where it is stable.
- Open tailed files with `FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE`, so Cero never locks a log that
  another app is writing.
- `watch_service_start` uses `journalctl` and systemd unit names. On Windows, watch Event Log entries for a service:
  `wevtutil qe System /q:"*[System[Provider[@Name='<service>']]]" /f:text /rd:true` polled, or
  `Get-WinEvent -FilterHashtable` polled every 2 s. Validate service names with the Windows rule (no `/` or `\`).
- **Done when:** watching a file that is being written and rotated works, and watching the `Spooler` service shows
  new events.

### 2.9 Other modules
- `path_search.rs`:
  - search roots: `%USERPROFILE%`, Desktop, Documents, Downloads, OneDrive (`%OneDrive%`), `source\repos`, and other
    drive roots (`D:\`) when the user names them;
  - matching is case-insensitive;
  - skip reparse points and junctions (`Application Data`, `My Documents`, which cause infinite loops) and
    `AppData\Local\Temp`, `node_modules`, `$Recycle.Bin` and `System Volume Information`;
  - **done when:** the existing tests pass on Windows, plus a test for the junction loop.
- `legacy_migration.rs`: check that `%USERPROFILE%\.sentinel` moves to `%USERPROFILE%\.cero` and that the WebView2
  data under `%LOCALAPPDATA%\org.sentinel.terminal` moves to `org.cero.terminal`.
- `logger.rs`: write logs to `%USERPROFILE%\.cero\logs` and rotate them. Check that a non-ASCII user name works.
- **Data location decision:** keep `%USERPROFILE%\.cero` (as 2.2.0 does, and the same layout as Linux), or move to
  `%APPDATA%\Cero`. **Recommendation:** keep `.cero`, for parity and upgrades. Record the decision in
  `docs/windows/README.md`.
- `lib.rs`: leave the macOS menu block and `request_bluetooth_permission` in place (they are `cfg`-gated). Make
  `set_decorations(false)` come from `tauri.windows.conf.json` (1.4). Add `#![windows_subsystem = "windows"]` in
  `main.rs` if it is not there already, so that no console
  window appears in release builds.

### 2.10 Smoke-test mode
- Add a hidden `--smoke-test` flag (only when `CERO_SMOKE=1`). Cero starts, spawns the default shell, writes
  `echo cero-smoke-ok`, waits for that output, writes `%TEMP%\cero-smoke.json` with the results (shell, time to first
  output, engine binary found yes/no) and exits with code 0 or 1.
- CI uses it in 7.2.
- **Done when:** `Cero.exe --smoke-test` exits 0 on a Windows VM.

---

## Phase 3: Frontend platform layer (`src`)

**Goal:** the TypeScript layer knows it runs on Windows, talks to Windows shells correctly, and reads Windows output.

### 3.1 One source of truth for the platform
- Replace `navigator.userAgent` sniffing (for example in `ShellAdapter.detectLoginShell`) with one module,
  `src/platform/os.ts`. It calls `@tauri-apps/plugin-os` `platform()` once at startup and caches it. Tests can
  override it.
- Audit the 62 files that check for Windows, and route them through `os.ts`.
- **Done when:** `grep -rn "userAgent" src` shows no platform checks, and a test asserts that
  `getPlatform()` is `'windows'` with the plugin mocked.

### 3.2 Shell profiles (`src/domain/shell/ShellAdapter.ts`)
- Add profiles for `pwsh`, `powershell`, `cmd`, `gitbash` and `wsl`. Each has its prompt pattern, its config file
  (`$PROFILE` resolved by running `pwsh -NoProfile -Command '$PROFILE'`, which handles OneDrive-redirected
  Documents), its history file and its quoting rules.
- `detectLoginShell` uses `list_available_shells` (2.3).
- `src/domain/rice/DotfileManager.ts`: on Windows, offer the PowerShell profile and the Windows Terminal
  `settings.json` path, or hide the feature (according to the feature matrix).
- **Done when:** unit tests cover each profile's prompt pattern and quoting.

### 3.3 Shell integration scripts (`src-tauri/resources/shell-integration/`)
- **`cero.ps1`**, for PowerShell 5.1 and 7:
  - dot-source the user's `$PROFILE` if it exists, inside `try`, so a broken profile does not break Cero;
  - wrap the existing `prompt` function so it emits OSC 133 `A` (prompt start), `B` (command start) and `D;<exit>`
    (command done, from `$?` and `$LASTEXITCODE`), plus `OSC 9;9` and `OSC 7` with the working directory;
  - set `[Console]::OutputEncoding` and `$OutputEncoding` to UTF-8;
  - turn off PSReadLine inline predictions (`Set-PSReadLineOption -PredictionSource None`), because Cero draws its
    own ghost text and two suggestions would overlap. Make this a setting.
- **`cero.cmd`**, for cmd: set `PROMPT=$e]133;A$e\$e]9;9;$P$e\$P$G$e]133;B$e\`. `cmd` cannot report exit codes in the
  prompt; accept this limitation and document it.
- Git Bash: reuse the Linux bash integration, if there is one; otherwise use `PROMPT_COMMAND` with the same OSC codes.
- The scripts are bundled as Tauri resources and resolved with `app.path().resource_dir()`.
- **Execution policy:** `-File` is blocked by the `Restricted` policy on some machines. Start PowerShell with
  `-ExecutionPolicy Bypass` for this process only (it does not change the machine policy), and document this in the
  security notes.
- **Done when:** in each shell, the OSC markers appear in the PTY output (checked by a Rust integration test that
  greps the raw output), and the user's own prompt (for example oh-my-posh or starship) still shows.

### 3.4 Prompt detection and terminal state (`src/domain/terminal/PtyStateTracker.ts`)
- When OSC 133 markers are present, trust them over the regex heuristic.
- Without markers (a user who turned integration off), extend the heuristic to `PS C:\path> `, `C:\path>` and
  `PS>`, while keeping the special case that a bare `>` is a continuation prompt. PowerShell's continuation prompt is
  `>> `, which must not count as idle.
- ConPTY repaints: ConPTY sends cursor movement and whole-line redraws (`\x1b[H`, `\x1b[?25l`) more often than a Unix
  PTY. Collect fixtures of real ConPTY output for: the prompt, typing, Tab completion, `cls`, and running a program.
  Make sure the state machine handles them.
- **Done when:** fixture tests from real ConPTY captures (saved under `src/domain/terminal/__fixtures__/conpty/`) pass.

### 3.5 Command history and ghost-text autocomplete
- Commit `1b914e3` fixed history by reading the OSC markers, so check that the same path works with `cero.ps1`
  markers.
- PSReadLine rewrites the whole input line on each key. Check that input tracking (what the user typed) still
  matches: Right arrow and Tab accept (commit `1909514`), arrows and paste do not duplicate the suggestion text
  (commit `28d645b`), and Ctrl+C state (commit `313d14f`).
- Import history from `(Get-PSReadLineOption).HistorySavePath` (by default
  `%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`) instead of `~/.bash_history`.
- Password input must still not be recorded (`Read-Host -AsSecureString`, `runas`).
- **Done when:** the existing history tests still pass, plus new tests with PowerShell fixtures.

### 3.6 Paths in the frontend
- One utility, `src/platform/paths.ts`, provides: `join`, `normalize` (`/` and `\`), `isAbsolute` (drive letters
  and UNC), `expandHome` (`~`, `%USERPROFILE%`, `$env:USERPROFILE`), `samePath` (case-insensitive) and
  `displayPath` (shortens `C:\Users\<name>` to `~`).
- Replace raw string handling of paths in these files: `FilesystemCapability`, `OpenInApp`,
  `AppLaunchParser`, the workflow folder, the title bar relative path display, and `TerminalView` `currentPath`.
- **Done when:** tests cover `C:\`, `c:/x`, `\\server\share`, `~\Documents`, paths with spaces, and long paths
  (more than 260 characters, with `\\?\`).

### 3.7 Capability drivers (`src/sdk/capabilities/drivers/` and `src/domain/system/`)
For each driver, write a Windows implementation with output parsers, plus **fixture tests** that use real captured
output from a Windows machine (like the existing `MacSystemParsers.test.ts`). Create `WindowsSystemParsers.ts` and
its test.

| Driver | Windows commands | Notes |
|---|---|---|
| System info | `Get-CimInstance Win32_OperatingSystem, Win32_Processor, Win32_ComputerSystem, Win32_LogicalDisk, Win32_Battery` with `ConvertTo-Json` | JSON output, no text parsing. |
| Process | `Get-Process` and `Stop-Process`; ports through `Get-NetTCPConnection -State Listen` and `OwningProcess` | `PortControl.ts` and `ProcessCapability.ts`. |
| Wi-Fi | `netsh wlan show interfaces`, `show networks mode=bssid`, `connect name=` | The labels are translated on non-English Windows, so parse by line position and the `: ` separator, not by English label text. Check on a non-English Windows. |
| Bluetooth | `Get-PnpDevice -Class Bluetooth`; radio on and off through WinRT `Windows.Devices.Radios` (a small PowerShell snippet) | Turning the radio on and off may need admin rights or may not be possible. Document what works. |
| Applications | Start-menu `.lnk` files (`%ProgramData%` and `%APPDATA%\Microsoft\Windows\Start Menu\Programs`), `Get-StartApps` (UWP apps through `shell:AppsFolder\<AppID>`), the `App Paths` registry, and the uninstall registry keys | `AppCatalog.ts`, `AppControl.ts` and `OpenInApp.ts`. Launch with `Start-Process`. Close with `Stop-Process -Name` after `CloseMainWindow()`. |
| Browser | Default browser from `HKCU\...\UrlAssociations\https\UserChoice` `ProgId` | Open a URL in a named browser: `Start-Process msedge`, `chrome` or `firefox`. |
| Developer / IDE | VS Code `code.cmd` (user and system install paths), JetBrains Toolbox scripts, Visual Studio `devenv` | "Open folder X in VS Code". |
| Git, Node, Python, Docker | `git`, `node`, `npm.cmd`; the `py` launcher before `python`; Docker Desktop's `docker.exe` | `python3` opens the Microsoft Store alias, which `CommandPortability` already maps. |
| Networking | `ipconfig /all`, `Test-NetConnection`, `Resolve-DnsName`, `Get-NetAdapter` | |
| Services | `Get-Service`, `Start-Service` and `Stop-Service` (admin), `sc.exe query` | Replaces systemd in `SystemServiceManager.ts`. |
| Packages | `winget` (preferred), `scoop`, `choco` when installed | Replaces `pacman`, `apt` and `dnf` in the installer flows and tool knowledge. |
| Filesystem | Delete to the Recycle Bin by default (`Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile(..., SendToRecycleBin)`) | Safer than `Remove-Item`. A permanent delete still needs explicit consent (4.4). |
| Clipboard | Tauri clipboard plugin | Already cross-platform. Check CRLF handling. |

- **Done when:** each driver has fixture tests, and each one runs on a real PC (Phase 8 rows).

### 3.8 Onboarding, installer wizard and settings text
- `InstallerWizard.tsx`: replace "add `~/.local/bin` to PATH in `~/.bashrc`" with Windows guidance (the user `PATH`
  through `[Environment]::SetEnvironmentVariable(..., 'User')`, done by Cero with consent).
- Engine download screen: show the chosen build (CPU, CUDA or Vulkan) and why it was chosen (2.5).
- Every text that mentions `sudo`, `~/.config`, `bash`, `apt` or Linux paths gets a Windows version. Search the
  copied `src/` for them.
- **Done when:** `grep -rniE "sudo|apt-get|pacman|~/.bashrc|/usr/bin" src --include=*.tsx` shows no
  user-facing text.

---

## Phase 4: AI agent and security for Windows

**Goal:** plain-language requests produce correct PowerShell, run safely, and are judged by Windows-aware security rules.

### 4.1 System prompt and context
- `SystemPrompt.ts` and `PromptBuilder.ts` (shared code: add the Windows branch behind the `os` check, so Linux behaviour is unchanged and the change can later go back to Linux): when
  `os = windows`, tell the model the shell is PowerShell (5.1 or 7, with the version), that `&&` exists only in
  PowerShell 7, that paths use drive letters, and to prefer the cmdlets over Unix aliases (`ls` in PowerShell is
  `Get-ChildItem` and takes different flags).
- Include the detected shell, the PowerShell version, the user profile path, and whether the user is an admin.
- **Done when:** the prompt snapshot tests for `windows` pass.

### 4.2 Agent command execution (`ShellSDKCapability.ts`)
- Run with `pwsh.exe` when present, otherwise `powershell.exe`, using
  `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -`, and pass the command through **stdin** or
  `-EncodedCommand` (Base64 UTF-16LE). This avoids every quoting problem with `"`, `$` and `` ` ``.
- Prefix every command with `$ErrorActionPreference='Continue'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new();`.
- Exit code: `exit $LASTEXITCODE` when a native program ran, otherwise exit 1 if `$?` is false.
- In PowerShell 5.1, a native program writing to stderr produces `NativeCommandError` records. Do not treat that
  alone as a failure; use the exit code.
- **Done when:** tests check the generated invocation for quotes, `$`, backticks, non-ASCII, multi-line scripts and
  exit codes.

### 4.3 Command portability and fast paths
- `CommandPortability.ts`: add Windows rules with tests:
  - `&&` and `||` become `; if ($?) { }` on PowerShell 5.1;
  - `rm -rf x` becomes `Remove-Item -Recurse -Force x`;
  - `which` becomes `Get-Command`;
  - `grep` becomes `Select-String`;
  - `cat` and `head -n` become `Get-Content -TotalCount`;
  - `export X=` becomes `$env:X=`;
  - `touch` becomes `New-Item -ItemType File`;
  - `~/` becomes `$HOME\`;
  - `findstr` and `where.exe` are treated as no-match programs (exit 1 without output is not an error).
- `AgentLoop.ts` fast-path regexes (for example `check bashrc aliases`, `check zshrc theme`) and `TaskRecipes.ts`: add
  PowerShell equivalents (`Get-Alias`, `$PROFILE`), or skip them on Windows.
- **Done when:** a test table of at least 40 Unix-to-PowerShell cases passes.

### 4.4 Security engine for Windows (high priority)
Files: `src/domain/security/` (shared code: add Windows rules next to the Unix rules, never in place of them), `SecurityEngine.ts`,
`ReadOnlyCommandPolicy.ts`, the policy engine and the guardian. **Write the failing tests first.**

- **Destructive commands** (require consent):
  - `Remove-Item -Recurse`, `rm`, `del`, `erase`, `rd /s`, `rmdir /s`;
  - `Format-Volume`, `format`, `diskpart`, `Clear-Disk`, `Initialize-Disk`;
  - `cipher /w`;
  - `vssadmin delete shadows`, `wbadmin delete`;
  - `bcdedit`;
  - `reg delete`, `Remove-ItemProperty` on `HKLM:`;
  - `Stop-Computer`, `Restart-Computer`, `shutdown`;
  - `takeown`, `icacls ... /grant Everyone`;
  - `Set-ExecutionPolicy Unrestricted`;
  - `Disable-WindowsOptionalFeature`;
  - `netsh advfirewall set allprofiles state off`;
  - `Set-MpPreference -DisableRealtimeMonitoring`.
- **Code-download patterns** (always flagged):
  - `iwr ... | iex`, `Invoke-Expression (New-Object Net.WebClient).DownloadString`;
  - `-EncodedCommand` and `-enc` from the model (never allowed from model output);
  - `Start-BitsTransfer` followed by execution;
  - `mshta`, `rundll32`, `regsvr32 /i:http` (LOLBins), and `certutil -urlcache`.
- **Protected paths:** `C:\Windows`, `C:\Program Files*`, `C:\ProgramData`, `%SystemRoot%`, the root of any drive,
  `%USERPROFILE%` itself (but not its children), `HKLM:` and `HKCR:`. The parent and child path protection (commit
  `fix/3`) must work with `\`, mixed separators, case differences and 8.3 short names (`PROGRA~1`).
- **Command chaining bypass** (branch `fix/2`): PowerShell separators `;`, `|`, `&` (the call operator), `` ` ``
  (backtick) continuations, `$( )` subexpressions and script blocks `& { }`.
- **Read-only policy:** `Get-*`, `Test-*`, `Select-*`, `Measure-*` and `dir` are read-only unless they contain a
  pipe to a changing cmdlet, a redirect (`>`, `Out-File`, `Set-Content`) or `-Force` with removal.
- **Elevation:** Windows has no `sudo` and no password check, so the macOS `dscl` and Linux `sudo` password dialogs
  do not apply. Cero never asks for or stores the Windows password. Commands that need admin rights run through
  `Start-Process -Verb RunAs` after a Cero consent card, and Windows shows its own UAC prompt. Detect "is admin"
  with `[Security.Principal.WindowsPrincipal]`. If Cero itself runs as admin, show a persistent warning bar.
- **Audit log:** the format stays the same, with Windows paths.
- **Review:** after implementation, run the `security-reviewer` subagent and a Fable 5.1 review of the full
  `src/domain/security` diff.
- **Done when:** at least 80 new security test cases pass (both blocked and allowed), and the review has no open
  high-severity findings.

### 4.5 Tool knowledge (`tools/*/tool.json`, knowledge files)
- All 103 tools list `windows`, but their examples and knowledge are mostly Unix. For each tool, check that the
  Windows examples exist and are correct PowerShell. Write a checker script
  (`scripts/windows/check-tool-windows-examples.ts`) that fails when a tool lists `windows` without Windows examples.
- Tool files are shared: add the Windows examples next to the Unix ones, and offer the fixes back to `linux-v2-update`.
- **Done when:** the checker passes and the `ToolRegistry` tests pass.

### 4.6 Model reliability on Windows
- Add a Windows case set to `scripts/eval/cases.json` (or `cases.windows.json`): at least 60 requests covering files,
  processes, apps, network, Git, Python, workflows and destructive requests that must be refused.
- Run `npm run eval:model` with each built-in model size (0.5B, 1.5B, 3B, 4B) and with an API model. Record the
  results in `docs/windows/MODEL_RELIABILITY_WINDOWS.md`.
- **Done when:** the pass rates are recorded. Agree on a minimum before release (suggestion: at least 85% on 1.5B for
  the non-destructive set, and 100% refusal on the destructive set).

### 4.7 `.flow` workflows across operating systems
- A `.flow` written on Linux contains bash commands. `FlowRunner.ts` and `FlowAuthoring.ts`:
  - record the authoring OS and shell in the flow header when saving;
  - when a flow from another OS opens on Windows, show a full-screen notice with the choice "Translate to PowerShell
    (review each step)" or "Run as written in Git Bash/WSL" (if available), or cancel;
  - never run bash commands through PowerShell silently.
- Save `.flow` files with LF line endings and UTF-8 without a BOM.
- **Done when:** tests cover opening a Linux flow on Windows, opening a Windows flow, and opening a flow without a
  header (legacy).

---

## Phase 5: UI and UX for Windows

**Goal:** Cero looks and behaves like a native Windows app while keeping its grayscale design.

### 5.1 Window chrome (`src/ui/components/WindowControls.tsx`, `App.tsx`)
- Put the Windows controls on the right in the Windows order (minimize, maximize/restore, close), 46x32 px hit areas,
  drawn with `lucide-react` icons (`Minus`, `Square`/`Copy`, `X`) in the grayscale palette. The close-button hover is
  a muted red only if the design rules allow; otherwise use a lighter gray.
- Drag region through `data-tauri-drag-region` on the tab bar, with double-click to maximize and restore.
- Resizing from the edges with `decorations: false`: enable `shadow: true` in the window config (Windows 11 gives
  rounded corners and resizing from the shadow). Check Windows 10 too.
- Snap Layouts (the hover menu on maximize) is not available for custom title bars in WebView2. Win+Arrow snapping
  still works. Document this.
- **Done when:** the Phase 8 rows for move, resize, maximize, snap, minimize and close pass on Windows 10 and 11.

### 5.2 Keyboard shortcuts
- Follow the Windows Terminal convention:
  - Ctrl+C copies when there is a selection, otherwise it sends `^C` (interrupt);
  - Ctrl+V pastes;
  - Ctrl+Shift+C and Ctrl+Shift+V always copy and paste;
  - Ctrl+Shift+T opens a new tab and Ctrl+Shift+W closes it;
  - Ctrl+Tab switches tabs;
  - Alt+Shift+D splits;
  - F11 toggles full screen;
  - Ctrl+, opens Settings.
- Gate every `metaKey` (Cmd) binding behind macOS in `App.tsx` and `TerminalView.tsx`, so Windows never needs the
  Windows key for a Cero shortcut. Do not delete the macOS bindings.
- AltGr is reported as Ctrl+Alt on Windows. Make sure AltGr characters (`@`, `{`, `\` on German and other layouts)
  reach the terminal and do not trigger shortcuts.
- The Ctrl+C state with the queue and running requests (commit `313d14f`) must still work with copy-on-selection.
- Update `docs/windows/KEYBOARD_SHORTCUTS.md`.
- **Done when:** the shortcut tests pass, and a manual check on a German or French layout passes.

### 5.3 Fonts and rendering
- Terminal font stack: `"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace`. Cascadia ships with
  Windows 11; on Windows 10 it falls back to Consolas, or the font can be bundled (it is under the OFL licence).
- UI font stack: `"Segoe UI Variable Text", "Segoe UI", sans-serif`.
- The xterm WebGL addon works in WebView2. Keep the fallback to the DOM renderer when the GPU is blocklisted or in a
  remote desktop session.
- Check crispness at 125% and 150% scaling, and when moving between monitors with different DPI (`devicePixelRatio`
  changes must refit the terminal).
- **Done when:** the Phase 8 rendering rows pass.

### 5.4 Clipboard and line endings
- Paste: turn CRLF into CR before writing to the PTY, and keep bracketed paste. A multi-line paste triggers the
  existing confirmation.
- Copy: Windows apps expect CRLF, so convert LF to CRLF when copying from the terminal.
- **Done when:** tests cover paste and copy with CRLF, LF, and mixed endings.

### 5.5 Settings and onboarding (full screen)
- Shell picker: list `list_available_shells` with versions, and set the default.
- Toggles: "Use Cero shell integration" (on by default), and "Turn off PSReadLine predictions in Cero" (on).
- `.flow` association toggle (2.6), with the status text.
- An "Administrator" indicator when running elevated.
- Every new screen follows AGENTS.md: full frame (`position: fixed; inset: 0`), `#090b10`, no emoji.
- **Done when:** the settings tests pass, and a visual check at 100% and 150% scaling passes.

### 5.6 Windows theme integration
- Respect the high-contrast mode (`forced-colors: active`): Cero must stay readable and must not paint over the
  system colours.
- Keep the app always dark (by design), but make the native parts (scrollbars, context menus, dialogs) dark through
  `color-scheme: dark` and the Tauri `theme: "Dark"` window option.
- **Done when:** a manual check in High Contrast passes.

---

## Phase 6: Packaging and installers

**Goal:** professional, upgrade-safe installers.

### 6.1 Bundle configuration (`tauri.windows.conf.json`, `bundle.windows`)
- `webviewInstallMode`: `downloadBootstrapper` (small installer; WebView2 is present on Windows 11 and most up-to-date
  Windows 10 PCs). Offer an offline build with `offlineInstaller` later if users ask for it.
- NSIS:
  - `installMode: "currentUser"` (no admin needed), `displayLanguageSelector: false`;
  - the grayscale header and sidebar bitmaps (`src-tauri/windows/nsis-header.bmp` 150x57 and
    `nsis-sidebar.bmp` 164x314);
  - the MIT licence page;
  - a Start menu folder named `Cero`.
- MSI (WiX): `perMachine` (needs admin, for company deployments), with the same bitmaps (`banner.bmp` 493x58 and
  `dialog.bmp` 493x312).
- Product version: MSI needs `major.minor.patch` numbers only. Do not use `-beta` in the version; mark betas in
  the release name instead.
- **Done when:** both installers build locally on Windows and show the Cero branding.

### 6.2 `.flow` file association, only once
- Tauri's `bundle.fileAssociations` already writes the registry entries for MSI and NSIS. The custom
  `installer-hooks.nsh` writes them again, under `SHCTX`.
- Pick one source: keep `fileAssociations` (it covers both installers) and reduce the NSIS hook to the
  `SHChangeNotify` call, or keep the hook if the generated entries lack the icon. Check the result in `regedit` after
  installing each package.
- The `flow.ico` resource is installed next to the exe (`resources` mapping already exists).
- **Done when:** after each installer, `.flow` files show the Cero document icon and open Cero; after uninstalling,
  the keys are gone.

### 6.3 Upgrades from 2.2.0
- Keep `identifier` and the product name, so that the MSI `UpgradeCode` (derived from the identifier) and the NSIS
  install path match 2.2.0.
- Test: install `Cero_2.2.0_x64-setup.exe` from GitHub, add an API key and a workflow, then install the new version.
  Settings, the key, `~/.cero` and the `.flow` association must survive. Repeat with the MSI.
- **Done when:** both upgrade paths pass on a VM.

### 6.4 Uninstall
- Remove the program files, shortcuts and registry keys.
- Keep `%USERPROFILE%\.cero` and the Credential Manager entries by default. The NSIS uninstaller offers a "Also delete
  my Cero data (models, settings, saved keys)" checkbox, which is off by default.
- **Done when:** both modes are checked on a VM.

### 6.5 Portable build (optional)
- A `Cero_<version>_x64_portable.zip` with `Cero.exe` and `flow.ico`. It needs WebView2 to be installed already, and
  it registers `.flow` only after the user agrees (2.6).
- **Done when:** the zip runs from a USB drive path on a clean VM.

### 6.6 Code signing (decide before the first public release of this version)
- Options, cheapest first:
  1. **Unsigned** (as 2.2.0). SmartScreen warns until the file earns reputation. Document "More info, then Run anyway".
  2. **SignPath.io free plan for open-source projects:** signs CI builds with their certificate. It needs an
     application and their GitHub Action.
  3. **Azure Trusted Signing** (about USD 10 a month). Check whether an individual in your country is eligible (it was
     limited to some regions at first).
  4. An OV or EV certificate from a CA (expensive; EV needs a hardware token or cloud HSM).
- In Tauri, set `bundle.windows.signCommand` (or `certificateThumbprint` plus `timestampUrl`) so that both the exe
  and the installers are signed, and timestamped with RFC 3161.
- **Done when:** the decision is recorded in `docs/windows/README.md`; if signing is chosen, `signtool verify /pa` passes
  on the release assets.

---

## Phase 7: CI and release pipeline

**Goal:** every push to `windows` is tested on Windows, and a release is one merge.

### 7.1 CI on the `windows` branch (`.github/workflows/ci.yml`)
- `ci.yml` already runs on pushes and pull requests to `windows`, on Ubuntu, macOS and Windows. Changes:
  - run `npm run build` on Windows too (today the type check and bundle step runs only on Linux);
  - run `cargo test` (not only `cargo check`) on `windows-latest`, so the `#[cfg(windows)]` PTY, Job Object, registry
    and keyring tests run;
  - add `cargo clippy -- -D warnings` on `windows-latest`.
- Optional: a Linux job that runs `cargo xwin check --target x86_64-pc-windows-msvc`, so Windows compile errors show
  up on Linux pull requests too.
- These edits are additive and useful for Linux as well, so offer them back to `linux-v2-update`.
- **Done when:** a push to `windows` runs all jobs green, including `cargo test` on Windows.

### 7.2 Installer smoke test in CI
- After `tauri build`:
  1. install the NSIS setup silently (`/S`);
  2. run `"%LOCALAPPDATA%\Cero\Cero.exe" --smoke-test` with `CERO_SMOKE=1` (2.10);
  3. check `%TEMP%\cero-smoke.json`;
  4. uninstall silently.
- Do the same with the MSI: `msiexec /i Cero.msi /qn`, then `msiexec /x /qn`.
- **Done when:** the smoke job is green, and it fails when `--smoke-test` is broken on purpose (check this once).

### 7.3 Release workflow
- `release.yml` already builds `.msi` and `.exe` on `windows-latest` when `release/windows` is pushed, and publishes
  `v<version>-windows` with the notes from `docs/releases/windows.md`. Changes:
  - run the smoke test (7.2) before the upload;
  - sign, if 6.6 chose signing;
  - keep `SHA256SUMS.txt` (the `publish` job already makes it).
- **Release flow:** merge `windows` into `release/windows`, then push. CI builds, tests and creates the release.
  Today `release/windows` points at a `main` commit (`376538b`). The first merge from `windows` replaces that
  history line, so check the diff before pushing.
- `build-installers.yml`: add `windows` to its branches, so testers get installers from every push.
- **Done when:** a `workflow_dispatch` run on `release/windows`, saved as a draft release, produces both installers
  and the checksums.

### 7.4 Automatic merges from Linux
- `.github/workflows/sync-shared.yml` copies shared paths from `main` into `windows` (a path checkout, not a merge).
  That fights the merge model, because it can overwrite Windows additions in shared files. Remove `windows` from its
  targets.
- Add `merge-linux-into-windows.yml`: on pushes to `linux-v2-update`, create a branch `sync/linux-to-windows` from
  `windows`, run `git merge linux-v2-update`, and open a pull request into `windows`. If the merge conflicts, the pull
  request says so and lists the files, so the merge is finished by hand (1.5). CI (7.1) tests the pull request on
  Windows.
- **Done when:** one real Linux change has come through as a pull request and been merged.

---

## Phase 8: Verification on real Windows

**Goal:** prove that it works. This phase is done by a person on real Windows machines.

### 8.1 Test report document
- `docs/windows/WINDOWS_TEST_REPORT.md`, in the same style as `docs/LINUX_TEST_REPORT.md`. Each row has: area, steps,
  expected result, Windows 11 result, Windows 10 result, date, and notes or issue link.

### 8.2 Install and first run
- NSIS per-user install as a standard user, and MSI per-machine install as an admin.
- SmartScreen behaviour (unsigned or signed).
- WebView2 missing on Windows 10 (the bootstrapper installs it).
- First launch, onboarding, engine download (CPU, then GPU if available), and the first AI request.
- A user name with a space and with non-ASCII characters, and OneDrive-redirected Documents.

### 8.3 Terminal
- Each shell (PowerShell 5.1, PowerShell 7, cmd, Git Bash, WSL): spawn, typing, Tab completion, history, Up and Down,
  ghost text accepted with Tab and with Right, `cls` and `clear`, Unicode output, colours (`Write-Host -ForegroundColor`),
  and full-screen programs (`vim` from Git, `htop`-like TUIs, `nano` in WSL).
- Ctrl+C interrupts `ping -t`; Ctrl+C copies a selection.
- Resize, split panes, tabs, and closing a tab with a running process (no orphan left in Task Manager).
- Large output speed: `Get-ChildItem -Recurse C:\Windows -ErrorAction SilentlyContinue` stays responsive.

### 8.4 AI and workflows
- A fixed list of 30 requests (files, apps, processes, network, Git, Python, VS Code, settings), run with the built-in
  model and with an API model.
- Approval cards and the queue panel.
- Destructive requests are blocked or ask for consent (at least 10 from 4.4).
- Admin requests show the Cero consent card, then UAC.
- Save a workflow by sentence, run it again, double-click a `.flow` file with Cero closed and open, and open a Linux
  `.flow` (4.7).

### 8.5 System and robustness
- An API key persists across restarts (Credential Manager).
- Killing Cero in Task Manager leaves no `llama-server.exe` or shell processes.
- Sleep and resume with a running engine.
- Windows Defender full scan of the install folder and `~\.cero` (record any detection).
- Offline start, and starting with the engine folder deleted.
- Upgrade from 2.2.0 (6.3) and uninstall (6.4).

### 8.6 Display and input
- 100%, 125%, 150% and 200% scaling; mixed-DPI monitors; High Contrast; and a German and a French keyboard layout
  (AltGr).
- Window move, resize, maximize, snap (Win+Arrows), minimize and close, on Windows 10 and 11.

### 8.7 Performance
- Record cold start time, idle memory, memory with the engine loaded, and input latency (subjective plus a
  `Measure-Command` echo test). Compare with the Linux numbers in `docs/benchmark/`.

### 8.8 Beta round
- Publish `v<version>-windows` as a **GitHub pre-release** (`prerelease: true`). Ask two or three testers. Collect the
  issues with the label `platform:windows`, and fix the blockers.
- **Done when:** every row of 8.2 to 8.7 is passed or listed as a known issue, and no blocker issue is open.

---

## Phase 9: Documentation and release

### 9.1 Documentation
- `docs/windows/README.md`: requirements, building from source on Windows, running the tests, the sync workflow and the
  folder model.
- `docs/windows/`: `USER_GUIDE` Windows notes, `TROUBLESHOOTING` (SmartScreen, missing WebView2, execution policy,
  antivirus quarantine of the engine, PSReadLine conflicts, cmd limitations), `KEYBOARD_SHORTCUTS` and `FEATURE_MATRIX`.
- Root `README.md`: a Windows download row that links to the latest `-windows` release.
- `docs/CROSS_PLATFORM_SHARING.md`: describe the current model: `windows` receives `linux-v2-update` by merge, the
  worktree setup, and that the old `sync-shared` path checkout is no longer used for Windows (7.4).

### 9.2 Release notes
- `docs/releases/windows.md`, in the style of the 2.2.0 notes: downloads, what changed since 2.2.0 (all Linux
  fixes plus the Windows work), and an honest **"Verified on"** list (OS builds, shells, hardware) and **"Not
  verified"** list.

### 9.3 Version and release
- Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. These files are shared
  with Linux, so the version bump commit on `windows` will conflict with the next Linux bump. Resolve it to the higher
  version, or keep the Windows version only in `tauri.windows.conf.json` if the two lines must have different numbers.
  Suggested: `2.3.0` for the first release from the folder.
- Merge `linux-v2-update` one last time (1.5). Run `npm run check:triple` on a Windows machine, then commit
  `chore(windows): Cero <version> for Windows`.
- Merge into `release/windows` and push. Wait for CI to publish `v<version>-windows`.
- **Final check:** download both installers from the GitHub release page onto a clean VM, check them against
  `SHA256SUMS.txt`, install, and run the smoke steps by hand.
- **Done when:** the release is public, and the final check passes.

---

## Phase 10: After release (optional)

### 10.1 Distribution channels
- winget: submit a manifest to `microsoft/winget-pkgs` (`wingetcreate new <url>`). It works best with signed
  installers.
- A Scoop bucket (`NetPranav/scoop-cero`), and Chocolatey later.

### 10.2 Auto-update
- `tauri-plugin-updater` with a signed `latest.json` on GitHub releases. It needs an updater key pair stored in GitHub
  secrets. Show the update offer in the grayscale UI, and never update without consent.

### 10.3 ARM64
- Add the `aarch64-pc-windows-msvc` target to CI (`windows-11-arm` runner, or cross-compile from x64), and use the
  ARM64 llama.cpp builds.

### 10.4 Reuse for macOS
- The same branch-and-worktree model can be used for a `macos` line, reusing this roadmap's structure.

---

## Risks and open decisions

| # | Risk or decision | Impact | Mitigation or recommendation |
|---|---|---|---|
| 1 | **The branches drift apart.** If merges from Linux are skipped, or Windows changes overwrite shared code, merges get harder every time. | High | The "add, do not replace" rule, regular merges (1.5), automatic merge pull requests (7.4), and "shared fixes go to Linux first". Merge `linux-v2-update` before every Windows release. |
| 2 | **No one has run Cero on Windows yet**, including 2.2.0. | High | Phase 8 is mandatory. Release a pre-release first (8.8). |
| 3 | ConPTY and PSReadLine behave differently from a Unix PTY (repaints, exit detection). | High | Capture fixtures early (3.4). Run the Phase 2 and 3 tests on real Windows as soon as possible, not at the end. |
| 4 | The security patterns miss a PowerShell bypass. | High | Write the tests first (4.4), get a Fable 5.1 and `security-reviewer` review, and recycle-bin deletes by default. |
| 5 | Antivirus quarantines `llama-server.exe` or flags the unsigned app. | Medium | A clear message (2.5), signing (6.6), and a report to Microsoft through the Defender submission portal if needed. |
| 6 | The small built-in models write worse PowerShell than bash. | Medium | Measure it (4.6), add the portability rules (4.3), and suggest an API model when the reliability is low. |
| 7 | Localized Windows (non-English `netsh` and `ipconfig` output). | Medium | Prefer CIM and cmdlets that return JSON objects over text parsing (3.7). |
| 8 | Data folder: `~\.cero` or `%APPDATA%\Cero`. | Low | Keep `~\.cero` for 2.2.0 compatibility (2.9). |
| 9 | Code signing cost. | Low/Medium | Start unsigned, and apply to SignPath for open source (6.6). |
| 10 | The old `origin/windows` branch confuses contributors. | Low | Mark it as superseded after the first release from `windows/` (0.1). |
