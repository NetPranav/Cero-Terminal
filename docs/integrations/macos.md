# macOS Native OS Integration Architecture

Cero is structured as a first-class native desktop terminal emulator on macOS, adhering to established conventions pioneered by Terminal.app, iTerm2, and Ghostty.

## Application Registration
In `src-tauri/tauri.conf.json`, Cero registers:
- **Application Category**: `public.app-category.developer-tools`
- **Custom Protocol Scheme**: `cero://`
- **Minimum OS Compatibility**: macOS 12.0 Monterey

## PTY Spawning & Login Shells
When a terminal tab opens, Cero utilizes `ShellAdapter` to detect the user's default login shell (e.g., `/bin/zsh`, `/usr/local/bin/fish`). 
Spawns are executed with the login shell flag (`-l` or `--login`), ensuring environment initialization scripts (`.zprofile`, `.bash_profile`, `.config/fish/config.fish`) are properly sourced.

## Environment Variables
Every interactive session spawned by Cero exports standard terminal emulation identifiers:
- `TERM=xterm-256color`
- `COLORTERM=truecolor`
- `TERM_PROGRAM=Cero`
- `TERM_PROGRAM_VERSION=0.1.0`
- `CERO_TERMINAL=1`
- `LANG=en_US.UTF-8`
- `LC_ALL=en_US.UTF-8`

## Protocol Routing & Deep-Link Reception
Via Tauri v2 `RunEvent::Opened`, any folder or URI launched via Launch Services (`open -a "Cero" <path>`) is immediately received by the Rust backend and routed to React views via `"cero-url"` events.
