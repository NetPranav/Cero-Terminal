# .flow files

A `.flow` file describes a setup: what to install, what to run and what to open. Anyone can write one:
- a tutorial ("install Node.js, clone the starter, run it")
- a team ("the tools for this repo")
- you ("my morning apps")

Opening the file with Cero runs it on macOS, Windows and Linux. Cero picks the commands for
each OS, so the author writes the file once.

## What happens when you open one

| The flow contains | What you see |
|---|---|
| Only desktop actions (`browser`, `app`, `folder`, `file`) | The apps and pages open. The terminal never appears, and Cero quits afterwards if it was not already running. |
| Anything that installs or runs something (`install`, `command`, `clone`, `download`) | Cero shows its terminal and **one confirmation that lists every command**. Nothing runs until you click Run (Enter does not approve a flow from a file). Then each step is typed into the terminal, so you see the output and can answer prompts such as a `sudo` password or `[y/N]`. The flow stops at the first step that fails. |

Actions Cero does not understand are skipped and listed; they are never guessed.

## Make a flow by asking

In Cero, describe the steps and it writes the file:

```text
>make me a workflow called morning that opens gmail, opens spotify and opens ~/projects/api
```

The steps must be ones Cero understands: install a package, open a site or an app, open a folder by path,
clone, download, make a folder and go into it, or `run <command>` (or a developer command such as `npm install`).
Anything else is named and left out, never guessed. Then choose where to save: Desktop, this folder,
`~/.cero/workflows`, or a path. An existing file is never replaced (`name-2.flow`).

### Save what you just did

Add the save words anywhere in a request and Cero runs the task first, then writes a `.flow` from the
steps that really ran:

```text
>open spotify and save this as a workflow
>open spotify and save it as a workflow called my music on the desktop
>install node, save this as a workflow called node setup, then open vs code
>save this as a workflow called nightly
>save the last 3 steps as a workflow called deploy
```

Every request to save ends with one plain line: `Saved workflow "name" (N steps) to <path>`, or
`Not saved: <reason>` (the task failed, you cancelled, nothing in it can be repeated, or there is nothing earlier to
save). Failed steps and your own questions are never saved. If the task fails half way, Cero asks whether to keep
the steps that worked. Without a name it suggests one and lets you type another. Run it later with
`run the workflow <name>`, or double-click the file.

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

## Cero only writes `.flow`

Cero strictly creates and exports `.flow` files for all workflows and recorded macros. Legacy `.json` workflows located in `~/.cero/workflows` are automatically migrated to `.flow` (preserving the original as `.json.bak`). When both `.flow` and `.json` exist for a workflow, `.flow` is canonical.

## Opening flows

Double-clicking a `.flow` file opens it directly in Cero across all supported platforms:

- **macOS**:
  - Registered with UTI `com.cero.flow` (`public.filename-extension = flow`) conforming to `public.json` and `public.data` with handler rank `Owner`.
  - Displays the custom grayscale document icon (`flow.icns`).
  - Open via Finder double-click or CLI: `open -a "Cero" setup.flow`.
  - *Resetting association:* If another app has hijacked `.flow`, refresh LaunchServices:
    ```bash
    /System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f "/Applications/Cero.app"
    killall Finder
    ```

- **Windows**:
  - Registered with ProgID `Cero.Flow`, Content Type `application/x-cero-workflow`, and default icon `flow.ico`.
  - Open via Explorer double-click or CLI: `Cero.Terminal.exe setup.flow`.
  - *User Choice:* On Windows 10 and 11, the first double-click may ask "How do you want to open this file?"; select Cero. To reset, right-click the file, select **Open with > Choose another app**, check "Always use this app", and pick Cero.

- **Linux (deb, rpm, Arch, Flatpak, AppImage)**:
  - Registered under MIME type `application/x-cero-workflow` (sub-class of `text/plain`, so text editors remain accessible via "Open with" while Cero is the default).
  - Uses the grayscale vector mark `application-x-cero-workflow` icon in all standard resolutions (16px to 512px + scalable SVG).
  - **deb / rpm / Arch / Flatpak**: Package installers install the MIME specification and run `update-mime-database` and `gtk-update-icon-cache`.
  - **AppImage self-registration**: Because AppImages are standalone binaries without system package hooks, Cero detects when running as an AppImage and offers a one-time prompt:
    > "Open .flow files with Cero? This adds a launcher and a file type to your user folders. [Yes] [No, never ask]"
    Answering Yes installs the desktop launcher, icons, and MIME registration into `~/.local/share/`. If the AppImage is subsequently moved, Cero automatically updates the desktop `Exec` path on launch. This can also be toggled anytime in **Settings > General**.
  - **Snap**: Snap sandbox restrictions prevent writing to `/usr/share/mime`. Snap users open flows via `cero-terminal setup.flow` or from inside the app.
  - *Resetting association:*
    ```bash
    xdg-mime default cero-terminal.desktop application/x-cero-workflow
    ```

- **Single-instance window handling**:
  Double-clicking any number of `.flow` files when Cero is already running forwards the file path to the running instance over the native IPC/mutex channel. If the terminal is currently busy executing another task, the newly opened flows are queued sequentially in FIFO order without interrupting or dropping runs.

- **From inside Cero**:
  - Ask "run the workflow in setup.flow".
  - Or open the Workflow Manager drawer, which lists all `.flow` files saved in `~/.cero/workflows` and provides **Import .flow** and **Export as .flow** tools.

Examples: [`examples/flows`](../examples/flows).

## Safety

- A flow that runs commands always shows the full list first; nothing runs until you approve.
- Desktop-only flows run without asking. They can only open web links (http/https), apps by name and
  folders.
- Values are quoted by Cero; a flow cannot inject shell syntax through a URL, app name, package name
  or path.
