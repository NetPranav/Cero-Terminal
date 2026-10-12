# Requests and slash commands

Everything you can type that is not a plain shell command. Anything else you type goes to your shell untouched.

## Requests

Start a line with `>` and Cero treats it as a request in plain words.

```text
>what is the total of the score column in data.csv
>open the folder gitBrains in VS Code
>show listening ports
>free port 3000
>open firefox and also open zen browser
>make me a workflow called morning that opens gmail and spotify
>open spotify and save this as a workflow
```

- A request that changes anything shows the commands in an approval card (bottom-right corner). Click **Run** or **Deny**;
  Enter and Esc do not answer it, because they belong to the prompt you are typing.
- Several actions in one request run as separate steps; each one is reported.
- `>fix` or `>heal` applies the suggested fix for the last failed command (the same as pressing Tab on the suggestion).
- `>what did you just do` lists what Cero changed this session; `>undo last step` reverses the last reversible one.
- `run the workflow <name>` replays a saved workflow.
- Add `:: save as workflow <name>` to the end of a request, or say "save this as a workflow", to keep what ran as a
  `.flow` file (see [FLOW_FILES.md](FLOW_FILES.md)).

## Slash commands

| Command | What it does |
|---|---|
| `/queue` | Shows the running request and the waiting ones. Also: `/queue list`, `/queue pause`, `/queue resume`, `/queue clear`. |
| `/cancel` | Cancels the question Cero is waiting for you to answer. |
| `/learn` | Teaches Cero the request just above it. `/learn <request> -> <command>` teaches a pair. |
| `/learned` | Lists what Cero was taught. |
| `/forget <id or request>` | Removes one taught item. |
| `/learning on` / `off` | Keeps (or stops keeping) a local record of failed requests. Off by default. |
| `/app <alias> "<application name>"` | Maps a short name to an installed application (`/app chrome "Google Chrome"`). `/app` or `/apps` alone lists the mappings; saved in `~/.cero/app_aliases.json`. `/alias` and `/aliases` do the same. |

More on teaching: [LEARNING.md](LEARNING.md). Keys: [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md).
