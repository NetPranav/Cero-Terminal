# Future scope

Features that the documentation used to describe (or that the app hints at) but that are **not implemented** in
the code as of Cero 2.2.3. They were removed from the guides so those describe only what works, and are kept here
so they are not lost. Each row says where the idea appeared and what exists today.

Last checked against the code: 2026-10-04 (branch `linux-v2-update`).

## Keyboard and interface

| Idea | Was described in | What exists today |
|---|---|---|
| `Ctrl+Shift+Z` toggles Zen and Visual mode | KEYBOARD_SHORTCUTS, USER_GUIDE, FEATURES, THEMES, in-app hints (Settings, onboarding) | No key handler. The mode switches from Settings or the command palette ("Toggle UI mode"). The in-app hint text is wrong until this is built. |
| `Ctrl+1` to `Ctrl+9` switch tabs, `Ctrl+Tab` and `Ctrl+Shift+Tab` cycle tabs | KEYBOARD_SHORTCUTS, TERMINAL, FEATURES | No handler. Tabs are chosen with the mouse. The in-app help lists `1..9`. |
| `Alt+Arrow` moves focus between split panes | KEYBOARD_SHORTCUTS | No handler. Click a pane. |
| Workspace and project switcher (`Ctrl+O`) | ui.md, THEMES, FEATURES | No modal exists (`WorkspaceSwitcherModal.tsx` is not in the source). Ask in plain words: `>switch to <folder>`. |
| Listening-ports drawer (`Ctrl+Alt+P`) and `[Projects]` / `[Ports]` status-bar buttons | THEMES, ui.md, TROUBLESHOOTING | Not built. Visual mode shows only the Workflows button. Ask `>show listening ports` or `>free port 3000`. |
| `Ctrl+Shift+H` for a horizontal split | TERMINAL, KEYBOARD_SHORTCUTS, FEATURES | Not bound. Horizontal split is `Ctrl+Shift+D` (vertical is `Ctrl+D`). |
| The in-app help (F1) shows `Ctrl+Shift+D` for a vertical and `Ctrl+Alt+D` for a horizontal split | `KeyboardShortcutsModal.tsx` | The real keys are `Ctrl+D` and `Ctrl+Shift+D` (`App.tsx`). The help modal needs correcting. |
| Window opacity and backdrop blur sliders | THEMES | No such settings. The blur is fixed in CSS. |

## Workflows

| Idea | Was described in | What exists today |
|---|---|---|
| Three-tier workflows (template, user workflow, instance), 11 typed variable domains | WORKFLOWS, WORKFLOW_FOLDER | Types exist in `src/workflows/models`, but the app saves and runs flat `.flow` action lists (see FLOW_FILES.md). |
| Control flow (parallel, conditional, switch, loop, retry, wait), a workflow IR compiler and graph compiler | WORKFLOWS, WORKFLOW_FOLDER | `WorkflowIRCompiler`, `WorkflowGraphCompiler`, `WorkflowExecutionEngine`, `LoopEngine`, `ControlFlow` are not reachable from the app. |
| Triggers: cron, startup, login, filesystem and application events | WORKFLOWS, WORKFLOW_FOLDER | `WorkflowScheduler` is not reachable from the app. Workflows only run when asked. |
| Workflow registry, sharing/import by link, telemetry, execution history, 11 validation gates, built-in templates | WORKFLOWS, WORKFLOW_FOLDER | The modules exist but are not reachable from the app. Only the starter workflows and `.flow` import/export are live. |

## Assistant and safety

| Idea | Was described in | What exists today |
|---|---|---|
| Learning from watching the user's own fix after a failed request | AI, FEATURES | Removed on purpose: Cero learns only with `/learn` (see LEARNING.md). |
| Self-evolving training loop (SFT and DPO datasets, local LoRA fine-tuning from the user's sessions) | AI | Training scripts exist under `scripts/` for the developers. The app does not fine-tune on the user's machine; `/learning on` only keeps a local record of failed requests. |
| Tool output wrapped in `<tool_output>` delimiters as a prompt-injection defence | SECURITY | No such wrapper in the code. Commands are still checked by the safety guardian and approved by the user before anything that changes the system runs. |
| An automatic "path confinement" check that keeps file changes inside the workspace | SECURITY | Not enforced. Changes outside the current folder need the same approval as any other change. |
| A "CPU Fallback Mode" toggle | TROUBLESHOOTING | The engine falls back to CPU by itself when the GPU cannot be used; Settings shows `Running (CPU)` or `Running (GPU)`. There is no toggle. |
| The embedded engine moves to the next free port when 8080 is taken | AI, TROUBLESHOOTING | The port is fixed at 8847, and an engine left over from a crash on that port is cleaned up at start. No port search. |

## Platforms and integrations

| Idea | Was described in | What exists today |
|---|---|---|
| Windows ConPTY file `pty_windows.rs` | CROSS_PLATFORM_SHARING | Not in `src-tauri/src`. The Windows branch carries its own PTY work. |
| `cero --split` and `cero --new-tab` act on the running window | integrations/cli | Both are accepted by the launcher; whether the running window honours them has not been checked on Linux. |
| Flatpak package | LINUX_TEST_REPORT, releases | `packaging/flatpak/build-flatpak.sh` exists and the test matrix lists it, but the CI workflows build no Flatpak and none is released. |

## Quality targets (carried over from ROADMAP)

- Raise the built-in model `pass@1` from 83.1% toward 95% (see MODEL_RELIABILITY.md).
- Check the Linux packages, AppImage registration, Windows installer registration and macOS Finder icon on real systems (LINUX_TEST_REPORT.md).
