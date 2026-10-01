# Sentinel Terminal — Completed Roadmap

Tracks every task completed from `docs/ROADMAP.md` with implementation details.

---

## Phase 1: Quick UX Wins (High-Impact, Low-Risk)

### Task 1.1 — Esc closes the Settings screen
**Status:** COMPLETE  
**Commit:** `8ae48c1` on `linux-v2-update`

**Problem:** The Escape key listener lived inside the big `handleKeyDown` effect whose dependency array did not include `showAiSettings`, so it used a stale closure and never saw `showAiSettings === true`. Pressing Esc while Settings was open did nothing.

**Solution:**
- Extracted a pure decision function `shouldCloseSettings()` in [`src/presentation/escapeKey.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/escapeKey.ts).
- Created a dedicated `useEffect` (capture phase) in `App.tsx` that only runs when `showAiSettings` is true. Capture phase fires before xterm swallows the keypress.
- The effect respects `data-esc-owner="true"` on child controls (dropdowns, inline editors) so their own Esc handling is not stolen.
- After closing, focus is returned to the terminal via `.xterm-helper-textarea`.
- Removed the stale branch from the big `handleKeyDown` effect and added `showAiSettings` to its dependency array.

**Tests:** 5 unit tests in [`escapeKey.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/escapeKey.test.ts) covering all branches.

---

### Task 1.2 — Provider/model choice persists across restart
**Status:** COMPLETE  
**Commit:** `8ae48c1` on `linux-v2-update`

**Problem:** `setModel()` never called `localStorage.setItem`, and `setActiveProviderId` inlined its own persistence logic. On restart, `initialize()` blocked on `isAvailable()` — if Ollama or a cloud provider was slow to start, the saved preference was thrown away and the embedded provider was silently selected.

**Solution:**
- Added a single private `persistChoice()` method that is the only writer of the two localStorage keys (`sentinel_active_ai_provider`, `sentinel_active_ai_model`).
- `setModel()` now calls `persistChoice()` after setting the active model.
- `setActiveProviderId()` delegates to `persistChoice()` instead of inlining localStorage writes.
- `initialize()` applies the saved choice immediately (without waiting for `isAvailable()`), then verifies availability in the background with a retry loop (5 retries, 2s apart).
- If the provider never becomes available, it stays selected with `isReady: false` and `unavailableReason` set — no silent switch to embedded.
- Added `unavailableReason?: string` field to the `ActiveModelInfo` interface.

**Tests:** Existing 5 ModelManager tests still pass. Integration verified via build.

---

### Task 1.3 — Honest AI status-bar badge
**Status:** COMPLETE  
**Commit:** `8ae48c1` on `linux-v2-update`

**Problem:** The status bar only checked `EmbeddedStatus.isRunning`. When a cloud or Ollama provider was active, the badge still showed "AI: Off" because the embedded engine was stopped.

**Solution:**
- Created a pure function `describeAi()` in [`src/ai/management/AiStatus.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/management/AiStatus.ts) that takes `{ active: ActiveModelInfo, embedded: EmbeddedStatus, cloudConfigured: boolean }` and returns `{ state, label, detail }`.
- The function covers all four providers: embedded (running/warming/off), cloud_api (configured/unconfigured), ollama (ready/unavailable), and unknown.
- "Off" is reserved for the embedded engine being stopped. External providers show "unavailable" when not reachable.
- [`StatusBar.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/StatusBar.tsx) now imports `describeAi`, `ModelManager`, and `CloudApiProvider`; it fetches `activeModel` from `ModelManager.getInstance().getActiveModel()` and recomputes on `sentinel:ai-status-changed`.
- The badge uses `ShieldAlert` (lucide-react) for "unavailable" state and `Sparkles` for ready/starting/off.

**Tests:** 9 unit tests in [`AiStatus.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/management/AiStatus.test.ts) covering all provider/state combinations. Includes a cross-provider rule test that external providers never show "Off".

---

### Task 1.4 — Arrow keys and ghost text
**Status:** COMPLETE  
**Commit:** `8ae48c1` on `linux-v2-update`

**Problem:** The `onData` handler treated Right arrow (`\x1b[C`) identically to Tab — it always accepted the ghost suggestion. This broke normal cursor movement: pressing Right mid-line inserted the ghost text instead of moving the cursor one position. Left, Up, and Down arrows triggered ghost recomputation, causing flicker.

**Solution:**
- Created a pure decision function `decideGhostKey()` in [`src/presentation/ghostKeys.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/ghostKeys.ts) that returns `'accept-ghost' | 'clear-ghost-and-pass' | 'pass'` based on key, cursor position, ghost presence, and user preference.
- Rules:
  - **Tab at end with ghost:** accept
  - **Tab mid-line:** pass (let shell do tab completion)
  - **Right at end with ghost + `acceptRight`:** accept
  - **Right mid-line:** clear ghost and pass to shell
  - **Left, Up, Down, Home, End, Ctrl+Left/Right, Alt+Left/Right:** clear ghost and pass
  - **Everything else:** pass
- The `onData` handler in [`TerminalView.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/TerminalView.tsx) now calls `decideGhostKey()` first, then acts on the result.
- Ghost recomputation is gated on `isPrintableOrBackspace` and cursor-at-end, preventing unnecessary recalculations on navigation keys.
- Added `sentinel_ghost_accept_right` localStorage preference for users who prefer Right arrow to never accept ghost text.

**Tests:** 19 unit tests in [`ghostKeys.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/ghostKeys.test.ts) covering every key/context combination.

---

## Phase 2: Stopping and Queueing

### Task 2.1 — A cancel signal that reaches everything
**Status:** COMPLETE  
**Commit:** `939cf12` (with cleanup in `82f1c18`) on `linux-v2-update`

**Problem:** Nothing in the agent could be cancelled. `AgentLoop.run` took no cancel signal; multi-step runners never checked one; provider model calls (`fetch`) ran without `AbortSignal`; and `ShellSDKCapability.cancel()` attempted to kill a `runningPid` that was only populated after the process had already exited.

**Solution:**
- **Rust process registry:** Added `RUNNING: OnceLock<Mutex<HashMap<String, u32>>>` in [`src-tauri/src/process_cmds.rs`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/src/process_cmds.rs) tracking `run_id -> pid`.
- Added optional `run_id` parameter to `execute_command` and `run_command` in Rust.
- Added `cancel_command(run_id: String)` Tauri command supporting process group termination (`killpg` with `SIGTERM` followed by `SIGKILL` fallback, and `taskkill /PID /T /F` on Windows), plus wildcard `run_id == "*"` support to cancel all running tasks. Registered in [`src-tauri/src/lib.rs`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/src/lib.rs). Added `cancelled: bool` field to `CommandOutput` with exit code `130`.
- **Cancellation primitive:** Created [`src/ai/agent/Cancelled.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/Cancelled.ts) defining `CancelledError`, `isCancelledError`, and `throwIfAborted(signal)`.
- **Agent loop integration:** Added `signal?: AbortSignal` to `AgentRunContext` in [`src/ai/agent/AgentLoop.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/AgentLoop.ts), checking `throwIfAborted` at step boundaries, between plan phases, and inside loops.
- **Provider abortion:** Added `signal?: AbortSignal` to `GenerateOptions` in [`src/ai/provider/Provider.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/provider/Provider.ts) and passed to `fetch(..., { signal })` in `EmbeddedProvider.ts`, `CloudApiProvider.ts`, and `OllamaProvider.ts`. Aborted requests throw `CancelledError` without falling back to grammar removal or retrying.
- **Tool capability cancellation:** Updated [`src/sdk/capabilities/drivers/ShellSDKCapability.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/sdk/capabilities/drivers/ShellSDKCapability.ts) to generate UUID `runId`, pass to `execute_command`, and invoke `cancel_command({ runId })` on cancel.
- Forwarded cancellation in [`src/ai/agent/ToolExecutor.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/ToolExecutor.ts) when `signal` aborts.
- Forwarded cancellation in [`src/workflows/flow/FlowRunner.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/workflows/flow/FlowRunner.ts) between stages and steps.

**Tests:**
- [`Cancelled.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/Cancelled.test.ts) (4 tests).
- [`ShellSDKCapability.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/sdk/capabilities/drivers/ShellSDKCapability.test.ts) (4 tests).
- [`AgentLoop.cancel.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/AgentLoop.cancel.test.ts) (3 tests).

---

### Task 2.2 — Ctrl+C stops the running task
**Status:** COMPLETE  
**Commit:** `66a6df2` on `linux-v2-update`

**Problem:** In `term.onData` inside `TerminalView.tsx`, Ctrl+C (`\x03`) was unconditionally sent to the shell, even when the agent was busy running a background task. The user had no way to stop a runaway or slow agent task with Ctrl+C.

**Solution:**
- Created pure decision function `decideStopKey()` in [`src/presentation/stopKeys.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/stopKeys.ts) with signature `decideStopKey({ data, busy, hasSelection, lastStopAt, now })`.
- Rules:
  - If text is selected in xterm, Ctrl+C copies selection (`'pass'`).
  - If idle (`!busy`), Ctrl+C passes through to shell (`'pass'`).
  - If busy: first Ctrl+C returns `'stop'`, aborts the active `AbortController`, and outputs `Stopping...`.
  - If second Ctrl+C arrives within 500ms while still stopping, returns `'force-stop'`, invoking `cancel_command('*')` and sending `\x03` to PTY.
- Managed `activeRunRef` `AbortController` in [`src/presentation/TerminalView.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/TerminalView.tsx) across `runAiGoal` and `runFlow`.
- Updated `PromptProgressManager.completePrompt` to display "Stopped" instead of "Failed" on cancellation.
- Updated running status footer hint to display `Ctrl+C to stop`.

**Tests:**
- [`src/presentation/stopKeys.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/stopKeys.test.ts) (6 tests).

---

### Task 2.3 — See and manage the queue
**Status:** COMPLETE  
**Commit:** `ce29f40` on `linux-v2-update`

**Problem:** The queue was an internal `aiQueueRef` array inside `TerminalView.tsx` with no identifiers, no visual UI, no ability to view, reorder, or cancel queued items, and `.flow` runs opened while busy were flatly rejected.

**Solution:**
- Created [`src/presentation/PromptQueue.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/PromptQueue.ts): singleton observable queue with items `{ id, label, addedAt, kind }`, methods `add`, `list`, `remove`, `move`, `clear`, `takeNext`, `subscribe`, and pause/resume support.
- Added natural language and command parser in `PromptQueue.ts` for `/queue`, `/queue clear`, `/queue remove <N>`, `>show queue`, `>clear queue`, and `>remove <N> from queue`.
- Created [`src/ui/components/QueuePanel.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/QueuePanel.tsx): dark grayscale styling (`#090b10`, `#0c0d12`, muted whites, 5-15% white borders), zero emojis (lucide icons `ListOrdered`, `Play`, `X`, `Trash2`, `Pause`, `ArrowUp`), showing running task with `Stop` button, queued tasks with `Run Next` and `Remove` buttons, "Pause Queue" toggle, "Clear All" button, and keyboard Esc dismissal.
- Wired `Queue: N items` indicator into [`src/ui/components/StatusBar.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/StatusBar.tsx) (visible when items are queued, clicking opens the queue panel).
- Integrated `QueuePanel` into [`src/App.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/App.tsx) responding to `sentinel:open-queue` custom event.
- Replaced `aiQueueRef` in [`src/presentation/TerminalView.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/TerminalView.tsx) with `PromptQueue`, queueing both goals and flows, dispatching next items after a 150ms delay.

**Tests:**
- [`src/presentation/PromptQueue.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/PromptQueue.test.ts) (14 tests).

---

## Verification Summary

| Check | Result |
|-------|--------|
| `npm test` | 240 files, 2073 passed, 1 skipped |
| `npm run build` | exit 0 (tsc + vite) |
| `cargo check` | exit 0 (3 pre-existing warnings) |
