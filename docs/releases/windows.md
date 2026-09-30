## Sentinel Terminal 2.1.0 for Windows

**Downloads**
- `Sentinel.Terminal_2.1.0_x64_en-US.msi`: installer for Windows 10 (1803 or later) and Windows 11.
- `Sentinel.Terminal_2.1.0_x64-setup.exe`: the same app as a per-user setup program.

The installers are not code-signed, so SmartScreen shows "Windows protected your PC": choose "More info", then "Run anyway".

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

**What works on Windows in this release**
- The terminal (PowerShell), tabs and splits, and talking to other terminals.
- AI requests through the built-in model, Ollama or a cloud key. The built-in engine now downloads and unpacks natively on Windows (Vulkan build when `vulkan-1.dll` is present, else CPU), with no console windows popping up.
- The agent's shell commands (run in PowerShell), multi-step chains, workflows (including `.flow` files) and the app functions by request.
- No separate title bar: minimize, maximize and close sit at the right of the tab bar, and the tab bar moves the window.
- Quitting an app by name ("quit notepad") checks the running apps first and asks with the exact name.
- System settings by request, with Windows commands:
  - Wi-Fi and Bluetooth: turn on or off (the same radio switch as the quick settings), status, nearby networks, joining a saved network, paired devices.
  - Brightness (built-in displays), volume and mute, dark mode.
  - Battery, lock screen, and any Settings page ("open display settings").
- Saying only a topic ("bluetooth", "brightness") lists what Sentinel can do for it on Windows ("Did you mean: turn Bluetooth on, ..."). Typing `>` requests completes them.
- When a switch is blocked (no radio, policy, external monitor without brightness control), Sentinel says why and opens the matching Settings page.

**Known gaps on Windows.**
- Some system-information tools still use Unix commands.
- The error watcher's checks.
- ROS 2 detection.

These installers are built by CI from the `release/windows` branch. They were not run on a Windows PC for this release; please report problems.

Checksums: `SHA256SUMS.txt`.
