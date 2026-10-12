# Cero: Frequently asked questions

## Privacy and the built-in model

### Does Cero send my commands or files to the cloud?
Not with the built-in model or Ollama: the request and the command output stay on your computer. If you choose an API
provider (OpenAI, Anthropic, Groq, DeepSeek, OpenRouter or a custom endpoint), your request and the output Cero needs
to answer it are sent to that provider. API keys are kept in the Windows Credential Manager.

### Do I need to install Ollama?
No. Cero runs its own `llama-server` and uses a Qwen model it downloads on first use. The default is
Qwen 2.5 Coder 3B (about 2 GB); smaller (0.5B, 1.5B) and larger (Qwen3 4B) choices are in Settings. Downloads are
checked against a pinned SHA-256 and resume if interrupted. An existing Ollama server can be chosen in Settings instead.

### Does it work offline?
After the model is downloaded, yes, with the built-in model or Ollama. API providers need a connection.

## Using it

### How does Cero tell a request from a shell command?
A line starting with `>` is a request. Everything else goes to your shell (PowerShell), so `git`, `docker`,
`ssh` and other programs behave as in any terminal.
See [COMMANDS.md](COMMANDS.md).

### What does the status bar show?
`AI: local` (built-in model), `AI: API` or `AI: Ollama` while that provider works. `AI: Off` appears only when the
built-in engine is stopped. While a request runs it also shows the stage and a progress estimate.

### How do I stop a request?
`Ctrl+C` stops the running request and its command. Waiting requests stay in a queue (`/queue`); press `Ctrl+C` again
within 1.5 seconds to clear it. With no request running, `Ctrl+C` goes to the shell.

### How do I save and replay a workflow?
Say "save this as a workflow called x" in a request, or add `:: save as workflow x`. Cero runs the task, then writes the
steps that really ran to a `.flow` file. Replay with `run the workflow x` or by double-clicking the file.
See [FLOW_FILES.md](FLOW_FILES.md).

### Does Cero learn from what I do?
Only when you say so (`/learn`). See [LEARNING.md](LEARNING.md).

### What happens when a command fails?
Cero shows a suggested fix. Press `Tab` or type `>fix` to apply it.

## Safety

### What stops Cero from running `rm -rf /`?
The command safety guardian refuses catastrophic commands (root deletion, raw disk writes, formatting, permission
lockouts, fork bombs, firmware wipes, C library removal, obfuscated pipes) both when you type them and when a model
proposes them. Commands that change files, the system or the network wait for your click on Run or Deny.
See [SECURITY.md](SECURITY.md).

### Can I undo what Cero did?
`>what did you just do` lists the changes made this session; `>undo last step` reverses the last reversible one.
The log lives in memory, so it is gone when you close Cero.
