# Workflow & Agentic Execution Engine

The **Workflow & Agentic Execution Engine** (`src/domain/workflow/` & `src/domain/agent/`) coordinates complex task pipelines, sequential step execution, automated verification loops, and interactive terminal synchronization.

---

## 🏛️ Autonomous Execution Loop Architecture

When a natural language instruction warrants multi-step actions or formal tool orchestration, the `Planner` compiles a directed workflow specification for consumption by `AgentRuntime`:

```
User Instruction ➔ Planner (Intent Engine) ➔ Workflow Schema Compiled
                                                     │
               ┌─────────────────────────────────────▼─────────────────────────────────────┐
               │                        AGENT RUNTIME ENGINE                               │
               │  1. Evaluate Step Security & Risk Profile (SecurityEngine Guardrail)     │
               │  2. Execute Concrete Driver Action (Capability SDK)                      │
               │  3. Run Verification Hooks (PlanValidator Assertions)                   │
               │  4. Execute Automated Error Repair Loops (Retry / Rollback on Failure)   │
               └─────────────────────────────────────┬─────────────────────────────────────┘
                                                     │
                                   StepCompleted / Workflow Summary
                                                     │
                         ┌───────────────────────────▼───────────────────────────┐
                         │       INTERACTIVE SHELL SYNCHRONIZATION               │
                         │   Auto-Injects commands (such as cd <target_path>)    │
                         │   directly into active interactive zsh PTY sessions!  │
                         └───────────────────────────────────────────────────────┘
```

---

## ⚡ Key Operational Capacities

### 1. Sequential Task Scheduling
Unlike single-shot script wrappers, the engine handles multi-stage execution pipelines. For example, an instruction like *"Open Chrome, go to GitHub, and check battery status"* compiles into a sequential task list where each step's completion outputs can dynamically feed downstream variable injections.

### 2. Real-Time Security Engine Interception
Prior to invoking capability drivers, every proposed workflow step evaluates against our `SecurityEngine`. Operations assessed at a high risk profile (`filesystem.delete` or administrative mutations) trigger an immediate execution block, holding runtime processing until explicit user authorization is granted via interactive terminal dialogs.

### 3. Automatic Shell Directory Synchronization (`cd <path>`)
A major challenge in terminal agent architectures is synchronizing background subprocess executions with active interactive user shells. Cero implements an automated solution:
- When any executed workflow step involves filesystem directory navigation (`filesystem.cd`, `shell.cd`, or outputs starting with `Changed directory to:`), `AgentRuntime` automatically captures the resolved target path.
- Upon completing workflow executions and rendering the summary report, `TerminalView.tsx` directly injects `cd "<target_path>"\r` into the user's active `zsh` session via `SessionManager`. 
- **The developer's visible command prompt moves instantaneously to the newly selected working directory without manual intervention!**
