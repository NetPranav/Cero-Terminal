# Cursor IDE Integration Guide

Cero smoothly interfaces with Cursor IDE to offer state-of-the-art terminal emulation right inside your code editor.

## Why Use Cero in Cursor?
- **Consistent AI Context**: Your integrated terminal inherits identical variables (`CERO_TERMINAL=1`) and PATH environments.
- **Enhanced Scrollback**: Retain up to 100,000 lines of terminal output across complex LLM generation flows.
- **Native Login Profiles**: Transparently executes your login shell (`zsh`, `bash`, `fish`, or `nushell`).

## Auto-Configure via Cero Setup Wizard
Launch Cero and click **Enable IDE Profiles** in the Setup Wizard. This injects the custom profile directly into Cursor user preferences:
`~/Library/Application Support/Cursor/User/settings.json`

## Linux
The wizard (Settings, Desktop Integrations) merges a `Cero Shell` profile into `terminal.integrated.profiles.linux` in `~/.config/Cursor/User/settings.json` without touching your other profiles. The profile runs `~/.local/bin/cero-shell`, a small wrapper that starts your login shell with `CERO_TERMINAL=1` and `~/.local/bin` on the `PATH`.

## macOS: manual settings
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
