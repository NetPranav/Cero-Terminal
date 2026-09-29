# Sentinel Terminal — Complete Technical Reference: Workflow Folders (`src/workflows` & `src/domain/workflow`)

This document is the exhaustive, file-by-file technical reference for the workflow implementations in Sentinel Terminal. It details the complete architecture, data models, compilers, execution engines, validation rules, scheduling subsystems, storage layers, and test suites across:
- `src/workflows/`: The enterprise declarative workflow library, AST/IR compiler, scheduling, telemetry, and zero-token deterministic replay system.
- `src/domain/workflow/`: The runtime execution engine, step state tracker, priority task queue, and variable interpolation engine that coordinates with the ReAct agent and capability drivers.

For high-level usage guides and CLI macro replay documentation, see [docs/WORKFLOWS.md](file:///home/user/project/docs/WORKFLOWS.md).

---

## 1. Architecture Overview & Folder Separation

Sentinel Terminal separates workflow automation into two complementary architectural layers:

```
+---------------------------------------------------------------------------------------+
|                                    USER INTERFACES                                    |
|   Conversational CLI ("> prompt")  |  Workflow Manager Drawer  |  Command Palette     |
+---------------------------------------------------------------------------------------+
                                            |
+-------------------------------------------v-------------------------------------------+
|               SRC/WORKFLOWS: DECLARATIVE WORKFLOW & REPLAY SYSTEM                     |
|                                                                                       |
|   - Models & Schema: Three-Tier Hierarchy (Template -> UserWorkflow -> Instance)      |
|   - Engine & Compilers: IR Compiler, Graph Compiler, Execution Engine, Replay Engine  |
|   - Control Flow: Branching, Loops, Retries, Nested Workflows, Parallel Groups        |
|   - Variables: 11 Strongly-Typed Domains with Zod Validation & Parameter Injection    |
|   - Discovery & Scheduling: WorkflowRegistry, WorkflowScheduler (8 trigger modes)     |
|   - Storage & Sharing: WorkflowStorage (Versioned), DiskWorkflowStorage, Sharing      |
|   - Governance: WorkflowValidator (11 verification gates), Telemetry & History        |
+---------------------------------------------------------------------------------------+
                                            |
                                            v (Dispatches actions / steps)
+---------------------------------------------------------------------------------------+
|               SRC/DOMAIN/WORKFLOW: RUNTIME STEP SCHEDULING ENGINE                     |
|                                                                                       |
|   - WorkflowEngine: In-flight execution tracking, DAG task readiness (getNextTasks)   |
|   - TaskQueue: Priority-based queued execution with pause/resume controls             |
|   - VariableEngine: Deep nested path resolution (e.g. {{user.profile.id}})            |
|   - Types: StepType enum (10 primitives), TaskStatus lifecycle, Rollback Actions      |
+---------------------------------------------------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                       PTY PROCESS EXECUTION & SECURITY GUARD                          |
|   - SecurityEngine: 8-Category Zero-Trust Risk Gate & Consent Queue                   |
|   - SessionManager / PTY: Interactive zsh/bash pseudo-terminal execution               |
|   - UndoLog: Step-by-step session audit trail & rollback registration                 |
+---------------------------------------------------------------------------------------+
```

### Separation of Responsibilities

1. **`src/workflows/`**:
   - Manages workflow authoring, storage, templates, triggers, and compilation.
   - Compiles complex Directed Acyclic Graphs (DAGs) into Intermediate Representation (`WorkflowIR`) and standard `ActionGraph` topologies.
   - Executes zero-token replays of verified trajectories (`DeterministicReplayEngine`).
   - Translates POSIX shell commands across Linux distributions, macOS, and Windows PowerShell (`CrossPlatformCommandAdapter`).

2. **`src/domain/workflow/`**:
   - Manages the runtime task execution state during active agent runs.
   - Evaluates step dependencies dynamically (`getNextTasks`).
   - Tracks individual step execution metrics, durations, outputs, and rollback actions.
   - Manages priority queues (`TaskQueue`) and deep object variable substitution (`VariableEngine`).

---

## 2. Complete Folder Taxonomy & File Inventory

### A. Tree Structure of `src/workflows/`

```
src/workflows/
├── builder/
│   └── WorkflowBuilder.ts              # Fluent programmatic workflow construction API
├── conditions/
│   └── ControlFlow.ts                  # Condition evaluation & control flow node classifiers
├── engine/
│   ├── CrossPlatformCommandAdapter.ts  # OS & Linux distribution command translation
│   ├── DeterministicReplayEngine.ts    # Zero-token replay engine with drift & security checks
│   ├── MultistagePromptDecomposer.ts   # Natural language DAG parser & parameter extractor
│   ├── WorkflowExecutionEngine.ts      # Lifecycle orchestrator (Runtime Reuse principle)
│   ├── WorkflowGraphCompiler.ts        # WorkflowIR -> ActionGraph compiler
│   ├── WorkflowIRCompiler.ts           # UserWorkflow -> WorkflowIR compiler
│   └── WorkflowRecorder.ts             # Captures CLI sessions, UndoLog, & AgentPlans
├── history/
│   └── WorkflowHistory.ts              # Execution ring-buffer (up to 5,000 instances) & audits
├── loops/
│   └── LoopEngine.ts                   # Loop unrolling, iteration IR generation, & state
├── models/
│   └── WorkflowTypes.ts                # Master type definitions, schemas, & interfaces
├── registry/
│   └── WorkflowRegistry.ts             # Discovery, lookup, and template instantiation layer
├── scheduler/
│   └── WorkflowScheduler.ts            # Multi-trigger scheduler (8 trigger modes)
├── sharing/
│   └── WorkflowSharing.ts              # Export/import payload packaging with SHA-256 checksums
├── storage/
│   ├── DiskWorkflowStorage.ts          # File I/O to ~/.sentinel/workflows/ (schemaVersion: 1)
│   ├── DiskWorkflowStorage.test.ts     # Disk storage unit tests
│   └── WorkflowStorage.ts              # In-memory versioned storage with rollback snapshots
├── telemetry/
│   └── WorkflowTelemetry.ts            # Execution duration, success rates, & repair metrics
├── templates/
│   └── WorkflowTemplates.ts            # 6 immutable starter workflow templates
├── validation/
│   └── WorkflowValidator.ts            # 11 structural & semantic validation gates (DFS cycle check)
├── variables/
│   └── WorkflowVariables.ts            # 11 domain variable types, validation, & substitution
└── __tests__/
    ├── CrossPlatformCommandAdapter.test.ts
    ├── DeterministicReplayEngine.test.ts
    ├── Execution.test.ts
    ├── MultistagePromptDecomposer.test.ts
    ├── Performance.test.ts
    ├── Scheduler.test.ts
    ├── Storage.test.ts
    ├── Templates.test.ts
    ├── Validation.test.ts
    ├── Variables.test.ts
    ├── WorkflowBuilder.test.ts
    └── WorkflowRecorder.test.ts
```

### B. Tree Structure of `src/domain/workflow/`

```
src/domain/workflow/
├── TaskQueue.ts                        # Priority task queue with pause/resume support
├── VariableEngine.ts                   # Deep path interpolation (e.g. {{user.id}})
├── WorkflowEngine.ts                   # In-flight task DAG state tracker & step coordinator
└── types.ts                            # Zod schemas, StepType, TaskStatus, & step definitions
```

---

## 3. Comprehensive Module-by-Module Reference

### 3.1. Models & Type System (`src/workflows/models/WorkflowTypes.ts`)

File: [src/workflows/models/WorkflowTypes.ts](file:///home/user/project/src/workflows/models/WorkflowTypes.ts)

This file establishes the foundational domain contracts for the three-tier workflow library and the intermediate representation.

#### The Three-Tier Workflow Library
1. **`WorkflowTemplate`**: Immutable blueprint. Shipped built-in (`source: 'builtin'`), downloaded from a marketplace, or generated by AI. Never modified during execution.
2. **`UserWorkflow`**: User-owned, editable automation created from scratch or cloned from a template. Stores variable declarations, node topologies, triggers, and execution counts.
3. **`WorkflowInstance`**: Represents a single execution run. Stores timestamped execution metrics, resolved variables, individual `WorkflowNodeResult` objects, outputs, and diagnostic errors. Never mutates the parent `UserWorkflow`.

#### 11 Strongly-Typed Variable Domains (`VariableType`)
- `string`: General text strings.
- `number`: Numeric values and thresholds.
- `boolean`: Flags and boolean toggles.
- `array`: Lists of values.
- `object`: Structured JSON key-value maps.
- `secret`: API keys, tokens, and passwords (redacted in UI and logs).
- `path`: Filesystem paths (validated for path prefixes `/`, `~`, or `.`).
- `application`: Application names and bundle identifiers.
- `port`: Network TCP/UDP port numbers (validated integers between 1 and 65535).
- `device`: Hardware devices (GPU, USB, serial ports).
- `repository`: Git repository URLs or local repository paths.

#### 11 Control Flow Node Types (`ControlFlowType`)
- `action`: Dispatches a concrete capability driver action (e.g. `shell.execute`, `filesystem.write`).
- `sequential`: Executes an ordered list of child nodes.
- `parallel`: Executes independent child nodes concurrently.
- `conditional`: Evaluates conditional expressions and branches to `trueBranch` or `falseBranch`.
- `switch`: Multi-way branching matching values against cases.
- `loop`: Iterates over an explicit count (`loopCount`) or collection (`loopOverVariable`).
- `retry`: Retries failing actions with backoff options (`retryMaxAttempts`, `retryDelayMs`, `retryExponentialBackoff`).
- `wait`: Pauses execution for a specified duration (`waitMs`).
- `timeout`: Enforces maximum duration limits on child nodes (`timeoutMs`).
- `early_exit`: Terminates execution cleanly when an exit condition is met.
- `nested_workflow`: Invokes another workflow as a sub-routine with scoped input bindings.

#### Intermediate Representation (`WorkflowIRNode` & `WorkflowIR`)
The `WorkflowIR` represents a fully resolved execution graph where:
- Dynamic variables are resolved to concrete values.
- Conditions are evaluated and inactive branches pruned.
- Loops are unrolled into individual iteration nodes.
- Retries and timeouts are injected.
- Nested workflows are flattened.
- Topological execution order (`executionOrder`) and parallel groups (`parallelGroups`) are computed.

#### Saved Workflow File Schema (`schemaVersion: 1`)
Persisted to `~/.sentinel/workflows/<name>.json`:
- `schemaVersion`: Integer constant (`CURRENT_WORKFLOW_SCHEMA_VERSION = 1`).
- `environmentPrerequisites`: Prerequisite checks (`requiredBinaries`, `requiredPorts`, `requiredPaths`, `requiredEnvVars`).
- `steps`: Array of `WorkflowStepDefinition` objects with `command`, `cwd`, `timeoutMs`, `expectedExitCode`, `precondition_check`, `if_precondition_true`, `if_precondition_false`, and `platformCommands`.

---

### 3.2. Programmatic Workflow Builder (`src/workflows/builder/WorkflowBuilder.ts`)

File: [src/workflows/builder/WorkflowBuilder.ts](file:///home/user/project/src/workflows/builder/WorkflowBuilder.ts)

Provides a fluent, chainable API for programmatic construction of `UserWorkflow` objects.

#### Builder API Methods
- `setDescription(desc: string): this`
- `setCategory(cat: string): this`
- `addTag(tag: string): this`
- `fromTemplate(templateId: string): this`
- `addVariable(name: string, type: VariableType, description: string, required?: boolean, defaultValue?: unknown): this`
- `addAction(id: string, name: string, actionId: string, parameters?: Record<string, unknown>, dependencies?: string[]): this`
- `addParallel(id: string, name: string, parallelNodeIds: string[], dependencies?: string[]): this`
- `addConditional(id: string, name: string, condition: ConditionExpression, trueBranch: string[], falseBranch?: string[], dependencies?: string[]): this`
- `addLoop(id: string, name: string, bodyNodeIds: string[], opts: { loopCount?: number; loopOverVariable?: string }, dependencies?: string[]): this`
- `addNestedWorkflow(id: string, name: string, nestedWorkflowId: string, inputBindings?: Record<string, string>, dependencies?: string[]): this`
- `addWait(id: string, name: string, waitMs: number, dependencies?: string[]): this`
- `addRetry(id: string, name: string, opts: { maxAttempts: number; delayMs: number; backoff?: boolean }, dependencies?: string[]): this`
- `addOutput(name: string, type: VariableType, description: string, sourceNodeId: string, sourceKey: string): this`
- `addTrigger(type: TriggerType, config?: Partial<WorkflowTrigger>): this`
- `build(): UserWorkflow`: Finalizes metadata, sets timestamps, and returns the immutable `UserWorkflow`.

#### Static Utilities
- `WorkflowBuilder.duplicate(workflow: UserWorkflow, newName?: string): UserWorkflow`: Clones a workflow with a newly generated ID, reset execution metrics, and updated timestamps.
- `WorkflowBuilder.clone(workflow: UserWorkflow): UserWorkflow`: Performs a deep JSON clone.

---

### 3.3. Workflow Registry & Discovery (`src/workflows/registry/WorkflowRegistry.ts`)

File: [src/workflows/registry/WorkflowRegistry.ts](file:///home/user/project/src/workflows/registry/WorkflowRegistry.ts)

Decouples workflow discovery from storage persistence. Aggregates built-in templates, user workflows, and plugin workflows into a unified search and lookup layer.

#### Key APIs
- `registerTemplate(template: WorkflowTemplate): void`
- `getTemplate(id: string): WorkflowTemplate | undefined`
- `getAllTemplates(): WorkflowTemplate[]`
- `instantiateFromTemplate(templateId: string, author?: string): UserWorkflow | undefined`: Clones an immutable template into an editable `UserWorkflow` with unique ID.
- `registerUserWorkflow(workflow: UserWorkflow): void`
- `getUserWorkflow(id: string): UserWorkflow | undefined`
- `getAllUserWorkflows(): UserWorkflow[]`
- `removeUserWorkflow(id: string): boolean`
- `registerPluginWorkflow(workflow: UserWorkflow): void`
- `getAllPluginWorkflows(): UserWorkflow[]`
- `lookup(id: string): UserWorkflow | undefined`: Universal lookup resolving user workflows followed by plugin workflows.
- `search(query: string)`: Searches across descriptions, tags, and IDs, returning matches with their origin type (`template`, `user`, or `plugin`).
- Global singleton instance: `globalWorkflowRegistry`.

---

### 3.4. Structural & Semantic Validation (`src/workflows/validation/WorkflowValidator.ts`)

File: [src/workflows/validation/WorkflowValidator.ts](file:///home/user/project/src/workflows/validation/WorkflowValidator.ts)

Enforces integrity rules on `UserWorkflow` instances before compilation or execution.

#### 11 Structural and Semantic Validation Gates
1. **Metadata Presence**: Verifies `id` and `metadata.version`.
2. **Node Existence**: Verifies that `nodes` is non-empty.
3. **Node ID Uniqueness**: Flags duplicate node identifiers.
4. **Dependency Integrity**: Ensures all `dependencies` reference existing nodes.
5. **Cycle Detection (DFS)**: Evaluates the directed dependency graph using a recursive depth-first search (`visited` and `recursionStack`) to identify and report exact circular dependency chains.
6. **Action Node Contract**: Verifies that every `action` node declares an `actionId`.
7. **Nested Workflow Guard**: Verifies `nestedWorkflowId` is declared, guards against self-referential nesting, and issues warnings for unregistered target IDs.
8. **Loop Structure Validation**: Confirms loop nodes define `loopBodyNodeIds` and declare either `loopCount` or `loopOverVariable`.
9. **Conditional Expression Validation**: Asserts that `conditional` nodes define valid `ConditionExpression` objects.
10. **Output Node Integrity**: Validates that all declared outputs reference valid `sourceNodeId` entries.
11. **Variable Declaration Checks**: Ensures variable names and types are specified.

Returns `ValidationResult` containing `{ valid: boolean, errors: string[], warnings: string[] }`. Global singleton: `globalWorkflowValidator`.

---

### 3.5. Control Flow Primitives (`src/workflows/conditions/ControlFlow.ts`)

File: [src/workflows/conditions/ControlFlow.ts](file:///home/user/project/src/workflows/conditions/ControlFlow.ts)

Resolves control flow directives and conditional assertions against resolved runtime variables.

#### 10 Evaluated Comparison Operators
- `==`: Strict equality.
- `!=`: Strict inequality.
- `>` / `<`: Numeric comparison.
- `>=` / `<=`: Numeric comparison with equality.
- `exists`: Non-null and non-undefined check.
- `not_exists`: Null or undefined check.
- `contains`: Substring inclusion for strings, item inclusion for arrays.
- `matches`: Regular expression pattern evaluation.

#### Classification Predicates
- `isControlFlowNode(node: WorkflowNode): boolean`: Identifies structural directives (`sequential`, `parallel`, `conditional`, `switch`, `loop`, `retry`, `wait`, `timeout`, `early_exit`).
- `isNestedWorkflowNode(node: WorkflowNode): boolean`: Identifies nested workflow references.
- `isActionNode(node: WorkflowNode): boolean`: Identifies executable action references.

---

### 3.6. Loop Iteration Engine (`src/workflows/loops/LoopEngine.ts`)

File: [src/workflows/loops/LoopEngine.ts](file:///home/user/project/src/workflows/loops/LoopEngine.ts)

Handles loop unrolling into flattened `WorkflowIRNode` structures during intermediate representation compilation.

#### Unrolling Logic
- Supports count-based loops (`loopCount`) and collection-based loops (`loopOverVariable`).
- Generates uniquely scoped node IDs for each iteration: `${loopNode.id}_iter${i}_${bodyNode.id}`.
- Automatically wires dependencies so the first node of iteration `i` depends on the final node of iteration `i-1`.
- Dynamically injects loop context into node parameters:
  - `_loopIndex`: Current 0-based iteration index.
  - `_loopItem`: Current collection element for collection iterations.
- Enforces an execution safety cap (`maxIterations = 1000`) to prevent runaway loop expansions.

---

### 3.7. Variable Typing & Resolution (`src/workflows/variables/WorkflowVariables.ts`)

File: [src/workflows/variables/WorkflowVariables.ts](file:///home/user/project/src/workflows/variables/WorkflowVariables.ts)

Manages runtime variable resolution, domain-specific typing, defaults, and parameter interpolation.

#### Key APIs
- `resolve(declarations, userInputs)`: Resolves input bindings, applies defaults, and verifies values against type schemas.
- `validateType(name, type, value)`: Validates values against the 11 domain schemas:
  - `port`: Integer check and range constraint [1, 65535].
  - `path`: String check starting with `/`, `~`, or `.`.
  - `secret`: String validation with masking safeguards.
- `substituteParameters(parameters, resolvedVariables)`: Replaces `{{variableName}}` placeholders in parameter strings with resolved variable values.

---

### 3.8. Multi-Trigger Scheduler (`src/workflows/scheduler/WorkflowScheduler.ts`)

File: [src/workflows/scheduler/WorkflowScheduler.ts](file:///home/user/project/src/workflows/scheduler/WorkflowScheduler.ts)

Schedules and triggers workflows across 8 operational trigger modes.

#### Supported Trigger Types
1. `manual`: On-demand execution from CLI or UI.
2. `on_login`: Triggered when the user logs into their desktop session.
3. `on_startup`: Triggered during Sentinel Terminal initialization.
4. `daily`: Scheduled at specific times of day (`HH:MM`).
5. `weekly`: Scheduled on specific days of the week (`dayOfWeek`).
6. `cron`: Standard cron schedule.
7. `filesystem_event`: Triggered on filesystem modifications within a watched directory (`watchPath`).
8. `application_event`: Triggered on application launch or exit matching bundle ID (`applicationId`).

#### Key APIs
- `schedule(workflow: UserWorkflow): ScheduledWorkflow[]`
- `unschedule(workflowId: string): number`
- `getReadyWorkflows(currentTime?: number): ScheduledWorkflow[]`: Identifies time-based workflows ready for execution and advances their `nextFireAt` timestamp.
- `evaluateEventTrigger(eventType, eventPayload)`: Evaluates event-driven triggers with payload filters (e.g. prefix matching on `path` for filesystem events).

---

### 3.9. Storage Subsystems

#### In-Memory Versioned Storage (`src/workflows/storage/WorkflowStorage.ts`)
File: [src/workflows/storage/WorkflowStorage.ts](file:///home/user/project/src/workflows/storage/WorkflowStorage.ts)
- Manages in-memory storage of `UserWorkflow` definitions.
- Automatic snapshotting: Creates a `WorkflowVersion` snapshot in `versionHistory` before any overwrite.
- `rollback(id: string, version: string)`: Reverts a workflow to any historical version.
- `exportAsJSON(id)` / `importFromJSON(jsonStr)`: Serializes workflows into `sentinel-workflow-v1` payloads with SHA-256 checksums.

#### Disk Workflow Storage (`src/workflows/storage/DiskWorkflowStorage.ts`)
File: [src/workflows/storage/DiskWorkflowStorage.ts](file:///home/user/project/src/workflows/storage/DiskWorkflowStorage.ts)
- Persists workflows as JSON files in `~/.sentinel/workflows/<name>.json` (Windows: `%USERPROFILE%\.sentinel\workflows\<name>.json`).
- Uses Tauri Rust filesystem bridge (`@tauri-apps/plugin-fs`) in desktop mode with Node.js `fs` fallback for headless testing.
- Enforces `schemaVersion: 1` and automatically migrates legacy unversioned workflow definitions.
- Sanitizes file paths to allow only alphanumeric characters, underscores, and hyphens.

---

### 3.10. Compiler & Execution Pipeline (`src/workflows/engine/`)

The compilation and execution pipeline strictly follows the **Runtime Reuse Principle**:

```
UserWorkflow
     │
     ▼ (WorkflowIRCompiler.compile)
WorkflowIR (Variables resolved, conditions pruned, loops unrolled, dependencies topologically sorted)
     │
     ▼ (WorkflowGraphCompiler.compile)
ActionGraph (Standard Phase 3 Action Nodes & Dependency DAG)
     │
     ▼ (WorkflowExecutionEngine.execute)
Execution via Phase 4 Runtime Engine
```

#### `WorkflowIRCompiler.ts`
File: [src/workflows/engine/WorkflowIRCompiler.ts](file:///home/user/project/src/workflows/engine/WorkflowIRCompiler.ts)
- Compiles `UserWorkflow` + runtime inputs into a `WorkflowIR`.
- Recursively expands nodes, evaluates conditions, unrolls loops via `LoopEngine`, inlines nested workflows (up to `maxNestedDepth = 10`), and partitions tasks into parallel execution groups via topological sort.

#### `WorkflowGraphCompiler.ts`
File: [src/workflows/engine/WorkflowGraphCompiler.ts](file:///home/user/project/src/workflows/engine/WorkflowGraphCompiler.ts)
- Converts `WorkflowIRNode` entries into standard `ActionNode` definitions compatible with the agent execution runtime.

#### `WorkflowExecutionEngine.ts`
File: [src/workflows/engine/WorkflowExecutionEngine.ts](file:///home/user/project/src/workflows/engine/WorkflowExecutionEngine.ts)
- Orchestrates the full lifecycle: compiles IR, produces `ActionGraph`, dispatches nodes, records `WorkflowInstance` records into `WorkflowHistory`, and logs metrics to `WorkflowTelemetry`.

#### `DeterministicReplayEngine.ts`
File: [src/workflows/engine/DeterministicReplayEngine.ts](file:///home/user/project/src/workflows/engine/DeterministicReplayEngine.ts)
- Replays saved workflows (`~/.sentinel/workflows/<name>.json`) with zero LLM inference tokens in ~22ms.
- Pre-execution validation: Verifies required binaries, ports, and paths, preventing environment drift.
- Parameter substitution: Injects CLI overrides (`--port=9000`) into commands.
- Categorical zero-trust safety: Inspects every command through `SecurityEngine` and halts on `SENSITIVE` operations unless pre-approved.
- Reversibility: Appends all executed steps to the session `UndoLog`.

#### `MultistagePromptDecomposer.ts`
File: [src/workflows/engine/MultistagePromptDecomposer.ts](file:///home/user/project/src/workflows/engine/MultistagePromptDecomposer.ts)
- Parses natural language composite instructions (e.g. `build frontend, run tests, and package release :: save as workflow ci-pipeline`).
- Extracts pipeline stages, parameter tokens, required ports, and prerequisite binaries.

#### `CrossPlatformCommandAdapter.ts`
File: [src/workflows/engine/CrossPlatformCommandAdapter.ts](file:///home/user/project/src/workflows/engine/CrossPlatformCommandAdapter.ts)
- Translates shell commands between POSIX environments (Linux Debian/Arch/Fedora/Alpine, macOS) and Windows PowerShell.
- Handles platform-specific command overrides declared in workflow step definitions.

#### `WorkflowRecorder.ts`
File: [src/workflows/engine/WorkflowRecorder.ts](file:///home/user/project/src/workflows/engine/WorkflowRecorder.ts)
- Records interactive CLI command sequences, recent steps from the session `UndoLog`, or multi-phase `AgentPlan` hierarchies into `SavedWorkflowDefinition` JSON files.

---

### 3.11. Telemetry & Execution History

#### `WorkflowTelemetry.ts`
File: [src/workflows/telemetry/WorkflowTelemetry.ts](file:///home/user/project/src/workflows/telemetry/WorkflowTelemetry.ts)
- Collects runtime execution metrics: `totalExecutions`, `successes`, `failures`, `successRate` (percentage), `totalDurationMs`, `averageDurationMs`, `repairRate` (automated repairs per execution), and `mostUsedWorkflows` (top 5 by frequency).

#### `WorkflowHistory.ts`
File: [src/workflows/history/WorkflowHistory.ts](file:///home/user/project/src/workflows/history/WorkflowHistory.ts)
- Maintains an in-memory ring-buffer repository of up to 5,000 `WorkflowInstance` execution records.
- Provides filtering by `workflowId` and calculates aggregate statistics (`getStats`: total, successes, failures, average duration, total repairs).

---

### 3.12. Workflow Sharing (`src/workflows/sharing/WorkflowSharing.ts`)

File: [src/workflows/sharing/WorkflowSharing.ts](file:///home/user/project/src/workflows/sharing/WorkflowSharing.ts)

Implements the `sentinel-workflow-v1` sharing and portability protocol.
- Computes SHA-256 integrity checksums over workflow definitions to guarantee payload integrity.
- Exports self-contained, shareable bundles.
- Validates payload structure and checksums on import before registering into `WorkflowRegistry`.

---

### 3.13. Starter Templates (`src/workflows/templates/WorkflowTemplates.ts`)

File: [src/workflows/templates/WorkflowTemplates.ts](file:///home/user/project/src/workflows/templates/WorkflowTemplates.ts)

Contains 6 immutable built-in starter templates:
1. **`tpl-morning-development`** (`Morning Development`): Launches developer editor, terminal, browser, and connects to development WiFi.
2. **`tpl-staging-deploy`** (`Staging Deployment`): Runs code linter, builds containers, pushes to registry, and verifies HTTP healthcheck.
3. **`tpl-clean-rebuild`** (`Clean Rebuild`): Cleans project caches, reinstalls dependencies, compiles project, and executes test suite.
4. **`tpl-pr-prep`** (`PR Preparation`): Inspects git status, executes linters and tests, and prepares branch for pull request.
5. **`tpl-database-sync`** (`Database Synchronization`): Verifies database host connectivity, runs migration scripts, and seeds local fixtures.
6. **`tpl-ai-healthcheck`** (`AI Engine Health Check`): Checks embedded llama-server process, inspects GPU VRAM allocation, and runs token generation test.

---

## 4. Runtime Step Scheduling Engine (`src/domain/workflow/`)

While `src/workflows/` handles high-level authoring, compilation, and declarative DAGs, `src/domain/workflow/` orchestrates immediate step execution during active agent operations.

### 4.1. `WorkflowEngine.ts`
File: [src/domain/workflow/WorkflowEngine.ts](file:///home/user/project/src/domain/workflow/WorkflowEngine.ts)
- **Active State Tracking**: Tracks running workflows in an `executions` map (`Map<string, Map<string, WorkflowTaskExecution>>`).
- **DAG Readiness Resolution (`getNextTasks`)**: Evaluates the dependency graph and returns steps that are `PENDING` with all prerequisite dependencies `COMPLETED`.
- **Task Lifecycle**: Coordinates state transitions: `PENDING` -> `RUNNING` -> `COMPLETED` | `FAILED` | `CANCELLED`.
- **Execution Timing**: Captures high-precision start and end times via `performance.now()`, logging exact durations in milliseconds.
- **Rollback Tracking**: Stores `rollbackAction` closures for every completed step to support reversibility.

### 4.2. `TaskQueue.ts`
File: [src/domain/workflow/TaskQueue.ts](file:///home/user/project/src/domain/workflow/TaskQueue.ts)
- Implements a priority-based queue for `QueuedTask` objects.
- Sorts tasks dynamically by descending priority (`priority` score).
- Provides execution controls: `enqueue`, `dequeue`, `peek`, `pause`, `resume`, and `removeByWorkflowId`.

### 4.3. `VariableEngine.ts`
File: [src/domain/workflow/VariableEngine.ts](file:///home/user/project/src/domain/workflow/VariableEngine.ts)
- Handles variable interpolation across strings, arrays, and nested objects.
- Supports dot-notation path traversal (e.g. `{{user.credentials.token}}`).
- Type-preserving single-variable extraction: If a string is exactly `"{{var}}"`, it returns the raw underlying type (e.g. number or object) rather than coercing to string.

### 4.4. `types.ts`
File: [src/domain/workflow/types.ts](file:///home/user/project/src/domain/workflow/types.ts)
- Defines runtime domain interfaces and Zod validation schemas (`workflowSchema`, `retryPolicySchema`).
- **10 Primitive Step Types (`StepType`)**:
  - `ExecuteCapability`: Dispatches an SDK capability.
  - `ConditionalBranch`: Evaluates runtime boolean condition.
  - `ParallelExecution`: Spawns parallel branch.
  - `Delay` / `Wait`: Pauses execution.
  - `Retry`: Re-executes step on failure.
  - `UserConfirmation`: Prompts operator via Consent Queue.
  - `VariableAssignment`: Assigns new variables to execution context.
  - `Loop`: Iterates over child steps.
  - `End`: Concludes workflow execution.

---

## 5. Verification & Test Suite Matrix

The workflow implementations are validated by 13 comprehensive test suites guaranteeing 100% pass rates:

| Test Suite File | Tested Subsystem | Key Verification Scenarios |
| :--- | :--- | :--- |
| [`CrossPlatformCommandAdapter.test.ts`](file:///home/user/project/src/workflows/__tests__/CrossPlatformCommandAdapter.test.ts) | CrossPlatformCommandAdapter | Linux distro detection, macOS POSIX handling, Windows PowerShell translation, override resolution. |
| [`DeterministicReplayEngine.test.ts`](file:///home/user/project/src/workflows/__tests__/DeterministicReplayEngine.test.ts) | DeterministicReplayEngine | Zero-token replay latency, parameter interpolation, drift detection, dry-run simulation, SecurityEngine consent halting. |
| [`Execution.test.ts`](file:///home/user/project/src/workflows/__tests__/Execution.test.ts) | WorkflowExecutionEngine | Runtime Reuse pipeline: IR compilation -> Graph compilation -> Action execution -> Telemetry/History recording. |
| [`MultistagePromptDecomposer.test.ts`](file:///home/user/project/src/workflows/__tests__/MultistagePromptDecomposer.test.ts) | MultistagePromptDecomposer | Natural language sequential conjunction parsing, parameter extraction, binary prerequisite detection. |
| [`Performance.test.ts`](file:///home/user/project/src/workflows/__tests__/Performance.test.ts) | Compilers & Engines | Large DAG compilation benchmarking, memory usage, unrolling performance under 1,000 iterations. |
| [`Scheduler.test.ts`](file:///home/user/project/src/workflows/__tests__/Scheduler.test.ts) | WorkflowScheduler | Time calculations, cron intervals, login/startup triggers, filesystem event path matching, application bundle ID filtering. |
| [`Storage.test.ts`](file:///home/user/project/src/workflows/__tests__/Storage.test.ts) | WorkflowStorage | In-memory persistence, version snapshotting, rollback verification, JSON export/import with SHA-256 checks. |
| [`DiskWorkflowStorage.test.ts`](file:///home/user/project/src/workflows/storage/DiskWorkflowStorage.test.ts) | DiskWorkflowStorage | File path sanitization, `schemaVersion: 1` validation, legacy migration, atomic file I/O. |
| [`Templates.test.ts`](file:///home/user/project/src/workflows/__tests__/Templates.test.ts) | WorkflowTemplates & Registry | Immutability of built-ins, instantiation to UserWorkflow, validation of all 6 starter templates. |
| [`Validation.test.ts`](file:///home/user/project/src/workflows/__tests__/Validation.test.ts) | WorkflowValidator | 11 validation gates: duplicate IDs, missing dependencies, DFS circular dependency detection, output source validation. |
| [`Variables.test.ts`](file:///home/user/project/src/workflows/__tests__/Variables.test.ts) | WorkflowVariables | Strict typing across 11 domains, default value fallback, required checks, mustache parameter substitution. |
| [`WorkflowBuilder.test.ts`](file:///home/user/project/src/workflows/__tests__/WorkflowBuilder.test.ts) | WorkflowBuilder | Fluent builder construction, duplicate/clone utilities, nested workflow linkage. |
| [`WorkflowRecorder.test.ts`](file:///home/user/project/src/workflows/__tests__/WorkflowRecorder.test.ts) | WorkflowRecorder | Command sequence capture, UndoLog step extraction, AgentPlan translation to SavedWorkflowDefinition. |
