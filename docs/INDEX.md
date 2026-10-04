# Documentation index

Current for Cero 2.2.3 (Linux). What a guide describes but the app does not do yet is in [FUTURE_SCOPE.md](FUTURE_SCOPE.md).

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
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Engine, keyboard, Linux desktop, white screen, `cero --debug` |
| [integrations/](integrations/cli.md) | `cero` command, file managers, VS Code, Cursor, macOS |

## How it works
| Document | What it covers |
|---|---|
| [AI.md](AI.md) | Providers, built-in engine and models, request flow, memory |
| [SECURITY.md](SECURITY.md) | Safety guardian, approvals, AST check, secrets, audit log |
| [MODEL_RELIABILITY.md](MODEL_RELIABILITY.md) | Measured pass rate and determinism of the built-in model |
| [CODEBASE_MAP.md](CODEBASE_MAP.md) | Every source file and whether the app uses it (`scripts/generate_codebase_map.py`) |
| [WORKFLOW_FOLDER.md](WORKFLOW_FOLDER.md) | Source reference for `src/workflows` and `src/domain/workflow` |
| [CROSS_PLATFORM_SHARING.md](CROSS_PLATFORM_SHARING.md) | Branches and syncing the shared core |

## Project
| Document | What it covers |
|---|---|
| [ROADMAP.md](ROADMAP.md) | What is done and what is next |
| [FUTURE_SCOPE.md](FUTURE_SCOPE.md) | Described but not built |
| [completed_roadmap.md](completed_roadmap.md) | The record of the twelve Linux findings: what was done and measured |
| [LINUX_TEST_REPORT.md](LINUX_TEST_REPORT.md) | The check matrix for Linux distributions |
| [releases/](releases/linux-2.2.3.md) | Release notes per platform and version |
| [rules.md](rules.md) | Development rules (also in `AGENTS.md`) |
| [TEST_CASES.md](TEST_CASES.md), [TOOL_TEST_CASES.md](TOOL_TEST_CASES.md), [benchmark/PROMPTS.md](benchmark/PROMPTS.md) | Prompt lists for manual and automated testing |
| [demo/](demo/README.md), [images/](images/README.md), `media/`, `brand/` | The demo video, screenshots and logo assets |
| [archive/](archive/README.md) | Historical documents; not accurate for the current app |

Verification before a commit: `npm run check:triple` (`npm test && npm run build && cargo check --manifest-path src-tauri/Cargo.toml`),
plus `cargo test --manifest-path src-tauri/Cargo.toml --lib` for Rust changes and `npm run smoke:engine` on a machine
with a local model.
