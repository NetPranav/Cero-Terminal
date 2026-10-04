# The `cero` command

`cero` opens Cero from a shell.

## Install
- Package installs (Arch, deb, rpm) put `cero` on the `PATH`.
- Otherwise Settings, Desktop Integrations (or the setup wizard) installs it to `~/.local/bin/cero` with no root needed
  (on macOS, `/usr/local/bin/cero` with `~/.local/bin/cero` as the fallback). Add `~/.local/bin` to your `PATH` if the
  settings page says it is missing.

## Use
| Command | What it does |
|---|---|
| `cero` or `cero .` | Open Cero in the current folder |
| `cero /path/to/folder` | Open Cero in that folder |
| `cero file.flow` | Open and run a `.flow` file (it asks first) |
| `cero --new-tab`, `cero --split` | Ask the running window for a new tab or a split |
| `cero --help`, `--version` | Print help or the version |
| `cero --debug` (`-d`, `--verbose`, `-v`) or `CERO_DEBUG=1 cero` | Run in the foreground with live logs ([TROUBLESHOOTING.md](../TROUBLESHOOTING.md)) |

On macOS the launcher passes paths to the app through the `cero://` URL scheme. On Linux it starts `cero-terminal`
and detaches (except in debug mode).
