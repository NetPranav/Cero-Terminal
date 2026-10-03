# Cero — User Guide

Welcome to **Cero**, an AI-native desktop terminal engineered to modernize how developers and power users interact with their machines. Whether managing system daemons, navigating complex multi-repo projects, inspecting open ports, or recording automated multi-step workflows, Cero provides a unified, intelligent workspace.

---

## 1. Launching Cero

1. **Start the Application**:
   - **Linux**: Launch `cero` from your application launcher (Rofi, Wofi, GNOME, KDE) or run `cero` from your CLI.
   - **macOS**: Open `Cero.app` from your Applications folder.
   - **Windows**: Launch Cero from the Start menu or desktop shortcut.
2. **Automatic Engine Boot**:
   - Cero automatically launches the embedded `llama-server` in the background.
   - Look at the bottom status bar: `● AI: Ready` indicates the embedded `Qwen 2.5 Coder 3B GGUF` model is loaded and ready for immediate inference with zero external configuration.
3. **Interactive Workspace**: You can start typing standard shell commands immediately or summon the AI assistant.

---

## 2. Standard Shell Commands vs. AI Prompts (`>`)

Cero cleanly separates raw shell execution from AI assistance:

### A. Standard Shell Execution
Standard commands run directly through your native PTY (`/bin/bash` or `/bin/zsh`) with sub-millisecond execution:
```bash
git status
docker compose ps
npm run build
```

### B. Natural Language Execution (`>`)
Prefix any instruction with **`>`** to invoke Cero's local reasoning agent:
```bash
> show me all docker containers using more than 500MB of RAM
> find files modified in the last 24 hours in src/
> write a python script in /tmp/netmon.py that monitors network throughput and run it
```

### C. Reading the Live Progress Bar
Whenever a `>` prompt runs, the bottom bar's AI status indicator expands into a live progress pill:
- **Status Dot**: Sky-blue pulsing dot while running, turning green on completion (`✓ Done`).
- **Percentage**: Real-time completion progress (e.g. `45%`).
- **Stage Label**: Displays the active lifecycle step (`Thinking...`, `Planning...`, `Running: git status...`, `Verifying...`).
- **Remaining Time**: Dynamic countdown estimate based on hardware inference speed (e.g. `~1.8s`).
- **Micro-Progress Bar**: 36px wide track illustrating progress.
- **Hover Tooltip**: Hovering over the progress pill shows the full prompt goal, stage details, elapsed seconds, and estimated time remaining.

---

## 3. Self-Healing & Error Remediation

When a command fails (e.g., port already in use, missing directory, process conflict):
1. **Auto-Heal Notification**: Cero detects the non-zero exit code and error signature in `stderr`.
2. **One-Key Remediation**: An auto-heal remediation pill appears. Press **`Tab`** to immediately execute the suggested fix (e.g., freeing the occupied port or creating missing directories).
3. **Manual Trigger**: You can also type **`>fix`** or **`>heal`** at any time to diagnose and resolve the last terminal error.

---

## 4. Multi-Stage Workflows & Macro Recording

Automate repetitive developer procedures into reusable 1-word macros:

### A. Recording While Executing
Combine execution with workflow recording using the `:: save as workflow <name>` directive:
```bash
> clean build cache, run cargo test, and package release :: save as workflow release-prep
```
Cero executes the tasks, verifies each step's exit code, and writes the structured workflow to `~/.cero/workflows/release-prep.json`.

### B. Replaying Workflows
Execute recorded workflows anytime with zero AI latency:
```bash
run workflow release-prep
```

### C. Workflow Manager Drawer
Click **Workflows** in the status bar (in Visual Mode) to inspect saved workflows, replay individual steps, customize parameters, or view execution logs.

---

## 5. Developer Modals & Quick Launchers

- **Settings Center (`Ctrl+,` / `Cmd+,`)**: Unified, full-screen configuration center with solid `#090b10` backdrop:
  - **AI Models & Architecture**: Manage hardware tiers (Qwen 2.5 3B/4B), embedded engine sidecars, and Cloud API keys (Groq, Anthropic, OpenAI, OpenRouter, DeepSeek).
  - **Desktop Integrations**: Install user-space command line launcher into PATH (`cero <path>`), register Linux file manager context actions, and configure VS Code / Cursor integrated terminal profiles.
  - **Terminal Experience**: Switch between distraction-free Zen Mode and classic Visual Mode with real 16:9 previews.
  - **General & Setup**: Inspect shell detection and config directories, reset first-run flags, and re-launch the full Onboarding Wizard.
- **Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)**: Search capabilities, run tools, or jump directly to specific settings tabs without touching the mouse.
- **Conversational Port & Project Management**:
  - Ask Cero directly in the terminal to inspect ports or change projects: `> what ports are open`, `> free port 3000`, or `> cd to sentinal`.
- **Fuzzy History Search (`Ctrl+R`)**: Search your entire bash/zsh command history with interactive fuzzy matching and instant execution.
- **Terminal Search Overlay (`Ctrl+F`)**: Search terminal scrollback buffers with **Case Sensitive (`Alt+C`)**, **Whole Word (`Alt+W`)**, and **Regex (`Alt+R`)** toggles.
- **Keyboard Shortcuts & Help (`F1`)**: View the complete reference of keybindings and application controls.

---

## 6. Multi-Pane Workspaces & Zen Mode

- **Split Panes**: Split vertically (`Ctrl+Shift+D`) or horizontally (`Ctrl+Shift+H`). Adjust ratios by dragging the divider bar.
- **Tab Customization**: Double-click any tab pill to assign custom labels that persist across app reloads.
- **Zen Mode vs. Visual Mode (`Ctrl+Shift+Z`)**:
  - **Zen Mode**: Hides all status bar buttons and auxiliary badges for distraction-free coding.
  - **Visual Mode**: Displays quick action buttons for Projects, Ports, and Workflows.
  - On first completing onboarding in Zen Mode, a temporary callout guides you on how to access controls via `Ctrl+Shift+Z` and highlights `[F1 help]`.

---

## 7. Dangerous Command Guardian & Consequence Explanations

Cero protects your workstation from catastrophic and irreversible command accidents:
- **Automatic Interception**: If a dangerous command (such as `rm -rf /`, zeroing a drive `dd of=/dev/sda`, formatting partitions `mkfs.ext4`, locking permissions `chmod 000 /`, or running a fork bomb) is entered, Cero intercepts execution before it reaches the shell.
- **Capability Refusal**: Cero informs you that it does not have the capability to run destructive operations:
  ```text
  ✕ Capability Statement: Cero does not have the capability to execute '[command]'.
  ```
- **Consequence Breakdown**: Cero explains in detail what kernel panics, data wipeouts, or filesystem ruins would occur, and suggests safe alternatives (such as `ncdu /` or package manager cache cleaning).
- **Strict No-Emoji Styling**: All security banners use clean, developer-focused ASCII/Unicode monospace glyphs (`[!]`, `[i]`, `[+]`, `[#]`) matching the matte grayscale interface.

---

## 8. Multi-Model Architecture & Cloud API Keys

In the AI Settings modal (press `Ctrl+,` or click `AI: Ready` in the status bar):
- **Local Engine & Hardware Tiers**: Cero detects your physical CPU cores, RAM, and GPU to categorize your hardware into a tier (`Budget`, `Balanced`, `Performance`, or `Workstation`) and highlights recommended local models with an `Optimal` badge.
- **Cloud API Keys (Zero Local Footprint)**: If you prefer not to run a local model or have a low-spec machine, switch to the "Cloud API Keys & External Providers" tab. You can configure:
  - OpenAI (`gpt-4o`, `gpt-4o-mini`)
  - Anthropic (`claude-3-5-sonnet`)
  - Groq (`llama-3.3-70b-versatile`)
  - DeepSeek (`deepseek-chat`)
  - OpenRouter or Custom OpenAI-Compatible endpoints
- **Live Connection Testing**: Click "Test Connection" next to any API key to send an instant 1-token probe and verify connectivity before activating the provider.

---

## 9. Intelligent Natural Language Directory Navigation

You do not need to memorize exact directory paths:
- Simply type `> cd <name>` or `> switch pwd to <folder>`.
- **Fuzzy Match Correction**: If you make a typo (e.g. `> cd sentinl`), Cero detects candidate matches using Levenshtein distance and offers an interactive disambiguation menu.
- **Automatic Directory Creation**: If the target folder does not exist, Cero asks if you would like it to create the directory, then creates and navigates to it upon confirmation.
