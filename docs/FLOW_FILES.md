# .flow files

A `.flow` file describes a setup: what to install, what to run and what to open. Anyone can write one:
- a tutorial ("install Node.js, clone the starter, run it")
- a team ("the tools for this repo")
- you ("my morning apps")

Opening the file with Sentinel Terminal runs it on macOS, Windows and Linux. Sentinel picks the commands for
each OS, so the author writes the file once.

## What happens when you open one

| The flow contains | What you see |
|---|---|
| Only desktop actions (`browser`, `app`, `folder`, `file`) | The apps and pages open. The terminal never appears, and Sentinel quits afterwards if it was not already running. |
| Anything that installs or runs something (`install`, `command`, `clone`, `download`) | Sentinel shows its terminal and **one confirmation that lists every command**. Nothing runs until you click Run (Enter does not approve a flow from a file). Then each step is typed into the terminal, so you see the output and can answer prompts such as a `sudo` password or `[y/N]`. The flow stops at the first step that fails. |

Actions Sentinel does not understand are skipped and listed; they are never guessed.

## Make a flow by asking

In Sentinel, describe the steps and it writes the file:

```text
>make me a workflow called morning that opens gmail, opens spotify and opens ~/projects/api
```

The steps must be ones Sentinel understands: install a package, open a site or an app, open a folder by path,
clone, download, make a folder and go into it, or `run <command>` (or a developer command such as `npm install`).
Anything else is named and left out, never guessed. Then choose where to save: Desktop, this folder,
`~/.sentinel/workflows`, or a path. An existing file is never replaced (`name-2.flow`).

## Format

```json
{
  "schemaVersion": "1.0",
  "metadata": { "id": "node-project", "name": "Node.js project", "description": "..." },
  "actions": [
    { "type": "install", "package": "nodejs" },
    { "type": "clone", "repo": "https://github.com/me/app.git", "into": "~/app" },
    { "type": "command", "command": "npm install", "cwd": "~/app" },
    { "type": "command", "command": "npm run dev", "windows": "npm.cmd run dev", "cwd": "~/app" },
    { "type": "browser", "url": "http://localhost:3000" }
  ]
}
```

Every action may have a `name`, which is shown as the step's title.

### Desktop actions: no terminal

| type | Fields | Example |
|---|---|---|
| `browser` (or `url`, `link`) | `url` or `urls`, optional `app` (`chrome`, `firefox`, `edge`, `safari`, `brave`, ...) | `{ "type": "browser", "app": "chrome", "urls": ["https://youtube.com"] }` |
| `app` | `app`, optional `path` to open in it | `{ "type": "app", "app": "VS Code", "path": "~/app" }` |
| `folder` / `file` | `path` | `{ "type": "folder", "path": "~/Downloads" }` |

Only `http://` and `https://` links are opened. Common app names are translated per OS: "VS Code" becomes
`Visual Studio Code` on macOS and `code` on Windows and Linux; "Chrome" becomes `Google Chrome` or
`chrome` or `google-chrome`.

### Terminal actions

| type | Fields | What runs |
|---|---|---|
| `install` | `package` (one per action) | See below. Skipped when the program is already installed. |
| `command` | `command`, optional `macos` / `linux` / `windows` variants, optional `cwd` | The command in the terminal. On Windows it runs in PowerShell, so give a `windows` variant when the command differs. |
| `clone` | `repo` (https or git@), optional `into` | `git clone` |
| `download` | `url`, optional `to` | `curl -fL -o` (macOS, Linux) or `Invoke-WebRequest` (Windows) |

`cwd` and paths may start with `~`, meaning the home folder on every OS.

### `install`: one name, every OS

| Package | macOS | Windows | Linux |
|---|---|---|---|
| `nodejs` (`node`, `npm`) | `brew install node` | `winget install OpenJS.NodeJS.LTS` | `nodejs npm` from apt / dnf / pacman / zypper |
| `python` (`python3`, `pip`) | `brew install python` | `winget install Python.Python.3.12` | `python3 python3-pip python3-venv` / `python3-pip` / `python python-pip` |
| `git` | brew | `Git.Git` | `git` |
| `vscode` (`code`) | `brew install --cask visual-studio-code` | `Microsoft.VisualStudioCode` | pacman `code`, else snap or flatpak |
| `chrome`, `firefox` | casks | `Google.Chrome`, `Mozilla.Firefox` | flatpak (Chrome), distro package (Firefox) |
| `docker` | `--cask docker` | `Docker.DockerDesktop` | `docker.io` / `moby-engine` / `docker` |
| `java`, `go`, `rust`, `curl`, `wget`, `ffmpeg`, `jq`, `cmake`, `yarn`, `pnpm`, `ollama` | brew | winget | distro packages (rust via rustup; yarn, pnpm via npm; ollama via its installer) |

Any other name is passed to the package manager as written.
- **Linux:** the one command detects apt, dnf, pacman or zypper and uses `sudo`. You type the password
  in the terminal.
- **macOS:** Homebrew must be installed (<https://brew.sh>).
- **Windows:** after `winget`, the terminal reloads `PATH`, so the next step finds the new program.

## Opening flows

- **macOS**: double-click in Finder, or `open -a "Sentinel Terminal" setup.flow`.
- **Windows**: double-click in Explorer (the installer registers `.flow`).
- **Linux**: double-click in the file manager (the packages install a MIME type for `*.flow`), or run
  `sentinel-terminal setup.flow`.
- **From inside Sentinel**:
  - Ask "run the workflow in setup.flow".
  - Or open the Workflow Manager, which lists `.flow` files saved in `~/.sentinel/workflows`.

Examples: [`examples/flows`](../examples/flows).

## Safety

- A flow that runs commands always shows the full list first; nothing runs until you approve.
- Desktop-only flows run without asking. They can only open web links (http/https), apps by name and
  folders.
- Values are quoted by Sentinel; a flow cannot inject shell syntax through a URL, app name, package name
  or path.
