# Cero Development Setup & Prerequisites

This manual instructs engineering contributors on configuring a reproducible local development environment for building, running, and modifying the Cero native codebase.

---

## 🛠️ Required Engineering Toolchain

To successfully compile both the web frontend presentation layer and the native Rust backend systems, ensure your development computer is equipped with the following toolchain:

### 1. Node.js & TypeScript Build Tools
- **Node.js (v20+ Recommended)**: Used for running the Vite bundling pipeline and executing automated Vitest test frameworks.
- **Package Manager (`npm` or `pnpm`)**: Manages our React 19, `@tauri-apps/api`, `@xterm/xterm`, and TypeScript compilation dependencies.
  ```bash
  # Verify installation:
  node -v
  npm -v
  ```

### 2. Rust & Cargo Backend Compilers
- **Rust Toolchain**: Required to build our native Tauri v2 desktop application bundle and execute portable-pty system wrappers (`src-tauri/`).
- Install via standard official Rustup installations:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  # Verify installation:
  cargo -v
  rustc -v
  ```
- **macOS Requirements**: Ensure Apple Xcode Command Line Tools are present:
  ```bash
  xcode-select --install
  ```

### 3. Local Offline AI Engine (Ollama)
To test conversational navigation and automated workflow execution without network access, install **[Ollama](https://ollama.ai)** locally on your workstation:
1. Download and start the background Ollama daemon.
2. Pull our targeted lightweight intelligence model:
   ```bash
   ollama pull qwen2.5:1.5b
   ```
3. Confirm the local AI engine is listening on default ports (`http://localhost:11434`):
   ```bash
   ollama list
   ```

---

## ⚡ Initializing Your Workspace

Once your prerequisites are secured, set up your development clone:

1. **Clone & Navigate into Workspace**:
   ```bash
   git clone https://github.com/NetPranav/Sentinal-Terminal.git
   cd Sentinal-Terminal
   ```
2. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```
3. **Launch Live Development Runtime**:
   Start the native standalone desktop application in interactive developer debugging mode with hot module reloading (HMR):
   ```bash
   npm run tauri dev
   ```
   *Your compiled native application window will launch automatically on your desktop!*

---

## 🔍 Verifying Your Local Setup
Confirm everything is communicating cleanly by running our automated unit verification suite:
```bash
npx vitest run
```
You should observe 69+ tests completing cleanly in under two seconds across our security, intent, SDK driver, and tool registry architectures!
