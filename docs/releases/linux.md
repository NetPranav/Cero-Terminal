## Sentinel Terminal 2.1.0 for Linux

**Downloads**
| File | For |
|---|---|
| `sentinel-terminal-bin-2.1.0-1-x86_64.pkg.tar.zst` | Arch Linux, Manjaro, EndeavourOS: `sudo pacman -U sentinel-terminal-bin-2.1.0-1-x86_64.pkg.tar.zst` (built on Arch; also installs the `sentinel` and `sentinel-shell` launchers and a Dolphin "Open in Sentinel" menu) |
| `Sentinel.Terminal_2.1.0_amd64.deb` | Ubuntu 22.04 or later, Debian 12, Mint, Pop!_OS: `sudo apt install ./Sentinel.Terminal_2.1.0_amd64.deb` |
| `Sentinel.Terminal-2.1.0-1.x86_64.rpm` | Fedora 38 or later, openSUSE: `sudo dnf install ./Sentinel.Terminal-2.1.0-1.x86_64.rpm` |
| `Sentinel.Terminal_2.1.0_amd64.AppImage` | Any other x86_64 distribution: `chmod +x` it and run it |

Double-clicking a `.flow` file opens it with Sentinel (the packages register the file type). All packages need WebKitGTK 4.1 (installed automatically by pacman, apt and dnf). The built-in model downloads its engine (the Vulkan build when `libvulkan.so.1` is present, else the CPU build) and the 2 GB model from Settings, AI, Built-in model. Ollama and cloud keys work too.

These packages are built by CI from the `release/linux` branch. They were not run on a Linux desktop for this release; please report problems.

**Open a .flow file and it runs.** A `.flow` file (from a tutorial, a teammate or you) lists what to install, run and open. Sentinel picks the commands for this OS.
- A flow that only opens apps and links (Chrome, YouTube, VS Code) runs without showing the terminal.
- A flow that installs or runs things opens the terminal, lists every command, waits for you to click Run, then types each step so you can see output and answer prompts.

See [FLOW_FILES.md](https://github.com/NetPranav/Sentinal-Terminal/blob/main/docs/FLOW_FILES.md) and the [example flows](https://github.com/NetPranav/Sentinal-Terminal/tree/main/examples/flows).

**New in 2.1.0** (all of it applies on Linux):
- **Make a workflow by asking**: "make me a workflow that ..." writes a `.flow` file from the steps you list, asks where to keep it (Desktop, this folder, Sentinel workflows, or a path) and never replaces an existing file. Steps it does not understand are named and left out, never guessed.
- **Close a port by number**: "close port 8765" finds what is listening on exactly that port, shows its name and PID, asks, stops it normally and checks that the port is free.
- **Wi-Fi is exact**: turning Wi-Fi on or off and joining a network use the exact command, shown before it runs. The built-in model is no longer involved (it once invented a password).
- **Fixed**: a workflow with relative folders stopped at step 3; opening Sentinel on a folder named `$(...)` could run text from the name; several drivers quoted names unsafely.
- **Security**: Sentinel no longer asks for your login password (high-risk commands need a click on Run). `~/.sentinel` is readable by you only. See [SECURITY.md](https://github.com/NetPranav/Sentinal-Terminal/blob/main/SECURITY.md).

See also the macOS release notes for the rest; everything there applies on Linux. The window has no separate title bar: minimize, maximize and close sit at the right of the tab bar. ROS 2 pipelines ("run the ros2 talker and listener demo") open each node in its own terminal when ROS 2 is installed.

Checksums: `SHA256SUMS.txt`.
