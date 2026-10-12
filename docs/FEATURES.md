# Cero: features

What the 2.2.3 app does. Things described elsewhere that are not built yet are in [FUTURE_SCOPE.md](FUTURE_SCOPE.md).

## Requests in plain language
- Start a line with `>` (see [COMMANDS.md](COMMANDS.md)). Cero works out the commands, shows the ones that change
  anything for approval, runs them in your terminal and answers from the real output.
- Common requests run from tested code without a model call; the rest go to the model you chose.
- Several actions in one request become separate steps, each reported.
- Open folders and apps by name: spelling and case are forgiven, typos ask "Did you mean ...?", two matches ask which,
  a missing folder is reported and never created unless you say "create it". Answers are remembered (`forget gitbrains`).
- Project creation (for example Next.js) uses recommended defaults; a command that still asks questions opens in a
  terminal pane for you to answer.
- Failed commands get a suggested fix: `Tab` or `>fix`.
- `>what did you just do` and `>undo last step` for reversible changes (session only).
- A queue panel (`/queue`) for requests typed while one is running; `Ctrl+C` stops the running one.

## Models
- Built-in `llama-server` (llama.cpp build pinned in `EmbeddedEngineManager.ts`) with a Qwen model downloaded on first
  use: 0.5B, 1.5B, 3B (default) or Qwen3 4B. GPU through Vulkan, CUDA or Metal where available, CPU otherwise.
- Decisions are deterministic (temperature 0, fixed seed, no prompt cache) and every action is checked before it runs.
- Providers: built-in, Ollama, or an API (OpenAI, Anthropic, Groq, DeepSeek, OpenRouter, custom OpenAI-compatible).
  One shared place sets sampling and parsing for all of them. The choice survives restarts.
- Measured reliability: [MODEL_RELIABILITY.md](MODEL_RELIABILITY.md).

## `.flow` files and workflows
- A `.flow` file lists what to install, run and open; double-click it to run it.
  See [FLOW_FILES.md](FLOW_FILES.md).
- Make one by asking, or save what a request really did. Run later with `run the workflow <name>`.
- The Workflow Manager (`Ctrl+Shift+W`) lists saved workflows. Files live in `~/.cero/workflows/`.

## Terminal
- WebGL xterm.js, tabs, split panes, search, fuzzy history (`Ctrl+R`), grey suggestions. See [TERMINAL.md](TERMINAL.md).
- Command palette `Ctrl+Shift+P`, Settings `Ctrl+,`, help `F1`, plugin marketplace `Ctrl+Shift+X`.
- Zen mode (default) hides extra buttons; Visual mode adds a Workflows button. Switch in Settings or the palette.
- Status bar: shell, folder breadcrumbs (click to `cd`), AI status, CPU, RAM, clock, `[F1 help]`.

## Teaching
`/learn`, `/learned`, `/forget`, `/learning on|off`. Nothing is learned unless you ask. See [LEARNING.md](LEARNING.md).

## Safety
- Command safety guardian refuses catastrophic commands at the keyboard and in the agent. See [SECURITY.md](SECURITY.md).
- One approval card (Run or Deny) for anything that changes your files, system or network; a `.flow` from a file lists
  every command first.
- Secrets are redacted before logs are written; downloads are verified by SHA-256.

## System knowledge
At startup Cero reads installed apps, developer tools, hardware, mounts, network, services and the desktop session into
`~/.cero/knowledge/system_profile.json`, so "open my browser" or "how much disk is free" need no probing.

## Desktop integration (Settings, Desktop Integrations)
`cero` command in `~/.local/bin`, file-manager "Open in Cero" (Nautilus, Nemo, Caja, Dolphin, Thunar), VS Code and
Cursor terminal profiles, `.flow` file type and icon. Everything is user-space; no root needed.
See [integrations/](integrations/cli.md).

## Look
Matte grayscale, no emoji, full-screen Settings and onboarding. See [ui.md](ui.md) and [THEMES.md](THEMES.md).
