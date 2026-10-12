# Building & Packaging Cero

This reference document explains how developers and maintainers compile optimized production packages, generate standalone application binaries, and construct distribution installers for Cero.

---

## 🏗️ Quick Reference: Compilation Commands

All command invocations should be executed directly within the main repository directory:

| Command | Description | Artifact Output Location |
| :--- | :--- | :--- |
| **`npm run tauri -- build --bundles app`** | **Fast Application Build**: Compiles TypeScript definitions, optimizes Vite frontend assets, and bundles a direct native macOS application binary (`.app`). Skip lengthy disk image packaging for rapid test loops. | `src-tauri/target/release/bundle/macos/Cero.app` |
| **`npm run tauri build`** | **Full Release Bundle**: Executes comprehensive compile cycles, building both standalone binaries AND distributable OS disk installers (`.dmg` for macOS, `.deb`/`.AppImage` for Linux). | `src-tauri/target/release/bundle/macos/Cero.app`<br>`src-tauri/target/release/bundle/dmg/Cero_0.1.0_aarch64.dmg` |
| **`npm run build`** | **Frontend Assets Compiling**: Validates TypeScript typing strictness (`tsc`) and renders minified static web packages via Vite without rebuilding native Rust backend components. | `dist/` |
| **`cargo build --release --manifest-path src-tauri/Cargo.toml`** | **Direct Rust Backend Compilation**: Bypasses web bundling tools entirely to directly verify Tauri IPC handlers and native `pty.rs` system multiplexing bridges. | `src-tauri/target/release/cero-terminal` |

---

## 🍏 Launching Standalone Builds for Testing

To confirm how the packaged application behaves in native user mode without terminal inheritance (e.g., verifying our automatic `TERM=xterm-256color` and Launch Services `$PATH` injection), execute your generated binary directly from your development shell:
```bash
# Open newly built standalone macOS package instantly:
open "src-tauri/target/release/bundle/macos/Cero.app"
```

---

## 📦 Distribution Best Practices

When publishing GitHub Release snapshots or distributing native software application packages:
1. **Always verify passing tests prior to compile**:
   ```bash
   npx vitest run
   ```
2. **Clean intermediate artifacts on major version bumps**:
   If modifying core Rust Cargo dependencies in `src-tauri/Cargo.toml` or Tauri native menu configurations, run a clean sweep before packaging:
   ```bash
   cargo clean --manifest-path src-tauri/Cargo.toml
   npm run tauri -- build --bundles app
   ```
