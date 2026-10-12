# Teaching Cero

Cero never learns by watching you. Nothing is remembered unless you say so.

| You type | What happens |
|---|---|
| `/learn` | Teaches the request just above it, if it worked with one command: next time you say the same thing, Cero runs that command without asking the model. If you typed your own command after a request that did not work, `/learn` teaches that one instead. |
| `/learn compress backups -> tar -czf backups.tgz ./backups` | Teaches a request and its command directly. |
| `/learned` | Lists what Cero was taught. |
| `/forget <id or request>` | Removes one. |
| `/learning on` / `/learning off` | Lets Cero keep a local record of its own failed requests for later study. Off by default. `/learning` shows the current state. |

Rules:
- A request that failed is never learnable.
- After a failed request, if you run a command yourself, Cero only says how to teach it (`/learn`). It does not learn it.
- A taught pattern is used only for the same request (numbers, file names and paths in it are filled in from what you say).
- Everything is stored on your computer in `~/.cero/learned_patterns.json`.
