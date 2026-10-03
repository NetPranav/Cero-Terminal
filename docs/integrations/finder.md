# Finder Quick Action Service ("Open in Cero")

Cero provides native macOS Finder integration, allowing users to right-click any directory in Finder to open an interactive terminal session at that exact location.

## Enabling Finder Integration
In the Cero **Setup Wizard** or under **Personalization**, enable **Finder Quick Actions**.
This installs an Automator workflow service to:
`~/Library/Services/Open in Cero.workflow`

## How to Use in Finder
1. Navigate to any folder in macOS Finder.
2. Right-click the folder icon (or invoke Two-Finger Tap on trackpad).
3. Scroll down to **Services** (or **Quick Actions** depending on OS version) → Select **Open in Cero**.
4. Cero opens immediately with your login shell running inside that working directory.

## Troubleshooting
If "Open in Cero" does not appear immediately:
- Go to **macOS System Settings** → **Privacy & Security** → **Extensions** → **Finder Extensions** / **Services** and ensure "Open in Cero" is ticked on.
