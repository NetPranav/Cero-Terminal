# Sentinel Terminal — Workflow & Macro Automation Architecture

Sentinel Terminal features an intelligent, multi-tiered workflow and macro automation engine. While traditional terminals force developers to manually repeat complex shell incantations or write brittle ad-hoc shell scripts, Sentinel bridges conversational AI planning with zero-token deterministic execution.

Developers can decompose high-level goals into multi-stage pipelines using natural language, persist verified execution trajectories as schema-versioned JSON workflows, and deterministically replay them with sub-millisecond dispatch, parameter substitution, environment drift detection, and categorical security guardrails.

> [!NOTE]
> For the complete file-by-file technical reference of the codebase workflow folders (`src/workflows/` and `src/domain/workflow/`), including full module taxonomy, APIs, internal compiler mechanics, and test suite matrix, see [docs/WORKFLOW_FOLDER.md](file:///home/user/project/docs/WORKFLOW_FOLDER.md).

---

## 1. Architectural Overview & Philosophy

Sentinel's workflow engine is divided into two complementary layers designed for distinct operational phases:

```
+-----------------------------------------------------------------------------------+
|                           USER INTERACTION LAYER                                  |
|                                                                                   |
|  Conversational CLI ("> prompt")   |   Visual UI Drawer   |   Command Palette     |
+------------------------------------+----------------------+-----------------------+
                                        |
+---------------------------------------v-------------------------------------------+
|               LAYER 1: INTERACTIVE SHELL & REPLAY WORKFLOW SYSTEM                  |
|                                                                                   |
|  - Multistage Prompt Decomposer (Natural language DAG parser & parameter extractor) |
|  - Workflow Recorder (Captures session commands, UndoLog, & AgentPlan trajectories)|
|  - Deterministic Replay Engine (Zero-token replay, drift check, security analysis)  |
|  - Cross-Platform Command Adapter (OS & distro translation: Linux, macOS, Win)    |
|  - Disk Workflow Storage (Persisted to ~/.sentinel/workflows/<name>.json)         |
+-----------------------------------------------------------------------------------+
                                        |
+---------------------------------------v-------------------------------------------+
|             LAYER 2: THREE-TIER DECLARATIVE WORKFLOW ARCHITECTURE                 |
|                                                                                   |
|  - Three-Tier Hierarchy: WorkflowTemplate -> UserWorkflow -> WorkflowInstance     |
|  - 11 Strongly-Typed Variable Domains (path, secret, port, repository, device...) |
|  - Advanced Control Flow DAGs (parallel, conditional, switch, loop, retry, wait)  |
|  - Trigger System (manual, cron, startup, login, filesystem, application events)  |
|  - Workflow IR Compiler & Graph Compiler -> ActionGraph Execution Pipeline        |
|  - Scheduler, Telemetry, History & Export/Sharing Modules                         |
+-----------------------------------------------------------------------------------+
```

### Core Design Principles

1. **Zero-Token Instant Replay**: Once an AI agent or developer discovers and verifies the correct sequence of commands for a task, re-executing that task should never consume LLM inference tokens or incur model latency. Saved workflows replay deterministically in 15–25ms.
2. **Environment Drift Awareness**: Workflows explicitly declare prerequisite binaries, ports, and paths. Sentinel verifies these prerequisites before dispatching commands, preventing silent failures caused by missing packages or occupied ports.
3. **Categorical Zero-Trust Security**: Replayed commands are not exempt from safety checks. Every command is statically evaluated by Sentinel's `SecurityEngine`. Commands classified as `SENSITIVE` halt execution for explicit operator consent unless pre-approved.
4. **Session Reversibility & Auditability**: Every step executed during workflow replay is recorded in Sentinel's session `UndoLog`, ensuring full auditability and rollback capability.
5. **Cross-Platform Portability**: Workflows created on Linux execute seamlessly on macOS and Windows through automated shell translation and platform-specific step overrides.

---

## 2. Interactive Shell & Macro Workflow System

The Interactive Shell Workflow System provides command-line ergonomics for recording, managing, and replaying workflows directly within the terminal buffer.

### A. Recording Workflows from CLI

Sentinel supports three natural mechanisms for saving workflows:

#### 1. Simultaneous Task Execution + Named Save Directive
Execute a natural language task and immediately persist the executed sequence as a named workflow using the `:: save as workflow <name>` syntax:

```bash
> clean build cache, run cargo test, and package release :: save as workflow release-prep
```

Sentinel's `MultistagePromptDecomposer` extracts the inner goal (`clean build cache, run cargo test, and package release`) and the target workflow name (`release-prep`). Upon successful completion, the verified commands are written to `~/.sentinel/workflows/release-prep.json`.

#### 2. Retrospective Scoped Workflow Save
Persist commands recently executed in the current session into a workflow by referencing recent steps recorded in the `UndoLog`:

```bash
# Save the last 10 commands executed in this session
> save workflow pr-gate

# Explicitly scope the save to the last N commands
> save workflow build-and-test last 4 steps
```

`MultistagePromptDecomposer.parseScopedWorkflowSave` extracts the count and workflow name, retrieving the corresponding entries from `UndoLog` and serializing them to disk.

#### 3. Execution Plan Capture (`saveFromPlan`)
When an AI agent generates a multi-phase `AgentPlan` via `AdaptivePlanEngine`, the entire plan hierarchy (phases, sub-phases, commands, and descriptions) can be directly compiled into a `SavedWorkflowDefinition` via `WorkflowRecorder.saveFromPlan()`.

---

### B. Saved Workflow File Schema (`schemaVersion: 1`)

Workflows are persisted as human-readable, schema-versioned JSON files in `~/.sentinel/workflows/<name>.json`.

```json
{
  "schemaVersion": 1,
  "name": "release-gate",
  "description": "Pre-flight validation pipeline before Git push",
  "author": "user",
  "createdAt": 1727145600000,
  "updatedAt": 1727145600000,
  "tags": ["git", "testing", "release", "ci"],
  "environmentPrerequisites": {
    "requiredBinaries": ["git", "npm", "cargo"],
    "requiredPorts": [8080],
    "requiredPaths": ["./package.json", "./src-tauri/Cargo.toml"]
  },
  "parameters": [
    {
      "name": "BRANCH",
      "type": "string",
      "description": "Target git branch for verification",
      "required": false,
      "defaultValue": "main"
    },
    {
      "name": "PORT",
      "type": "port",
      "description": "Application port to inspect",
      "required": false,
      "defaultValue": 8080
    }
  ],
  "steps": [
    {
      "id": "step-1",
      "name": "Git Status Check",
      "command": "git status --porcelain",
      "timeoutMs": 10000,
      "expectedExitCode": 0,
      "isDestructive": false
    },
    {
      "id": "step-2",
      "name": "Linter Verification",
      "command": "npm run lint",
      "timeoutMs": 60000,
      "expectedExitCode": 0,
      "isDestructive": false
    },
    {
      "id": "step-3",
      "name": "Precondition Check Docker Daemon",
      "command": "docker compose up -d",
      "precondition_check": "docker info >/dev/null 2>&1",
      "if_precondition_true": "continue",
      "if_precondition_false": "abort",
      "timeoutMs": 30000,
      "expectedExitCode": 0
    },
    {
      "id": "step-4",
      "name": "Cross-Platform Dependency Clean",
      "command": "rm -rf node_modules package-lock.json",
      "platformCommands": {
        "linux": "rm -rf node_modules package-lock.json",
        "macos": "rm -rf node_modules package-lock.json",
        "windows": "Remove-Item -Recurse -Force node_modules, package-lock.json"
      },
      "isDestructive": true
    },
    {
      "id": "step-5",
      "name": "Automated Test Suite",
      "command": "npm test",
      "timeoutMs": 120000,
      "expectedExitCode": 0,
      "isDestructive": false
    }
  ]
}
```

#### Step Definition Attributes

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier within the workflow |
| `name` | `string` | Human-readable name displayed during execution |
| `command` | `string` | Shell command executed in the shell |
| `cwd` | `string` (optional) | Target working directory (supports parameter interpolation) |
| `timeoutMs` | `number` (optional) | Maximum allowed execution time in milliseconds |
| `expectedExitCode` | `number` (optional) | Exit code indicating success (defaults to `0`) |
| `validationCriteria` | `string` (optional) | Assertion expression for validating stdout/stderr |
| `dependsOn` | `string[]` (optional) | IDs of prerequisite steps that must complete first |
| `isDestructive` | `boolean` (optional) | Flag indicating file deletion or irreversible changes |
| `precondition_check` | `string` (optional) | Shell command evaluated prior to executing `command` |
| `if_precondition_true` | `'skip' \| 'continue' \| 'abort'` | Action taken when precondition exits with code `0` |
| `if_precondition_false` | `'install' \| 'continue' \| 'abort' \| 'skip'` | Action taken when precondition exits with non-zero code |
| `platformCommands` | `object` (optional) | OS-specific overrides (`linux`, `macos`, `windows`, `distroOverrides`) |

---

## 3. Multistage Prompt Decomposition Engine

Located in `src/workflows/engine/MultistagePromptDecomposer.ts`, this engine parses compound natural language prompts and transforms them into structured Directed Acyclic Graphs (DAGs).

### Natural Language Sequence Parsing

The decomposer recognizes standard English sequential conjunctions:
- `and then`, `and also`, `followed by`, `after that`, `afterwards`
- `first <action> then <action>`
- Comma-delimited action lists
- Colon-scoped pipelines (e.g., `clean project: step 1, step 2, step 3`)

```typescript
// Example: Translating compound prompt into DAG
const decomposer = MultistagePromptDecomposer.getInstance();
const plan = decomposer.decompose(
  "deploy staging: build frontend, package container, push to registry, and verify health check on port 8080"
);

// Output: DecomposedWorkflowPlan with 4 sequential stages,
// detected parameter PORT=8080, and prerequisite binary checks for 'docker'
```

### Parameter & Prerequisite Extraction
- **Ports**: Regex patterns detect `port <number>`, `port=<number>`, or `:<number>`, populating `EnvironmentPrerequisites.requiredPorts`.
- **Binaries**: Commands referencing tools such as `cargo`, `docker`, `npm`, `git`, `python`, `systemctl`, `kubectl` automatically populate `EnvironmentPrerequisites.requiredBinaries`.
- **Paths**: Arguments with file extensions (`.json`, `.toml`, `.ts`) or path delimiters populate `EnvironmentPrerequisites.requiredPaths`.

---

## 4. Zero-Token Deterministic Replay Engine

Located in `src/workflows/engine/DeterministicReplayEngine.ts`, this engine executes saved workflows without LLM re-inference.

### Execution Workflow

```
[run workflow <name>]
         |
         v
+-------------------------------+
|  1. Load Workflow Definition  | ---> (From ~/.sentinel/workflows/<name>.json)
+-------------------------------+
         |
         v
+-------------------------------+
|  2. Parse CLI Overrides       | ---> (--port=9000, --tag=v2.0, --dry-run)
+-------------------------------+
         |
         v
+-------------------------------+
|  3. Environment Validation    | ---> (Check required binaries, ports, paths)
+-------------------------------+
         | (Passed)
         v
+-------------------------------+
|  4. Step Execution Loop       |
|    - Resolve OS command       | ---> (CrossPlatformCommandAdapter)
|    - Substitute parameters    | ---> ({{PORT}} -> 9000)
|    - Precondition check       | ---> (Skip / Continue / Abort)
|    - SecurityEngine check     | ---> (Halt if SENSITIVE without consent)
|    - PTY Execution            | ---> (Shell process dispatch)
|    - Audit Logging            | ---> (Record to session UndoLog)
+-------------------------------+
         |
         v
+-------------------------------+
|  5. Return Execution Result   | ---> (Telemetry, step timings, exit codes)
+-------------------------------+
```

### CLI Replay Commands

```bash
# Basic instant replay
> run workflow release-gate

# Parameter overrides
> run workflow dev-boot --port=9000 --tag=v2.0

# Dry-run validation (simulates steps and evaluates risk without executing)
> run workflow db-sync --dry-run

# Auto-approve sensitive steps (non-interactive CI mode)
> run workflow clean-rebuild --auto-approve
```

### Parameter Substitution Syntax

Workflow steps support variable interpolation using mustache syntax `{{VARIABLE}}` or shell format `$VARIABLE`:

```json
{
  "name": "Start Server",
  "command": "npm run start -- --port={{PORT}} --env={{ENVIRONMENT}}"
}
```

CLI flags automatically map to uppercase parameter keys:
- `--port=8080` -> `PORT: "8080"`
- `--dry-run` -> `DRY_RUN: true`
- `--tag v1.2.0` -> `TAG: "v1.2.0"`

### Precondition Check Semantics

Steps can define pre-execution assertions to prevent redundant work or abort on unsafe system states:

- `if_precondition_true: "skip"`: If the precondition command exits with code `0`, the step is safely skipped.
  *Example: Skip `docker compose up` if `docker compose ps` shows services are already running.*
- `if_precondition_false: "abort"`: If the precondition command fails, the entire workflow halts immediately before executing destructive actions.
  *Example: Abort database migration if network ping to database host fails.*

---

## 5. Cross-Platform Command Adapter

Located in `src/workflows/engine/CrossPlatformCommandAdapter.ts`, this adapter ensures that workflows recorded on one operating system run reliably across Linux distributions, macOS, and Windows.

### Operating System & Distribution Resolution

Sentinel automatically resolves the host platform via `getPlatform()` and detects the Linux distribution family (`debian`, `arch`, `fedora`, `alpine`, `generic`):

| Target OS / Distro | Shell Invocation | Package Manager / Tool Idiom |
| :--- | :--- | :--- |
| **Linux (Debian/Ubuntu)** | `sh -c '<cmd>'` | `apt-get install -y <pkg>` |
| **Linux (Arch)** | `sh -c '<cmd>'` | `pacman -Sy --noconfirm <pkg>` |
| **Linux (Fedora)** | `sh -c '<cmd>'` | `dnf install -y <pkg>` |
| **Linux (Alpine)** | `sh -c '<cmd>'` | `apk add <pkg>` |
| **macOS (Darwin)** | `sh -c '<cmd>'` | `brew install <pkg>` |
| **Windows** | `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '<cmd>'` | `winget install <pkg>` / `choco install <pkg>` |

### Platform Command Overrides vs. Automated Translation

When a step executes:
1. **Explicit Platform Override**: If `step.platformCommands[platform]` or `step.platformCommands.distroOverrides[distro]` is provided, that command is executed directly.
2. **Automated Translation**: If no explicit override exists, the adapter translates common POSIX constructs to PowerShell when running on Windows:
   - `rm -rf <path>` -> `Remove-Item -Recurse -Force <path>`
   - `mkdir -p <dir>` -> `New-Item -ItemType Directory -Force -Path <dir>`
   - `touch <file>` -> `New-Item -ItemType File -Force -Path <file>`
   - `cat <file>` -> `Get-Content <file>`
   - `export KEY=VAL` -> `$env:KEY="VAL"`
   - `cp -r <src> <dst>` -> `Copy-Item -Recurse -Force <src> <dst>`
   - `grep <pat>` -> `Select-String <pat>`

---

## 6. Disk Workflow Storage Engine

Located in `src/workflows/storage/DiskWorkflowStorage.ts`, this module provides persistent file storage for saved workflows.

### Storage Paths & Directory Layout

Workflows are stored in the user's home configuration directory:
- **Linux & macOS**: `~/.sentinel/workflows/`
- **Windows**: `%USERPROFILE%\.sentinel\workflows\`

Each workflow is saved as an individual JSON file (`<workflow_name>.json`). The filename is sanitized to contain only alphanumeric characters, underscores, and hyphens.

### Schema Validation & Migration

- **Strict Schema Enforcement**: Workflows must declare `schemaVersion: 1`. If an incompatible future version is encountered, the storage engine rejects it with a clear diagnostic message.
- **Legacy Migration**: Older unversioned workflow definitions are automatically migrated to `schemaVersion: 1` upon loading, ensuring backward compatibility.
- **Atomic Disk Writes**: In desktop Tauri mode, workflows are written using native Rust backend file invocations with fallback to Node.js `fs` in headless test environments.

---

## 7. Workflow Manager Visual UI Drawer

The Workflow Manager Drawer (`src/ui/components/WorkflowManagerDrawer.tsx`) provides a dedicated visual management interface for saved workflows.

```
+-----------------------------------------------------------------------------------+
|  WORKFLOWS & MACROS                                                        [X]   |
|  [ Search workflows...                                    ]  [+ New Workflow]   |
+-----------------------------------------------------------------------------------+
|  ▼ release-gate                                            [Dry Run]  [Play]     |
|    Pre-flight validation pipeline before Git push                                |
|    Tags: git, testing, release                                                    |
|                                                                                   |
|    Parameters:                                                                    |
|    [ BRANCH: main                     ]  [ PORT: 8080                     ]      |
|                                                                                   |
|    Steps (5):                                                                     |
|    1. [^] [v] Git Status Check               git status --porcelain        [SAFE] |
|    2. [^] [v] Linter Verification            npm run lint                  [SAFE] |
|    3. [^] [v] Precondition Docker Check      docker compose up -d          [WARN] |
|    4. [^] [v] Dependency Clean               rm -rf node_modules...        [RISK] |
|    5. [^] [v] Test Suite Execution           npm test                      [SAFE] |
|                                                                                   |
|    Execution Output:                                                              |
|    [✓] Step 1 passed (12ms)                                                       |
|    [✓] Step 2 passed (1420ms)                                                     |
|    [✓] Step 3 passed (820ms)                                                      |
|    [✓] Step 4 passed (310ms)                                                      |
|    [✓] Step 5 passed (2140ms)                                                     |
|    All 5 steps completed successfully in 4702ms.                                  |
|                                                                                   |
|    [Run in Terminal]  [Export JSON]  [Delete Workflow]                            |
+-----------------------------------------------------------------------------------+
```

### Key UI Features

- **Access Methods**: Click `[Workflows]` in the status bar (in Visual Mode) or open via Command Palette (`Ctrl+Shift+P` -> "Workflows: Open Manager").
- **Live Search & Tag Filtering**: Quickly locate workflows across hundreds of stored definitions.
- **Interactive Step Inspector & Reordering**: Reorder steps with `[^]` and `[v]` buttons or edit commands and timeouts inline.
- **Dynamic Parameter Customizer**: Fill out parameter forms with default value fallbacks before triggering a replay.
- **One-Click Dry Run Mode**: Validate workflow topology and inspect security risk scores without executing shell commands.
- **Real-Time Step-by-Step Execution Monitor**: Displays live progress spinners, per-step execution times, exit codes, and stdout/stderr output.
- **Safe Keyboard-Driven Deletion**: Modal confirmation dialog supporting `Enter` to confirm deletion and `Escape` to cancel.

---

## 8. Advanced Three-Tier Declarative Workflow Architecture

In addition to task-level shell macros, Sentinel contains an enterprise-grade declarative workflow engine modeled in `src/workflows/models/WorkflowTypes.ts` and orchestrated by `src/workflows/engine/WorkflowExecutionEngine.ts`.

### A. The Three-Tier Architecture

```
1. WorkflowTemplate (Immutable Blueprint)
         │  (Clone / Instantiate)
         ▼
2. UserWorkflow (Personalized & Editable Automation)
         │  (Compile IR & ActionGraph)
         ▼
3. WorkflowInstance (Isolated Single Execution Run)
```

1. **`WorkflowTemplate`**: Immutable, pre-configured blueprints shipped built-in with Sentinel or imported from external repositories. Templates cannot be modified during execution.
2. **`UserWorkflow`**: Editable clones of templates or workflows built from scratch. Belongs to the user, supports custom parameter definitions, schedules, and triggers.
3. **`WorkflowInstance`**: Represents a single execution run. Stores timestamped execution metrics, resolved variables, node results, generated outputs, and diagnostic errors without mutating the parent `UserWorkflow`.

---

### B. 11 Strongly-Typed Variable Domains

Sentinel workflows support strict variable typing across 11 system domains:

| Variable Type | Domain Description | Validation & UI Control |
| :--- | :--- | :--- |
| `string` | General text strings | Standard text input |
| `number` | Numeric quantities and thresholds | Number spinner with min/max |
| `boolean` | Flags and binary toggles | Checkbox / toggle switch |
| `array` | Lists of values | Tag input / multi-select |
| `object` | Structured JSON objects | Embedded JSON editor |
| `secret` | API keys, tokens, and passwords | Masked input, redacted from logs |
| `path` | Filesystem file or folder paths | File/Directory picker with existence check |
| `application` | Desktop or CLI applications | System application selector |
| `port` | Network TCP/UDP port numbers | Port number validator (1–65535) |
| `device` | Hardware devices (GPU, USB, serial) | Connected device enumerator |
| `repository` | Git repositories or remote URLs | Git remote validator |

---

### C. Control Flow Node Types

Workflows support complex logic beyond linear pipelines:

- **`action`**: Executes a registered capability driver (e.g. `shell.execute`, `filesystem.write`, `network.http`).
- **`sequential`**: Executes an ordered sequence of child nodes.
- **`parallel`**: Executes independent child nodes concurrently.
- **`conditional`**: Evaluates conditions (`==`, `!=`, `>`, `<`, `>=`, `<=`, `exists`, `contains`, `matches`) to branch execution (`trueBranch` / `falseBranch`).
- **`switch`**: Multi-way branching based on discrete variable values.
- **`loop`**: Iterates over a count or an array variable.
- **`retry`**: Retries failing operations with configurable attempt limits, delay intervals, and exponential backoff.
- **`wait`**: Pauses execution for a specified duration in milliseconds.
- **`timeout`**: Enforces hard deadlines on long-running tasks with fallback handler nodes.
- **`early_exit`**: Terminates workflow execution cleanly when an exit condition is satisfied.
- **`nested_workflow`**: Invokes another workflow as a sub-routine with scoped input bindings.

---

### D. Built-In Workflow Templates

Sentinel ships with 6 immutable starter templates (`src/workflows/templates/WorkflowTemplates.ts`):

1. **`tpl-morning-development`** (`Morning Development`): Launches developer IDE, terminal, browser, and connects to specified WiFi network.
2. **`tpl-staging-deploy`** (`Staging Deployment`): Runs linter, compiles containers, pushes to container registry, and verifies HTTP health checks.
3. **`tpl-clean-rebuild`** (`Clean Rebuild`): Cleans build caches, reinstalls dependencies, compiles project binaries, and executes test suites.
4. **`tpl-pr-prep`** (`PR Preparation`): Verifies git status, runs formatting checks, runs tests, and prepares commit branches.
5. **`tpl-database-sync`** (`Database Synchronization`): Verifies database host connectivity, runs migration scripts, and seeds local development fixtures.
6. **`tpl-ai-healthcheck`** (`AI Engine Health Check`): Inspects embedded `llama-server` process status, validates VRAM usage, and executes test token generation.

---

### E. Trigger Configuration System

Workflows can be triggered through multiple event sources (`WorkflowTrigger`):

- **`manual`**: Explicit operator invocation from CLI or UI drawer.
- **`on_login`**: Executed when the user logs into their desktop session.
- **`on_startup`**: Executed when Sentinel Terminal initializes.
- **`daily`**: Executed at a specific time of day (e.g., `09:00`).
- **`weekly`**: Executed on a specific day of the week and time.
- **`cron`**: Executed on standard 5-field cron schedules (e.g. `*/15 * * * *`).
- **`filesystem_event`**: Executed when files within a watched directory are modified.
- **`application_event`**: Executed when a specific application launches or terminates.

---

### F. Programmatic Workflow Builder API

For developers creating workflows programmatically, Sentinel provides a fluent `WorkflowBuilder` (`src/workflows/builder/WorkflowBuilder.ts`):

```typescript
import { WorkflowBuilder } from './workflows/builder/WorkflowBuilder';

const workflow = new WorkflowBuilder('Full Stack Deploy', 'dev-team')
  .setDescription('Build frontend and backend, run tests, and package containers')
  .setCategory('devops')
  .addTag('deployment')
  .addVariable({
    name: 'PORT',
    type: 'port',
    description: 'Server listening port',
    required: true,
    defaultValue: 3000
  })
  .addActionNode('build-web', 'Build Frontend', 'shell.execute', {
    command: 'npm run build'
  })
  .addActionNode('build-api', 'Build API', 'shell.execute', {
    command: 'cargo build --release'
  })
  .addActionNode('test-all', 'Run Tests', 'shell.execute', {
    command: 'npm test'
  }, ['build-web', 'build-api']) // Depends on both builds completing
  .addTrigger({ type: 'manual', enabled: true })
  .build();
```

---

### G. Workflow Sharing & Portability (`sentinel-workflow-v1`)

Workflows can be exported and imported using the `WorkflowSharing` module (`src/workflows/sharing/WorkflowSharing.ts`):

```typescript
export interface WorkflowExportPayload {
  readonly format: 'sentinel-workflow-v1';
  readonly exportedAt: number;
  readonly workflow: UserWorkflow;
  readonly templateId?: string;
  readonly checksum: string; // SHA-256 integrity hash
}
```

The export payload includes a SHA-256 checksum to guarantee file integrity during transit and prevent execution of corrupted or tampered workflow files.

---

## 9. Security & Safety Guardrails

Workflow execution adheres strictly to Sentinel's Zero-Trust architecture:

1. **Pre-Execution Static Risk Analysis**:
   Every command within a workflow is inspected by `SecurityEngine` before running. Sentinel evaluates the command against 8 safety categories (filesystem destruction, network exfiltration, system tampering, etc.).
2. **Consent Queue Enforcement**:
   If a step is identified as `SENSITIVE` (e.g., `rm -rf /`, `mkfs`, raw partition modification, downloading unverified remote binaries), execution immediately pauses and requests operator confirmation unless the workflow was explicitly triggered with `--auto-approve`.
3. **Parameter Sanitization**:
   Parameter substitutions (`{{VAR}}`) are checked for shell injection characters (`;`, `&&`, `||`, backticks, `$()`) to prevent command hijacking via parameter inputs.
4. **Session Reversibility in UndoLog**:
   All commands executed during replay are appended to the active session `UndoLog`. Destructive actions are flagged, allowing operators to review or roll back operations if needed.

---

## 10. Benchmarks & Validation Records

The Sentinel Workflow System is continuously validated across automated test suites and benchmark suites:

- **100% Pass Rate Across Domain 9 (Multi-Stage Composite Workflows)**:
  50 distinct composite workflow prompts (Prompts 9.1 through 9.50) are evaluated in `docs/BENCHMARK_REPORT.md` with an average execution latency of **22ms** and zero LLM inference tokens.
- **Test Suite Coverage**:
  - `DeterministicReplayEngine.test.ts`: Parameter injection, environment drift detection, dry-run simulation, and security gating.
  - `MultistagePromptDecomposer.test.ts`: Natural language conjunction parsing, DAG extraction, and parameter inference.
  - `WorkflowRecorder.test.ts`: Plan serialization, UndoLog capture, and file schema formatting.
  - `DiskWorkflowStorage.test.ts`: Schema versioning, legacy migration, and atomic disk persistence.
  - `CrossPlatformCommandAdapter.test.ts`: Linux distro resolution, macOS POSIX handling, and Windows PowerShell translation.
  - `WorkflowBuilder.test.ts`, `Execution.test.ts`, `Scheduler.test.ts`, `Variables.test.ts`: Three-tier declarative workflow lifecycle validation.
