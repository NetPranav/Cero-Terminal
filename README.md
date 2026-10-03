<div align="center">

<img src="assets/brand/cero-logo-animation.gif" alt="Cero" width="260" />

# Cero

**A terminal that also takes requests in plain language, runs `.flow` setup files on any OS, and can use a model that runs on your own computer.**

[![CI](https://github.com/NetPranav/Sentinal-Terminal/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/NetPranav/Sentinal-Terminal/actions/workflows/ci.yml)
[![Release](https://img.shields.io/badge/release-2.2.0-1F222E)](https://github.com/NetPranav/Sentinal-Terminal/releases)
![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-1F222E)
[![License: MIT](https://img.shields.io/badge/license-MIT-1F222E)](LICENSE)

[Download](#download) · [Why Cero](#why-cero) · [.flow files](#flow-files-write-a-setup-once-run-it-anywhere) · [What you can ask](#what-you-can-ask) · [Open things by name](#open-folders-and-apps-by-name) · [Teaching](#teaching-cero) · [AI choices](#choose-your-ai) · [Build](#build-from-source) · [Docs](#documentation)

<img src="docs/images/requests.png" alt="Cero answering requests: the total of a CSV column, the last two errors in a log, and suggestions for a bare 'bluetooth'" width="820">

<sub>The logo animation as a video: [assets/brand/cero-logo-animation.mp4](assets/brand/cero-logo-animation.mp4)</sub>

</div>

Cero is a desktop terminal (Tauri v2, Rust, React 19, xterm.js). Commands you type run in a real
shell: zsh or bash on macOS and Linux, PowerShell on Windows. Start a line with `>` and it becomes a request:

```text
~/demo % >what is the total of the score column in data.csv?
  ✓ The total of the score column in data.csv is 42.5 (3 rows).
```

Cero works out the commands, shows the ones that change anything for your approval, runs them in your
terminal and answers from their real output. Common requests run from tested code without a model call.
Everything else goes to the AI you choose (see [Choose your AI](#choose-your-ai)).

## Why Cero

- **Plain language, real shell.** Ask for what you want; see the exact commands before anything that changes your
  files, system or network runs. Nothing is hidden from you.
- **`.flow` files run on any OS.** One file, one double-click: Cero picks the right commands for macOS, Windows or Linux.
- **It finds the real thing.** Say "open the folder gitBrains in VS Code" and Cero looks for the folder (spelling and case
  forgiven), asks when two match, and never creates a folder when you asked to open one.
- **Same answer every time.** The built-in model is run deterministically; requests that code can answer never reach it.
- **It learns only when you say so.** `/learn`, `/forget`. Nothing is learned by watching you.
- **You can stop it.** Ctrl+C stops a running request and its command; waiting requests sit in a queue you can see and edit.
- **Private by default.** The built-in model and Ollama keep requests on your computer. API keys live in the system keychain.

## Demo

<div align="center">
<img src="docs/media/flow-demo.gif" alt="Double-clicking dev-setup.flow: Cero lists every command, waits for a click on Run, then types each step into the terminal" width="820">

Double-clicking a `.flow` file: every command is listed, nothing runs until you click Run, then each step is typed into the terminal.
</div>

## .flow files: write a setup once, run it anywhere

A `.flow` file lists what to install, run and open. A tutorial, a teammate or you can write one. Double-click
it and Cero runs it on macOS, Windows or Linux, choosing the right commands for that system.

```json
{
  "schemaVersion": "1.0",
  "metadata": { "id": "node-project", "name": "Node.js project" },
  "actions": [
    { "type": "install", "package": "nodejs" },
    { "type": "clone", "repo": "https://github.com/me/app.git", "into": "~/app" },
    { "type": "command", "command": "npm install", "cwd": "~/app" },
    { "type": "command", "command": "npm run dev", "windows": "npm.cmd run dev", "cwd": "~/app" },
    { "type": "browser", "url": "http://localhost:3000" }
  ]
}
```

| The flow contains | What happens |
|---|---|
| Only desktop actions: open Chrome, YouTube, VS Code, a folder | They open. **The terminal never appears**, and Cero quits afterwards if it was not already running. |
| Anything that installs or runs something | The terminal opens with one dialog listing every command. **Nothing runs until you click Run** (Enter does not approve a flow from a file). Each step is then typed into the terminal, so you see the output and can answer a `sudo` password or `[y/N]`. The flow stops at the first failing step. |

`install` takes one name for every OS. `nodejs` becomes `brew install node`, `winget install OpenJS.NodeJS.LTS`
or the apt, dnf, pacman or zypper package, whichever the machine has. Values are quoted by Cero, so a
flow cannot inject shell syntax through a URL, name or path. Every run is written to the audit log.

<table>
<tr>
<td width="50%"><img src="docs/images/flow-approval.png" alt="The approval dialog for a .flow file, listing five commands"></td>
<td width="50%"><img src="docs/images/flow-run.png" alt="The same flow running step by step in the terminal and finishing"></td>
</tr>
<tr>
<td align="center">One approval lists every command</td>
<td align="center">Steps typed into the terminal, output visible</td>
</tr>
</table>

### Make one by asking

You do not have to write the JSON. Tell the terminal the steps:

```text
>make me a workflow called dev setup that makes a folder called demo-project, goes into it,
 initializes git, creates a package.json with npm init -y, lists the files and opens textedit
```

Cero shows the steps in plain words, then asks where to keep the file: **1** Desktop, **2** this folder,
**3** `~/.cero/workflows` (listed in the Workflow Manager), or a path you type. It never replaces an existing
file, and a step it cannot understand is named and left out, never guessed.

<table>
<tr>
<td width="50%"><img src="docs/images/make-workflow.png" alt="The save dialog: five steps in plain words and the choice of Desktop, this folder, Cero workflows or another path"></td>
<td width="50%"><img src="docs/images/run-workflow.png" alt="Double-clicking the saved file shows every command and waits for a click on Run"></td>
</tr>
<tr>
<td align="center">Describe it, choose where it goes</td>
<td align="center">Double-click it: every command, then your click</td>
</tr>
</table>

### Save what you just did

Add the save words anywhere in a request. Cero runs the task first, then writes a `.flow` from the steps that really ran:

```text
>open spotify and save this as a workflow called my music on the desktop
>install node, save this as a workflow called node setup, then open vs code
>save the last 3 steps as a workflow called deploy
```

Every request to save ends with one plain line: `Saved workflow "name" (N steps) to <path>` or `Not saved: <reason>`.
Cero only ever writes `.flow` files (an old `.json` workflow is migrated, the original kept as `.json.bak`), and the file
type has its own icon and opens in Cero on macOS, Windows and Linux.

Format, actions and the package table: [docs/FLOW_FILES.md](docs/FLOW_FILES.md). Examples: [examples/flows](examples/flows).

## Open folders and apps by name

```text
>Please open a folder named gitBrains in VS Code. It is inside /padhai_in_linux/Projects/
>open crome
>cd gitbrains
```

- The place you name is searched first (as written, then under your home folder), then the current folder, your usual project
  folders and your home folder.
- `gitBrains`, `git-brains` and `Git Brains` are the same name. A typo asks "Did you mean ...?". Two matches ask which one.
  A name that is not found is reported with where Cero looked, and **nothing is created or opened**.
- The editor gets the folder in one window (no second window). Apps are found in your installed apps (desktop entries on Linux,
  `/Applications` on macOS, the Start menu on Windows); an app that is not installed is reported, never guessed.
- Your answers are remembered (`what do you remember about gitbrains`, `forget gitbrains`).
- **Is it running?** `>is the amphetmine application running or not` lists what is really running and matches the name loosely
  (case, spelling, a typo): "Amphetamine is running. (You wrote "amphetmine"; that is the closest running app.)" If it is not
  running, Cero says whether it is installed.
- **Fallbacks look things up; they do not guess.** When a command fails because a name was not found (a `pgrep` that matched
  nothing, a folder that does not exist, an app name that is not installed, a program that is not on the PATH), Cero checks the real
  state of your computer and answers from that: the running apps, your folders, your installed apps, the programs on your PATH. It
  asks before running anything it had to correct, and never closes an app on a guess.
- A slipped first word is read as intended: `opne fldor docs in cod` becomes `open folder docs in code`.

## Stop it, queue it

- **Ctrl+C** stops the running request and the command it started; press it again to force the stop.
- Requests typed while one is running **wait in a queue**. `/queue` shows them; remove, move or clear them there.
- **Esc** closes Settings. Left and right arrows only move the cursor; the grey suggestion is accepted with Tab (or Right at the end of the line).

## What you can ask

Type `>` followed by the request. Examples that were run in the release build:

| Request | What Cero does |
|---|---|
| `>what is the total of the score column in data.csv?` | Sums the column with a tested recipe and answers "42.5 (3 rows)" |
| `>show the last 2 errors in logs/app.log` | Prints the two lines |
| `>create a folder demo-app, go into it, run git init, then npm init -y, then list the files` | Plans all five steps, asks once (listing `mkdir`, `git init` and `npm init`), runs them, and leaves the shell in the new folder |
| `>open a new tab here and run python3 -m http.server 8765` | Asks once, opens the tab, starts the server there |
| `>what's running in my terminals` | Lists every terminal, its folder and its running command, without a model call |
| `>stop the server` | Confirms, then sends Ctrl+C to that tab |
| `>make me a workflow that installs node and opens youtube in safari` | Writes a `.flow` file from the steps and asks where to save it (see above) |
| `>close port 8765` | Finds what listens on exactly that port, names it (Python, PID 70334), asks, stops that process normally and checks the port is free. `force close port 8765` for `kill -9` |
| `>turn wifi off`, `>connect to wifi Home` | The exact `networksetup` / `nmcli` / Windows radio command, shown before it runs. Never asks the model, never invents a password |
| `>quit textedit`, `>terminate or stop the claude application` | Lists the running apps first, matches the name in any case ("claude" finds "Claude"), asks with the exact app, quits it normally and checks that it closed. If no running app has that name, it says so and closes nothing |
| `>run npm test in tab 2` | Types it there, or refuses and says why when that tab is busy or at a password prompt |
| `>why is npm test failing in api?` | Runs it there and explains the failure from the code it points to |
| `>fix buggy.py so it runs` | Runs the file, shows the change for approval (the original is kept as `.bak`), runs it again |
| `>open settings`, `>show my command history`, `>switch to zen mode`, `>go to tab 2` | The app's own functions |
| `>run the workflow in setup.flow` | Runs a flow from inside the terminal |

Commands that change files, the system or the network ask first and show exactly what will run. Reading
private keys or credential files always asks. Keys and tokens are masked before any output reaches a model.

<table>
<tr>
<td width="50%"><img src="docs/images/terminals.png" alt="A server started in a second tab, and the answer to 'what's running in my terminals'"></td>
<td width="50%"><img src="docs/images/chain.png" alt="A five-step request that created a project folder, a git repository and package.json"></td>
</tr>
<tr>
<td align="center">Other terminals, by request</td>
<td align="center">A multi-step request, planned and run</td>
</tr>
</table>

## Teaching Cero

Cero never learns by watching you.

| You type | What happens |
|---|---|
| `/learn` | Teaches the request just above, if it worked with one command. |
| `/learn compress backups -> tar -czf backups.tgz ./backups` | Teaches a request and its command directly. |
| `/learned`, `/forget <id>` | See what was taught; remove one. |
| `/learning on` / `off` | Lets Cero keep a local record of its own failed requests. Off by default. |

A request that failed is never learnable. Details: [docs/LEARNING.md](docs/LEARNING.md).

## System settings by request

`>turn wifi off`, `>set brightness to 60`, `>mute`, `>turn on dark mode`, `>show paired bluetooth devices`,
`>open sound settings`. Each request becomes the native command for your OS. Say only the topic (`>bluetooth`)
and Cero lists what it can do for it on this OS. Typing `>turn blu` completes the request.

| | macOS | Windows | Linux |
|---|---|---|---|
| Wi-Fi on/off, status, scan, join | `networksetup` | Windows radio API (same switch as Quick Settings), `netsh wlan` | `nmcli` |
| Bluetooth on/off, status, devices | `blueutil` for on/off (else the settings page), `system_profiler` | Windows radio API, `Get-PnpDevice` | `bluetoothctl`, `rfkill` |
| Brightness | Brightness keys; exact levels with the `brightness` tool | WMI (built-in displays) | `brightnessctl`, or GNOME over D-Bus |
| Volume and mute | AppleScript | Core Audio | `wpctl`, `pactl` or `amixer` |
| Dark mode | AppleScript | Registry (apps and system) | GNOME `gsettings`, KDE `plasma-apply-colorscheme` |
| Battery, lock screen | `pmset` | `Win32_Battery`, `LockWorkStation` | `/sys/class/power_supply`, `loginctl` |
| Open a settings page | `x-apple.systempreferences:` | `ms-settings:` | GNOME Settings or KDE System Settings |

Changes ask first. When a switch is blocked (no radio, a policy, an external monitor without brightness
control), Cero says why and opens the matching settings page.

## Choose your AI

<div align="center">
<img src="docs/images/settings.png" alt="Settings: choose the built-in model, Ollama or a cloud service" width="720">
</div>

One question: which AI answers your requests. Your choice is remembered across restarts, and the status bar shows what is
really answering (`AI: local`, `AI: Ollama`, `AI: API`).

| Choice | Notes |
|---|---|
| Built-in model | Runs on your computer through llama.cpp (Metal on macOS, Vulkan or CPU on Windows and Linux). No account. |
| Ollama | Any model you already run. |
| Cloud key | OpenAI, Anthropic, Groq, DeepSeek, OpenRouter or any OpenAI-compatible endpoint. Keys are stored in the macOS Keychain or Windows Credential Manager (a private file on Linux), not in browser storage. |

Built-in model sizes (Settings, Advanced): **0.5B** (about 470 MB, for slow connections and old machines), **1.5B** (1.1 GB),
**3B** (2.1 GB, the default) and **4B** (2.5 GB). A quantized model cannot be shrunk much by compressing it (measured:
3.4%), so a smaller model is the way to a smaller download. Interrupted downloads resume, and every file is checked against
its SHA-256.

**How reliable is the built-in model?** Measured on a 3B model, 71 cases, the whole path (code routes, then the model, then the
safety check): the same prompt gave the same answer every time (flip rate 0.0%), and 85.9% of cases were right on the first
try. That is below the 95% we are aiming for, so the code answers more requests itself with every release. Method, numbers and
the known misses: [docs/MODEL_RELIABILITY.md](docs/MODEL_RELIABILITY.md). If the built-in model fails its safety check twice
and an API model is set up, Cero offers to retry that one request there (it asks first).

## Download

Version 2.2.0. Sentinel Terminal is now **Cero**. Each platform has its own release, built from its own branch; get the
newest one for your system from the [Releases page](https://github.com/NetPranav/Sentinal-Terminal/releases).

| Platform | File |
|---|---|
| macOS, Apple Silicon | `Cero_2.2.0_aarch64.dmg` |
| Arch, Manjaro, EndeavourOS | `cero-terminal-bin-2.2.0-1-x86_64.pkg.tar.zst` |
| Ubuntu 22.04+, Debian 12, Mint, Pop!_OS | `Cero_2.2.0_amd64.deb` |
| Fedora 38+, openSUSE | `Cero-2.2.0-1.x86_64.rpm` |
| Other x86_64 Linux | `Cero_2.2.0_amd64.AppImage` |
| Windows 10 (1803+) and 11 | `Cero_2.2.0_x64_en-US.msi` or `Cero_2.2.0_x64-setup.exe` |

If a 2.2.0 file for your system is not listed on the Releases page yet, that platform's build has not been published;
the 2.1.0 releases (named Sentinel Terminal) are still there. Each release has a `SHA256SUMS.txt`.

**Coming from Sentinel Terminal?** Install Cero and open it: your `~/.sentinel` folder moves to `~/.cero`, your
settings and saved keys carry over, and the model does not have to be downloaded again. The `sentinel` command is now `cero`.

The optional `cero` command opens the app in a folder or runs a `.flow` file from any shell: see [assets/cli](assets/cli).

**First launch**
- **macOS:** the app is not notarized. macOS blocks the first launch. Open System Settings, then Privacy & Security, and choose "Open Anyway".
- **Windows:** the installers are not code-signed. SmartScreen shows "Windows protected your PC". Choose "More info", then "Run anyway".
- **Linux:**
  - Install the package: `sudo pacman -U ...`, `sudo apt install ./...deb` or `sudo dnf install ./...rpm`.
  - The packages need WebKitGTK 4.1, which the package manager installs.
  - The packages also register the `.flow` file type.

### How well each platform is tested

| | macOS | Linux | Windows |
|---|---|---|---|
| Builds and unit tests in CI (2,390+ tests) | Yes | Yes | Yes |
| Headless run of 120 complex requests against the real agent | Yes (macOS) | Not yet | Not yet |
| Run by hand in the release build | Yes, Apple Silicon on macOS 26 | Not yet | Not yet |
| `.flow` file type, icon and double-click | Built; checked in the macOS build | Packages written; not run on a Linux desktop | Installer written; not run on a Windows PC |

Linux and Windows builds come from CI and have not been run on those systems yet. The checklist for testing them is
[docs/LINUX_TEST_REPORT.md](docs/LINUX_TEST_REPORT.md). Please [open an issue](https://github.com/NetPranav/Sentinal-Terminal/issues)
if something does not work on your system.

## Build from source

Requirements: Node.js 20+, Rust (stable), and the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)
for your OS (WebKitGTK 4.1 on Linux, WebView2 on Windows).

```bash
npm install
npm run tauri dev          # run the app in development
npm run check:triple       # tests, production build and cargo check
npm run bundle:dmg         # macOS installer (bundle:deb, bundle:rpm, bundle:appimage on Linux)
```

Other scripts:
- `npm run cli`: the agent in a plain terminal, useful for trying requests without the window.
- [`assets/cli`](assets/cli): the `cero` command (`cero ~/project`, `cero setup.flow`) for macOS, Linux and Windows.
- `npm run stress`: the complex-request suite against a running local model.
- `npm run smoke:engine`: checks that a llama.cpp server starts and accepts Cero's grammar.

Releases: `scripts/release.sh macos|linux|windows|all` pushes the platform branches (`release/macos`,
`release/linux`, `release/windows`). CI then builds and publishes each release.

## Documentation

| | |
|---|---|
| [docs/FLOW_FILES.md](docs/FLOW_FILES.md) | The `.flow` format and how each OS runs it |
| [docs/LEARNING.md](docs/LEARNING.md) | Teaching Cero |
| [docs/MODEL_RELIABILITY.md](docs/MODEL_RELIABILITY.md) | How the built-in model is measured, and the results |
| [docs/LINUX_TEST_REPORT.md](docs/LINUX_TEST_REPORT.md) | What was checked, and what still needs a real Linux desktop |
| [docs/completed_roadmap.md](docs/completed_roadmap.md) | The record of the 2.2.0 work |
| [docs/releases](docs/releases) | Release notes per platform |
| [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md) | Where things live in the code |
| [SECURITY.md](SECURITY.md) · [CONTRIBUTING.md](CONTRIBUTING.md) | Reporting a problem; contributing |

## License

[MIT](LICENSE)
