# Cross-platform layout and shared-core sync

Cero runs on macOS, Windows and Linux from one code base, kept in per-platform branches.

## Layers
1. **Shared, OS-agnostic core** (most of the code):
   - `tools/`: the tool schemas, examples, knowledge files and tests (103 tool folders).
   - `src/ai/`: agent loop, planner, prompts, providers, memory.
   - `src/presentation/`: terminal view, output formatting.
   - `src/workflows/`: `.flow` authoring, saving, replay.
   - `src/domain/security/`: command safety guardian, policy, audit log.
2. **Platform layer**:
   - `src-tauri/`: the Rust side (`pty.rs`, `embedded_server.rs`, `file_association.rs`, `launch.rs`, `secrets.rs`, ...).
   - `src/sdk/capabilities/drivers/`: per-OS drivers (for example `bluetoothctl` on Linux, `blueutil` on macOS, PowerShell on Windows).
   - `packaging/`: `arch`, `linux`, `desktop`, `flatpak`, `snap`.

## Branches
| Branch | Purpose |
|---|---|
| `main` | macOS-first development; source of the shared core |
| `windows`, `linux` | Platform development branches (`linux-v2-update` is the current Linux line) |
| `release/macos`, `release/windows`, `release/linux` | What CI builds and publishes for each platform |
| `sync/shared-core-to-*` | Pull requests opened by the sync workflow |

Release notes for each platform are in [releases/](releases/linux.md). A platform is released only after its own check
([LINUX_TEST_REPORT.md](LINUX_TEST_REPORT.md)).

## Pulling the shared core
Do not merge `main` into a platform branch. Run the sync script, which checks out only the shared paths:

```bash
./scripts/sync-shared.sh                 # from origin/main
./scripts/sync-shared.sh origin/main     # or another source
```
On Windows: `powershell -ExecutionPolicy Bypass -File .\scripts\sync-shared.ps1`.

By hand:
```bash
git fetch origin main
git checkout origin/main -- tools/ src/ai/ src/presentation/ src/workflows/ src/domain/security/
```

`.github/workflows/sync-shared.yml` does the same automatically: a push to `main` that touches `tools/`, `src/ai/`,
`src/presentation/`, `src/workflows/` or `src/domain/security/` opens a pull request into `windows` and `linux`.

## Before committing a sync
1. `git status`: no platform file (`src-tauri/`, `drivers/`, `packaging/`) was overwritten.
2. `npm run check:triple` (`npm test && npm run build && cargo check --manifest-path src-tauri/Cargo.toml`).
3. Commit as `chore(sync): update shared core from main`.
