# Visual Studio Code Terminal Integration

Configure Cero as your integrated desktop terminal emulator inside Visual Studio Code.

## Automated Wizard Configuration
1. Open Cero.
2. If greeted by the Initial Setup Wizard, toggle **Enable IDE Profiles**. Otherwise, access the wizard via the **Personalization** menu.
3. Cero automatically edits your global VS Code user settings at `~/Library/Application Support/Code/User/settings.json`.

## Manual Settings Injection
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
