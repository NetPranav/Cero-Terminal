## Sentinel Terminal 2.1.0 for macOS

**Downloads**
- `Sentinel.Terminal_2.1.0_aarch64.dmg`: Apple Silicon (M1 and later). Built and tested on macOS 26.
- `Sentinel.Terminal_2.1.0_x64.dmg`: Intel Macs. Built by CI; not yet tested on Intel hardware.

**First launch.** The app is ad-hoc signed, not notarized. macOS blocks the first launch: open System Settings, then Privacy & Security, and choose "Open Anyway". On a new machine the app downloads the llama.cpp engine (about 12 MB) and the Qwen2.5-Coder 3B model (about 2 GB) from Settings, AI, Built-in model. Or use Ollama or a cloud key instead.

**Updating.** Drag the new app over the old one in Applications and choose Replace. macOS opens `.flow` files with the copy that is installed, so an older Sentinel keeps handling them until it is replaced.

**Open a .flow file and it runs.** A `.flow` file (from a tutorial, a teammate or you) lists what to install, run and open. Sentinel picks the commands for this OS.
- A flow that only opens apps and links (Chrome, YouTube, VS Code) runs without showing the terminal.
- A flow that installs or runs things opens the terminal, lists every command, waits for you to click Run, then types each step so you can see output and answer prompts.

See [FLOW_FILES.md](https://github.com/NetPranav/Sentinal-Terminal/blob/main/docs/FLOW_FILES.md) and the [example flows](https://github.com/NetPranav/Sentinal-Terminal/tree/main/examples/flows).

**New in 2.1.0**
- **Make a workflow by asking**: "make me a workflow that ..." writes a `.flow` file from the steps you list, asks where to keep it (Desktop, this folder, Sentinel workflows, or a path) and never replaces an existing file. Steps it does not understand are named and left out, never guessed.
- **Close a port by number**: "close port 8765" finds what is listening on exactly that port, shows its name and PID, asks, stops it normally and checks that the port is free.
- **Wi-Fi is exact**: turning Wi-Fi on or off and joining a network use the exact command, shown before it runs. The built-in model is no longer involved (it once invented a password).
- **Fixed**: a workflow with relative folders stopped at step 3; opening Sentinel on a folder named `$(...)` could run text from the name; several drivers quoted names unsafely.
- **Security**: Sentinel no longer asks for your login password (high-risk commands need a click on Run). `~/.sentinel` is readable by you only. See [SECURITY.md](https://github.com/NetPranav/Sentinal-Terminal/blob/main/SECURITY.md).
- System settings by request, with the right commands for each OS: "turn wifi off", "set brightness to 60", "mute", "turn on dark mode", "show paired bluetooth devices", "open sound settings". Saying only a topic ("bluetooth") lists what Sentinel can do for it on this OS. Changes ask first.
- Ask for the app's own functions in plain language: "open settings", "show my command history", "switch to zen mode", "search the terminal for ERROR", "go to tab 2", "rename this tab to api".
- Talk to other terminals: "open a new tab here and run npm run dev", "run ls in tab 2", "stop the server", "what's running in my terminals". The model reads other terminals only when you ask, and only what changed.
- Ready-made, tested commands for tricky requests: CSV totals and conversion, syntax checks, folder sizes, text replacement with backups, safe renames, port owners and git status of a named folder.
- "fix buggy.py so it runs": runs the file, shows the change for approval (original kept as .bak), then re-runs it.
- "why is npm test failing in api?": runs the command there and explains the failure from the code it points at.
- Security: commands that read private keys or credential files always ask first, and keys and tokens are masked before anything reaches a model.
- Quitting an app by name ("quit textedit", "terminate the claude application") checks the running apps first, matches the name in any case and asks with the exact app.
- No separate title bar: the window buttons sit in the tab bar.
- Command history (Ctrl+R) lists commands you actually ran, and never records a password typed into a running program.

Checksums: `SHA256SUMS.txt` (Intel, from CI) and `SHA256SUMS-apple-silicon.txt`.
