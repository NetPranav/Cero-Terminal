# Cero — VS Code Integration

This integration enables **Cero** as a first-class integrated desktop terminal profile inside Visual Studio Code on macOS.

## Quick Setup via Cero Installer

When launching Cero for the first time, simply click **"Enable IDE Profiles"** in the **Setup Wizard** (or accessible via **Personalization → AI & Shell Settings**).

Cero will automatically configure your global VS Code user settings (`~/Library/Application Support/Code/User/settings.json`).

## Manual Configuration

To manually configure Cero as your primary VS Code terminal profile, add the following entry to your `settings.json`:

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

## Features
- **TrueColor Support**: Automatically exports `TERM=xterm-256color` and `COLORTERM=truecolor`.
- **Login Shell Integration**: Respects `-l` and `--login` profiles across `zsh`, `bash`, `fish`, and `nushell`.
- **Context Menu Integration**: Right-click any folder in VS Code File Explorer and select **"Open in Cero"**.
