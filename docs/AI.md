# Cero — Local AI Cognitive Architecture

Cero brings native desktop computing and offline artificial intelligence together. Unlike cloud-based assistants that transmit sensitive code, environment credentials, and terminal buffers to external servers, Cero operates an in-app embedded Large Language Model engine directly on local machine hardware with zero external dependencies.

---

## 1. Embedded In-App Inference Engine

### A. Zero-Ollama Embedded Server
- **Native llama-server Integration**: Cero bundles an embedded, standalone `llama-server` binary natively managed by Tauri's Rust backend (`src-tauri/src/embedded_server.rs`).
- **Zero External Dependencies**: Users do not need to install, run, or configure Ollama or any external daemon. Cero handles process spawning, port discovery (defaulting to `8080` with automatic port-conflict incrementing), health polling, and clean child-process termination on application exit.
- **Auto-Start on Application Launch**: When Cero opens, the embedded inference engine automatically initializes in the background. Live engine status is reflected on the bottom bar (`StatusBar.tsx`).
- **Optional External Ollama Fallback**: For users with pre-existing Ollama models or remote inference servers, Cero retains a high-performance `OllamaProvider.ts` with instant toggle capability in the AI Settings drawer.

### B. Bundled Model Profile: Qwen 2.5 Coder 3B GGUF
- **Target Model**: `Qwen2.5-Coder-3B-Instruct` quantized in 4-bit / 8-bit GGUF format.
- **Hardware Acceleration**: Automatically compiles with and utilizes GPU acceleration backends (**Vulkan** on Linux, **CUDA** on NVIDIA, and **Metal** on Apple Silicon).
- **Graceful CPU Degradation**: If GPU VRAM is exhausted or hardware acceleration is unavailable, Cero seamlessly falls back to CPU thread layers without crashing or throwing unhandled errors.

### C. GBNF Grammar-Constrained Sampling
- **Deterministic Tool Calling**: Raw LLM output is constrained through Backus-Naur Form (GBNF) grammar schemas managed by `GbnfGrammarManager.ts`.
- **Zero Parse Failures**: The model is mathematically forbidden from emitting malformed JSON, unclosed quotes, or illegal tool signatures. Every token sampled adheres to Cero's strictly validated tool schema.
- **Unconstrained Fallback**: If an unsupported grammar rule or sampler initialization error occurs, `EmbeddedProvider.ts` automatically falls back to unconstrained JSON completion.

---

## 2. Real-Time Prompt Progress & Latency Estimation

### A. Prompt Lifecycle & Bottom Bar Indicator
Whenever a natural language prompt is executed (e.g. `> write a python script...` or auto-heal remediation):
- **Dynamic Progress Crawling**: `PromptProgressManager.ts` tracks the live execution lifecycle:
  - `Thinking...` (30%)
  - `Planning...` (50%)
  - `Running: <tool/command>` (75%)
  - `Executing...` (82%)
  - `Verifying...` (92%)
  - `Done` (100%)
- **Hardware-Adaptive Time Estimation**: Employs an exponential moving average (EMA) of inference latency that automatically calibrates remaining time countdowns (`~1.8s`) based on user hardware speed (GPU vs. CPU mode).
- **Sleek Micro-Progress Bar**: Rendered in the bottom `StatusBar.tsx` with high-contrast monochrome percentages and a smooth 36px progress track.

---

## 3. Cognitive Architecture & Multi-Domain Tool Routing

Small local models often hallucinate or struggle when exposed to dozens of complex tools simultaneously. Cero overcomes this through a multi-pillar cognitive pipeline:

### A. Dynamic Domain Tool Pruning
Instead of saturating context with 100+ raw tool specifications:
1. Cero's lightweight classifier determines the intent domain among 9 specialized functional domains:
   - *Domain 1: System Diagnostics & Hardware Monitoring*
   - *Domain 2: Process Management & Resource Optimization*
   - *Domain 3: Network Diagnostics, Ports & Connections*
   - *Domain 4: Filesystem, Directory Navigation & Search*
   - *Domain 5: Git & Developer Lifecycle Workflows*
   - *Domain 6: Linux Daemons & Systemd Services*
   - *Domain 7: Desktop Applications & UI Automation*
   - *Domain 8: Linux Dotfiles & Rice Management (Hyprland)*
   - *Domain 9: Multi-Stage Composite Workflows*
2. Only the **4 to 6 tools relevant to the classified domain** are injected into the active context window.
3. This eliminates context clutter, prevents argument hallucination, and enables a 3B model to execute with the accuracy of frontier models.

### B. "Probe Before You Leap" Discovery Engine
When target files, robotics nodes, or build targets are not in the current directory (`>run my gazebo`, `>start robotics node`):
- Executes a **Discovery Probe** across development workspaces (scanning for `package.xml`, `*.launch.py`, `Cargo.toml`, `docker-compose.yml`).
- If multiple candidates exist, presents an interactive disambiguation menu so the user can select their target with 1 keystroke.

### C. In-Loop Self-Healing & Failure Classification
When an automated command fails:
- **Failure Classification**: `FailureClassifier.ts` analyzes `stderr`, exit codes, and output patterns to distinguish between missing binaries, incorrect flags, environment misconfigurations, and physical device disconnections.
### D. Fuzzy Directory Navigation & Automatic Creation Engine (`DirectoryNavigationEngine.ts`)
When the user prompts to switch directories (e.g. `> switch pwd to backend` or `> cd to my project`):
- **Deep Workspace Indexing**: Scans user projects and directories up to 3 levels deep across `~`, `~/Projects`, `~/workspace`, and custom roots.
- **Exact & Substring Matching**: Immediately resolves matches if an exact or unique partial folder name is found.
- **Fuzzy "Did You Mean" Correction**: If the requested folder name contains a typo or spelling error (e.g. `sentinl` instead of `sentinal`), uses Levenshtein distance to detect candidates and prompts the user with an interactive disambiguation menu.
- **Automatic Creation Confirmation**: If the target folder does not exist on disk, Cero detects the absence, asks the user if they would like Cero to create the folder, and upon confirmation executes `mkdir -p` and automatically navigates the PTY.

---

## 4. Deep System Knowledge Scanner & Persistent Profile

### A. Non-Blocking 8-Domain Environmental Audit (`SystemKnowledgeScanner.ts`)
On startup, Cero executes an asynchronous background audit to build a comprehensive, structured snapshot of the host operating system:
1. **Desktop Applications**: Parses `.desktop` files from `/usr/share/applications`, `~/.local/share/applications`, Flatpak, and Snap to index installed GUI applications and binary launch triggers.
2. **Developer Toolchains**: Detects installed compilers and runtimes (`node`, `python3`, `rustc`/`cargo`, `gcc`, `go`, `docker`, `podman`).
3. **Hardware Acceleration & Compute**: Discovers GPU model (NVIDIA CUDA VRAM, AMD ROCm), physical CPU cores, total/available RAM, and power state.
4. **Storage & Snapshot Layout**: Maps mounted filesystems (`btrfs`, `ext4`, `zfs`), available disk capacity, and detects snapshot tools (`snapper`, `timeshift`).
5. **Shells & User Dotfiles**: Identifies `/etc/shells`, active dotfiles (`~/.bashrc`, `~/.zshrc`, `~/.config/fish/config.fish`, `~/.config/hypr/hyprland.conf`), and Starship prompts.
6. **Network Topology**: Audits default routes, active network interfaces, Wi-Fi SSID, and active VPNs (`Tailscale`, `WireGuard`).
7. **System Services & Ports**: Audits init system (`systemd`), active developer daemons (`postgresql`, `redis`, `docker`), and listening TCP ports.
8. **Desktop Session & Audio**: Identifies display server (`Wayland` vs `X11`), compositor (`Hyprland`, `KDE`, `GNOME`), and audio subsystem (`PipeWire` vs `PulseAudio`).

### B. Persistent Profile Caching & Prompt Injection
- **Persistence**: Saved to `~/.cero/knowledge/system_profile.json` and mirrored in `localStorage`.
- **System Prompt Enrichment (`SystemPrompt.ts`)**: Injects a compact, token-optimized summary into the AI context window, allowing Cero to answer queries like *"open my browser"*, *"how much disk space is free"*, or *"what ports are open"* without running exploratory shell commands.

---

## 5. Multi-Model Architecture & Hardware Tier Recommendations

### A. Hardware-Adaptive Model Recommendations (`ModelRecommendationEngine.ts`)
Cero inspects physical CPU cores, RAM, and GPU VRAM to categorize the host machine into one of four hardware tiers and suggest the ideal local model:
- **Budget Tier (< 6 GB RAM)**: Recommends ultra-lightweight models (e.g. `Qwen 2.5 Coder 1.5B (Q4_K_M)` requiring ~1.2 GB RAM) or Cloud API providers to prevent host memory exhaustion.
- **Balanced Tier (6 GB - 12 GB RAM)**: Recommends `Qwen 2.5 Coder 3B Instruct (Q4_K_M)` (~2.5 GB RAM) as the optimal sweet spot for local reasoning, tool orchestration, and responsiveness.
- **Performance Tier (12 GB - 24 GB RAM)**: Recommends `Qwen 2.5 Coder 7B Instruct` or `DeepSeek Coder 6.7B` for advanced multi-file synthesis and complex bash scripting.
- **Workstation Tier (> 24 GB RAM / High VRAM)**: Recommends `Qwen 2.5 Coder 14B` or `DeepSeek Coder V2 Lite` for heavy autonomous software engineering.

### B. Cloud API Providers & Zero Local Footprint (`CloudApiProvider.ts`)
For developers who prefer zero local CPU/RAM overhead or who require frontier cloud intelligence:
- **Supported Providers**:
  - **OpenAI**: `gpt-4o`, `gpt-4o-mini`, `o3-mini`
  - **Anthropic**: `claude-3-5-sonnet`, `claude-3-5-haiku`
  - **Groq**: `llama-3.3-70b-versatile`, `qwen-2.5-coder-32b` (Ultra-low latency LPU inference)
  - **DeepSeek**: `deepseek-chat`, `deepseek-coder`
  - **OpenRouter**: Access to unified open-source and proprietary models
  - **Custom OpenAI-Compatible**: Custom `baseUrl`, `modelId`, and `apiKey` (e.g., vLLM, LocalAI, enterprise gateways)
- **Live Connection Verification**: Interactive "Test Connection" button sends a 1-token probe to confirm endpoint accessibility and key validity in real time before activating the provider.

---

## 6. Continuous Learning & Memory Engines

### A. Episodic Memory Engine (`EpisodicMemoryEngine.ts`)
- Stores execution trajectories, intent embeddings, and user corrections in localized storage (`~/.cero/memory/`).
- Future prompts matching past goals query episodic memory to replay proven command patterns instantaneously.

### B. Demonstration Learning Engine (`DemonstrationLearningEngine.ts`)
- If an AI prompt fails or is unresolved, and the user manually executes the correct terminal command within 3 minutes, Cero automatically links the user's command to the goal.
- Generates verified pattern templates in `~/.cero/learned_patterns.json` so the AI remembers the exact solution next time.

### C. Cero SERL Coordinator (`CeroSerlCoordinator.ts`)
- Implements Self-Evolving Reinforcement Learning (SERL).
- Logs successful command executions into instruction-tuning datasets:
  - **SFT Dataset**: Supervised fine-tuning pairs (`cero_sft_dataset.jsonl`).
  - **DPO Dataset**: Direct preference optimization pairs (`cero_dpo_dataset.jsonl`).
- Enables localized LoRA fine-tuning tailored to the user's specific developer environment and aliases.

### D. Session Undo Log & Destructive Rollback (`UndoLog.ts`)
- Records reversible operations (file creations, package installations, branch switches).
- Users can inspect recent actions by asking `>what did you just do` and trigger deterministic rollback via `>undo last step`.

---

## 7. Security & 8-Category Command Safety Guardian

- **Command Safety Guardian (`CommandSafetyGuardian.ts`)**: Permanently blocks destructive operations across 8 threat vectors (root deletion, raw disk zeroing, partition wipes, permission lockouts, fork bombs, UEFI wipes, glibc removal, and obfuscated base64 pipes).
- **Explicit Capability Refusal**: Asserts that Cero does not have the capability to execute dangerous commands, outputting an ANSI refusal banner with full consequence analysis and safe alternatives.
- **Asynchronous Consent Queue**: Non-destructive sensitive operations require explicit user approval via a non-blocking modal.
- **AST Shell Validation**: Model-generated commands are parsed by `ShellAstParser.ts` prior to execution.
- **Secret Redaction**: Sanitizes API keys, tokens, and passwords prior to writing traces to disk or terminal buffers.
