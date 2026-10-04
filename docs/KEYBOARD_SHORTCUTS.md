# Keyboard shortcuts

On macOS use `Cmd` where this page says `Ctrl`. Checked against `App.tsx` and `TerminalView.tsx`.
Keys listed under "Not built yet" are in [FUTURE_SCOPE.md](FUTURE_SCOPE.md).

## Windows and panels
| Action | Keys |
|---|---|
| Command palette | `Ctrl+Shift+P` |
| Settings (full screen; `Esc` closes it) | `Ctrl+,` |
| Workflow Manager | `Ctrl+Shift+W` |
| Plugin marketplace | `Ctrl+Shift+X` |
| Shortcuts and help | `F1`, `Ctrl+/` or `Ctrl+?` |
| Fuzzy history search | `Ctrl+R` |

## Tabs and panes
| Action | Keys |
|---|---|
| New tab | `Ctrl+T` |
| Close pane, or tab when it is the only pane | `Ctrl+W` |
| Rename tab | double-click the tab |
| Split side by side | `Ctrl+D` |
| Split stacked | `Ctrl+Shift+D` |
| Resize panes | drag the divider |

The F1 help screen currently lists different split keys (`Ctrl+Shift+D` and `Ctrl+Alt+D`) and tab keys `1..9`;
the table above is what the app does.

## Terminal
| Action | Keys |
|---|---|
| Search the scrollback | `Ctrl+Shift+F` |
| Next / previous match | `Enter` / `Shift+Enter` |
| Case / whole word / regex | `Alt+C` / `Alt+W` / `Alt+R` |
| Close search | `Esc` |
| Copy | `Ctrl+Shift+C`, `Ctrl+Insert`, or `Ctrl+C` while text is selected |
| Paste | `Ctrl+V`, `Ctrl+Shift+V`, `Shift+Insert` |
| Clear the screen | `Ctrl+K` (also `Ctrl+L` in the shell) |

## Requests and suggestions
| Action | Keys |
|---|---|
| Start a request | `>` at the start of the line |
| Accept the grey suggestion | `Tab`, or `Right` at the end of the line (a setting turns Right off). It is accepted only while it still matches the line; after a paste or an edit it is dropped. |
| Apply a suggested fix | `Tab`, or type `>fix` / `>heal` |
| Stop the running request | `Ctrl+C`: the model call, its commands and open approval cards stop and the task shows as cancelled. Waiting prompts are kept and the queue pauses (`/queue resume`). A second `Ctrl+C` within 1.5 s clears the queue. A draft you are typing is kept. With nothing running, `Ctrl+C` goes to the shell. |
| Queue panel | `/queue`, or click the queue count in the status bar. `Esc` closes it while it has focus. |
| Answer an approval | click **Run** or **Deny** (Enter and Esc do not answer it) |
| Move through a long wrapped prompt | `Up` / `Down` |

## Not built yet
`Ctrl+Shift+Z` (Zen/Visual toggle; use Settings or the palette), `Ctrl+1..9`, `Ctrl+Tab`, `Alt+Arrow` pane focus,
`Ctrl+O` workspace switcher, `Ctrl+Alt+P` ports drawer, `Ctrl+Shift+H`.
