# Cero Command Line Launcher (`cero`)

The `cero` CLI executable allows developers to interact with the Cero desktop application directly from standard macOS command shells.

## Installation
The standalone launcher is installed automatically to `/usr/local/bin/cero` (or fallback `~/.local/bin/cero`) when completing the **Initial Setup Wizard** inside Cero.

## Command Reference

| Command | Description |
| :--- | :--- |
| `cero` or `cero .` | Open a new Cero window at current working directory |
| `cero /path/to/project` | Open Cero at the specified folder |
| `cero --new-tab [path]` | Spawn a new tab inside the current active window |
| `cero --split [path]` | Split the active pane horizontally/vertically |
| `cero --run "<command>"` | Launch Cero and immediately execute an interactive instruction |
| `cero --help`, `-h` | Print summary of available commands |

## Technical Mechanism
Under the hood, the `cero` command line interface encodes target filesystem paths and commands into the `cero://` custom macOS protocol handler, resulting in instant application activation without spawning extraneous processes.
