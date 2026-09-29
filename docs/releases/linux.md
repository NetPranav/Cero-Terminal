## Sentinel Terminal 2.1.0 for Linux

**Downloads**
| File | For |
|---|---|
| `sentinel-terminal-bin-2.1.0-1-x86_64.pkg.tar.zst` | Arch Linux, Manjaro, EndeavourOS: `sudo pacman -U sentinel-terminal-bin-2.1.0-1-x86_64.pkg.tar.zst` (built on Arch; also installs the `sentinel` and `sentinel-shell` launchers and a Dolphin "Open in Sentinel" menu) |
| `Sentinel.Terminal_2.1.0_amd64.deb` | Ubuntu 22.04 or later, Debian 12, Mint, Pop!_OS: `sudo apt install ./Sentinel.Terminal_2.1.0_amd64.deb` |
| `Sentinel.Terminal-2.1.0-1.x86_64.rpm` | Fedora 38 or later, openSUSE: `sudo dnf install ./Sentinel.Terminal-2.1.0-1.x86_64.rpm` |
| `Sentinel.Terminal_2.1.0_amd64.AppImage` | Any other x86_64 distribution: `chmod +x` it and run it |

All packages need WebKitGTK 4.1 (installed automatically by pacman, apt and dnf). The built-in model downloads its engine (the Vulkan build when `libvulkan.so.1` is present, else the CPU build) and the 2 GB model from Settings, AI, Built-in model. Ollama and cloud keys work too.

These packages are built by CI from the `release/linux` branch. They were not run on a Linux desktop for this release; please report problems.

**New in 2.1.0**: see the macOS release notes. Everything there applies on Linux. ROS 2 pipelines ("run the ros2 talker and listener demo") open each node in its own terminal when ROS 2 is installed.

Checksums: `SHA256SUMS.txt`.
