# Feature matrix: Linux and Windows

One row for every feature in [../FEATURES.md](../FEATURES.md), plus the Linux and macOS features removed from this
branch in roadmap 1.4. Updated 2026-10-13.

- **Windows status:** `same` (OS-neutral code, runs unchanged), `adapted` (rewritten for Windows), `removed` (not
  carried over). A note says where an `adapted` feature is still a stub or only partly done.
- **Verified:** `yes` only when it has run on a real Windows PC (Phase 8). Nothing is `yes` yet; unit tests and
  `cargo xwin check` do not count (ROADMAP principle 4).
- **Phase:** the ROADMAP subphase that finishes or verifies the row.

## Requests in plain language
| Feature | Linux | Windows | Phase | Verified | Note |
|---|---|---|---|---|---|
| `>` requests, plan, approval card, real-output answer | works | same | 4.1, 4.2 | no | The agent shell is `powershell.exe`; the system prompt says PowerShell 5.1 |
| Requests answered from tested code (fast paths) | works | adapted | 4.3 | no | Most `shell.execute` fast paths in `AgentLoop.ts` are still Linux commands (marked TODO 4.3) and must be rewritten or removed |
| Multi-action requests in steps | works | same | 4.7 | no | Step preconditions of the decomposer are still POSIX (TODO 4.7) |
| Open folders and apps by name, fuzzy and "Did you mean" | works | adapted | 3.6, 3.7 | no | App names resolve through the Start menu and winget ids; paths need `src/platform/paths.ts` |
| Project creation with recommended defaults | works | adapted | 4.2 | no | `.venv\Scripts\Activate.ps1`; `./run.sh` fallback open (TODO 4.2) |
| Suggested fix for failed commands (`Tab`, `>fix`) | works | adapted | 4.3 | no | The deterministic oracle keeps its Unix rules and has no Windows rules yet |
| `>what did you just do`, `>undo last step` | works | adapted | 3.7 | no | Delete goes to the Recycle Bin |
| Queue panel, `Ctrl+C` stop | works | adapted | 2.4 | no | Stopping a run needs Job Objects (2.4) |

## Models
| Feature | Linux | Windows | Phase | Verified | Note |
|---|---|---|---|---|---|
| Built-in `llama-server` and Qwen models | works | adapted | 2.5 | no | Windows release assets (CPU, Vulkan, ARM64 CPU); extraction, parent-death handling and orphan reaping open |
| GPU: Vulkan, CUDA | works (Vulkan, CUDA) | adapted | 2.5 | no | Vulkan chosen when the loader exists; CUDA builds open |
| Deterministic decisions, action checks | works | same | 4.6 | no | Reliability on Windows prompts is unmeasured |
| Providers: Ollama, OpenAI, Anthropic, Groq, DeepSeek, OpenRouter, custom | works | same | 8.4 | no | OS-neutral |
| Fine-tuning from learned corrections (CeroSerl) | works | removed | 4.6 | no | The trainer was an Apple MLX script. Replacement idea: llama.cpp LoRA training on Windows |
| Measured reliability document | works | adapted | 4.6 | no | Windows numbers go to `MODEL_RELIABILITY_WINDOWS.md` |

## `.flow` files and workflows
| Feature | Linux | Windows | Phase | Verified | Note |
|---|---|---|---|---|---|
| Run a `.flow`, double-click | works | adapted | 2.6, 6.2 | no | File association is a stub (`file_association.rs`) |
| Make a flow by asking, save what a request did | works | same | 4.7 | no | A flow from another OS must not run in PowerShell silently (4.7) |
| Starter workflows | works | adapted | 4.7 | no | Rewritten as PowerShell |
| Workflow Manager (`Ctrl+Shift+W`), `~/.cero/workflows/` | works | same | 3.6 | no | Folder is `%USERPROFILE%\.cero\workflows` |

## Terminal
| Feature | Linux | Windows | Phase | Verified | Note |
|---|---|---|---|---|---|
| WebGL xterm.js, tabs, split panes, search | works | same | 8.3 | no | |
| PTY and shells | works | adapted | 2.1, 2.3, 3.2 | no | `portable-pty` (ConPTY). Shell choice, fallback and exit detection still to do; Git Bash and WSL profiles open |
| Current folder of the shell (breadcrumbs, `cd`) | `/proc` | adapted | 2.2, 3.3 | no | Needs the OSC 9;9 / OSC 7 reports from shell integration |
| Prompt detection, suggestions, fuzzy history (`Ctrl+R`) | works | adapted | 3.4, 3.5 | no | PowerShell prompt patterns and ConPTY fixtures open |
| Command palette, Settings, help, marketplace shortcuts | works | adapted | 5.2 | no | Keys checked on a Windows keyboard in 8.6 |
| Zen and Visual mode, status bar | works | same | 5.5, 8.6 | no | Status bar CPU and RAM read through `sysinfo` |
| Window controls | custom | adapted | 5.1 | no | Windows caption buttons and snap layouts open |

## Teaching
| Feature | Linux | Windows | Phase | Verified | Note |
|---|---|---|---|---|---|
| `/learn`, `/learned`, `/forget`, `/learning` | works | same | 8.4 | no | |
| Self-play (Reflexion, Dream-State) | works | adapted | 4.6 | no | PowerShell templates written; the Shadow-PTY sandbox that checks them is still POSIX (TODO 4.3, 4.6) |

## Safety
| Feature | Linux | Windows | Phase | Verified | Note |
|---|---|---|---|---|---|
| Command safety guardian, AST check, protected paths | works | adapted | 4.4 | no | Unix rules stay (Git Bash, WSL); no Windows rules yet. Today every Windows command is rated alike |
| Approval card, `.flow` command list | works | same | 4.4 | no | |
| `sudo` password dialog | works | removed | 4.4 | no | Windows has no `sudo`. Replacement: `Start-Process -Verb RunAs` after a consent card (UAC) |
| Secrets redaction, SHA-256 verified downloads | works | same | 2.5 | no | |
| API keys in the system keychain | Secret Service | adapted | 2.7 | no | Windows Credential Manager |
| Audit log | works | same | 4.4 | no | Windows paths |

## System knowledge and tools
| Feature | Linux | Windows | Phase | Verified | Note |
|---|---|---|---|---|---|
| System scan into `system_profile.json` | works | adapted | 4.1 | no | Stub ("not available on Windows yet"); CIM, `Get-StartApps`, winget plan |
| Tool knowledge (103 tools in `tools/`) | works | adapted | 4.5 | no | All list `windows`; examples reworked to PowerShell, checker script open |
| Wi-Fi, Bluetooth, brightness, volume, dark mode, battery, lock, settings pages | works | adapted | 3.7 | no | Drivers are stubs until Windows parsers exist |
| Network, ports, process list and kill | works | adapted | 3.7 | no | PowerShell commands (`Get-NetTCPConnection`, `Get-Process`) |
| Files: search, grep, trash | works | adapted | 3.7 | no | PowerShell; trash is the Recycle Bin |
| Service watching and logs | systemd, journald | adapted | 2.8 | no | Windows services and Event Log |

## Desktop integration
| Feature | Linux | Windows | Phase | Verified | Note |
|---|---|---|---|---|---|
| `cero` command | `~/.local/bin` | adapted | 3.8 | no | Launcher script exists (`assets/cli/cero.js`); installing it from Settings is a stub |
| VS Code and Cursor terminal profiles | works | adapted | 3.8 | no | Stub; docs say "planned" |
| `.flow` type and icon | desktop file | adapted | 2.6, 6.2 | no | Registry association |
| Installers | deb, rpm, AppImage, Arch | adapted | 6.1 | no | MSI and NSIS configured; not run |

## Look
| Feature | Linux | Windows | Phase | Verified | Note |
|---|---|---|---|---|---|
| Matte grayscale, no emoji, full-screen Settings and onboarding | works | same | 5.5, 8.6 | no | |

## Removed in 1.4 (Linux or macOS only)
| Feature | Linux or macOS | Windows | Reason | Windows replacement idea |
|---|---|---|---|---|
| ROS environment helpers | Linux | removed | No ROS on Windows in scope | none |
| Hyprland and dotfile "rice" helpers | Linux | removed | Linux desktop only | Edit the PowerShell `$PROFILE` and the Windows Terminal `settings.json` (3.2) |
| systemd service watching | Linux | removed | No systemd | Windows services and Event Log (2.8) |
| File-manager "Open in Cero" (Nautilus, Nemo, Caja, Dolphin, Thunar), Finder | Linux, macOS | removed | No such file managers | Explorer context menu in the installer (6.2) |
| AppImage file-association prompt | Linux | removed | No AppImage | Installer registers the association |
| Linux desktop and systemd fast paths | Linux | removed | Linux only | PowerShell fast paths (4.3) |
| macOS rules in the deterministic oracle, brew rule | macOS | removed | macOS only | winget, Docker Desktop and execution-policy rules (4.3) |
| macOS and POSIX tldr pages | both | removed | Wrong OS | Windows pages (4.5) |
| Spotlight search | macOS | removed | macOS only | `Get-ChildItem` search (done) |
| `developer.xcode` tool | macOS | removed | macOS only | Visual Studio Build Tools tool (idea) |
| SystemAdvisor ("improve my computer") | Linux | removed | POSIX snapshot | Port with CIM snapshots (3.7) |
| ProcessPortManager | Linux | removed | Unused, ports are covered by PortControl | none |
| MacSystemParsers, DesktopCommands, InputDaemonProbe | macOS | removed | macOS only | none |
| MLX fine-tuning script | macOS | removed | Apple only | See "Fine-tuning" above (4.6) |
| Headless stress harness | Linux | removed | Used a POSIX pty relay | ConPTY harness (8.x) |
| Linux and macOS packaging, release and sync scripts | both | removed | Windows-only branch | none |
