# Building & Packaging Cero

How to compile Cero for Windows and build its installers. Run every command from the repository folder.

---

## Quick Reference: Compilation Commands

| Command | Description | Artifact Output Location |
| :--- | :--- | :--- |
| **`npm run bundle:windows`** | **Full Release Bundle**: builds the frontend (`tsc` and Vite), compiles the Rust backend in release mode and builds both installers. | `src-tauri/target/release/bundle/msi/*.msi`<br>`src-tauri/target/release/bundle/nsis/*-setup.exe` |
| **`npm run bundle:msi`**, **`npm run bundle:nsis`** | One of the two installers only. | as above |
| **`npm run build`** | **Frontend Assets**: checks the TypeScript types (`tsc`) and builds the minified web assets with Vite, without the Rust backend. | `dist/` |
| **`cargo build --release --manifest-path src-tauri/Cargo.toml`** | **Rust Backend Only**: compiles the Tauri IPC handlers and the PTY without bundling. | `src-tauri/target/release/` |
| **`npm run check:triple`** | Tests, frontend build and `cargo check` (on Linux: `cargo xwin check` for the Windows target). | none |

---

## Launching Standalone Builds for Testing

To see how the installed app behaves outside `npm run tauri dev` (its own environment and `PATH`), install the
`.msi` or setup `.exe` you just built, or start the release binary from `src-tauri\target\release\` directly.

---

## Distribution Best Practices

When publishing a release or handing installers to testers:
1. **Always run the checks first**:
   ```powershell
   npm run check:triple
   ```
2. **Clean intermediate artifacts on major version bumps**:
   If you change Rust dependencies in `src-tauri/Cargo.toml` or the bundle configuration, clean before packaging:
   ```powershell
   cargo clean --manifest-path src-tauri/Cargo.toml
   npm run bundle:windows
   ```
3. The release workflow (`.github/workflows/release.yml`) builds both installers on `windows-latest` when
   `release/windows` is pushed, and publishes them with a `SHA256SUMS.txt`.
