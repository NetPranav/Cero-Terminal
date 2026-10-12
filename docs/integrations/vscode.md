# Visual Studio Code Terminal Integration

Configure Cero as your integrated desktop terminal emulator inside Visual Studio Code.

## Automated Wizard Configuration
1. Open Cero.
2. If greeted by the Initial Setup Wizard, toggle **Enable IDE Profiles**. Otherwise, access the wizard via the **Personalization** menu.
3. Cero edits your global VS Code user settings (macOS: `~/Library/Application Support/Code/User/settings.json`; Linux: `~/.config/Code/User/settings.json`).

## Linux
The wizard (Settings, Desktop Integrations) merges a `Cero Shell` profile into `terminal.integrated.profiles.linux` in `~/.config/Code/User/settings.json` without touching your other profiles. The profile runs `~/.local/bin/cero-shell`, a small wrapper that starts your login shell with `CERO_TERMINAL=1` and `~/.local/bin` on the `PATH`.

## macOS: manual settings
Add the profile directly to your VS Code user configurations:

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

## Developer Workflow
When integrated, opening a terminal panel in VS Code (`Control+~`) spins up a high-speed Cero PTY session inheriting your TrueColor themes and dotfile settings.
