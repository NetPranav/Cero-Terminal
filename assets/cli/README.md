# sentinel

Command line launcher for [Sentinel Terminal](https://github.com/NetPranav/Sentinal-Terminal). Works on macOS,
Linux and Windows (Node.js 18 or later).

```bash
sentinel                 # open a Sentinel window in the current folder
sentinel ~/projects/api  # open a Sentinel window in that folder
sentinel setup.flow      # run a .flow file
sentinel --version
```

A `.flow` file that only opens apps and links runs without showing the terminal. One that installs or runs
commands opens the terminal and lists every command; nothing runs until you click Run. See
[FLOW_FILES.md](https://github.com/NetPranav/Sentinal-Terminal/blob/main/docs/FLOW_FILES.md).

## Install

The app itself comes from the [releases page](https://github.com/NetPranav/Sentinal-Terminal/releases). Then:

```bash
npm install -g @netpranav/sentinel-cli --registry=https://npm.pkg.github.com
```

GitHub Packages needs a login even for public packages: `npm login --registry=https://npm.pkg.github.com`
with a token that has `read:packages`. The Arch package already installs a `sentinel` launcher.

## Where it looks for the app

| OS | Locations |
|---|---|
| macOS | `/Applications/Sentinel Terminal.app`, `~/Applications/Sentinel Terminal.app` |
| Windows | `%LOCALAPPDATA%\Sentinel Terminal`, `%ProgramFiles%\Sentinel Terminal` |
| Linux | `/usr/bin/sentinel-terminal`, `/usr/local/bin`, `~/.local/bin`, then `PATH` |

Set `SENTINEL_APP` to the app (the `.app`, the `.exe`, or the binary or AppImage) when it is somewhere else.

## License

MIT
