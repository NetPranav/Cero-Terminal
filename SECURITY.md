# Security

## Reporting a problem

Please report security problems privately, not in a public issue: use
[Report a vulnerability](https://github.com/NetPranav/Sentinal-Terminal/security/advisories/new) on the
Security tab. Include the version, your operating system and steps to reproduce. Reports are read by the
maintainer as soon as possible.

Supported version: the latest release (2.1.x). Fixes go into a new release of the affected platform.

## How Sentinel keeps you in control

- **Nothing that changes your system runs without your approval.** A request that installs, deletes,
  stops a process, changes a setting or writes outside a folder you chose shows the exact command first.
  Commands that are high risk (stopping processes, deleting, super-user) need a click on **Run**; Enter is ignored.
- **Sentinel never asks for your password.** Super-user commands ask in the terminal itself, where `sudo` belongs.
- **Files opened with Sentinel** (`.flow`, workflows) show every command they will run, and start only
  after you click Run. Values from a file are quoted so they cannot add shell syntax.
- **Reading private keys and credential files always asks**, and keys and tokens are masked before any
  output reaches a model.
- **Names and paths are data.** Folder, file, app and workflow names are passed to programs as arguments or
  quoted, so `$(...)` or backticks inside a name do not run.

## What stays on your computer

- The built-in model runs on your computer (llama.cpp, listening on `127.0.0.1` only). With Ollama it stays
  local too. With a cloud key, your requests go to that provider and nowhere else.
- History, transcripts, the audit log and learning data live in `~/.sentinel`, readable by you only.
  There is no telemetry, crash reporting or account.
- Network requests Sentinel makes on its own: downloading the model and engine you ask for (checked against
  pinned SHA-256 digests), and the public-IP lookup (`api.ipify.org`) only when you ask "what is my ip".

## Known limits

- The installers are not code-signed or notarized yet (macOS Gatekeeper and Windows SmartScreen warn on
  first launch). Check the `SHA256SUMS.txt` of each release.
- The app can use any HTTPS host, because you can point it at any OpenAI-compatible endpoint.
- The file access of the window is the whole home folder. Narrowing it is on the roadmap.
- There is no automatic updater: install new releases yourself.
