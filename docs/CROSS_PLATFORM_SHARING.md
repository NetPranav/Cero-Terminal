# Cero — Cross-Platform Shared Architecture & Synchronization Guide

This document outlines how Cero's cross-platform architecture is organized across operating systems (`macOS`, `Windows`, `Linux`) and how developers on different platform branches pull shared code without causing merge conflicts.

---

## 🏗️ Architecture Overview

Cero is structured into two clear layers:

1. **Shared OS-Agnostic Core (~85% of codebase)**:
   - `tools/`: All 101 tool calling JSON schemas, parameters, knowledge artifacts, examples, and tests.
   - `src/ai/`: Agent loop, Adaptive Planning Engine, prompt builders, intent normalizers, and memory stores.
   - `src/presentation/`: React UI components, TerminalView overlays, OutputFormatter, and CSS themes.
   - `src/workflows/`: Declarative multi-step workflows, validation, and state machines.
   - `src/domain/security/`: Risk scoring engine, PolicyEngine, PermissionManager, and audit logger.

2. **Platform-Specific Execution Layer (~15% of codebase)**:
   - `src-tauri/`: Rust PTY spawning (`pty.rs` on Unix vs `pty_windows.rs` ConPTY on Windows).
   - `src/sdk/capabilities/drivers/`: Concrete OS drivers (e.g. `blueutil` / AppleScript on macOS, PowerShell / WinRT on Windows, `bluetoothctl` / `systemctl` on Linux).

---

## 🌿 Branching Model

| Branch | Primary Platform | Maintained By | Codebase Focus |
| :--- | :--- | :--- | :--- |
| **`main`** | macOS | Pranav | macOS capability drivers, AppleScript integration, core AI, UI |
| **`windows`** | Windows | Adarsh | Windows ConPTY, PowerShell drivers, WinRT capabilities |
| **`linux`** | Linux | Burhanuddin | Linux POSIX PTY, systemd, BlueZ / bluetoothctl drivers |

---

## 🔄 How Colleagues Pull Only Shared Code

To prevent merge conflicts between macOS, Windows, and Linux codebases, **never merge branches directly** (e.g., do not run `git merge main` inside `windows`). 

Instead, use the automated sync utilities to pull **only the shared core**:

### 🪟 On Windows (PowerShell)
Open PowerShell in your Windows branch and run:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-shared.ps1
```

Or manually via Git:
```bash
git fetch origin main
git checkout origin/main -- tools/ src/ai/ src/presentation/ src/workflows/ src/domain/security/
git commit -m "chore(sync): update shared core from main"
```

---

### 🐧 On Linux or macOS (Bash / Zsh)
In your terminal, run:
```bash
./scripts/sync-shared.sh
```

Or specify a custom remote or branch:
```bash
./scripts/sync-shared.sh origin/main
```

---

## 🤖 Automated GitHub Actions Sync

Whenever a commit is pushed to `main` that touches `tools/`, `src/ai/`, or `src/presentation/`, the automated GitHub Action (`.github/workflows/sync-shared.yml`) will:
1. Detect changes in the shared core.
2. Automatically create a synchronization Pull Request into `windows` and `linux`.
3. Platform maintainers simply review and click **Merge** on GitHub. No manual git operations required!

---

## 🛡️ Synchronization Safety Checklist

Before committing synced shared code:
1. Run `git status` to verify that **no platform-specific files** (`src-tauri/`, `drivers/`) were overwritten.
2. Run `npm test` to verify that the shared AI engine and tool loader pass all tests.
3. Commit and push:
   ```bash
   git commit -m "chore(sync): update shared core from main"
   git push origin <your-branch>
   ```
