# "Open in Cero" from a file manager

Settings, Desktop Integrations (or the setup wizard) installs a right-click action that opens Cero in a folder.

## Linux (user-space, no root)
| File manager | Installed to |
|---|---|
| Nautilus (GNOME Files) | `~/.local/share/nautilus/scripts/` |
| Nemo (Cinnamon) | `~/.local/share/nemo/scripts/` |
| Caja (MATE) | uses the same script variables |
| Dolphin (KDE) | `~/.local/share/kio/servicemenus/cero_open.desktop` (and the KDE 5 services folder) |
| Thunar (Xfce) | a custom action in `~/.config/Thunar/uca.xml` |

Right-click a folder, then Scripts (Nautilus, Nemo) or the context menu, and choose **Open in Cero**. The script calls
`~/.local/bin/cero <folder>`. If the entry does not appear, restart the file manager (`nautilus -q`, `thunar -q`).

## macOS (Finder Quick Action)
Enabling it installs `~/Library/Services/Open in Cero.workflow`. Right-click a folder, then Services (or Quick Actions),
then **Open in Cero**. If it is missing, tick it in System Settings, Privacy & Security, Extensions.

## `.flow` files
Cero also registers the `.flow` file type and icon (`application/x-cero-workflow`), so double-clicking a flow opens it.
