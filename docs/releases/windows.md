## Sentinel Terminal 2.1.0 for Windows

**Downloads**
- `Sentinel.Terminal_2.1.0_x64_en-US.msi`: installer for Windows 10 (1803 or later) and Windows 11.
- `Sentinel.Terminal_2.1.0_x64-setup.exe`: the same app as a per-user setup program.

The installers are not code-signed, so SmartScreen shows "Windows protected your PC": choose "More info", then "Run anyway".

**What works on Windows in this release**
- The terminal (PowerShell), tabs and splits, and talking to other terminals.
- AI requests through the built-in model, Ollama or a cloud key. The built-in engine now downloads and unpacks natively on Windows (Vulkan build when `vulkan-1.dll` is present, else CPU), with no console windows popping up.
- The agent's shell commands (run in PowerShell), multi-step chains, workflows (including `.flow` files) and the app functions by request.

**Known gaps on Windows.** These still use Unix commands and do not work yet:
- Wi-Fi and Bluetooth control, and some system-information tools.
- The error watcher's checks.
- ROS 2 detection.

These installers are built by CI from the `release/windows` branch. They were not run on a Windows PC for this release; please report problems.

Checksums: `SHA256SUMS.txt`.
