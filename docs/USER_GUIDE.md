# Cero: user guide

## 1. Starting
Open Cero from your launcher, or run `cero` (or `cero /path`). On first launch the setup wizard offers to download a
model (default Qwen 2.5 Coder 3B, about 2 GB), pick Zen or Visual mode and install the optional integrations. Status bar
`AI: local` means the built-in model is ready. Starting with 2.2 your `~/.sentinel` folder is moved to `~/.cero`.

## 2. Commands and requests
Plain commands go to your shell. A line starting with `>` is a request:

```text
>show me the processes using the most memory
>find files changed in the last day in src
>write a python script in /tmp/netmon.py that prints network speed, then run it
```

Cero shows commands that change things in an approval card at the bottom-right. Click **Run** or **Deny**.
Full list of requests and slash commands: [COMMANDS.md](COMMANDS.md).

While a request runs, the status bar shows its stage and progress. `Ctrl+C` stops it. Requests typed meanwhile wait in
a queue: open it with `/queue` or by clicking the queue count.

## 3. When something fails
A suggested fix appears; press `Tab` or type `>fix`. To undo a Cero change: `>undo last step`.

## 4. Workflows
```text
>clean build output, run the tests and package it :: save as workflow release-prep
>open spotify and save this as a workflow called music
run the workflow release-prep
```
Cero runs the task, then saves the steps that really ran as `~/.cero/workflows/<name>.flow` (or where you choose) and
prints `Saved workflow "name" (N steps) to <path>` or `Not saved: <reason>`. `Ctrl+Shift+W` opens the Workflow Manager.
Details and the file format: [FLOW_FILES.md](FLOW_FILES.md).

## 5. Open things by name
`>open the folder gitBrains in VS Code`, `>open firefox`. Typos get a question, not a guess. `/app chrome "Google Chrome"`
maps a short name to an application.

## 6. Settings (`Ctrl+,`)
Full-screen. Tabs: AI (model downloads, hardware recommendation, API keys with "Test Connection", Ollama), Desktop
Integrations (`cero` command, file-manager actions, VS Code and Cursor profiles), Terminal (Zen/Visual mode, "Accept
suggestion with Right arrow"), General (shell, folders, re-run onboarding). `Esc` closes it.

## 7. Layout
Tabs `Ctrl+T`, split `Ctrl+D` / `Ctrl+Shift+D`, search `Ctrl+Shift+F`, history `Ctrl+R`, palette `Ctrl+Shift+P`, help `F1`.
All keys: [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md).

## 8. Safety
Catastrophic commands (`rm -rf /`, `dd` onto a disk, `mkfs`, `chmod -R 000 /`, fork bombs) are refused with an
explanation and a safer alternative. See [SECURITY.md](SECURITY.md).

## 9. Teaching
`/learn` teaches the request above it. Nothing is learned otherwise. See [LEARNING.md](LEARNING.md).

## 10. Problems
[TROUBLESHOOTING.md](TROUBLESHOOTING.md) and `cero --debug` for live logs.
