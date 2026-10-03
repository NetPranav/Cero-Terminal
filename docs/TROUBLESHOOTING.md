# Cero — Troubleshooting & Diagnostics Guide

Encountering an unexpected behavior in Cero? Follow these step-by-step diagnostic and resolution procedures for the embedded AI engine, terminal PTY, and Linux desktop integration.

---

## 1. Embedded AI Inference Engine Diagnostics

### A. AI Status Shows "AI: Off" in Bottom Status Bar
If the status indicator displays `AI: Off`:
1. **Check AI Settings**: Click the `AI: Off` button or open AI Settings via the Command Palette (`Ctrl+Shift+P`).
2. **Start Engine Manually**: In the AI Settings drawer, click **Start Engine**. Cero will spawn `llama-server` on the next available port.
3. **Check Port Availability**: The embedded server defaults to port `8080`. If another process occupies port 8080, Cero automatically increments to `8081`, `8082`, etc. Verify running status via:
   ```bash
   curl http://localhost:8080/health
   # or
   curl http://localhost:8081/health
   ```
4. **Inspect Lingering Processes**: If an unexpected crash left an orphan process running, terminate it cleanly:
   ```bash
   pkill -f llama-server
   ```

### B. Slow AI Inference or GPU VRAM Exhaustion
- **VRAM Exhaustion**: If running alongside heavy 3D rendering (e.g. Gazebo or Blender), your GPU may run out of memory for the 3B model.
- **CPU Fallback**: In the AI Settings drawer, toggle **CPU Fallback Mode**. Cero will offload model computation layers to your host CPU threads, ensuring uninterrupted inference.

### C. GBNF Grammar Initialization Errors
- **Error Code 400 (`failed to parse grammar`)**: Older `llama-server` builds forbid underscores in rule names (e.g. `action_done`). Cero's `GbnfGrammarManager.ts` automatically sanitizes rule identifiers to hyphen-case (`action-done`).
- If an unhandled grammar parse error occurs, `EmbeddedProvider.ts` automatically falls back to unconstrained JSON completion.

---

## 2. Shell Input, PTY & Keyboard Behaviors

### A. `Ctrl+Shift+P` vs. `Ctrl+Alt+P` Conflict
- **Command Palette**: Bound to **`Ctrl + Shift + P`** (or `Cmd + Shift + P`).
- **Listening Ports Drawer**: Bound to **`Ctrl + Alt + P`** (or `Ctrl + Option + P`).
- If a shortcut does not trigger, open **`[F1 help]`** in the status bar to verify active keybindings.

### B. `Ctrl+R` History Search Interception
- Cero intercepts `Ctrl+R` in the terminal to display an interactive, visual fuzzy history search modal.
- If raw bash reverse-search (`(reverse-i-search)`) appears instead, ensure your terminal is running Cero version 5.0+ where keydown events are captured prior to PTY byte transmission.

### C. Fullscreen Interactive Programs (`vim`, `nano`, `htop`, `tmux`)
- Cero's PTY state tracker detects the alternate screen buffer (`\x1b[?1049h`) and automatically suspends ghost-text autocompletions and output observers, preventing cursor jumping or display glitches during interactive editing.

---

## 3. Linux Desktop & Wayland Integration

### A. Virtual Keyboard & Mouse Automation (`ydotoold`)
- For desktop application automation under Wayland / Hyprland, Cero interfaces with `ydotoold`.
- If automation commands fail with `cannot open /dev/uinput`:
  1. Add your user to the `input` group:
     ```bash
     sudo usermod -aG input $USER
     ```
  2. Ensure the `ydotool` systemd user daemon is active:
     ```bash
     systemctl --user enable --now ydotool
     ```

### B. Missing Binaries in Standalone App
- Cero automatically incorporates standard paths into session environments (`/usr/local/bin`, `~/.cargo/bin`, `~/.local/bin`, `/opt/homebrew/bin`).
- If custom toolchains (e.g. `nvm`, `pyenv`, `asdf`) are not found, ensure their exports are present in `~/.bashrc` or `~/.zshrc`.

---

## 4. Webview, Packaging & Live Diagnostic Logging System

### A. White Screen: "Could not connect to localhost: Connection refused"
- **Symptom**: When opening Cero after installing a release package (e.g. `.pkg.tar.zst` or `.deb`), the window displays a blank white screen with the text:
  ```
  Could not connect to localhost: Connection refused
  ```
- **Technical Root Cause**:
  In Tauri v2, `tauri-macros::generate_context` compiles embedded production assets into the binary only if the `custom-protocol` feature is active on `tauri`.
  If `src-tauri/Cargo.toml` lacks:
  ```toml
  [features]
  default = ["custom-protocol"]
  custom-protocol = ["tauri/custom-protocol"]
  ```
  Tauri defaults to development mode (`cargo:dev=true`), which hardcodes the webview initial URL to `devUrl` (`http://localhost:1420`). When installed as a standalone release package without an active Vite dev server running in the background, the webview attempts to connect to `127.0.0.1:1420`, resulting in a fatal connection refused error.
- **Permanent Resolution**:
  1. `src-tauri/Cargo.toml` defines `default = ["custom-protocol"]` and `custom-protocol = ["tauri/custom-protocol"]`.
  2. The packaging build pipeline (`packaging/arch/build-pacman.sh`) automatically runs `npm run build` and compiles with `--features tauri/custom-protocol`.
  3. The build pipeline performs an automated pre-packaging sanity verification asserting that the compiled binary contains `tauri://localhost` before allowing `makepkg` to produce release archives.

### B. Live Terminal Diagnostic Logging System
Cero includes an end-to-end live diagnostic logging system spanning the native Rust backend, Webview runtime, and frontend React engine.

#### Launching with Live Logs
To diagnose runtime issues, window loading failures, IPC errors, or background crashes, launch Cero from any terminal using diagnostic flags or environment variables:

```bash
# Using CLI launcher
cero --debug
cero -d
cero --verbose
cero -v

# Or using environment variable
CERO_DEBUG=1 cero

# Or launching binary directly
cero-terminal --debug
```

#### Foreground Attached Execution
When launched with any debug flag, the launcher wrapper automatically bypasses background disowning (`>/dev/null 2>&1 &`) and attaches directly to your terminal (`exec "$APP_BIN" "$@"`).

#### Log Output Format
All log output adheres strictly to zero-emoji, grayscale terminal standards with ISO-8601 UTC timestamps:
```text
================================================================================
[YYYY-MM-DDTHH:MM:SSZ] [SYSTEM] Cero Diagnostic Logging ACTIVE (PID: <pid>)
[YYYY-MM-DDTHH:MM:SSZ] [SYSTEM] OS: linux | Arch: x86_64 | Release: 2.0.0
================================================================================
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [BOOT] Initializing Cero runtime
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [SETUP] Initializing core application services
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [WINDOW] Main webview URL: tauri://localhost
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [WEBVIEW] Embedded production assets active via custom-protocol (tauri://localhost)
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [APP] Cero application runtime READY
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [FRONTEND] DiagnosticLogger initialized in webview context
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [PTY] Spawned PTY session <uuid> (rows: 45, cols: 109, shell: /bin/bash)
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [LLM] Spawned llama-server (pid: <pid>) on port 8847
```

#### Monitored Subsystems & Diagnostic Tags
- **`[BOOT]`**: Runtime initialization and core plugins configuration.
- **`[SETUP]`**: Platform-specific permissions and hardware capability checks.
- **`[WINDOW]`**: Window creation, focus, resize, and destruction tracking.
- **`[WEBVIEW]`**: Real-time validation of loaded URL (`tauri://localhost` vs `http://localhost:1420`).
- **`[APP]`**: Application lifecycle events (`READY`, `EXIT`, `ExitRequested`).
- **`[FRONTEND]`**: Uncaught JavaScript errors (`window.onerror`), unhandled promise rejections (`unhandledrejection`), and initialization status.
- **`[CONSOLE]`**: Real-time capture of `console.error` and `console.warn` forwarded from WebKit GTK.
- **`[PTY]`**: Terminal session allocation, rows/cols geometry, shell binary resolution, and teardown.
- **`[LLM]`**: Embedded `llama-server` process spawn, port binding, and termination signals.
