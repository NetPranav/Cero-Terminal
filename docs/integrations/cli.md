# The `cero` command

`cero` opens Cero from a shell. The launcher is `assets/cli/cero.js` (Node.js, no dependencies).

## Install
Installing it from Settings, Desktop Integrations is not available on Windows yet (roadmap 3.8; the page reports "Not
available on Windows yet"). Until then run the script directly with `node assets\cli\cero.js`, or put a `cero.cmd`
that calls it in a folder on your `PATH`.

The launcher looks for the app in `%LOCALAPPDATA%\Cero` first; set `CERO_APP` to the `.exe` when Cero is installed
somewhere else.

## Use
| Command | What it does |
|---|---|
| `cero` or `cero .` | Open Cero in the current folder |
| `cero C:\path\to\folder` | Open Cero in that folder (`~` is your user folder) |
| `cero setup.flow` | Run a `.flow` file (a flow that installs or runs commands asks first) |
| `cero --help`, `--version` | Print help or the version |

`cero --new-tab`, `--split` and `--debug` are not in the Windows launcher yet. Troubleshooting without them is in
[TROUBLESHOOTING.md](../TROUBLESHOOTING.md).
