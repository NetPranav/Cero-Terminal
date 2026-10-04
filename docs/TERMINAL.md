# The terminal

Cero is a Tauri v2 desktop terminal: xterm.js in the window, a real PTY and your login shell behind it.

## Rendering
- `@xterm/xterm` with the WebGL addon. If the graphics context is lost, Cero falls back to the standard renderer
  and redraws the cursor.
- Full-screen programs (`vim`, `nano`, `tmux`, `htop`) work. `PtyStateTracker` detects the alternate screen and
  switches off the grey suggestion and output observers while one runs.
- Environment given to every session: `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=Cero`, `CERO_TERMINAL=1`.

## Tabs and panes
- New tab `Ctrl+T`, close tab or pane `Ctrl+W`. Double-click a tab to rename it.
- Split side by side `Ctrl+D`, split stacked `Ctrl+Shift+D`. Drag the divider to resize (8 px grab area).
- Each tab and pane keeps its own output history, shell and working directory.
- Not built yet: `Ctrl+1..9`, `Ctrl+Tab` and `Alt+Arrow` for tab and pane navigation (see [FUTURE_SCOPE.md](FUTURE_SCOPE.md)).

## Search (`Ctrl+Shift+F`)
Opens a search bar in the focused pane with a live match count. `Enter` goes to the next match, `Shift+Enter` to the
previous one. `Alt+C` toggles case, `Alt+W` whole word, `Alt+R` regular expression; `Esc` closes it.
You can also ask: "search the terminal for ERROR".

## Copy, paste, clear, history
- Copy: `Ctrl+Shift+C`, or `Ctrl+C` while text is selected. Paste: `Ctrl+V`, `Ctrl+Shift+V` or `Shift+Insert`.
- Clear: `Ctrl+K` (or `Ctrl+L` / `clear` in the shell).
- History: `Ctrl+R` opens a fuzzy search over every command and `>` request you ran.

## Suggestions (grey text)
`AutocompleteEngine` shows one suggestion after the cursor from command history (filtered by folder), project files
and scripts (`package.json`, `Cargo.toml`), and patterns you taught with `/learn`.
- `Tab` accepts it. `Right` at the end of the line accepts it too (Settings, Terminal, "Accept suggestion with Right arrow").
- Other arrow keys, Home and End only move the cursor. A suggestion that no longer matches the line (after a paste or edit) is dropped.
- Up and Down move between the lines of a long wrapped prompt (`PromptNavigationEngine`) and otherwise recall shell history.
