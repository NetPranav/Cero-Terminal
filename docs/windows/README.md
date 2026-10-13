# Cero for Windows: notes for developers

Decisions that are not obvious from the code. The plan is in [../../ROADMAP.md](../../ROADMAP.md), the progress in
[../../COMPLETION.md](../../COMPLETION.md).

## Where Cero keeps its files

| What | Where |
|---|---|
| Models, engine, workflows, learned state, audit log | `%USERPROFILE%\.cero\` |
| Diagnostic log | `%USERPROFILE%\.cero\logs\cero.log` (2 MB, three old files `cero.log.1` to `.3`); `llama-server.log` next to it |
| llama.cpp engine | `%USERPROFILE%\.cero\engine\current\llama-server.exe` |
| WebView2 profile (settings kept by the web view) | `%LOCALAPPDATA%\org.cero.terminal\EBWebView` |
| API keys | Windows Credential Manager (service and key names as in 2.2.0; values over 1000 characters are split into `<key>#chunk0..n`) |

**Decision (2.9): the data stays in `%USERPROFILE%\.cero`.** The alternative, `%APPDATA%\Cero`, would be the more usual
Windows place, but 2.2.0 already uses `.cero`, the folder layout is the same as on Linux (workflows and notes move
between machines unchanged), and nothing has to be migrated on upgrade. `%USERPROFILE%` is read before `HOME`, which Git
Bash and MSYS point somewhere else. An old `.sentinel` folder and the old `org.sentinel.terminal` web view data are
moved or copied once at start.

## Running with a log in the console

A release build has no console. Start it from a terminal with `--debug` (or `CERO_DEBUG=1`) and it prints its log into
that terminal as well as into `cero.log`.

## Process cleanup

- Commands the agent runs get a Job Object each. A cancel or a timeout ends the whole tree. A command that finishes by
  itself leaves the programs it started on purpose running.
- `llama-server.exe` is in an application-wide job that ends with Cero, even after a crash.
- The terminal shells are **not** in a kill-on-close job: closing a tab would also close editors and other programs
  started from it. Decide in roadmap 8.5 whether that should change.
