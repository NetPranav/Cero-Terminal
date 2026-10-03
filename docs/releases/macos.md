## Cero 2.2.0 for macOS

**Downloads**
- `Cero_2.2.0_aarch64.dmg`: Apple Silicon (M1 and later). Built and run on macOS 26.

**First launch.** The app is ad-hoc signed, not notarized. macOS blocks the first launch: open System Settings, then Privacy & Security, and choose "Open Anyway". Drag the new app over an old Sentinel Terminal or Cero in Applications. `.flow` files open with the copy that is installed.

**What changed** (answers to twelve findings from the first Linux test)

| # | You saw | Now |
|---|---|---|
| 1 | "...and save this as a workflow" did nothing | Run the task, then save what really ran as a `.flow`. Every request ends with `Saved workflow "x" (N steps) to <path>` or `Not saved: <reason>`. |
| 2 | Arrow keys moved the grey suggestion and appended it | Left, Right, Up, Down, Home and End only move the cursor. Tab, or Right at the end of the line, accepts. A setting turns Right-to-accept off. |
| 3 | Queued prompts could not be seen | A queue panel and `/queue` commands: view, remove, reorder, clear. |
| 4 | A prompt worked with an API model, not the built-in one | One shared place sets sampling for every provider; one tolerant parser reads every model's answer; after two failed checks the built-in model offers to retry that one request on your API model (it asks first). |
| 5 | Esc did not close Settings | It does, and focus returns to the terminal. |
| 6 | "Open folder gitBrains in VS Code (inside /padhai_in_linux/Projects/)" made files and opened a second window | The real folder is found (the place you name, this folder, usual project folders, then home), opened in one editor window, and nothing is created unless you say "create it". |
| 7 | Wrong folder or app names were not handled | Spelling and case are forgiven, typos ask "Did you mean ...?", two matches ask which, a missing folder or app is reported. Answers are remembered (`forget gitbrains` clears one). "opn firefox" is read as "open firefox". |
| 8 | The chosen provider and model were forgotten | Remembered across restarts; if the provider is not reachable yet it is retried and the reason is shown, never silently replaced by the built-in model. |
| 9 | The status bar said "AI: Off" for a working API or local model | Shows `AI: local`, `AI: API` or `AI: Ollama`; "Off" is only for a stopped built-in engine. |
| 10 | Ctrl+C did not stop a task | Ctrl+C stops the running request and its command; a second press forces it. |
| 11 | The built-in model was right sometimes, random the next time | Decisions are deterministic (temperature 0, one choice, fixed seed, no prompt cache); the prompt is fitted to the context; every action is checked before it runs. Measured numbers: `docs/MODEL_RELIABILITY.md`. |
| 12 | `.flow` files were saved as `.json`; no icon; not tied to the app | Only `.flow` is written (old `.json` flows are migrated, originals kept as `.json.bak`); a document icon; registered on macOS, Windows, Linux (deb, rpm, Arch, Flatpak) and by the AppImage on first run; opening one while Cero is running joins that window. |

Also: API keys are stored in the macOS Keychain or Windows Credential Manager (a private `0600` file on Linux)
instead of browser storage, after the new copy is read back; "list my workflows"; "what do you remember about X".

Not verified yet: the Linux packages, the AppImage registration, the Windows installer registration and the macOS
Finder icon were built from configuration and unit-tested but not run on those systems.


**Teaching Cero.** Cero never learns by watching you. `/learn` teaches the request just above it (only if it worked), `/learn <request> -> <command>` teaches a pair, `/forget` removes one, and `/learning on|off` controls whether it keeps a record of its own failed requests (off by default). See [LEARNING.md](https://github.com/NetPranav/Sentinal-Terminal/blob/main/docs/LEARNING.md).

**Smaller model option.** A 0.5B model (about 470 MB) joins the 1.5B, 3B and 4B choices for slow connections and old machines. Compressing a model file does not shrink it much (measured: 3.4%), so a smaller model is the way to a smaller download. Interrupted downloads resume.

**Renamed.** Sentinel Terminal is now Cero. On first launch `~/.sentinel` moves to `~/.cero`, saved settings and stored API keys carry over, and nothing has to be downloaded again. The `sentinel` command is now `cero`.

Checksums: `SHA256SUMS.txt`.
