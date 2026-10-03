# Cero — High-Performance Shell & PTY Architecture

At its core, Cero provides a robust, native terminal emulator engineered for speed, interactive compatibility, and seamless multitasking. Whether running intensive server builds or editing code via interactive text editors, Cero delivers sub-millisecond responsiveness.

---

## 1. Hardware-Accelerated WebGL Rendering

Say goodbye to input buffering and display latency:
- **Sub-Millisecond Drawing**: Built with an advanced **WebGL rendering pipeline** (`@xterm/addon-webgl`) that accelerates character drawing and scrolling animations directly on your computer's GPU.
- **Flawless Interactive Tooling**: High-performance pseudo-terminal (PTY) synchronization guarantees 100% compatibility with full-screen CLI tools like `vim`, `nano`, `tmux`, `git interactive rebase`, `htop`, and Docker monitoring interfaces.
- **PTY State Tracking (`PtyStateTracker.ts`)**: Detects alternate screen buffer switches (`\x1b[?1049h`). Automatically suspends autocomplete ghost text and output observers during interactive text editing sessions to prevent cursor jumping or visual artifacts.

---

## 2. Multi-Pane Workspace & Split Routing

Eliminate desktop clutter by dividing your command workflow into multi-directional workspaces:
- **Vertical & Horizontal Split Panes**:
  - Vertical split: `Ctrl + Shift + D` (or `Cmd + D`).
  - Horizontal split: `Ctrl + Shift + H` (or `Cmd + Shift + D`).
  - Dividers feature an invisible 8px grab hitbox for easy mouse targeting and an active window-wide drag overlay that prevents canvas event capture during resizing.
- **Session Memory Persistence**: Cero utilizes dedicated output ring-buffers for every open session tab and split pane. When switching tabs, resizing windows, or dividing views, your full terminal scrollback history and active shell processes remain preserved without blinking or vanishing.
- **Tab Customization**: Double-click any tab pill to assign persistent custom labels. Use `Ctrl+1` through `Ctrl+9` for instant tab switching.

---

## 3. Terminal Search Bar Overlay (`Ctrl + F`)

- **Floating Glassmorphic Search**: Press **`Ctrl + F`** (or **`Cmd + F`**) to reveal the terminal search bar floating at the top-right of the active pane.
- **Instant Match Navigation**: Displays live match counters (e.g. `4 of 28`) with `Enter` (next) and `Shift+Enter` (previous) navigation.
- **Keyboard-Driven Toggles**:
  - **`Alt + C`**: Toggle Case Sensitive matching.
  - **`Alt + W`**: Toggle Whole Word matching.
  - **`Alt + R`**: Toggle Regular Expression matching.

---

## 4. Intelligent Shell Integration & Autocomplete

- **Interactive Autocomplete Engine (`AutocompleteEngine.ts`)**: Combines multiple predictive providers to deliver low-latency ghost-text suggestions:
  - **History Provider**: Suggests recent commands filtered by current working directory.
  - **Workspace Context Provider**: Predicts file targets, scripts, and commands based on project manifests (`package.json`, `Cargo.toml`).
  - **Demonstration Memory Provider**: Suggests learned workflows from user demonstrations.
- **Safe Line Clearing (`safeClearLine`)**: Cancels pending command-line inputs cleanly without sending SIGINT (`\x03`) to running foreground processes.
