# Linux test report

What was checked for the twelve findings, where, and what is still waiting for a real Linux desktop.
Nothing in the "Real Linux" column has been run yet: the plan (`docs/ROADMAP.md`, Phase 8) was built and
checked on a Mac. Fill in the table as each target is tried, with the date and the build.

Legend: **pass** = ran and worked, **fail** = ran and broke (write why), **not run** = still to do.

## Checked without a Linux desktop (macOS, automated)

| Report | Finding | How it was checked | Result |
|---|---|---|---|
| 1 | Save from a prompt | `src/workflows/engine/SaveIntent.test.ts` (45 rows), `src/ai/agent/AgentLoopSaveWorkflow.test.ts`, headless requests `s-*` in `scripts/stress/tests3.ts` | pass |
| 2 | Arrow keys and ghost text | `ghostKeys.test.ts`, `InputLineTracker.test.ts`, `GhostText.test.ts` (logic only: the real terminal view is not unit tested) | pass (logic) |
| 3 | Queue | `PromptQueue.test.ts`, `AgentLoop.queue.test.ts` | pass (logic) |
| 4 | Same prompt, built-in vs API | `DecisionRequest.test.ts`, `ModelReply.test.ts`, `AgentLoopExternalRetry.test.ts`; not compared against a real API model | pass (plumbing) |
| 5 | Esc closes Settings | `escapeKey.test.ts` (the key rule only) | pass (logic) |
| 6 | Open a folder by name | `OpenRequest`, `PathResolver`, `OpenInApp`, `AgentLoopOpen` tests; headless `o-*` requests against a sandbox home | pass |
| 7 | Wrong folder or app names | same, plus `AppCatalog.test.ts` with saved `.desktop` samples; headless `a-*` requests | pass |
| 8 | Provider and model remembered | `ModelManager.test.ts` | pass (logic) |
| 9 | Status bar | `AiStatus.test.ts` | pass (logic) |
| 10 | Ctrl+C | `Cancelled.test.ts`, `AgentLoop.cancel.test.ts`; headless `c-*` requests with an abort (the model-backed ones were not run: the machine ran out of memory) | pass (logic) |
| 11 | Built-in model reliability | `npm run eval:model` against the local 3B model on a Mac: flip rate 0.0% (target met), `pass@1` 83.1% (target 95% NOT met); details in `docs/MODEL_RELIABILITY.md` | partly met |
| 12 | `.flow` extension, icon, association | `FlowExport`, `DiskWorkflowStorage`, `FlowImport` tests; Rust tests for `launch.rs` and `file_association.rs` | pass (code) |

## Real Linux: to do

Run each target below, then fill in the matrix. Commands to copy are in the right-hand column.

| Target | Install | Desktop |
|---|---|---|
| Ubuntu 24.04 | `.deb` | GNOME, X11 and Wayland |
| Fedora (current) | `.rpm` | KDE Plasma |
| Arch | PKGBUILD | Hyprland |
| Any | AppImage | any |
| Any | Flatpak | any |

| Report | Steps | Pass when | Ubuntu .deb | Fedora .rpm | Arch | AppImage | Flatpak |
|---|---|---|---|---|---|---|---|
| 1 | `open gmail and save this as a workflow called mail check`; answer the question | A `.flow` is at the chosen place, the summary names the path, double-click runs it | not run | not run | not run | not run | not run |
| 2 | type `git sta`, Left twice, Right twice, Right at the end | nothing inserted by the first three; the last accepts | not run | not run | not run | not run | not run |
| 3 | run a slow request, type three more, open the queue, remove one, reorder | the panel shows, edits work, order is respected | not run | not run | not run | not run | not run |
| 4 | the report 4 prompt on the built-in and on an API model | same result | not run | not run | not run | not run | not run |
| 5 | open Settings, press Esc | closes | not run | not run | not run | not run | not run |
| 6 | `Please open a folder named gitBrains in VS Code. This folder is inside /padhai_in_linux/Projects/` | one VS Code window on the right folder, nothing created | not run | not run | not run | not run | not run |
| 7 | `open gitbarins in code`, `open crome` | "did you mean" questions, no files created | not run | not run | not run | not run | not run |
| 8 | choose an API model, restart three times | the same model each time | not run | not run | not run | not run | not run |
| 9 | look at the status bar for each provider | never "Off" while it works; a reason when it does not | not run | not run | not run | not run | not run |
| 10 | run a slow request, press Ctrl+C | stops in under a second, no leftover process (`pgrep -fa sleep`) | not run | not run | not run | not run | not run |
| 11 | `npm run eval:model` | `pass@1` of at least 95%, flip rate of at most 3% | not run | not run | not run | not run | not run |
| 12 | `xdg-mime query filetype x.flow`; look at the file in the file manager; double-click it; first run of the AppImage | `application/x-sentinel-workflow`, the Sentinel flow icon, opens in Sentinel; AppImage asks once to register | not run | not run | not run | not run | not run |

Useful commands on the Linux machine:

```bash
xdg-mime query filetype ~/Desktop/test.flow          # application/x-sentinel-workflow
xdg-mime query default application/x-sentinel-workflow   # sentinel-terminal.desktop
ls ~/.local/share/mime/packages/ ~/.local/share/applications/ | grep -i sentinel   # AppImage registration
update-mime-database ~/.local/share/mime && update-desktop-database ~/.local/share/applications
pgrep -fa 'sleep|llama-server'                       # nothing left over after Ctrl+C
```

macOS and Windows still need their own checks before those releases (Finder icon and double-click; the Windows
installer's `.flow` registration and icon). Phases 1, 2, 3, 5, 6 and 7 changed shared code.
