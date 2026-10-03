# Codebase map

Every TypeScript source file under `src/`, grouped by directory, with its line count, whether the
application can reach it, and the first line of its own header comment. Generated from the import
graph (entry points: `src/main.tsx` for the app, `scripts/*.ts` for the CLI and benchmark tools).
Regenerate after large refactors; see "Regenerating" at the end.

Status: **app** = loaded by the desktop app; **cli** = only used by scripts; **unreachable** = imported by
nothing that runs (candidates for removal).

Totals: 199 app, 1 cli-only, 252 unreachable.

## `src/` (2/2 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `App.tsx` | 1649 | app | - |
| `main.tsx` | 116 | app | - |

## `src/actions/` (0/7 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `loader/ActionLoader.ts` | 187 | unreachable | Reads and validates tool.json files into ActionDefinitions Adapts the legacy tool.json format into the enriched ActionDefinition schema |
| `models/ActionTypes.ts` | 434 | unreachable | Complete Type System for the Action Registry Every Action is a self-describing, platform-independent capability |
| `registry/ActionRegistry.ts` | 209 | unreachable | Multi-index in-memory capability catalog Completely declarative |
| `resolver/ActionResolver.ts` | 103 | unreachable | Converts ExecutionPlan (GoalNodes) → ActionGraph (ActionNodes) Maps each GoalNode's goal ID to the best matching ActionDefinition |
| `runtime/ActionRuntime.ts` | 47 | unreachable | Stub interfaces for Phase 4+ Defines the contract for the Execution Runtime |
| `search/ActionSearch.ts` | 118 | unreachable | Hybrid ranked retrieval pipeline Ranking order: 1 |
| `validation/ActionValidator.ts` | 119 | unreachable | Pre-execution planning validation Validates inputs, required entities, platform compatibility, and constraints |

## `src/ai/` (49/105 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `agent/ActionGate.ts` | 255 | app | Pre-Execution Action Validation, Gating & Safety Enforcement Verifies every candidate action proposed by the model before execution: 1 |
| `agent/AdaptivePlanEngine.ts` | 1280 | app | Dynamic Adaptive Multi-Phase Planning & Execution Engine Core AI architecture for: 1 |
| `agent/AgentLoop.ts` | 5739 | app | The Core AI Brain (ReAct Agent Loop) This replaces the entire regex-based intent pipeline with a real LLM-powered agent loop |
| `agent/Cancelled.ts` | 25 | app | Error class and check helper for task cancellation |
| `agent/CommandPortability.ts` | 114 | app | small, deterministic corrections for commands a model writes |
| `agent/ContextBudget.ts` | 114 | app | Token Budgeting & Message Fitting for Cero AI Prevents context overflow in embedded (llama.cpp) and external models by strictly fitting system prompt,... |
| `agent/DecisionCall.ts` | 108 | app | Extracted LLM Decision Call Builder Prepares structured chat messages and GenerateOptions for the agent loop and for evaluation scripts (Task 3.1) so ... |
| `agent/DirectoryNavigationEngine.ts` | 235 | app | - |
| `agent/DynamicToolPruner.ts` | 142 | app | Cero — Dynamic Domain Tool Pruner Reduces large tool libraries (103+ tools) down to the 4–6 most relevant tools for any given user instruction in <1ms |
| `agent/ErrorDiagnosticsEngine.ts` | 255 | app | Cero — Error Diagnostics Engine Inspects execution failures (stderr, non-zero exit codes, error payloads) and determines whether an error is autonomou... |
| `agent/ErrorSources.ts` | 67 | app | which source files an error points at |
| `agent/FailureClassifier.ts` | 179 | app | Failure Classification Before Retry (Phase 0.5, Item 10) Categorizes command and tool execution failures before embarking on retries: - MISSING_BINARY... |
| `agent/FixFile.ts` | 72 | app | "fix buggy.py so it prints the right total" |
| `agent/InstantAnswers.ts` | 202 | app | deterministic answers for the most common inspection questions |
| `agent/ModelReply.ts` | 182 | app | ModelReply.ts: understand what a model sent back, whichever model it was |
| `agent/PromptProgressManager.ts` | 191 | app | Real-time AI Prompt Progress & Time Estimation Tracks live progress percentage, multi-stage lifecycle, elapsed time, and estimated time to completion ... |
| `agent/ShadowPtySimulator.ts` | 731 | app | Speculative Shadow-PTY Simulation Engine ("Minority Report for the Shell") Part of Cero-SERL (Self-Evolving Reflexion Loop): Spawns an ephemeral RAM s... |
| `agent/StandardToolSpecs.ts` | 186 | app | Built-in Standard Tool Specifications Extracted from SystemPrompt.ts to reduce core prompt builder module footprint |
| `agent/SystemPrompt.ts` | 205 | app | Dynamic System Prompt Builder for LLM Agent Loop Generates a system prompt that includes all available tools from the registry, formatted so the LLM c... |
| `agent/TaskRecipes.ts` | 413 | app | tested commands for tricky, common requests |
| `agent/ToolExecutor.ts` | 175 | app | Bridge between AgentLoop and CapabilityRegistrySDK Executes a tool by ID with given parameters through the SDK driver registry |
| `agent/ToolParameterValidator.ts` | 120 | app | Cero — Zero-Hallucination Tool Parameter Validator Validates, repairs, and type-coerces LLM-generated parameter JSON before calling execution drivers |
| `agent/TypoFix.ts` | 59 | app | TypoFix.ts: read "opne fldor docs in cod" as "open folder docs in code" |
| `agent/WrongAnswerReporter.ts` | 84 | app | Formats and copies AI incorrect answers as cases.json test cases Allows users to report any wrong or unexpected AI answer directly to clipboard format... |
| `cache/AICache.ts` | 6 | unreachable | - |
| `cache/PromptCache.ts` | 23 | unreachable | - |
| `config/AIConfig.ts` | 5 | unreachable | - |
| `config/ModelConfig.ts` | 7 | unreachable | - |
| `config/PromptConfig.ts` | 8 | unreachable | - |
| `conversation/ConversationContext.ts` | 233 | unreachable | Pronoun Resolution & Reference Tracking Lightweight state manager that resolves follow-up references like "it", "that", "them", "there", "the file", "... |
| `conversation/ConversationEngine.ts` | 275 | unreachable | The Single Public Entry Point Orchestrates the full conversation understanding pipeline: User Input |
| `conversation/ConversationMemory.ts` | 155 | unreachable | Ring Buffer of Recent Conversation Turns Stores conversation history as a FIFO ring buffer |
| `conversation/ConversationTypes.ts` | 237 | unreachable | Strongly Typed Interfaces for the Conversation Engine Every type used across the conversation module is defined here |
| `conversation/EntityExtractor.ts` | 345 | unreachable | Strongly-Typed Regex Entity Extraction Extracts structured ConversationEntity[] from natural language input |
| `conversation/GoalExtractor.ts` | 163 | unreachable | Two-Tier Goal Extraction Tier 1: Fast heuristic matching (<5ms) via IntentNormalizer |
| `conversation/IntentNormalizer.ts` | 495 | unreachable | Synonym → Canonical Goal Mapping Maps the many natural-language ways users express the same intent into a single canonical NormalizedGoal string (doma... |
| `conversation/LocalModel.ts` | 254 | unreachable | Model Abstraction Layer for the Conversation Engine Provides a clean interface over the existing ModelProvider infrastructure |
| `conversation/PromptBuilder.ts` | 199 | unreachable | LLM Prompt Templates for Goal & Entity Extraction Builds structured prompts for the local model |
| `conversation/ResponseValidator.ts` | 244 | unreachable | LLM Response Validation & Recovery Validates every LLM response before the Conversation Engine returns it |
| `eval/compareReports.ts` | 41 | unreachable | compareReports.ts: line two evaluation reports up case by case |
| `helpers/EntityMatcher.ts` | 34 | app | - |
| `helpers/Ranking.ts` | 22 | unreachable | Basic keyword scoring logic |
| `helpers/Similarity.ts` | 32 | unreachable | - |
| `helpers/StringNormalizer.ts` | 5 | unreachable | - |
| `helpers/Tokenizer.ts` | 6 | unreachable | A very basic approximation (e.g., 1 token ≈ 4 characters) |
| `intent/CompositePatterns.ts` | 173 | unreachable | Multi-Step Intent Pattern Library Recognizes common multi-step user instructions that should be decomposed into sequential tool chains |
| `intent/ConfidenceEstimator.ts` | 60 | unreachable | Comprehensive Confidence Scoring Engine Computes overall confidence score (0.00 to 1.00) based on: - Tool identification clarity and match quality |
| `intent/ContextBuilder.ts` | 112 | unreachable | Dynamic Tool Awareness & Context Engineering At runtime, builds lightweight prompt runtime context from active Tool Registry state: - available tools,... |
| `intent/EntityExtractor.ts` | 340 | unreachable | Comprehensive OS & Registry Entity Extractor Reliably extracts all Cero required entities from natural language: paths, folders, files, URLs, reposito... |
| `intent/IntentClassifier.ts` | 74 | unreachable | Fast Hybrid Intent & Domain Classification Determines primary domain, category, and action from unrestricted natural language |
| `intent/IntentEngine.ts` | 132 | unreachable | Core Cero Local Intent AI Platform Coordinates the full natural language -> structured execution plan conversion pipeline: 1 |
| `intent/PlanValidator.ts` | 99 | unreachable | Structured Plan Verification & Auto-Correction Validates generated execution plans against active Tool Registry metadata |
| `intent/Planner.ts` | 541 | unreachable | Local Intent Multi-Step Task Decomposition Converts unrestricted natural language into sequential task arrays composed of Tool IDs and extracted entit... |
| `intent/SynonymMap.ts` | 171 | app | Centralized Verb & Noun Synonym Registry Single source of truth for all synonym expansions used across: - ToolSearcher (verb-aware scoring) |
| `management/AiStatus.ts` | 119 | app | pure function that computes the status-bar AI badge |
| `management/ModelManager.ts` | 531 | app | Autonomous Model Lifecycle & Evaluation Manager Responsibilities: - Detect installed models across available providers |
| `management/ModelRecommendationEngine.ts` | 217 | app | Hardware-Aware LLM Tier & Model Recommendation Engine Analyzes host hardware profile (RAM, CPU cores, GPU/VRAM) and assigns an optimal model tier: - B... |
| `models/AIProvider.ts` | 9 | app | - |
| `models/AIResponse.ts` | 12 | app | - |
| `models/ActivationSteeringManager.ts` | 766 | app | Neural Activation Steering & Representation Engineering Part of Cero-SERL (Self-Evolving Reflexion Loop): Breakthrough 3: Brain Surgery on the Residua... |
| `models/EmbeddedEngineManager.ts` | 1133 | app | Cero — Embedded Engine Manager Manages the self-contained local LLM inference lifecycle (Qwen2.5-Coder-3B-Instruct), request isolation across tabs, SH... |
| `models/GbnfGrammarManager.ts` | 218 | app | GBNF (GGML BNF) Grammar-Constrained Decoding Manager Formal grammar constraints enforced at the token sampling level in llama.cpp / llama-server |
| `models/IntentModel.ts` | 408 | app | Two-Tier Intent Classification & Step Decomposition Engine Implements Phase 0.75 Tasks: - 0.75.1: Real IntentModel.classify() backed by small CPU-resi... |
| `models/LocalModel.ts` | 17 | app | - |
| `models/ModelManifestManager.ts` | 316 | app | Adapter Version Registry & Rollback Controller Phase 0.75.12: Tracks active and historical adapter versions in `~/.cero/models/manifest.json` with sem... |
| `models/OllamaProvider.ts` | 125 | app | - |
| `planner/DependencyResolver.ts` | 86 | unreachable | Pure DAG operations for GoalNodes |
| `planner/GoalPlanner.ts` | 95 | unreachable | - |
| `planner/GoalResolver.ts` | 59 | unreachable | Normalizes a ConversationResult into a canonical internal root GoalNode |
| `planner/PlanValidator.ts` | 56 | unreachable | Validates the plan and updates the plan status/confidence |
| `planner/PlannerContext.ts` | 63 | unreachable | PlannerContext maintains the state during a planning session |
| `planner/PlannerMemory.ts` | 41 | unreachable | Goal ID -> JSON serialized array of GoalNodes |
| `planner/PlannerPrompts.ts` | 74 | unreachable | Prompts for the Goal Planning Engine Enforces logical breakdown without shell commands or execution details |
| `planner/PlannerTelemetry.ts` | 21 | unreachable | - |
| `planner/PlannerTypes.ts` | 149 | unreachable | Strongly Typed Interfaces for the Goal Planning Engine Defines the logical structures used to plan how a goal is achieved |
| `planner/PlanningStrategy.ts` | 33 | unreachable | Implements high-level planning strategies: - Conditional Planning: Skipping nodes that are already satisfied |
| `planner/TaskDecomposer.ts` | 221 | unreachable | - |
| `provider/CloudApiProvider.ts` | 666 | app | Unified Cloud LLM Provider Layer Implements ModelProvider for commercial and open cloud endpoints: - OpenAI (gpt-4o, gpt-4o-mini, o3-mini) |
| `provider/DecisionRequest.ts` | 61 | app | DecisionRequest.ts: the one place that decides how an agent request is sampled |
| `provider/EmbeddedProvider.ts` | 343 | app | Embedded llama.cpp Model Provider Communicates with a bundled llama-server sidecar binary that ships inside the Cero .app bundle |
| `provider/LlamaCppProvider.ts` | 101 | unreachable | llama.cpp / Local Server Provider Implementation Communicates with embedded or local HTTP llama.cpp runtime servers for ultra-fast Apple Silicon GGUF ... |
| `provider/OllamaProvider.ts` | 204 | app | Ollama Model Provider Implementation Communicates cleanly with local Ollama runtime over HTTP REST endpoints |
| `provider/Provider.ts` | 60 | app | Pluggable Model Provider Layer Defines the foundational interface for local and pluggable model inference providers |
| `provider/SecretStore.ts` | 55 | app | SecretStore.ts: API keys in the operating system keychain, not in browser storage |
| `registry/ToolIndexer.ts` | 34 | unreachable | - |
| `registry/ToolLoader.ts` | 29 | unreachable | - |
| `registry/ToolRegistry.ts` | 32 | unreachable | - |
| `registry/ToolSearcher.ts` | 27 | unreachable | - |
| `router/ContextBuilder.ts` | 11 | unreachable | - |
| `router/EntityExtractor.ts` | 18 | app | - |
| `router/IntentRouter.ts` | 81 | app | Two-Tier Intent Routing Engine Implements Phase 0.75 Tasks: - 0.75.1: Two-tier routing layer connecting IntentModel with EntityExtractor |
| `router/PromptBuilder.ts` | 56 | unreachable | - |
| `schemas/EntitySchema.ts` | 13 | app | - |
| `schemas/IntentSchema.ts` | 24 | app | - |
| `schemas/ResponseSchema.ts` | 22 | unreachable | - |
| `schemas/ToolSchema.ts` | 18 | unreachable | - |
| `schemas/WorkflowSchema.ts` | 21 | unreachable | - |
| `telemetry/DatasetGenerator.ts` | 69 | unreachable | SFT / LoRA Training Dataset Builder Converts self-improvement telemetry and validated execution plans into structured JSONL records suitable for super... |
| `telemetry/TelemetryRecorder.ts` | 61 | unreachable | Autonomous Self-Improvement Telemetry Engine Automatically captures runtime signals: - failed intent matches |
| `types/AI.ts` | 6 | unreachable | - |
| `types/Entity.ts` | 10 | unreachable | - |
| `types/Intent.ts` | 5 | unreachable | - |
| `types/Model.ts` | 16 | app | - |
| `types/Tool.ts` | 21 | unreachable | - |
| `types/Workflow.ts` | 17 | unreachable | - |

## `src/devtools/` (0/10 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `diagnostics/DiagnosticEngine.ts` | 31 | unreachable | Error and warning consolidation |
| `export/TraceExporter.ts` | 27 | unreachable | JSON, Markdown, HTML exporters |
| `index/DeveloperIndex.ts` | 67 | unreachable | Unified search across all observability structures |
| `inspector/Inspectors.ts` | 52 | unreachable | Read-Only Debug Views Consumes immutable snapshots from IDebugProviders and history from TraceEngine |
| `models/DevToolsTypes.ts` | 36 | unreachable | Core Data Models for Observability |
| `profiler/PerformanceProfiler.ts` | 36 | unreachable | Distributed metric aggregator |
| `providers/IDebugProvider.ts` | 24 | unreachable | Interface implemented by all core subsystems to expose read-only state |
| `timeline/TimelineEngine.ts` | 65 | unreachable | Time-Travel playback and seeking for TraceEvents |
| `tracing/TraceEngine.ts` | 52 | unreachable | Zero-overhead Event Bus for Observability |
| `visualizer/GraphVisualizer.ts` | 44 | unreachable | DAG and Graph rendering bounds |

## `src/domain/` (71/95 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `Capability.ts` | 161 | app | - |
| `SessionManager.ts` | 148 | app | - |
| `agent/AgentRuntime.ts` | 460 | unreachable | - |
| `agent/RetryEngine.ts` | 19 | unreachable | - |
| `agent/types.ts` | 47 | unreachable | - |
| `app/AppActions.ts` | 137 | app | the app's own functions, by request |
| `app/AppLaunchParser.ts` | 93 | app | Pure deterministic parser for application launch requests Maps phrases like "open firefox", "launch spotify", "start google chrome" directly to applic... |
| `autocomplete/AutocompleteEngine.ts` | 64 | app | - |
| `autocomplete/CapabilityProvider.ts` | 38 | unreachable | - |
| `autocomplete/DemonstrationProvider.ts` | 55 | app | Autocomplete provider that suggests learned user workflows and demonstrations |
| `autocomplete/HistoryProvider.ts` | 114 | app | - |
| `autocomplete/SystemSettingsProvider.ts` | 24 | app | Completes ">" requests about system settings with what this OS can do ("turn bluetooth off", "set brightness to 70%", "open sound settings"), so the s... |
| `autocomplete/WorkspaceContextProvider.ts` | 109 | app | Autocomplete provider that provides context-aware command suggestions based on the active directory's manifest files (Node, Rust, Python, ROS, Docker) |
| `autocomplete/types.ts` | 23 | app | - |
| `capabilities/AppAliasRegistry.ts` | 386 | app | Persistent Application Registry & Alias Resolution Manages native OS desktop application naming mappings and aliases |
| `capabilities/ClipboardCapability.ts` | 48 | unreachable | - |
| `capabilities/FilesystemCapability.ts` | 90 | unreachable | - |
| `capabilities/InputDaemonProbe.ts` | 201 | unreachable | ydotool/wtype Capability Probe (Phase 0.5, Item 8) Probes Linux desktop input automation readiness: - Detects display server (Wayland vs X11) and comp... |
| `capabilities/NetworkCapability.ts` | 65 | unreachable | - |
| `capabilities/ProcessCapability.ts` | 59 | unreachable | - |
| `capabilities/ShellCapability.ts` | 50 | unreachable | - |
| `capabilities/SystemCapability.ts` | 58 | unreachable | - |
| `desktop/DesktopCommands.ts` | 89 | app | window control and screenshots for the Linux desktop in use |
| `discovery/ProjectDiscoveryEngine.ts` | 330 | app | Cero — Project & Environment Discovery Engine Scans development workspaces for project manifests (ROS 1/2, Node, Python, Rust, Docker) to enable intel... |
| `discovery/WorkspaceRegistry.ts` | 191 | unreachable | Cero — Workspace Registry Scans, indexes, and caches developer workspaces (ROS 1/2, Node, Python, Rust, Docker) across local filesystem roots to provi... |
| `git/GitActionParser.ts` | 54 | app | Pure deterministic parser for Git inspection queries Direct routing for status, branch, log, and diff inspection requests before calling the model |
| `integration/InstallerService.ts` | 700 | app | - |
| `integration/UrlSchemeHandler.ts` | 120 | app | - |
| `interfaces.ts` | 88 | unreachable | Domain Layer Interfaces for Cero |
| `knowledge/SystemKnowledgeScanner.ts` | 509 | app | what Cero knows about this machine |
| `knowledge/TldrKnowledgeEngine.ts` | 936 | app | Offline Ground-Truth CLI Knowledge Base Part of Tier 5 (Production Hardening & Ground-Truth Intelligence Oracles): Provides instant 0.1ms semantic loo... |
| `learning/CeroSerlCoordinator.ts` | 864 | app | End-to-End Cero-SERL Autonomous Orchestrator Part of Cero-SERL (Self-Evolving Reflexion Loop & Frontier On-Device Intelligence): Unifies and synchroni... |
| `learning/DemonstrationLearningEngine.ts` | 413 | app | Cero — Autonomous Demonstration & Pattern Learning Engine Enables Cero to learn new terminal workflows directly from human demonstrations or explicit ... |
| `learning/DpoDatasetEngine.ts` | 357 | app | Direct Preference Optimization (DPO) Pair Generator Part of Cero-SERL (Self-Evolving Reflexion Loop): Automatically constructs high-quality DPO traini... |
| `learning/DreamStateScheduler.ts` | 795 | app | The "Dream-State" Nightly Autonomous Self-Play Engine Part of Cero-SERL (Self-Evolving Reflexion Loop): Breakthrough 4: Nightly Autonomous Self-Play o... |
| `learning/EpisodicMemoryEngine.ts` | 389 | app | Cero — Tier 3: Episodic Memory Engine Implements Continuous On-Device Learning via: 1 |
| `learning/KnowledgeDeficitLogger.ts` | 455 | app | Runtime Knowledge Deficit Logger Part of Cero-SERL (Self-Evolving Reflexion Loop): Intercepts when the model fails, produces an excuse, or outputs an ... |
| `learning/LearnCommand.ts` | 52 | app | LearnCommand.ts: Cero learns only when told to |
| `learning/PowerState.ts` | 44 | app | is the machine on AC power, and how full is the battery? Background learning work must not drain a laptop battery |
| `learning/ProjectFingerprint.ts` | 96 | app | Workspace & Project Identification Scoping Part of Phase 0.5 (Roadmap item 0.5.4): Scopes episodic memory and learned patterns per project rather than... |
| `learning/ReflexionEngine.ts` | 472 | app | Autonomous Background Reflexion & Counterfactual Synthesis Engine Part of Cero-SERL (Self-Evolving Reflexion Loop): When the terminal is idle, this au... |
| `observer/PtyOutputObserver.ts` | 210 | app | Cero — Passive PTY Output Stream Observer Monitors real-time terminal stdout/stderr stream from standard shell sessions |
| `planner/Planner.ts` | 341 | unreachable | AI Operating Knowledge Base Orchestrator (Phase X Integrated) The Planner orchestrates Cero's Local Intent AI System: 1 |
| `planner/RuleBasedReasoningEngine.ts` | 72 | unreachable | 1 |
| `planner/types.ts` | 56 | unreachable | - |
| `process/ProcessPortManager.ts` | 196 | unreachable | Cero — Process & Port Manager Discovers active listening TCP/UDP ports, maps them to their owning PIDs and process binaries, and provides safe, 1-clic... |
| `remediation/AutoRemediationPolicy.ts` | 128 | app | decides whether a detected error may be fixed without asking |
| `remediation/DeterministicRuleOracle.ts` | 1719 | app | Battle-Tested CLI Error Remediation Oracle Ported from the battle-tested architecture of nvbn/thefuck (85,000+ GitHub stars) and tailored specifically... |
| `remote/RemoteSSHManager.ts` | 113 | unreachable | Cero — Remote SSH Manager Discovers and parses remote SSH hosts from ~/.ssh/config, providing one-click remote multiplexing and connection across clou... |
| `rice/DotfileManager.ts` | 242 | app | Cero — Safe Dotfile & Rice Configuration Manager Provides safe, non-destructive configuration editing for window managers (Hyprland, i3, Sway), termin... |
| `rice/DotfileSyncEngine.ts` | 85 | app | Cero — Dotfile & Profile Sync Engine Bundles themes, glassmorphism UI preferences, learned AI demonstration workflows, and custom shell aliases into a... |
| `ros/RosEnvironment.ts` | 69 | app | make ROS 2 commands work from Cero |
| `ros/RosPipelinePlanner.ts` | 83 | app | ROS 2 requests that need several terminals |
| `security/AuditLogger.ts` | 207 | app | - |
| `security/BatchApproval.ts` | 67 | app | one confirmation for a whole plan instead of one per command |
| `security/CommandSafetyGuardian.ts` | 442 | app | 8-Category Linux System Destruction Guardian & Consequence Explainer Intercepts dangerous, catastrophic commands across 8 threat vectors: 1 |
| `security/ConsentQueue.ts` | 212 | app | Asynchronous Non-Blocking Consent Flow Part of Phase 0.5 (Roadmap item 0.5.2): Manages pending user consent/authorization requests for sensitive or ad... |
| `security/ExecutionEngine.ts` | 346 | app | - |
| `security/PermissionManager.ts` | 179 | app | - |
| `security/PolicyEngine.ts` | 179 | app | - |
| `security/ReadOnlyCommandPolicy.ts` | 312 | app | single source of truth for "this command line cannot change anything" |
| `security/SecretRedactor.ts` | 180 | app | Phase 0.5, Item 14 Scans text for common secret/credential patterns and replaces them with `[REDACTED:<type>]` placeholders before the text is persist... |
| `security/SecurityEngine.ts` | 388 | app | - |
| `security/ShellAstParser.ts` | 771 | app | ShellAstParser.ts Recursive-descent concrete AST parser for Bash/Zsh/POSIX shell command lines |
| `security/ShellCommandGuard.ts` | 363 | unreachable | - |
| `services/SystemServiceManager.ts` | 223 | app | Cero — Unified Cross-Platform System Service Manager Controls background daemons and services across Linux (systemd / systemctl), macOS (launchctl / b... |
| `session/SessionPersistenceEngine.ts` | 468 | app | Cero — Session Persistence Engine Provides crash-proof workspace state serialization for multi-tab and split-pane layouts |
| `session/UndoLog.ts` | 262 | app | Destructive Workflow Rollback & Undo Log (Phase 0.5, Item 9) Maintains a chronological log of commands and mutations executed across the session |
| `shell/ShellAdapter.ts` | 136 | app | - |
| `simulation/CommandCapabilityClassifier.ts` | 184 | app | CommandCapabilityClassifier.ts Implements Phase 0.5, Item 5: Classifies shell commands into three distinct simulation execution paths: |
| `system/AliasStore.ts` | 95 | app | AliasStore.ts: remember which folder or app a spoken name meant, so the same question is asked once |
| `system/AppCatalog.ts` | 157 | app | AppCatalog.ts: the apps installed on this computer, and the one a name means |
| `system/AppControl.ts` | 175 | app | quit an app the user names, after checking what is actually running |
| `system/DirectoryActionParser.ts` | 84 | app | Pure deterministic parser for directory operations Handles creation (mkdir), listing (ls), and navigation (cd) operations deterministically before inv... |
| `system/NameMatch.ts` | 88 | app | NameMatch.ts: one way to compare the name a person typed with real folder, file and app names |
| `system/OpenInApp.ts` | 56 | app | OpenInApp.ts: the command that opens a folder or file, alone or in an editor, on each OS |
| `system/OpenRequest.ts` | 137 | app | OpenRequest.ts: read "open the folder gitBrains in VS Code |
| `system/PathResolver.ts` | 141 | app | PathResolver.ts: turn "gitBrains" (and maybe "inside /padhai_in_linux/Projects") into a real path |
| `system/PortControl.ts` | 71 | app | "close port 8765": find what listens there, ask, stop exactly that, check it is free |
| `system/SystemControl.ts` | 427 | app | system settings by request, on macOS, Windows and Linux |
| `system/appAliases.ts` | 41 | app | appAliases.ts: what people type for an app, and the real names it goes by (all lower case keys) |
| `system/appPathProbe.ts` | 26 | app | appPathProbe.ts: the real file access for PathResolver (Tauri commands) |
| `terminal/PromptNavigationEngine.ts` | 314 | app | Terminal Line & Cursor Navigation vs History Guard Issue 9 Specification: 1 |
| `terminal/PtyStateTracker.ts` | 162 | app | PTY Session State Tracking & Safe Cancellation Guard Part of Phase 0.5 (Roadmap item 0.5.3): Tracks whether a terminal PTY session is: |
| `terminal/StdinHangDetector.ts` | 115 | app | Interactive Stdin Hang Detection & Non-Interactive Mitigation Part of Phase 0.5 (Roadmap item 0.5.18): Detects when spawned agent shell commands hang ... |
| `terminal/TerminalActions.ts` | 210 | app | requests about the terminals themselves |
| `terminal/TerminalWorkspace.ts` | 317 | app | what every terminal pane is doing, and a way to open new ones |
| `tool/DiscoveryEngine.ts` | 53 | unreachable | Filters and ranks tools based on semantic/keyword matching against the user's goal |
| `tool/ToolRegistry.ts` | 51 | app | - |
| `tool/types.ts` | 39 | app | - |
| `watch/ErrorWatchService.ts` | 224 | app | continuous error detection on log files and systemd units (`>watch`) |
| `workflow/TaskQueue.ts` | 48 | unreachable | - |
| `workflow/VariableEngine.ts` | 45 | unreachable | Interpolates variables within a string or object |
| `workflow/WorkflowEngine.ts` | 190 | unreachable | Track state of active workflows |
| `workflow/types.ts` | 86 | unreachable | - |

## `src/infrastructure/` (3/4 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `execution/NodeTauriBridge.ts` | 361 | cli | Seamless Tauri IPC Polyfill for Node.js / CLI Environments Enables all Cero Capability SDK drivers to execute real native macOS commands directly in N... |
| `interfaces.ts` | 29 | unreachable | Infrastructure Layer Interfaces for Cero |
| `logging/DiagnosticLogger.ts` | 65 | app | - |
| `storage/CeroFiles.ts` | 63 | app | read and write files under ~/.cero without a shell |

## `src/learning/` (0/9 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `discovery/PatternDiscoveryEngine.ts` | 102 | unreachable | Identifies recurring behaviors and sequences |
| `experience/ExperienceBuilder.ts` | 56 | unreachable | Normalizes diverse system events into ExperienceRecords |
| `models/LearningTypes.ts` | 68 | unreachable | Core Data Models for Cero Learning Engine Defines ExperienceRecords, LearningProfiles, and Recommendations |
| `optimizer/Optimizer.ts` | 41 | unreachable | Synthesizes Long-Term Preferences for Planner Context |
| `policies/LearningProfiles.ts` | 48 | unreachable | Manages context switching and privacy boundaries |
| `ranking/RankingEngine.ts` | 104 | unreachable | Adaptive Sorting based on Experience Deterministically sorts entities based on frequency, recency, success rate, and user feedback |
| `recommendations/RecommendationEngine.ts` | 70 | unreachable | Generates Contextual Nudges & Explanations |
| `store/ExperienceStore.ts` | 63 | unreachable | Independent Append-Only Experience Store Stores experience records optimized for time-series analytics and pattern discovery |
| `telemetry/LearningTelemetry.ts` | 38 | unreachable | Metrics for Pattern Throughput and Engine Scale |

## `src/memory/` (0/11 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `entities/EntitySchemas.ts` | 132 | unreachable | Strongly Typed Schemas for Memory Graph Entities Defines the 18 core entities capable of existing as nodes in the Knowledge Graph |
| `explainability/ExplainabilityEngine.ts` | 85 | unreachable | Memory Retrieval Transparency Enriches retrieved memory nodes with natural language reasoning, detailing the path traversal and confidence scores |
| `graph/KnowledgeGraph.ts` | 136 | unreachable | In-Memory Directional Graph Holds nodes and edges, provides traversal and subgraph extraction algorithms |
| `models/MemoryTypes.ts` | 76 | unreachable | Core Data Models for Cero Memory Engine Enforces immutable provenance, strict privacy labels, confidence scoring, and semantic revision histories for ... |
| `pipeline/ObservationPipeline.ts` | 131 | unreachable | The Only Path to Memory Mutation Ensures all explicit and implicit facts pass through validation and policy enforcement before being committed to the ... |
| `policies/PolicyEngine.ts` | 97 | unreachable | Enforces Data Lifecycles & Privacy Rules Applies confidence decay over time, enforces TTL expirations, and masks data based on PrivacyLabels |
| `relationships/RelationshipTypes.ts` | 44 | unreachable | Defined Edge Vocabularies for Knowledge Graph Includes base weights to influence retrieval ranking |
| `retrieval/RetrievalEngine.ts` | 119 | unreachable | Multi-Stage Hybrid Memory Retrieval Implements the 8-stage pipeline: Exact Match → Filter → Expand → Semantic → Embedding → Rank → Explain → Context |
| `store/MemoryStore.ts` | 122 | unreachable | Append-Only Revision History Persistence Persists the KnowledgeGraph |
| `telemetry/MemoryTelemetry.ts` | 47 | unreachable | Metrics and Performance Tracking for Memory Engine |
| `validation/MemoryValidator.ts` | 114 | unreachable | Structural & Semantic Knowledge Graph Validation Prevents duplicates, broken edge references, circular ownership constraints, and ensures entities mat... |

## `src/platform/` (0/13 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `backup/BackupManager.ts` | 37 | unreachable | Automated archive bundling |
| `configuration/ConfigService.ts` | 41 | unreachable | Unified Configuration Manager |
| `configuration/FeatureFlagManager.ts` | 36 | unreachable | Dynamic runtime flags without recompilation |
| `crash/CrashManager.ts` | 37 | unreachable | Global Exception Interceptor |
| `diagnostics/HealthMonitor.ts` | 35 | unreachable | Continuous subsystem tracking |
| `diagnostics/SelfDiagnostics.ts` | 36 | unreachable | Generates human readable reports |
| `installer/InstallerEngine.ts` | 31 | unreachable | Lifecycle scaffolding |
| `logging/Logger.ts` | 53 | unreachable | Centralized Structured Logging |
| `migration/MigrationManager.ts` | 36 | unreachable | Schema version migrations |
| `release/ReleaseMetadata.ts` | 34 | unreachable | Build hashes and schemas |
| `security/ISecretProvider.ts` | 10 | unreachable | Abstraction for OS secure storage |
| `security/SecretManager.ts` | 25 | unreachable | High-level API for tokens/keys |
| `updater/AutoUpdater.ts` | 36 | unreachable | Version and channel checking |

## `src/plugins/` (1/14 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `bridge/SDKBridge.ts` | 62 | unreachable | Security Boundary Proxy Intercepts calls from the Plugin Sandbox to the Core SDK |
| `bus/PluginMessageBus.ts` | 59 | unreachable | Strongly-typed inter-plugin isolated communication channel |
| `dependencies/DependencyResolver.ts` | 73 | unreachable | Validates dependency DAG and semantic versions |
| `hooks/ExtensionPoints.ts` | 54 | unreachable | Event-Driven Core Hooks Allows plugins to subscribe to Core lifecycle events without modifying Core |
| `host/PluginHost.ts` | 83 | unreachable | Independent Owner for an Individual Plugin Instance Instantiates the Sandbox, configures SDK Bridge, injects capabilities, and gracefully manages isol... |
| `lifecycle/PluginLifecycle.ts` | 87 | unreachable | Orchestrates the Plugin State Machine |
| `manifest/ManifestValidator.ts` | 46 | unreachable | Enforces PluginManifest integrity via Zod |
| `marketplace/PluginMarketplaceCatalog.ts` | 191 | app | Cero — Plugin Marketplace Catalog Provides a curated catalog of ecosystem extensions for Cero, with 1-click installation, permission verification, and... |
| `models/PluginTypes.ts` | 44 | unreachable | Core Data Models for the Plugin SDK |
| `permissions/PermissionManager.ts` | 41 | unreachable | Evaluates Capability-level permissions |
| `registry/PluginRegistry.ts` | 41 | unreachable | Discovers and tracks loaded plugins |
| `sandbox/PluginSandbox.ts` | 47 | unreachable | Execution Isolation Boundary For this architecture, we use Node VM as an implementation detail, proxying exclusively through the SDKBridge to allow fu... |
| `sdk/CeroSDK.ts` | 52 | unreachable | Public SDK Surface API This is the ONLY object injected into the Plugin Sandbox |
| `telemetry/PluginTelemetry.ts` | 39 | unreachable | Tracks Load Times, Usage, and Crashes |

## `src/presentation/` (11/11 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `ChoiceRequests.ts` | 54 | app | ask the person to pick one of a few options, or type their own |
| `InputLineTracker.ts` | 165 | app | finds the text the user typed on the current input line |
| `OutputFormatter.ts` | 480 | app | terminal rendering for agent events and structured results |
| `PromptQueue.ts` | 297 | app | PromptQueue manages queued background and user agent prompts |
| `TerminalRequests.ts` | 50 | app | hand an AI request or a workflow run to the focused terminal pane |
| `TerminalSearchBar.tsx` | 412 | app | - |
| `TerminalView.tsx` | 2242 | app | - |
| `escapeKey.ts` | 35 | app | pure decision function for the Escape key and the Settings screen |
| `ghostKeys.ts` | 80 | app | pure decision function for ghost-text key handling |
| `paneFocus.ts` | 21 | app | keep the focused pane inside the tab on screen |
| `stopKeys.ts` | 43 | app | Pure decision logic for interrupt/stop key combinations (Ctrl+C) |

## `src/repair/` (0/22 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `engine/AdaptiveExecutionEngine.ts` | 126 | unreachable | Resilient Runtime Execution Layer Implements adaptive self-healing as an additional execution orchestration layer around the deterministic Phase 4 Run... |
| `engine/RecoveryEngine.ts` | 93 | unreachable | Logical Repair Graph Execution Orchestrator Executes logical RepairGraphs generated by the RepairPlanner through the standard Action runtime bridge |
| `history/RepairHistoryStore.ts` | 76 | unreachable | Structured Historical Recovery Attempt Repository Every repair attempt becomes structured historical data containing the diagnosed failure, applied lo... |
| `learning/AdaptiveLearningTracker.ts` | 100 | unreachable | Structured Pattern Telemetry & Strategy Ranking Evaluates historical repair logs to identify recurring operational faults and rank recovery strategy e... |
| `models/FailureClassification.ts` | 160 | unreachable | Structured Taxonomy & Diagnosis for Runtime Execution Failures Every failure encountered during execution or verification is classified into a structu... |
| `models/RepairTypes.ts` | 90 | unreachable | Data Schema and Interfaces for Adaptive Verification & Repair Engine Enforces structured multi-source evidence reporting, confidence scoring, logical ... |
| `repair/RepairGraph.ts` | 73 | unreachable | Logical Recovery Plan Structure Represents an automated, platform-independent recovery workflow generated by the RepairPlanner |
| `repair/RepairPlanner.ts` | 75 | unreachable | Logical Recovery Workflow Synthesizer Receives verification failures, analyzes root causes via structural taxonomy classification, selects optimal rec... |
| `strategies/AlternativeActionStrategy.ts` | 59 | unreachable | Fallback Action Discovery Strategy When primary execution or resource manipulation fails, this strategy substitutes an alternative logical action from... |
| `strategies/DependencyRepairStrategy.ts` | 78 | unreachable | Automated Dependency & Resource Provisioning Strategy Resolves missing CLI utilities, package binaries, or system daemons by generating logical packag... |
| `strategies/EscalationStrategy.ts` | 47 | unreachable | Controlled Failure Escalation & Termination Strategy Terminal catch-all strategy invoked when automated recovery strategies are exhausted or disallowe... |
| `strategies/IRepairStrategy.ts` | 30 | unreachable | Contract for Modular Self-Healing Strategies Each strategy is responsible for evaluating a specific class of operational failure and generating a plat... |
| `strategies/PermissionRecoveryStrategy.ts` | 57 | unreachable | OS Permission & Privilege Recovery Strategy Resolves access denials by generating explicit permission audit checkpoints and guidance instructions for ... |
| `strategies/RetryStrategy.ts` | 79 | unreachable | Flexible Retry Strategy Supporting Multiple Policies Support immediate, delayed, exponential backoff, dependency-triggered, and user approval retries ... |
| `strategies/RollbackStrategy.ts` | 50 | unreachable | Automated State Reversion Recovery Deployed when an action failure leaves the operating system in an inconsistent or partially modified state |
| `strategies/StateRefreshStrategy.ts` | 57 | unreachable | World Model Synchronization & Cache Expiration Recovery Resolves failures stemming from stale State Engine caches or unsynchronized OS mutations by fo... |
| `strategies/StrategyRegistry.ts` | 81 | unreachable | Automated Strategy Matching & Discovery Registry Maintains all registered self-healing strategies and prioritizes candidates based on structured failu... |
| `strategies/UserConfirmationStrategy.ts` | 57 | unreachable | Interactive User Consultation Strategy Deployed when automated recovery implies destructive side effects or significant ambiguity |
| `telemetry/RepairTelemetry.ts` | 74 | unreachable | Real-time Diagnostics & Self-Healing Performance Monitor Captures verification throughput, failure frequency, and automated repair recovery rates |
| `verification/AdaptiveVerificationEngine.ts` | 55 | unreachable | Central Verification Authority Coordinates multi-stage verification and evidence triangulation so the Execution Runtime never blindly assumes action s... |
| `verification/MultiStageVerifier.ts` | 110 | unreachable | Four-Tier Lifecycle Verification Engine Implements verification across four essential execution checkpoints: 1 |
| `verification/VerificationSources.ts` | 178 | unreachable | Multi-Source Evidence Triangulator Enforces evidence-based verification by combining independent observations from: 1 |

## `src/runtime/` (0/14 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `engine/ExecutionEngine.ts` | 104 | unreachable | Master orchestrator for Cero V3 Execution Runtime Coordinates ExecutionSessions, Schedulers, State Machines, and Event Streams |
| `events/RuntimeEventBus.ts` | 95 | unreachable | Typed, immutable, replayable event bus Every subsystem communicates only through events |
| `executor/NodeExecutor.ts` | 161 | unreachable | Executes ActionNodes with timeout, retries, and context publishing Enforces action retry policy and timeout |
| `lifecycle/RuntimeHooks.ts` | 48 | unreachable | Extensible lifecycle hooks Hooks allow plugins, logging, analytics, debugging, and learning without modifying the Runtime |
| `lifecycle/SessionLifecycle.ts` | 63 | unreachable | Manages the lifecycle of active execution sessions Ensures clean creation, tracking, and automatic eviction of sessions after completion to guarantee ... |
| `models/RuntimeTypes.ts` | 216 | unreachable | Complete Type System for the Execution Runtime Defines every interface used by the orchestration engine |
| `queue/ExecutionQueue.ts` | 91 | unreachable | Priority queue with dependency gating Nodes only become eligible when all dependencies are satisfied |
| `queue/ResourceLockManager.ts` | 57 | unreachable | Lightweight resource locking Prevents parallel execution on conflicting resources |
| `recovery/RecoveryManager.ts` | 84 | unreachable | Basic error containment and failure propagation Ensures the runtime never crashes from uncaught exceptions |
| `scheduler/Scheduler.ts` | 142 | unreachable | Intelligent context-aware scheduler Responsibilities: - Dependency resolution |
| `sessions/ExecutionSession.ts` | 302 | unreachable | Encapsulates an executing session and all its state Every user request creates an ExecutionSession |
| `state/ActionStateMachine.ts` | 96 | unreachable | Strict deterministic lifecycle for each ActionNode Created → Queued → Waiting → Running → Completed / Failed / Cancelled / TimedOut |
| `state/ExecutionContext.ts` | 74 | unreachable | Shared session memory Stores action outputs, temporary variables, shared entities, and runtime metadata |
| `telemetry/RuntimeTelemetry.ts` | 81 | unreachable | Rich execution metrics |

## `src/sdk/` (16/39 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `application/ApplicationCapability.ts` | 129 | unreachable | Native macOS Capability Driver for Application Lifecycle & Windows Implements Launch Services (open -a), full process string elimination (pkill -9 -i ... |
| `bluetooth/BluetoothCapability.ts` | 108 | unreachable | Native macOS Capability Driver for Bluetooth Radio & Hardware Devices Toggles hardware radio state via blueutil and manages device pairings |
| `browser/BrowserCapability.ts` | 92 | unreachable | Native macOS Capability Driver for Web Browsers & Tabs Handles browser session dispatch, secure HTTPS URL scheme injection, and AppleScript active tab... |
| `capabilities/CancellationToken.ts` | 38 | unreachable | Lightweight token for propagating cooperative cancellation to executing capabilities |
| `capabilities/CapabilityRegistrySDK.ts` | 305 | app | Central Capability SDK Binding Registry Binds every Tool Registry capability entry directly to its concrete TypeScript execution driver across all 10 ... |
| `capabilities/CapabilitySDK.ts` | 179 | app | Core Architecture for Cero Execution Capabilities Defines the standard interfaces and base classes for concrete capability execution drivers |
| `capabilities/CapabilityTypes.ts` | 155 | unreachable | Complete Interfaces for the Native macOS Capability SDK Defines structured payloads, metadata contracts, and context passthrough |
| `capabilities/drivers/ApplicationCapability.ts` | 614 | app | Concrete Execution Driver for Desktop Applications Implements native macOS Launch Services, window manager interaction, and software package installat... |
| `capabilities/drivers/BluetoothCapability.ts` | 464 | app | Concrete Execution Driver for Bluetooth Subsystems Implements native macOS Bluetooth control APIs via system_profiler and blueutil command interfaces |
| `capabilities/drivers/BrowserCapability.ts` | 181 | app | Concrete Execution Driver for System Browser Implements native default browser URL navigation, searches, tab management, bookmarks, downloads, and his... |
| `capabilities/drivers/DeveloperCapability.ts` | 229 | app | Concrete Execution Driver for Developer Workspace Tooling Implements native IDE launches (VS Code, Cursor AI, Xcode, Android Studio), terminal spawns,... |
| `capabilities/drivers/DockerCapability.ts` | 176 | app | Concrete Execution Driver for Docker & Compose Implements native container management, composition stacks, logs, and interactive container execution |
| `capabilities/drivers/FilesystemSDKCapability.ts` | 477 | app | Concrete Execution Driver for Filesystem Operations Implements native filesystem operations across 18 specialized tools without relying solely on simp... |
| `capabilities/drivers/GitCapability.ts` | 200 | app | Concrete Execution Driver for Git Version Control Implements local and remote Git workflow operations cleanly without ad-hoc AI scripts |
| `capabilities/drivers/MacSystemParsers.ts` | 155 | app | parse macOS system tool output (pmset, vm_stat, sysctl, df, ps) |
| `capabilities/drivers/NetworkingCapability.ts` | 181 | app | Concrete Execution Driver for Network Utilities & Probing Implements native diagnostic probes for ping reachability, traceroute hops, open TCP/UDP por... |
| `capabilities/drivers/NodeCapability.ts` | 146 | app | Concrete Execution Driver for Node.js Runtimes & Package Managers Implements direct execution of npm, pnpm, bun, and yarn package management and build... |
| `capabilities/drivers/PythonCapability.ts` | 146 | app | Concrete Execution Driver for Python Ecosystem & Data Tools Implements native execution for virtual environments, pip packages, scripts, and Jupyter d... |
| `capabilities/drivers/ShellSDKCapability.ts` | 149 | app | Concrete Execution Driver for Explicit Shell Commands Mapped from Tool Registry: "shell.execute" |
| `capabilities/drivers/SystemSDKCapability.ts` | 772 | app | Concrete Execution Driver for System Diagnostics & Monitoring Implements OS diagnostic probes across all 9 system monitoring capabilities |
| `capabilities/drivers/WifiCapability.ts` | 485 | app | Concrete Execution Driver for Wi-Fi Network Interfaces Implements native macOS airport scanning and networksetup connection controllers |
| `common/BaseCapability.ts` | 211 | unreachable | Abstract Base Class for Native macOS Capabilities Enforces metadata immutability, mock mode portability, cancellation checks, telemetry recording, and... |
| `developer/DeveloperCapability.ts` | 98 | unreachable | Native Capability Driver for IDE & Build Automation Manages developer workspace launches (Cursor, VS Code, Xcode), compiler triggers, and simulator di... |
| `diagnostics/DiagnosticsManager.ts` | 61 | unreachable | Decentralized Orchestration Engine for Subsystem Diagnostics Coordinates health checks and diagnostic sweeps across capabilities |
| `docker/DockerCapability.ts` | 102 | unreachable | Native Capability Driver for Container Automation & Lifecycle Management Handles Docker container dispatch, daemon state audits, image builds, and por... |
| `execution/CapabilityExecutor.ts` | 177 | unreachable | High-Performance Execution Bridge (<2ms dispatch) Connects the Phase 4 Execution Runtime to the Native macOS Capability SDK |
| `filesystem/FilesystemCapability.ts` | 111 | unreachable | Native macOS Capability Driver for Filesystem Operations Implements file creation, deletion via Trash API, copying, renaming, and checksum auditing |
| `git/GitCapability.ts` | 94 | unreachable | Native Capability Driver for Git Repository Automation & Version Control Handles repository cloning, status audits, commit executions, and branch mana... |
| `node/NodeCapability.ts` | 94 | unreachable | Native Capability Driver for Node.js Runtimes & NPM package scripting Implements package script execution (npm run), npx tool dispatch, and runtime en... |
| `permissions/PermissionManager.ts` | 80 | unreachable | Decentralized Orchestration Engine for macOS Permissions Checks required capability permissions against current operating system access grants |
| `process/ProcessCapability.ts` | 135 | unreachable | Native macOS Capability Driver for Process Sweeping & Listening Socket Audits Implements PID table searches, TCP socket port inspections (lsof -i), an... |
| `python/PythonCapability.ts` | 93 | unreachable | Native Capability Driver for Python Runtimes & Virtual Environments Handles virtualenv creation, pip package installation, and Python module execution |
| `registry/CapabilityRegistry.ts` | 138 | unreachable | Automated Discovery & O(1) Capability Lookup Registry Automatically loads built-in domain capabilities, supports future plugin capability extensions, ... |
| `rollback/RollbackEngine.ts` | 101 | unreachable | Decentralized Orchestration Engine for State Reversal Coordinates execution rollback across Capabilities without embedding domain-specific logic |
| `system/SystemCapability.ts` | 82 | unreachable | Native macOS Capability Driver for System Profiling & Hardware Controls Implements display, volume, battery power profiles (pmset), and system_profile... |
| `telemetry/CapabilityTelemetry.ts` | 111 | unreachable | Telemetry and performance metric tracker for Native Capability Drivers Tracks execution time, verification duration, rollback events, success percenta... |
| `terminal/TerminalCapability.ts` | 91 | unreachable | Native Capability Driver for Pseudo-Terminal (PTY) Shell Orchestration Implements terminal environment management, directory focus, and script streami... |
| `verification/VerificationEngine.ts` | 46 | unreachable | Decentralized Orchestration Engine for Execution Verification Coordinates postcondition verification across Capabilities without embedding domain-spec... |
| `wifi/WifiCapability.ts` | 141 | unreachable | Native macOS Capability Driver for Wi-Fi Networks Implements wireless network scanning, power state toggling via networksetup, and SSID authentication... |

## `src/shared/` (1/2 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `EventBus.ts` | 60 | unreachable | - |
| `platform.ts` | 76 | app | Unified Cross-Platform Detection Utilities Provides reliable host operating system detection and UI helper methods across Tauri webview runtimes, brow... |

## `src/state/` (0/12 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `cache/StateCache.ts` | 165 | unreachable | Multi-Tier Hot/Cold Cache with Automatic TTL & Event Invalidation Prevents repeated system queries during high-frequency planning and execution loops |
| `collectors/IStateCollector.ts` | 27 | unreachable | Collector Interface & Schema Enforces collector isolation: every domain capability owns its own state collector |
| `collectors/StateCollectorManager.ts` | 105 | unreachable | Decentralized State Harvesting Aggregator Coordinates state collection across all SDK capability collectors |
| `diff/StateDiffer.ts` | 93 | unreachable | Structural Before/After Delta Analyzer for World Model Snapshots Computes exact modifications between any two historical snapshots so the Planner and ... |
| `engine/StateEngine.ts` | 176 | unreachable | Centralized State Engine & World Model Synchronization Hub Serves as Cero's single source of truth for all operating system state |
| `events/StateEventBus.ts` | 92 | unreachable | Real-time event propagation mechanism for State Engine Prefer subscriptions over polling to keep the World Model synchronized |
| `models/StateTypes.ts` | 80 | unreachable | Core Data Contracts for Cero V3 State Engine & World Model Implements rigorous state wrappers containing timestamp, confidence (0.0 to 1.0), origin so... |
| `models/WorldModel.ts` | 176 | unreachable | The Single Source of Truth representing current Operating System state |
| `queries/StateQueries.ts` | 184 | unreachable | Ergonomic, Strongly-Typed State Query Layer Planner and Runtime should NEVER inspect raw snapshots directly |
| `snapshot/StateSnapshot.ts` | 73 | unreachable | Immutable World Model Snapshot Generator & History Log Every state update generates an immutable snapshot (Object.freeze) |
| `telemetry/StateTelemetry.ts` | 80 | unreachable | Performance & Synchronization Diagnostics Metric Collector Monitors cache efficiency, query latency, and snapshot generation frequency |
| `watchers/StateWatchers.ts` | 88 | unreachable | Real-time event subscription handlers and OS mutation watchers Replaces iterative polling by listening to system event hooks and publishing synchroniz... |

## `src/tools/` (8/11 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `compiler/WorkflowCompiler.ts` | 175 | unreachable | WorkflowCompiler.ts Compiles a tool's workflow.json into an executable Workflow object |
| `entities/EntityTypes.ts` | 80 | unreachable | EntityTypes.ts Defines standard semantic entities supported by the AI Operating Knowledge Base |
| `loader/ToolLoader.ts` | 310 | app | ToolLoader.ts Discovers, validates, and loads all tool folders into the registry |
| `registry/AliasIndex.ts` | 73 | app | AliasIndex.ts Maps alternate wording / aliases → tool IDs |
| `registry/DomainIndex.ts` | 40 | app | DomainIndex.ts Groups tools by their domain (network, filesystem, system, shell, etc.) |
| `registry/EntityIndex.ts` | 52 | app | EntityIndex.ts Maps entity types (ssid, device_name, file_path, etc.) → tool IDs that consume them |
| `registry/KnowledgeIndex.ts` | 115 | app | KnowledgeIndex.ts Indexes semantic knowledge from knowledge.json files |
| `registry/TagIndex.ts` | 33 | app | TagIndex.ts Maps tags → tool IDs |
| `registry/ToolIndex.ts` | 47 | app | ToolIndex.ts Primary index: maps tool ID → LoadedTool |
| `schemas/ToolDefinitionSchema.ts` | 220 | app | ToolDefinitionSchema.ts Zod schemas for every JSON file in a tool folder |
| `search/ToolSearcher.ts` | 309 | unreachable | ToolSearcher.ts Multi-dimensional semantic search across all registry indexes with stopword exclusion, typo tolerance, verb-aware scoring, entity-cont... |

## `src/ui/` (16/16 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `components/AiSettingsPage.tsx` | 2530 | app | - |
| `components/ChoiceDialog.tsx` | 106 | app | - |
| `components/CommandPalette.tsx` | 246 | app | - |
| `components/EmbeddedModelManagerModal.tsx` | 807 | app | - |
| `components/FileAssociationPrompt.tsx` | 131 | app | - |
| `components/GhostText.ts` | 116 | app | - |
| `components/HistorySearchModal.tsx` | 336 | app | - |
| `components/InstallerWizard.tsx` | 1222 | app | - |
| `components/KeyboardShortcutsModal.tsx` | 398 | app | - |
| `components/PluginMarketplaceModal.tsx` | 385 | app | - |
| `components/QueuePanel.tsx` | 209 | app | - |
| `components/StatusBar.tsx` | 470 | app | - |
| `components/WindowControls.tsx` | 72 | app | minimize, maximize and close inside the tab bar on Windows and Linux |
| `components/WorkflowManagerDrawer.tsx` | 1337 | app | - |
| `components/ZenModeHelpCallout.tsx` | 135 | app | - |
| `theme/ThemeManager.ts` | 255 | app | - |

## `src/utils/` (5/7 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `clipboard.ts` | 112 | app | Unified Native & Web Clipboard Management for Cero Provides robust clipboard access across desktop Linux (Wayland wl-clipboard / X11), macOS, and Wind... |
| `cryptoPolyfill.ts` | 18 | unreachable | Browser-Safe Crypto Polyfill for Tauri Webview |
| `encodingUtils.ts` | 32 | app | Isomorphic Base64 and String Utilities Works identically in Node.js (Buffer) and Browser/WebKit (btoa/atob) |
| `fsPolyfill.ts` | 140 | app | synchronous `fs` for the Tauri webview, backed by ~/.cero |
| `legacyStorage.ts` | 37 | app | legacyStorage.ts: carry settings across the rename from Sentinel Terminal to Cero |
| `pathPolyfill.ts` | 110 | unreachable | the `path` module inside the Tauri webview, on every OS |
| `shellQuote.ts` | 27 | app | put a value into a shell command without letting it become part of the command |

## `src/ux/` (0/16 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `accessibility/AccessibilityEngine.ts` | 25 | unreachable | UI accessibility enforcement |
| `demo/DemoMode.ts` | 24 | unreachable | Sandboxed virtual execution layer |
| `designer/WorkflowDesigner.ts` | 28 | unreachable | Visual editor scaffolding |
| `diff/DiffViewer.ts` | 20 | unreachable | Human-readable before/after rendering bounds |
| `documentation/DocumentationGenerator.ts` | 15 | unreachable | Auto-generated architecture docs |
| `explanations/DecisionExplainer.ts` | 16 | unreachable | Human-readable planner logic summaries |
| `history/HistoryTimeline.ts` | 34 | unreachable | Chronological operation history |
| `history/UndoManager.ts` | 40 | unreachable | Reversible action stack management |
| `interaction/ClarificationEngine.ts` | 23 | unreachable | Contextual question generator for ambiguous entities |
| `interaction/ParameterCollector.ts` | 22 | unreachable | Interactive prompts for missing runtime parameters |
| `preview/ExecutionPreview.ts` | 28 | unreachable | Read-only generator summarizing planned actions and risks |
| `progress/NotificationManager.ts` | 27 | unreachable | Unified UI notifications |
| `progress/ProgressEngine.ts` | 30 | unreachable | Multi-stage execution feedback |
| `recovery/RecoveryAssistant.ts` | 34 | unreachable | Friendly error translations and fixes |
| `startup/StartupOptimizer.ts` | 23 | unreachable | Deferred booting logic |
| `themes/ThemeEngine.ts` | 22 | unreachable | Runtime theme switching |

## `src/workflows/` (17/32 used)

| File | Lines | Status | Purpose |
|---|---:|---|---|
| `builder/WorkflowBuilder.ts` | 237 | unreachable | Fluent Builder API for Programmatic Workflow Construction Supports full CRUD lifecycle: create, edit, delete, duplicate, clone |
| `conditions/ControlFlow.ts` | 73 | unreachable | 9 Control Flow Primitives for Workflow Composition Each primitive is a composable node type resolved by the Workflow IR Compiler into flattened Action... |
| `engine/ChainPlanner.ts` | 274 | app | "do this, then that" requests turned into concrete steps |
| `engine/CrossPlatformCommandAdapter.ts` | 315 | app | OS-Agnostic Workflow Command & Execution Adapter Normalizes shell commands, paths, and process invocations across: - Linux (Debian/Ubuntu, Arch, Fedor... |
| `engine/DeterministicReplayEngine.ts` | 628 | app | Zero-Token Replay with Safety & Parameter Injection Executes saved workflows deterministically without LLM re-inference: 1 |
| `engine/MultistagePromptDecomposer.ts` | 490 | app | Composite Request Parser & DAG Generator Decomposes multi-stage requests (e.g |
| `engine/SaveIntent.ts` | 102 | app | SaveIntent.ts: understand "...and save this as a workflow" written anywhere inside a prompt |
| `engine/WorkflowExecutionEngine.ts` | 153 | unreachable | Workflow Lifecycle Orchestrator Strictly follows the Runtime Reuse principle: Resolve Variables → Compile IR → Compile ActionGraph → Call Runtime.exec... |
| `engine/WorkflowGraphCompiler.ts` | 91 | unreachable | WorkflowIR → Phase 3 ActionGraph Compiler Transforms a fully resolved, flattened WorkflowIR into a standard Phase 3 ActionGraph that can be dispatched... |
| `engine/WorkflowIRCompiler.ts` | 271 | unreachable | Workflow Definition → Intermediate Representation Compiler Compiles a UserWorkflow into a WorkflowIR by: 1 |
| `engine/WorkflowRecorder.ts` | 249 | app | Interactive Workflow & Macro Recorder Captures executed session steps, commands, working directories, dynamic parameters, and environment prerequisite... |
| `engine/WorkflowRequest.ts` | 35 | app | "run the workflow in deploy.flow", "run my nightly workflow" |
| `flow/FlowAuthoring.ts` | 307 | app | "make me a workflow that installs node and opens youtube in chrome" |
| `flow/FlowExport.ts` | 116 | app | Convert SavedWorkflowDefinition into the canonical .flow format |
| `flow/FlowFromSteps.ts` | 70 | app | FlowFromSteps.ts: turn the steps an agent run really performed into portable .flow actions |
| `flow/FlowPlan.ts` | 361 | app | a .flow file as concrete steps for this OS |
| `flow/FlowRunner.ts` | 215 | app | run a FlowPlan |
| `flow/FlowStore.ts` | 87 | app | where a generated .flow file goes, and writing it without overwriting anything |
| `history/WorkflowHistory.ts` | 68 | unreachable | Structured Workflow Execution History Repository Stores execution records containing duration, node outcomes, failures, repairs, and outputs |
| `loops/LoopEngine.ts` | 90 | unreachable | Loop Iteration State Manager Manages count-based and collection-based loop expansion during IR compilation |
| `models/WorkflowTypes.ts` | 356 | app | Complete Type System for the Workflow Engine Implements the three-tier Workflow Library architecture: WorkflowTemplate → UserWorkflow → WorkflowInstan... |
| `registry/WorkflowRegistry.ts` | 145 | unreachable | Unified Workflow Discovery & Lookup Layer Separates discovery (Registry) from persistence (Storage) |
| `scheduler/WorkflowScheduler.ts` | 179 | unreachable | Multi-Trigger Workflow Scheduling Engine Supports 8 trigger modes: manual, on_login, on_startup, daily, weekly, cron, filesystem_event, and applicatio... |
| `sharing/WorkflowSharing.ts` | 84 | unreachable | Import/Export & Sharing Utilities Exports workflows as self-contained versioned JSON payloads |
| `storage/DiskWorkflowStorage.ts` | 716 | app | File Persistence for .flow Workflows and Legacy Migration Persists and loads workflows to/from `~/.cero/workflows/<name>.flow` |
| `storage/FlowImport.ts` | 90 | app | read ".flow" workflow files (action lists) as Cero workflows |
| `storage/WorkflowStorage.ts` | 128 | unreachable | Versioned JSON Persistence Layer Responsible ONLY for persistence |
| `telemetry/WorkflowTelemetry.ts` | 69 | unreachable | Execution Frequency, Duration, Success Rate, Template Usage & Repair Rate |
| `templates/StarterWorkflows.ts` | 226 | app | Curated Starter Workflow Definitions for Linux Provides production-ready, deterministic workflow blueprints saved in schemaVersion: 1 |
| `templates/WorkflowTemplates.ts` | 195 | unreachable | 6 Built-in Immutable Workflow Templates Templates are immutable blueprints |
| `validation/WorkflowValidator.ts` | 163 | unreachable | Structural & Semantic Workflow Validation Validates variable declarations, graph topology, dependency ordering, missing inputs, circular reference det... |
| `variables/WorkflowVariables.ts` | 133 | unreachable | Strongly Typed Variable System with Runtime Validation Supports 11 domain-specific variable types with Zod-backed runtime validation, default value in... |

## `src-tauri/src/` (Rust backend)

| File | Lines | Purpose |
|---|---:|---|
| `downloads.rs` | 288 | - |
| `embedded_server.rs` | 736 | llama-server lifecycle: binary/model discovery, launch flags, stderr log, status, inference slot bookkeeping, SHA-256 verification. |
| `file_association.rs` | 414 | - |
| `launch.rs` | 160 | - |
| `legacy_migration.rs` | 89 | - |
| `lib.rs` | 288 | Tauri setup: plugins, managed state, command registration, window and exit handling. |
| `logger.rs` | 83 | Diagnostic logging to file for release builds. |
| `main.rs` | 6 | Binary entry point; calls the library run(). |
| `path_search.rs` | 190 | - |
| `process_cmds.rs` | 627 | execute_command (timeout, process-group kill, closed stdin, output cap), process list/kill, system stats, file helpers, ~/.cero store commands. |
| `pty.rs` | 373 | Pseudo-terminal sessions (portable-pty): spawn the user shell, stream output, resize, kill. |
| `secrets.rs` | 173 | - |
| `watcher.rs` | 276 | Error watcher backend: file tailing (rotation/truncation aware) and journalctl streaming, emitted as cero-watch-lines events. |

## `scripts/`

| File | Purpose |
|---|---|
| `agent-cli.ts` | scripts/agent-cli.ts — Direct CLI Agent Runner & Inspection Harness Allows running Cero AI Terminal prompts directly from terminal / scripts, with ful... |
| `benchmark_cold_boot.ts` | scripts/benchmark_cold_boot.ts Phase 4 Cold-Boot Startup Latency Benchmark Measures startup time from process invocation to: |
| `benchmark_prompts.ts` | scripts/benchmark_prompts.ts — Cero Automated Benchmark Suite Phase 0 of CERO_ROADMAP_v5.0: Executes domain-classified prompts against Cero's agent en... |
| `brand/` | Draws the Cero logo as vector art and renders the logo animation video. |
| `build_all_packages.sh` | Build the Linux release bundles (deb, rpm, AppImage, pacman) from src-tauri. |
| `build_all_test_cases.js` | Generate tests/tool_test_cases.json from a tool spec dump (one-off generator). |
| `convert_peft_to_gguf.py` | convert_peft_to_gguf.py — Converts Hugging Face PEFT LoRA safetensors to GGUF format Compatible with llama.cpp and Cero's embedded llama-server / llam |
| `engine_smoke.ts` | live check of the self-hosted llama.cpp engine |
| `eval/` | The model reliability test (`npm run eval:model`). |
| `export_colab_dataset.py` | export_colab_dataset.py — Python CLI Wrapper for Cero Dataset Compilation Runs the dataset exporter and outputs the paths to: - cero_sft_dataset.jsonl |
| `export_colab_dataset.ts` | Cero Unified Training Dataset Exporter for Google Colab Aggregates all on-device intelligence datasets: 1 |
| `finetune_cero_lora.py` | Cero — Autonomous LoRA Fine-Tuning Pipeline (Tier 3) Trains a lightweight LoRA adapter on your personal terminal interactions, human demonstrations, a |
| `generate_codebase_map.py` | Generate docs/CODEBASE_MAP.md from the import graph: python3 scripts/generate_codebase_map.py > docs/CODEBASE_MAP.md |
| `icons/` | Builds the .flow document icons. |
| `release.sh` | Publish Cero releases, one per platform, each from its own branch. |
| `run_cli_prompts.ts` | scripts/run_cli_prompts.ts — Cero CLI Prompt Test Runner & Telemetry Recorder Executes prompts through the Cero CLI (scripts/agent-cli.ts), records ev... |
| `stress/` | Headless stress tests of the real agent against a local model. |
| `sync-shared.ps1` | Pull only the OS-agnostic shared core from another branch (PowerShell). |
| `sync-shared.sh` | Pull only the OS-agnostic shared core from another branch (bash). |
| `train_cero_grpo.py` | scripts/train_cero_grpo.py — On-Device Rule-Based GRPO Reinforcement Learning DeepSeek-R1 Architecture for Bash & Terminal Automation Part of Cero-SER |
| `train_cero_mlx.py` | Cero — Apple Silicon Native MLX LoRA Fine-Tuning Pipeline (Phase 4.8) Part of Cero-SERL (Self-Evolving Reflexion Loop): Breakthrough 4.8: Native Apple |
| `train_colab_standalone.py` | train_colab_standalone.py — Standalone Google Colab / Cloud GPU Fine-Tuning Script Fine-tunes Qwen/Qwen2.5-Coder-3B-Instruct (or 7B) on Google Colab ( |
| `verify_distro_compatibility.ts` | scripts/verify_distro_compatibility.ts Phase 4 Multi-Distribution Verification Script Audits host Linux distribution, package managers, init systems, ... |

## `tools/` (tool definitions)

One folder per tool with `tool.json`, `workflow.json`, `knowledge.json`, `examples.json`, `tests.json`,
validated by `src/tools/loader/ToolLoader.ts`. The model does not see these specs (its grammar only allows
`execute`/`done`); they feed parameter validation, the offline fast paths and tests.

| Domain | Tools |
|---|---:|
| `application` | 10 |
| `browser` | 8 |
| `developer` | 8 |
| `docker` | 8 |
| `filesystem` | 21 |
| `git` | 11 |
| `network` | 14 |
| `node` | 5 |
| `python` | 4 |
| `shell` | 1 |
| `system` | 13 |

## Regenerating

```bash
python3 scripts/generate_codebase_map.py > docs/CODEBASE_MAP.md
```

