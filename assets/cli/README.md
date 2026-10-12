# cero

Command line launcher for [Cero](https://github.com/NetPranav/Sentinal-Terminal) on Windows (Node.js 18 or
later).

```bash
cero                 # open a Cero window in the current folder
cero ~\projects\api  # open a Cero window in that folder
cero setup.flow      # run a .flow file
cero --version
```

A `.flow` file that only opens apps and links runs without showing the terminal. One that installs or runs
commands opens the terminal and lists every command; nothing runs until you click Run. See
[FLOW_FILES.md](https://github.com/NetPranav/Sentinal-Terminal/blob/main/docs/FLOW_FILES.md).

## Install

The app itself comes from the [releases page](https://github.com/NetPranav/Sentinal-Terminal/releases). Then:

```bash
npm install -g @netpranav/cero-cli --registry=https://npm.pkg.github.com
```

GitHub Packages needs a login even for public packages: `npm login --registry=https://npm.pkg.github.com`
with a token that has `read:packages`.

## Where it looks for the app

`%LOCALAPPDATA%\Cero`, `%ProgramFiles%\Cero` and `%ProgramFiles(x86)%\Cero`, then `PATH`.

Set `CERO_APP` to the app's `.exe` when it is somewhere else.

## License

MIT
