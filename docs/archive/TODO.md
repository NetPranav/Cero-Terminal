# Sentinel Terminal — Product Roadmap & Engineering Master Tracker

Sentinel Terminal is a high-performance, AI-native terminal emulator designed for mission-critical software engineering, robotics development (ROS/ROS 2), system administration, and modern full-stack workflows.

---

## 🏆 Master Roadmap Status by Tier (Active Focus)

| Tier | Focus Area | Status | Key Deliverables |
|---|---|---|---|
| **Tier 1** | **Shell-Native Autonomous Execution Engine** | 🟢 **COMPLETED** | Replaces brittle 101-tool JSON schema architecture with direct Shell (`zsh`/`bash`/`powershell`) CLI generation. Sandboxed via `SecurityEngine` & `PolicyEngine`. |
| **Tier 2** | **Autonomous Self-Healing & Refusal Interception** | 🟢 **COMPLETED** | Intercepts LLM conversational refusals (*"I don't have access"*), feeds command stderr/exit codes back into AI loop for up to 3 self-healing retries. |
| **Tier 3** | **Continuous On-Device Learning & LoRA Fine-Tuning** | 🟢 **COMPLETED** | Dynamic Episodic Memory (0ms in-context conditioning) + automatic ShareGPT dataset export for Qwen 2.5 Coder 3B LoRA fine-tuning. |
| **Tier 4** | **Sentinel-SERL: Self-Evolving Reflexion Loop & On-Device Training** | 🟢 **COMPLETED** | Autonomous failure analysis, Knowledge Deficit logging, DPO preference pair mining, MLX local training, and SerlCoordinator closed-loop integration. (887/887 tests passing). |
| **Tier 5** | **Production Hardening & Ground-Truth Intelligence Oracles** | 🟡 **IN PROGRESS** | Integrating battle-tested open-source technologies (`tldr-pages`, `thefuck` rules, GBNF grammar decoding, tree-sitter AST, and native macOS vibrancy). |

---

## 🐚 Tier 1: Shell-Native Autonomous Execution Engine

Transition Sentinel Terminal from fragile tool calling to native shell execution aligned with Qwen 2.5 Coder's pre-trained weights:

- [x] **1.1 Native Shell System Prompt Contract**
  - *Target*: `src/ai/agent/SystemPrompt.ts`
  - *Goal*: Remove 101 custom JSON tool schemas. Instruct the model as an active terminal copilot with full command generation authority.
  - *Format*: `{"action": "execute", "command": "<cli_command>", "explanation": "<1-line summary>"}` or `{"action": "done", "summary": "<response>"}`.
- [x] **1.2 Direct PTY Shell Execution Pipeline**
  - *Target*: `src/ai/agent/AgentLoop.ts`, `src/sdk/capabilities/drivers/ShellSDKCapability.ts`
  - *Goal*: Run commands directly via `/bin/zsh -lc` (macOS), `/bin/bash` (Linux), and `powershell` (Windows) with real environment variable and alias awareness.
- [x] **1.3 Security & Permission Guardrails**
  - *Target*: `src/domain/security/SecurityEngine.ts`, `src/domain/security/PolicyEngine.ts`
  - *Goal*: Zero-friction execution for read-only / diagnostic commands (`ls`, `mdfind`, `lsof`, `git status`, `networksetup`), while requiring 1-click user confirmation with 1-line explanation for sensitive/destructive commands (`rm`, `kill`, `sudo`).
- [x] **1.4 Direct Output Streaming to Terminal**
  - *Target*: `src/presentation/TerminalView.tsx`, `src/presentation/OutputFormatter.ts`
  - *Goal*: Real command stdout/stderr rendered cleanly without fake tool wrapper badges.

---

## 🔄 Tier 2: Autonomous Self-Healing & Refusal Interception

Ensure Sentinel never gets stuck on canned model refusals or broken command syntax:

- [x] **2.1 Conversational Refusal Interceptor**
  - *Target*: `src/ai/agent/AgentLoop.ts`
  - *Goal*: Detect and intercept LLM canned refusals (*"I don't have access to your file system"*, *"I cannot assist with that"*), reject the response, and re-prompt the model to generate the actionable terminal command.
- [x] **2.2 Stderr & Non-Zero Exit Code Feedback Loop**
  - *Target*: `src/ai/agent/AgentLoop.ts`
  - *Goal*: When a shell command fails (exit code != 0 or stderr), feed the exact error back into the AI context:
    *"Command '<cmd>' failed with code <code>: <stderr>. Analyze the failure and output a corrected command."*
- [x] **2.3 Three-Strike Autonomous Auto-Remediation**
  - *Target*: `src/ai/agent/AgentLoop.ts`
  - *Goal*: Allow up to 3 automatic correction attempts before halting and prompting the user for manual demonstration.
- [x] **2.4 Deterministic Execution Fallback**
  - *Target*: `src/ai/agent/AgentLoop.ts`
  - *Goal*: If LLM fails across 3 attempts, run deterministic OS probe as safety net.

---

## 🧠 Tier 3: Continuous On-Device Learning & LoRA Fine-Tuning

Make Sentinel adapt to the user's specific system, workflows, and style over time:

- [x] **3.1 Dynamic Episodic Memory Engine (Instant 0ms Recall)**
  - *Target*: `src/domain/learning/EpisodicMemoryEngine.ts`
  - *Goal*: Persist user demonstrations to `~/.sentinel/memory/episodic_memory.json`.
  - *Features*: Semantic & token-similarity retriever that fetches top matching demonstrations and injects them directly into the system prompt's dynamic context window.
- [x] **3.2 Persistent Demonstration Capture in Terminal**
  - *Target*: `src/presentation/TerminalView.tsx`
  - *Goal*: When a user demonstrates a command following an unresolved goal or runs `/learn`, Sentinel records `(goal, command, cwd, os)` into episodic memory.
- [x] **3.3 Continuous ShareGPT / Alpaca Dataset Generation**
  - *Target*: `src/domain/learning/EpisodicMemoryEngine.ts`
  - *Goal*: Automatically append every successful self-healing and demonstrated workflow to `~/.sentinel/training/sentinel_shell_dataset.jsonl`.
- [x] **3.4 One-Click LoRA Fine-Tuning Pipeline**
  - *Target*: `scripts/finetune_sentinel_lora.py`
  - *Goal*: Standalone fine-tuning script supporting Unsloth / PEFT to train lightweight LoRA adapter (`~/.sentinel/models/sentinel_custom_lora`) and auto-load via `llama-server --lora`.
- [x] **3.5 Dynamic Adaptive Multi-Phase Planning**
  - *Target*: `src/ai/agent/AdaptivePlanEngine.ts`, `src/ai/agent/AgentLoop.ts`
  - *Goal*: Compound goal routing (`requiresExecutionPlan`), real shell execution per phase, `currentCwd` directory propagation, and runtime plan adaptation (reducing redundant phases e.g. git init skipping, increasing sub-phases for error recovery).

---

## 🚀 Tier 4: Sentinel-SERL (Self-Evolving Reflexion Loop & Frontier On-Device Intelligence)

Transform Sentinel into a truly self-evolving, closed-loop AI terminal copilot that actively learns from its own failures, refuses to use cloud models, and self-trains locally via 4 breakthrough pillars:

- [x] **4.1 Speculative Shadow-PTY Simulation Engine ("Minority Report for the Shell")**
  - *Target*: `src/ai/agent/ShadowPtySimulator.ts`
  - *Goal*: Spawns an ephemeral RAM sandbox that executes 3 parallel candidate branches in milliseconds before presenting any command to the user. Evaluates empirical rewards (exit code 0, non-empty stdout, zero stderr) and prunes failing trajectories. Safe non-destructive predicate transformations (`kill -0`, `test -e`, `zsh -n -c`) ensure 100% zero-risk simulation.
- [x] **4.2 Runtime Knowledge Deficit Logger**
  - *Target*: `src/domain/learning/KnowledgeDeficitLogger.ts`
  - *Storage*: `~/.sentinel/learning/knowledge_deficits.jsonl`
  - *Goal*: Automatically intercept when the model fails, produces an excuse, or outputs an unresolved answer (e.g. *"can't detect how many ports are used by antigravity"*). Capture prompt, model output, environment context, and execution status with entity/intent extraction and query/resolution APIs.
- [x] **4.3 Autonomous Background Reflexion & Counterfactual Synthesis Engine**
  - *Target*: `src/domain/learning/ReflexionEngine.ts`
  - *Goal*: When the terminal is idle, an autonomous background reflexion agent examines logged deficits, identifies the target entity and intent, tests candidate command pipelines in a sandbox, and discovers the verified solution. Includes idle worker lifecycle and counterfactual resolution pipeline.
- [x] **4.4 Direct Preference Optimization (DPO) Pair Generator**
  - *Target*: `src/domain/learning/DpoDatasetEngine.ts`
  - *Storage*: `~/.sentinel/training/sentinel_dpo_pairs.jsonl`
  - *Goal*: For every resolved deficit, construct a DPO training pair:
    - `prompt`: User's original request (e.g. *"give me the list of the ports used by antigravity"*).
    - `rejected`: The bad output generated by the model (refusals, excuses, broken syntax).
    - `chosen`: The verified, working shell command pipeline.
  - *Impact*: Mathematically trains the neural network to suppress excuses and reinforce direct shell execution.
- [x] **4.5 On-Device Rule-Based GRPO Reinforcement Learning (DeepSeek-R1 Architecture for Bash)**
  - *Target*: `scripts/train_sentinel_grpo.py`
  - *Goal*: Pure reinforcement learning using Group Relative Policy Optimization on Apple Silicon. Uses deterministic terminal rewards (exit 0 = +2.0, stderr = -1.5, refusal = -2.0) to teach the 3B model multi-step reasoning without human labels. Includes `--test-rewards` and `--dry-run` verification harness.
- [x] **4.6 Neural Activation Steering (Representation Engineering)**
  - *Target*: `src/ai/models/ActivationSteeringManager.ts`
  - *Goal*: Steers hidden layer activations during token generation: $\vec{h} \leftarrow \vec{h} + \alpha \vec{v}_{\text{unix}} - \beta \vec{v}_{\text{refusal}}$. Physically suppresses refusal attention heads at inference time with 0ms latency. Includes 23 comprehensive mathematical and runtime tests.
- [x] **4.7 The "Dream-State" Nightly Autonomous Self-Play Engine**
  - *Target*: `src/domain/learning/DreamStateScheduler.ts`
  - *Goal*: When the Mac is idle and connected to power (e.g. at 2 AM), Sentinel scans local installed tools (`brew`, `launchctl`, Docker, local repos), synthesizes personalized system puzzles across 5 operational categories, solves them in a Shadow-PTY sandbox, and generates high-reward DPO training pairs before morning. Includes 13 comprehensive tests.
- [x] **4.8 Apple Silicon Native MLX LoRA Fine-Tuning Pipeline & Hot-Reload**
  - *Target*: `scripts/train_sentinel_mlx.py`, `src/ai/models/EmbeddedEngineManager.ts`, `src-tauri/src/embedded_server.rs`
  - *Goal*: 1-click local fine-tuning script utilizing Apple's native `mlx-lm` framework. Runs on Apple Silicon Unified Memory GPU in under 10 minutes without CUDA or cloud costs, and hot-reloads the adapter directly into `llama-server --lora`. Includes `--test-mlx` verification harness and hot-reload lifecycle testing.
- [x] **4.9 End-to-End Joint Integration of Sentinel-SERL Closed-Loop Architecture**
  - *Target*: `src/domain/learning/SentinelSerlCoordinator.ts`, `src/ai/agent/AgentLoop.ts`, `src/presentation/TerminalView.tsx`, `src/domain/learning/SentinelSerlCoordinator.test.ts`
  - *Goal*: Harmonizes and synchronizes all 8 Tier 4 subsystems into an autonomous, closed-loop, self-evolving architecture on Apple Silicon macOS. Refusal-suppression logit biases steer local model generation, candidate commands are speculatively evaluated in Shadow-PTY, model excuses and command failures are caught in KnowledgeDeficitLogger, idle periods trigger ReflexionEngine counterfactual synthesis into DpoDatasetEngine, user demonstrations record to EpisodicMemoryEngine, nightly idle on AC power triggers DreamStateScheduler self-play, and MLX distillation hot-reloads adapters into llama-server with zero downtime. (150/150 test files, 887/887 tests passing).

---

## 🛡️ Tier 5: Production Hardening & Ground-Truth Intelligence Oracles

Elevate Sentinel from raw LLM reasoning to hybrid ground-truth intelligence by merging battle-tested, open-source technology standards:

- [x] **5.1 Offline `tldr-pages` Ground-Truth CLI Knowledge Base & Fast-Path Retrieval**
  - *Target*: `src/domain/knowledge/TldrKnowledgeEngine.ts`, `src/ai/agent/AgentLoop.ts`, `src/ai/agent/ShadowPtySimulator.ts`
  - *Goal*: Bundle an offline, local catalog of community-curated `tldr-pages` covering macOS BSD and Unix tools (70+ binaries, 250+ canonical recipes). Enables sub-millisecond semantic retrieval of canonical, verified CLI recipes (`dscacheutil`, `lsof`, `tar`, `mdfind`, `diskutil`, `networksetup`, `launchctl`, `rsync`) with 100% ground-truth accuracy, prompt exemplar enrichment, and zero LLM flag hallucination. Fully verified across 903 unit and integration tests.
- [x] **5.2 Deterministic Error-Remediation Rule Oracle (`thefuck` Architecture)**
  - *Target*: `src/domain/remediation/DeterministicRuleOracle.ts`, `src/ai/agent/ErrorDiagnosticsEngine.ts`, `src/presentation/TerminalView.tsx`, `src/domain/observer/PtyOutputObserver.ts`
  - *Goal*: Port and embed the top 59 battle-tested remediation rules from `nvbn/thefuck` directly into Sentinel's diagnostic engine across 8 subsystems (Git, package managers, filesystem, Docker, permissions, process/port, shell typos, and macOS system tools). When commands fail with known patterns (`git push` missing upstream, `brew` Xcode license, `docker` daemon stopped, typos, directory creation), instantly applies the exact deterministic fix in <1ms without calling the LLM. Fully verified across 940 unit and integration tests.
- [x] **5.3 GBNF (GGML BNF) Grammar-Constrained Decoding for Embedded llama-server**
  - *Target*: `src/ai/models/GbnfGrammarManager.ts`, `src/ai/provider/EmbeddedProvider.ts`, `src/ai/provider/Provider.ts`, `src/ai/agent/AgentLoop.ts`
  - *Goal*: Enforce strict formal grammar constraints at the hardware sampling level in embedded `llama-server`. Uses custom `.gbnf` grammars for actions (`SENTINEL_ACTION_GBNF`), planner steps (`SENTINEL_PLANNER_GBNF`), and JSON schemas. Mathematically eliminates 100% of conversational chatbot apologies, markdown backtick leakage, and malformed JSON output at zero token overhead. Fully verified across 952 unit and integration tests.
- [x] **5.4 Concrete AST Syntactic Parsing & Pipeline Validation (`ShellAstParser.ts`)**
  - *Target*: `src/domain/security/ShellAstParser.ts`, `src/ai/agent/ShadowPtySimulator.ts`, `src/domain/security/ShellCommandGuard.ts`
  - *Goal*: Recursive-descent concrete AST parser for Bash/Zsh/POSIX shell command lines. Validates compound pipelines (`cmd1 | cmd2 && (cmd3 || cmd4)`), nested subshells, environment variable prefixes (`NODE_ENV=production PORT=3000 node server.js`), redirections (`2>&1`), and command substitutions (`$(...)`), mathematically eliminating security evasion and accurately isolating executable binary names and catastrophic destructive operations. Fully verified across 968 unit and integration tests.
- [x] **5.5 Native macOS Desktop Polish & Vibrancy (Original Terminal Feel)**
  - *Target*: `src-tauri/tauri.conf.json`, `src/App.css`, `src/App.tsx`, `src/presentation/TerminalView.tsx`
  - *Goal*: Configured native macOS window vibrancy (`transparent: true`, `backdrop-filter: blur(28px)`), overlay titlebar with traffic light inset clearance (`titleBarStyle: "Overlay"`, `hiddenTitle: true`, 78px traffic light padding), native window dragging (`-webkit-app-region: drag` on header with non-drag interactive controls), suppressed default webview context menus, disabled web text selection outside terminal grid (`user-select: none`), and SF Mono subpixel font smoothing with WebGL hardware acceleration. Fully verified across 968 unit and integration tests.
- [x] **5.6 Grand Unified Integration: Closed-Loop Tier 4 (SERL) + Tier 5 (Ground-Truth Oracles)**
  - *Target*: `src/domain/learning/SentinelSerlCoordinator.ts`, `src/domain/learning/ReflexionEngine.ts`, `src/domain/learning/DreamStateScheduler.ts`, `src/domain/observer/PtyOutputObserver.ts`, `src/ui/components/StatusBar.tsx`
  - *Goal*: Synthesize all 14 Tier 4 & Tier 5 intelligence subsystems into one synchronized, closed-loop runtime:
    1. `SentinelSerlCoordinator`: Exposes `executeUnifiedResolution(goal, context)` fast path orchestrator (Rule Oracle -> TLDR recipes -> Episodic Memory -> GBNF/Steering LLM fallback) and unified 14-subsystem telemetry dashboard (`getSystemDashboard`).
    2. `ReflexionEngine`: Enhanced with sub-millisecond Deterministic Rule Oracle diagnoses and TLDR canonical recipe candidates pre-validated by `ShellAstParser`.
    3. `DreamStateScheduler`: Generates realistic Category 6 system puzzles seeded from TLDR recipes of locally installed CLI binaries.
    4. `PtyOutputObserver`: Seamlessly routes unhandled shell command failures directly to `SentinelSerlCoordinator.onCommandExecutionFailure` for autonomous background reflexion.
    5. `StatusBar`: Unified `⚡ SERL & Oracles` status pill rendering live metrics tooltip for the complete local intelligence stack.
  - *Verification*: All 154 test suites passing (971/971 tests green), `tsc --noEmit` clean (0 errors), `cargo check` clean (0 errors), native release bundle compiled and deployed to `/Applications/Sentinel Terminal.app`.

---

## 🔮 Milestone v2.1: Macro Recording & 1-Click Multi-App Workflow Automation (Upcoming)

Promised for **Version 2.1**, this major evolution upgrades the Sentinel Workflow System from task-level execution to full **desktop and browser macro automation**:

- [ ] **2.1.1 Interactive Workflow & Macro Recorder ("Record & Replay")**
  - *Target*: `src/workflows/MacroRecorder.ts`, `src/domain/observer/DesktopActionObserver.ts`
  - *Goal*: Enable users to record sequential desktop and terminal actions. When recording is started (`>record workflow: <name>`), Sentinel observes launched applications, browser navigations, and CLI steps, producing clean declarative workflow definitions.
- [ ] **2.1.2 1-Click Multi-App & Multi-Browser Orchestration**
  - *Target*: `src/workflows/MultiAppOrchestrator.ts`, `src/sdk/capabilities/drivers/BrowserCapability.ts`, `src/sdk/capabilities/drivers/ApplicationCapability.ts`
  - *Goal*: Execute complex multi-application desktop setups in a single command or click.
  - *Real-world Workflow Example*:
    - Open **Claude**, **Gemini**, and **ChatGPT** concurrently in **Safari**.
    - Open **YouTube** (or reference video/music) in **Google Chrome**.
    - Open **Antigravity IDE** (or Visual Studio Code) targeted at the current repository.
    - Result: With a single prompt (`>start ai dev session`) or 1-click UI button, the entire multi-browser, multi-app workspace is launched and arranged.
- [ ] **2.1.3 Declarative Workflow Storage & Quick-Trigger Binding**
  - *Target*: `src/workflows/WorkflowStorage.ts`, `src/ui/components/WorkflowBar.tsx`
  - *Goal*: Save recorded macros as human-readable JSON/YAML in `~/.sentinel/workflows/`. Bind any macro to customizable hotkeys (e.g. `Cmd+Shift+1`) or the terminal quick-action bar.
- [ ] **2.1.4 Window Tiling & Workspace Geometry Management**
  - *Target*: `src/platform/macos/WindowGeometryManager.ts`
  - *Goal*: Automatically position and tile orchestrated application windows across multiple displays or split desktop spaces for zero-friction context switching.

---

## 🏛️ Completed Foundation (Archived Milestone)
- ✅ Core Reliability, Security & Sandbox Fortification (749/749 tests green).
- ✅ Visual Auto-Remediation Toast HUD, Workspace Quick-Switcher (`Cmd+O`), Port & Process Manager (`Cmd+Shift+P`), Frecency History (`Ctrl+R`) (754/754 tests green).
- ✅ Plugin Marketplace runtime, cryptographic tamper-evident audit logs, remote SSH session multiplexer (765/765 tests green).
- ✅ Full Tier 4: Sentinel-SERL (Self-Evolving Reflexion Loop & Frontier On-Device Intelligence) (887/887 tests green).
- ✅ Production Release v2.0.0: Decoupled refusal interception, autonomous self-healing, multi-turn referential context resolution, macOS IP/DHCP renewal, and full offline Metal acceleration (983/983 tests green).


