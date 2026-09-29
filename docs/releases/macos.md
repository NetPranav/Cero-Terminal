## Sentinel Terminal 2.1.0 for macOS

**Downloads**
- `Sentinel.Terminal_2.1.0_aarch64.dmg`: Apple Silicon (M1 and later). Built and tested on macOS 26.
- `Sentinel.Terminal_2.1.0_x64.dmg`: Intel Macs. Built by CI; not yet tested on Intel hardware.

**First launch.** The app is ad-hoc signed, not notarized. macOS blocks the first launch: open System Settings, then Privacy & Security, and choose "Open Anyway". On a new machine the app downloads the llama.cpp engine (about 12 MB) and the Qwen2.5-Coder 3B model (about 2 GB) from Settings, AI, Built-in model. Or use Ollama or a cloud key instead.

**New in 2.1.0**
- Ask for the app's own functions in plain language: "open settings", "show my command history", "switch to zen mode", "search the terminal for ERROR", "go to tab 2", "rename this tab to api".
- Talk to other terminals: "open a new tab here and run npm run dev", "run ls in tab 2", "stop the server", "what's running in my terminals". The model reads other terminals only when you ask, and only what changed.
- Ready-made, tested commands for tricky requests: CSV totals and conversion, syntax checks, folder sizes, text replacement with backups, safe renames, port owners and git status of a named folder.
- "fix buggy.py so it runs": runs the file, shows the change for approval (original kept as .bak), then re-runs it.
- "why is npm test failing in api?": runs the command there and explains the failure from the code it points at.
- Security: commands that read private keys or credential files always ask first, and keys and tokens are masked before anything reaches a model.
- Command history (Ctrl+R) lists commands you actually ran, and never records a password typed into a running program.

Checksums: `SHA256SUMS.txt` (Intel, from CI) and `SHA256SUMS-apple-silicon.txt`.
