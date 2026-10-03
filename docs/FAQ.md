# Cero — Frequently Asked Questions (FAQ)

Frequently asked questions regarding Cero's embedded local AI, privacy guardrails, terminal compatibility, and macro automation.

---

## 1. Privacy & Offline Local AI

### Does Cero send my code, commands, or private data to the cloud?
**No.** Cero is engineered as an offline-first solution. All natural language parsing, command translation, and planning execute 100% locally on your machine. Zero telemetry, keystrokes, source code, or filesystem paths ever transmit to external cloud services or public LLM endpoints.

### Do I need to install or run Ollama?
**No.** Cero bundles a standalone embedded `llama-server` directly inside the application. When Cero launches, it boots the embedded server and loads the bundled `Qwen 2.5 Coder 3B GGUF` model automatically. No external installation or daemon setup is required.

### Can I still use an external Ollama server if I prefer?
**Yes.** If you maintain custom models or external Ollama instances on your network, open the AI Settings drawer (`Ctrl+Shift+P` ➔ AI Settings) and switch the provider mode to **External Ollama**.

### What happens if I disconnect from the internet?
Cero retains 100% of its AI and terminal capabilities offline. Because your model and inference server run directly in your local machine RAM, all features—including multi-stage workflows, directory navigation, process management, and port inspection—operate at peak performance anywhere you work.

---

## 2. Terminal Compatibility & Ergonomics

### Can I still run traditional terminal utilities and shell scripts?
**Yes.** Cero is a high-performance terminal emulator utilizing hardware-accelerated WebGL rendering and native pseudo-terminal (PTY) communication. Tools like `vim`, `nano`, `tmux`, `git`, `docker`, `htop`, and SSH operate with full fidelity.

### How does Cero distinguish between conversational AI commands and normal shell syntax?
To eliminate any ambiguity between standard UNIX syntax and automated AI assistance, Cero requires an explicit **`>`** prompt prefix:
- Standard commands (`git status`, `ls -lah`, `npm test`) run immediately with sub-millisecond latency through your native shell.
- Prompts starting with **`>`** (e.g. `> find all open ports`, `> write a python test script`) route to Cero's AI agent loop.

### What is the progress indicator in the bottom bar?
Whenever a `>` prompt runs, the bottom bar's AI status button transforms into a live progress indicator. It displays the completion percentage (e.g. `45%`), current execution stage (`Thinking...`, `Planning...`, `Running: ...`), an estimated completion countdown (`~1.8s`), and a sleek micro-progress track.

---

## 3. Workflows, Macros & Self-Healing

### How do I save and replay automated workflows?
You can append `:: save as workflow <name>` to any natural language request:
```bash
> clean build artifacts, run cargo test, and package release :: save as workflow release-prep
```
Once saved, replay the entire procedure anytime with zero AI latency or token cost:
```bash
run workflow release-prep
```

### What is Auto-Heal and how do I use it?
When a terminal command exits with an error (such as an occupied port or missing directory), Cero analyzes the error and displays an auto-heal remediation pill. Press **`Tab`** or type **`>fix`** / **`>heal`** to execute the suggested correction automatically.

---

## 4. Safety & System Control

### What prevents Cero from running destructive commands like `rm -rf /`?
Cero implements a **Zero-Trust Categorical Policy Engine**:
- Safe operations (reading diagnostics, listing files) execute immediately.
- Destructive operations (deleting directories, killing system processes) trigger an interactive **Consent Queue** modal requiring explicit user approval.
- High-risk operations require sudo/root authentication.
- Malicious obfuscated commands (`eval`, `base64 -d | bash`) are hard-blocked by an Abstract Syntax Tree (AST) shell parser before execution.

### Can I undo actions performed by the AI?
**Yes.** Cero maintains an in-memory session undo log. Ask `>what did you just do` to inspect recent modifications, or `>undo last step` to roll back supported file and git operations.
