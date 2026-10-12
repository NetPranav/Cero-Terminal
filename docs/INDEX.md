# Documentation index

Documentation of the `windows` branch (Cero for Windows, port in progress: [../ROADMAP.md](../ROADMAP.md),
[../COMPLETION.md](../COMPLETION.md)). What a guide describes but the app does not do yet is in [FUTURE_SCOPE.md](FUTURE_SCOPE.md).

## Using Cero
| Document | What it covers |
|---|---|
| [USER_GUIDE.md](USER_GUIDE.md) | Start here: requests, fixes, workflows, settings |
| [COMMANDS.md](COMMANDS.md) | Every `>` request form and slash command |
| [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md) | Keys, checked against the code |
| [FEATURES.md](FEATURES.md) | What the app does, in one page |
| [FAQ.md](FAQ.md) | Privacy, models, stopping a request, safety |
| [FLOW_FILES.md](FLOW_FILES.md) | The `.flow` file: what it does, format, how to make one |
| [WORKFLOWS.md](WORKFLOWS.md) | Saving, storing and replaying workflows |
| [LEARNING.md](LEARNING.md) | `/learn`, `/forget`, `/learning` |
| [TERMINAL.md](TERMINAL.md) | Rendering, tabs, panes, search, suggestions |
| [THEMES.md](THEMES.md), [ui.md](ui.md) | Zen and Visual mode, the grayscale design system |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Engine, keyboard, white screen, `cero --debug` |
| [integrations/](integrations/cli.md) | `cero` command, VS Code, Cursor |

## How it works
| Document | What it covers |
|---|---|
| [AI.md](AI.md) | Providers, built-in engine and models, request flow, memory |
| [SECURITY.md](SECURITY.md) | Safety guardian, approvals, AST check, secrets, audit log |
| [MODEL_RELIABILITY.md](MODEL_RELIABILITY.md) | Measured pass rate and determinism of the built-in model |
| [CODEBASE_MAP.md](CODEBASE_MAP.md) | Every source file and whether the app uses it (`scripts/generate_codebase_map.py`) |
| [WORKFLOW_FOLDER.md](WORKFLOW_FOLDER.md) | Source reference for `src/workflows` and `src/domain/workflow` |

## Project
| Document | What it covers |
|---|---|
| [../ROADMAP.md](../ROADMAP.md), [../COMPLETION.md](../COMPLETION.md) | The Windows port plan and its progress |
| [ROADMAP.md](ROADMAP.md) | The 2.2.0 roadmap record |
| [FUTURE_SCOPE.md](FUTURE_SCOPE.md) | Described but not built |
| [completed_roadmap.md](completed_roadmap.md) | The record of the twelve Linux findings: what was done and measured |
| [releases/](releases/windows.md) | Release notes |
| [rules.md](rules.md) | Development rules (also in `AGENTS.md`) |
| [TEST_CASES.md](TEST_CASES.md), [TOOL_TEST_CASES.md](TOOL_TEST_CASES.md), [benchmark/PROMPTS.md](benchmark/PROMPTS.md) | Prompt lists for manual and automated testing |
| [demo/](demo/README.md), [images/](images/README.md), `media/`, `brand/` | The demo video, screenshots and logo assets |
| [archive/](archive/README.md) | Historical documents; not accurate for the current app |

Verification before a commit: `npm run check:triple` (`npm test`, `npm run build`, then `cargo check` on Windows or
`cargo xwin check --target x86_64-pc-windows-msvc` on Linux; `scripts\windows\check-triple.ps1` on Windows),
plus `cargo test --manifest-path src-tauri/Cargo.toml --lib` for Rust changes and `npm run smoke:engine` on a machine
with a local model.
