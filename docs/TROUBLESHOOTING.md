# Cero — Troubleshooting & Diagnostics Guide

Encountering an unexpected behavior in Cero? Follow these step-by-step diagnostic and resolution procedures for the embedded AI engine, the terminal and the installed app on Windows.

---

## 1. Embedded AI Inference Engine Diagnostics

### A. The status bar says "AI: Off"
`AI: Off` appears only when the built-in engine is stopped. A working API or Ollama model shows `AI: API` or `AI: Ollama`.
1. Click the status pill or open Settings (`Ctrl+,`), AI tab, and choose **Start Engine**. If the model is not
   downloaded yet the status says "Download Required"; start the download there.
2. The engine listens on port `8847` (fixed). Check it with:
   ```powershell
   curl.exe http://localhost:8847/health
   ```
3. Cero removes a `llama-server` left on that port by a crash when it starts. To do it by hand:
   ```powershell
   Stop-Process -Name llama-server
   ```
4. If the chosen provider cannot be reached, Cero shows the reason and retries; it does not fall back to the built-in model by itself.

### B. Slow answers or GPU memory exhaustion
- If the GPU runs out of memory (for example next to Blender or Gazebo), the engine falls back to the CPU on its own and
  Settings shows `Running (CPU)`. There is no toggle.
- On a slow machine choose a smaller model in Settings (Qwen 2.5 Coder 0.5B or 1.5B), or use an API provider.

### C. GBNF Grammar Initialization Errors
- **Error Code 400 (`failed to parse grammar`)**: Older `llama-server` builds forbid underscores in rule names (e.g. `action_done`). Cero's `GbnfGrammarManager.ts` automatically sanitizes rule identifiers to hyphen-case (`action-done`).
- If an unhandled grammar parse error occurs, `EmbeddedProvider.ts` automatically falls back to unconstrained JSON completion.

---

## 2. Shell Input, PTY & Keyboard Behaviors

### A. A shortcut does nothing
- Check [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md): some keys that older pages listed (`Ctrl+Shift+Z`, `Ctrl+1..9`, `Ctrl+Alt+P`) are not built.
- The F1 help screen still shows the wrong split keys; the real ones are `Ctrl+D` and `Ctrl+Shift+D`.
- The command palette is `Ctrl+Shift+P`.

### B. `Ctrl+R` History Search Interception
- Cero intercepts `Ctrl+R` in the terminal to display an interactive, visual fuzzy history search modal.
- If the shell's own reverse search (PSReadLine's `bck-i-search`) appears instead, update Cero: `Ctrl+R` is captured before it reaches the shell in every current version.

### C. Fullscreen Interactive Programs (`vim`, `nano`, `htop`, `tmux`)
- Cero's PTY state tracker detects the alternate screen buffer (`\x1b[?1049h`) and automatically suspends ghost-text autocompletions and output observers, preventing cursor jumping or display glitches during interactive editing.

---

## 3. Webview, Packaging & Live Diagnostic Logging System

### A. White Screen: "Could not connect to localhost: Connection refused"
- **Symptom**: When opening Cero after installing it (`.msi` or setup `.exe`), the window displays a blank white screen with the text:
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
  2. `npm run bundle:windows` (`tauri build`) runs `npm run build` first and compiles with the default features, so the
     installers always embed the assets.

### B. Live Terminal Diagnostic Logging System
Cero includes an end-to-end live diagnostic logging system spanning the native Rust backend, Webview runtime, and frontend React engine.

#### Launching with Live Logs
To diagnose runtime issues, window loading failures, IPC errors, or background crashes, launch Cero from any terminal using diagnostic flags or environment variables:

```powershell
# Using the CLI launcher
cero --debug
cero -d
cero --verbose
cero -v

# Or using the environment variable
$env:CERO_DEBUG = '1'; cero

# Or starting the installed program with the flag (the `cero` launcher looks for it in
# %LOCALAPPDATA%\Cero and %ProgramFiles%\Cero)
& "$env:LOCALAPPDATA\Cero\Cero.exe" --debug
```

#### Log Output Format
All log output adheres strictly to zero-emoji, grayscale terminal standards with ISO-8601 UTC timestamps:
```text
================================================================================
[YYYY-MM-DDTHH:MM:SSZ] [SYSTEM] Cero Diagnostic Logging ACTIVE (PID: <pid>)
[YYYY-MM-DDTHH:MM:SSZ] [SYSTEM] OS: windows | Arch: x86_64 | Release: 2.2.3
================================================================================
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [BOOT] Initializing Cero runtime
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [SETUP] Initializing core application services
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [WINDOW] Main webview URL: tauri://localhost
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [WEBVIEW] Embedded production assets active via custom-protocol (tauri://localhost)
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [APP] Cero application runtime READY
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [FRONTEND] DiagnosticLogger initialized in webview context
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [PTY] Spawned PTY session <uuid> (rows: 45, cols: 109, shell: powershell.exe)
[YYYY-MM-DDTHH:MM:SSZ] [INFO ] [LLM] Spawned llama-server (pid: <pid>) on port 8847
```

#### Monitored Subsystems & Diagnostic Tags
- **`[BOOT]`**: Runtime initialization and core plugins configuration.
- **`[SETUP]`**: Platform-specific permissions and hardware capability checks.
- **`[WINDOW]`**: Window creation, focus, resize, and destruction tracking.
- **`[WEBVIEW]`**: Real-time validation of loaded URL (`tauri://localhost` vs `http://localhost:1420`).
- **`[APP]`**: Application lifecycle events (`READY`, `EXIT`, `ExitRequested`).
- **`[FRONTEND]`**: Uncaught JavaScript errors (`window.onerror`), unhandled promise rejections (`unhandledrejection`), and initialization status.
- **`[CONSOLE]`**: Real-time capture of `console.error` and `console.warn` forwarded from WebView2.
- **`[PTY]`**: Terminal session allocation, rows/cols geometry, shell binary resolution, and teardown.
- **`[LLM]`**: Embedded `llama-server` process spawn, port binding, and termination signals.
