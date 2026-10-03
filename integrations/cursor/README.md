# Cero — Cursor IDE Integration

Integrate **Cero** as your default modern terminal emulator inside Cursor IDE on macOS.

## Automated Setup via Setup Wizard

In Cero, open the **Installer Setup Wizard** and toggle **Enable IDE Profiles**. Cero automatically discovers and configures your Cursor user preferences at:
`~/Library/Application Support/Cursor/User/settings.json`

## Manual Profile Installation

Copy the contents of `cursor-profile.json` directly into your Cursor `settings.json` file:

```json
{
  "terminal.integrated.profiles.osx": {
    "Cero": {
      "path": "/Applications/Cero.app/Contents/MacOS/Cero",
      "icon": "terminal",
      "overrideName": true
    }
  },
  "terminal.integrated.defaultProfile.osx": "Cero"
}
```

## Benefits in Cursor
- **AI Intent Parity**: Consistent terminal environment variables (`CERO_TERMINAL=1`).
- **High-Performance PTY**: Smooth scrolling with a 100,000-line scrollback capacity.
- **Auto-Detection**: Works out of the box with custom `zsh`, `bash`, `fish`, and `nushell` dotfile themes.
