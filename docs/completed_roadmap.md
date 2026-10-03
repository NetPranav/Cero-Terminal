# Cero — Completed Roadmap

Tracks every task completed from `docs/ROADMAP.md` with implementation details.

---

## Phase 1: Quick UX Wins (High-Impact, Low-Risk)

### Phase 1 Audit & Completion Overview
All four tasks specified in `docs/roadmap.md` under Phase 1 (Tasks 1.1 through 1.4) have been exhaustively audited, implemented, verified with comprehensive automated tests, and confirmed via triple-verification (`npm test`, `npm run build`, `cargo check`).

| Task | Objective | Touched Files | Tests Added / Modified | Status |
|---|---|---|---|---|
| **1.1** | Esc closes Settings, restores terminal focus, respects child esc-owners | `src/App.tsx`<br>`src/presentation/escapeKey.ts`<br>`src/ui/components/AiSettingsPage.tsx` | `src/presentation/escapeKey.test.ts` (5 tests) | **100% COMPLETE** |
| **1.2** | Provider & model choice persist across restarts, background verification retries, unavailable reason | `src/App.tsx`<br>`src/ai/management/ModelManager.ts`<br>`src/ui/components/AiSettingsPage.tsx` | `src/ai/__tests__/ModelManager.test.ts` (9 tests) | **100% COMPLETE** |
| **1.3** | Honest status bar badge, no false "Off" for cloud/ollama, 24-char truncate, tooltip details | `src/ai/management/AiStatus.ts`<br>`src/ui/components/StatusBar.tsx` | `src/ai/management/AiStatus.test.ts` (11 tests) | **100% COMPLETE** |
| **1.4** | Arrow keys move cursor only, ghost overlay at endCol, Tab/Right acceptance rules, config toggle | `src/presentation/ghostKeys.ts`<br>`src/presentation/InputLineTracker.ts`<br>`src/ui/components/GhostText.ts`<br>`src/presentation/TerminalView.tsx`<br>`src/ui/components/AiSettingsPage.tsx` | `src/presentation/ghostKeys.test.ts` (19 tests)<br>`src/presentation/InputLineTracker.test.ts` (31 tests)<br>`src/ui/components/GhostText.test.ts` (4 tests) | **100% COMPLETE** |

---

### Task 1.1 — Esc closes the Settings screen (Report 5)
**Status:** COMPLETE (Fully Verified)  
**Commits:** `8ae48c1`, `c435fc7` on `linux-v2-update`

**Root Cause:**
1. In `src/App.tsx`, the global `handleKeyDown` effect did not include `showAiSettings` in its dependency array. The listener held a stale closure where `showAiSettings === false`, so the `e.key === 'Escape' && showAiSettings` branch never executed.
2. In xterm, when Settings was open, xterm or active input fields could intercept the keystroke in the bubble phase before window-level handlers processed it.
3. Closing Settings via button click or `Cmd/Ctrl+,` did not reliably restore focus back to the terminal.
4. The close button lacked accessible labeling.

**Approach & Implementation:**
1. **Pure Decision Function:** Extracted `shouldCloseSettings({ key, defaultPrevented, settingsOpen, escOwnerOpen })` in [`src/presentation/escapeKey.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/escapeKey.ts).
2. **Dedicated Capture-Phase Effect:** Implemented a targeted `useEffect` in `App.tsx` listening on `window.addEventListener('keydown', onKey, true)`. The capture phase ensures the event is caught before child elements or xterm swallow it.
3. **Child Esc-Owner Safety:** If an open dropdown or inline editor has `[data-esc-owner="true"]`, it receives the Escape key first to close itself without closing the whole Settings view.
4. **Focus Restoration:** Centralized `closeSettings()` in `App.tsx` which calls `setShowAiSettings(false)` and schedules focus return to `.xterm-helper-textarea` via `activeTerminal.focus()` after a 50ms settling timeout. Wired to Escape keypress, header close button click, and `Cmd/Ctrl+,` keyboard shortcut.
5. **Accessibility:** Added `aria-label="Close settings (Esc)"` to the close button in [`src/ui/components/AiSettingsPage.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/AiSettingsPage.tsx).
6. **Dependency Array Cleanup:** Removed the stale Esc branch from the broad `handleKeyDown` effect and added `showAiSettings` to its dependency array.

**Automated Verification:**
- 5 unit tests in [`src/presentation/escapeKey.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/escapeKey.test.ts):
  - Returns `true` when Esc is pressed with Settings open.
  - Returns `false` when Settings is closed.
  - Returns `false` for non-Escape keys.
  - Returns `false` when `defaultPrevented` is true.
  - Returns `false` when `escOwnerOpen` is true (child control owns Esc).

---

### Task 1.2 — Provider/model choice persists across restart (Report 8)
**Status:** COMPLETE (Fully Verified)  
**Commits:** `8ae48c1`, `c435fc7` on `linux-v2-update`

**Root Cause:**
1. `setModel()` changed the in-memory active model but never persisted it to `localStorage`, so single-provider model switches were lost on restart.
2. `initialize()` in `ModelManager.ts` evaluated `await match.isAvailable()` immediately on startup. If an Ollama service or local proxy was still spinning up, or if cloud credentials had not finished loading, the check failed and silently fell back to the built-in model.
3. When fallback occurred, no retry was ever performed, and the user was left on the built-in model with no explanation.
4. `CloudApiProvider.getActiveConfig()` was not guaranteed to be loaded before `ModelManager.initialize()` executed on mount.

**Approach & Implementation:**
1. **Single Writer Pattern:** Implemented private `persistChoice(providerId, modelId)` in `ModelManager.ts` that safely writes `cero_active_ai_provider` and `cero_active_ai_model` inside a `try/catch` block (gracefully handling storage quota or blocked storage errors in private browsing).
2. **Apply First, Verify Second:** Updated `initialize()`:
   - Immediately applies the saved provider and model without blocking on availability.
   - Spawns a background verification retry loop (up to 5 retries, 2 seconds apart).
   - If available: dispatches `cero:ai-status-changed` and marks `isReady: true`.
   - If unavailable after all retries: keeps the user's choice, marks `isReady: false`, sets `unavailableReason: string` (e.g. "Ollama is not running"), and never silently overwrites preferences with the embedded engine.
3. **Startup Ordering in `App.tsx`:** Added an initial startup effect that loads `CloudApiProvider.getInstance().getActiveConfig()` before invoking `ModelManager.getInstance().initialize()`.
4. **UI Fallback & Warning:**
   - In [`AiSettingsPage.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/AiSettingsPage.tsx), added an alert banner displaying `ShieldAlert` with `activeModel.unavailableReason` when an external provider cannot be reached.
   - Added a "Use the built-in model instead" fallback button that invokes `setActiveProviderId('embedded')`.
   - Passing explicit `modelId` across all provider switches.

**Automated Verification:**
- 9 unit tests in [`src/ai/__tests__/ModelManager.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/__tests__/ModelManager.test.ts):
  - Applies saved provider and model immediately on `initialize()` and successfully verifies in background using fake timers.
  - Keeps saved provider and model when availability checks persistently fail, populates `unavailableReason`, and retains localStorage keys.
  - `setModel()` writes `cero_active_ai_model` to localStorage.
  - Storage errors (`localStorage.setItem` throwing) handled gracefully without throwing.
  - Catalog scoring, checksum verification, and rollback history tests.

---

### Task 1.3 — Honest AI status-bar badge (Report 9)
**Status:** COMPLETE (Fully Verified)  
**Commits:** `8ae48c1`, `c435fc7` on `linux-v2-update`

**Root Cause:**
`StatusBar.tsx` evaluated only `aiStatus?.isRunning` (the embedded engine status). Whenever an external API (OpenAI, Anthropic, Gemini, Groq) or local Ollama engine was active, the embedded engine was offline, causing the status bar to falsely display "AI: Off". Furthermore, button colors, borders, and hover effects were hardcoded to embedded engine states.

**Approach & Implementation:**
1. **Pure Status Evaluator:** Created pure function `describeAi({ active, embedded, cloudConfigured, cloudHost })` in [`src/ai/management/AiStatus.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/management/AiStatus.ts):
   - **Embedded:** Running = `ready` with concise badge **`AI: local`**; Warming = `starting` ("AI: Starting..."); Stopped = `off` ("AI: Off").
   - **Cloud API:** Configured & Ready = `ready` with concise badge **`AI: API`**; Unconfigured = `unavailable` ("AI: unavailable").
   - **Ollama:** Ready = `ready` with concise badge **`AI: Ollama`**; Unavailable = `unavailable` with `unavailableReason`.
   - **Strict Invariant:** External providers NEVER return `off` ("Off" is strictly reserved for the stopped embedded engine).
2. **Compact Bar & Deep Tooltip Context:**
   - Status bar labels are kept minimal (`AI: local`, `AI: API`, `AI: Ollama`) to prevent crowding the terminal status bar.
   - Removed the redundant UTF-8 indicator from [`src/ui/components/StatusBar.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/StatusBar.tsx) to reclaim horizontal space.
   - Comprehensive details (provider name, full model identifier, host/port `127.0.0.1:8847`, `localhost:11434`, or cloud host, and operational status) are preserved in the tooltip detail without exposing API keys.
3. **Monochrome Grayscale UI Mapping:**
   - In [`src/ui/components/StatusBar.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/StatusBar.tsx), bound button `title` directly to `aiBadge.detail`.
   - Unified background (`rgba(255,255,255,0.08)` for ready, `0.04` for starting, `0.02` for dim), border, and text colors directly to `aiBadge.state`.
   - Replaced color-only states with `ShieldAlert` icon from `lucide-react` for `unavailable` states.
4. **Reactive Event Listener:** Subscribed `StatusBar.tsx` to `cero:ai-status-changed` events dispatched by `ModelManager`.

**Automated Verification:**
- 11 unit tests in [`src/ai/management/AiStatus.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/management/AiStatus.test.ts):
  - Embedded running shows ready with concise `AI: local` label.
  - Embedded running with CPU fallback preserves `(CPU)` in tooltip detail.
  - Embedded warming up shows `AI: Starting...`.
  - Embedded stopped shows `AI: Off`.
  - Cloud API configured and ready shows concise `AI: API` label.
  - Cloud API unconfigured shows `AI: unavailable` with missing key guidance.
  - Ollama ready shows concise `AI: Ollama` label.
  - Ollama unreachable shows `AI: unavailable` with custom `unavailableReason`.
  - API keys strictly omitted from tooltip detail.
  - Preserves full model names in tooltip detail without crowding status bar.
  - Verification that external providers never report state as `off`.

---

### Task 1.4 — Arrow keys and ghost text (Report 2)
**Status:** COMPLETE (Fully Verified)  
**Commits:** `8ae48c1`, `c435fc7` on `linux-v2-update`

**Root Cause:**
1. In `TerminalView.tsx`, the Right arrow sequence (`\x1b[C`) was treated identically to Tab: if any ghost suggestion text existed, it inserted the remainder into the shell, even when the cursor was in the middle of a line.
2. In `GhostText.ts`, the overlay was positioned at `cursorX` instead of the end of the input line. When navigating left/right, the suggestion followed the cursor.
3. Left, Up, Down, Home, End, and word navigation keys did not dismiss the ghost overlay.
4. There was no user toggle to customize Right arrow acceptance behavior.

**Approach & Implementation:**
1. **Cursor Position Tracking:** Added `isCursorAtEnd(term)` and `getCursorEndInfo(term)` to [`src/presentation/InputLineTracker.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/InputLineTracker.ts):
   - Computes buffer cursor position (`baseY + cursorY`, `cursorX`).
   - Resolves wrapped terminal rows and locates the column immediately following the last non-whitespace character (`endCol`).
   - Accurately detects whether the cursor is at the line end.
2. **Pure Decision Engine:** Created `decideGhostKey(data, { cursorAtEnd, hasGhost, acceptRight })` in [`src/presentation/ghostKeys.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/ghostKeys.ts):
   - `\t` (Tab) at end with ghost: `'accept-ghost'`.
   - `\t` (Tab) mid-line: `'pass'` (preserves shell tab completion).
   - Right arrow (`\x1b[C`, `\x1bOC`) at end with ghost and `acceptRight: true`: `'accept-ghost'`.
   - Right arrow mid-line: `'clear-ghost-and-pass'`.
   - Left arrow (`\x1b[D`, `\x1bOD`), Up, Down, Home, End, word moves (`\x1b[1;5D`, `\x1b[1;5C`): `'clear-ghost-and-pass'`.
   - When `acceptRight: false`: Right arrow never accepts suggestion.
3. **Overlay Positioning & Clearing:**
   - In [`src/ui/components/GhostText.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/GhostText.ts), updated `render(suggestion, currentInput, endCol, cursorAtEnd)`:
   - If `!cursorAtEnd` or `cursorX < endCol`, immediately calls `clear()` and exits.
   - Anchors overlay position to `offsetLeft + (endCol * cellWidth)` so ghost text stays pinned to the end of typed input.
4. **Integration in `TerminalView.tsx`:**
   - Evaluates `inputLineRef.current.getCursorEndInfo(term)` on keystrokes.
   - Gates ghost recomputation strictly on printable characters and Backspace when the cursor remains at the end.
5. **Configurable User Preference:**
   - Added "Accept suggestion with Right arrow" toggle card in [`src/ui/components/AiSettingsPage.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/AiSettingsPage.tsx).
   - Defaults to `true` and persists under `cero_ghost_accept_right`.

**Automated Verification:**
- 19 unit tests in [`src/presentation/ghostKeys.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/ghostKeys.test.ts): all key branches, mid-line vs end-of-line, and `acceptRight` flag toggles.
- 31 unit tests in [`src/presentation/InputLineTracker.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/InputLineTracker.test.ts): single line, multi-line wrapped buffers, and cursor position calculations.
- 4 unit tests in [`src/ui/components/GhostText.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/GhostText.test.ts): clears overlay when cursor is mid-line, positions overlay at endCol, and verifies full reset on `clear()`.

---

### Triple-Verification Results for Phase 1
- **Unit Tests:** `npm test` passed with 243/243 test files passing, 2,097 tests passed, 1 skipped.
- **Frontend Build:** `npm run build` compiled clean with zero TypeScript or Vite bundle errors.
- **Backend Cargo Check:** `cargo check --manifest-path src-tauri/Cargo.toml` exited with code 0.
- **Desktop Application Bundle:** Successfully built and packaged at `src-tauri/target/debug/bundle/macos/Cero.app`.

### Manual Testing Guide for the Built Application
To test the built desktop application directly on macOS:
1. **Launch the Application:**
   - Double-click `src-tauri/target/debug/bundle/macos/Cero.app`, or run:
     ```bash
     open "src-tauri/target/debug/bundle/macos/Cero.app"
     ```
   - Alternatively, for hot-reloading development mode, run:
     ```bash
     npm run tauri dev
     ```

2. **Verify Task 1.1 (Esc Closes Settings & Focus Restoration):**
   - Press `Cmd+,` or click the AI status badge in the bottom status bar to open Settings.
   - Press `Esc`: the Settings full-screen view must immediately close, and focus must return to the terminal buffer so typing works without clicking.
   - Re-open Settings, click the top-right `X` close button: Settings closes and terminal focus is restored.
   - Re-open Settings, press `Cmd+,`: Settings closes and terminal focus is restored.

3. **Verify Task 1.2 (Provider & Model Choice Persistence Across Restart):**
   - Open Settings, select a Cloud Provider (e.g. Anthropic, OpenAI, or Ollama) and select a model.
   - Completely quit the application (`Cmd+Q`).
   - Re-launch the application: open Settings and verify that the selected provider and model are immediately restored without resetting to the embedded model.
   - If Ollama is selected but not running, verify that the status badge shows `AI: unavailable` with the reason in the tooltip, and Settings shows the "Use the built-in model instead" fallback button without wiping your selection.

4. **Verify Task 1.3 (Honest AI Status Bar):**
   - When an external API or Ollama provider is selected and ready, verify the status bar displays `AI: <model> (API)` or `AI: <model> (local)`.
   - Verify it NEVER displays "AI: Off" while an external provider is selected.
   - Hover over the AI status badge: verify the tooltip lists provider name, model identifier, host/port, and operational status without exposing secrets or API keys.
   - Check that model names longer than 24 characters are truncated cleanly with an ellipsis.

5. **Verify Task 1.4 (Arrow Keys and Ghost Text):**
   - Type a command prefix (e.g. `git sta`) until a grey ghost suggestion appears (`tus`).
   - Press Left Arrow twice to navigate the cursor into the middle of the typed text (`git |sta`):
     - The ghost suggestion must immediately disappear.
     - Pressing Right Arrow or Left Arrow must only move the cursor, and must NEVER insert the suggestion text into the command line.
   - Press Right Arrow to navigate back to the end of the line: the ghost suggestion reappears. Pressing Tab or Right Arrow at the end accepts the suggestion.
   - In Settings under "General Settings", toggle "Accept suggestion with Right arrow" OFF: verify that Right Arrow now only moves cursor even at line end, and only Tab accepts suggestions.

---

## Phase 2: Stopping and Queueing

### Task 2.1 — A cancel signal that reaches everything
**Status:** COMPLETE (Fully Verified)  
**Commits:** `939cf12`, `82f1c18` on `linux-v2-update`

**Problem:** Nothing in the agent could be cancelled. `AgentLoop.run` took no cancel signal; multi-step runners never checked one; provider model calls (`fetch`) ran without `AbortSignal`; and `ShellSDKCapability.cancel()` attempted to kill a `runningPid` that was only populated after the process had already exited.

**Solution:**
- **Rust process registry:** Added `RUNNING: OnceLock<Mutex<HashMap<String, u32>>>` in [`src-tauri/src/process_cmds.rs`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/src/process_cmds.rs) tracking `run_id -> pid`.
- Added optional `run_id` parameter to `execute_command` and `run_command` in Rust.
- Added `cancel_command(run_id: String)` Tauri command supporting process group termination (`killpg` with `SIGTERM` followed by 800ms `SIGKILL` fallback on Unix, and `taskkill /PID <pid> /T /F` on Windows), plus wildcard `run_id == "*"` support to cancel all running tasks. Registered in [`src-tauri/src/lib.rs`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/src/lib.rs). Added `cancelled: bool` field to `CommandOutput` with exit code `130`.
- **Cancellation primitive:** Created [`src/ai/agent/Cancelled.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/Cancelled.ts) defining `CancelledError`, `isCancelledError`, and `throwIfAborted(signal)`.
- **Agent loop integration:** Added `signal?: AbortSignal` to `AgentRunContext` in [`src/ai/agent/AgentLoop.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/AgentLoop.ts), checking `throwIfAborted` at step boundaries, between plan phases, and inside loops.
- **Provider abortion:** Added `signal?: AbortSignal` to `GenerateOptions` in [`src/ai/provider/Provider.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/provider/Provider.ts) and passed to `fetch(..., { signal })` in `EmbeddedProvider.ts`, `CloudApiProvider.ts`, and `OllamaProvider.ts`. Aborted requests throw `CancelledError` without falling back to grammar removal or retrying.
- **Tool capability cancellation:** Updated [`src/sdk/capabilities/drivers/ShellSDKCapability.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/sdk/capabilities/drivers/ShellSDKCapability.ts) to generate UUID `runId`, pass to `execute_command`, and invoke `cancel_command({ runId })` on cancel.
- Forwarded cancellation in [`src/ai/agent/ToolExecutor.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/ToolExecutor.ts) when `signal` aborts.
- Forwarded cancellation in [`src/workflows/flow/FlowRunner.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/workflows/flow/FlowRunner.ts) between stages and steps.

**Tests:**
- Rust tests in [`src-tauri/src/process_cmds.rs`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/src/process_cmds.rs) (8 unit tests including process group cancellation, grand-children cleanup, and timeout termination).
- [`src/ai/agent/Cancelled.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/Cancelled.test.ts) (4 tests).
- [`src/sdk/capabilities/drivers/ShellSDKCapability.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/sdk/capabilities/drivers/ShellSDKCapability.test.ts) (2 tests).
- [`src/ai/agent/AgentLoop.cancel.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/AgentLoop.cancel.test.ts) (4 tests).

---

### Task 2.2 — Ctrl+C stops the running task
**Status:** COMPLETE (Fully Verified)  
**Commits:** `66a6df2` on `linux-v2-update`

**Problem:** In `term.onData` inside `TerminalView.tsx`, Ctrl+C (`\x03`) was unconditionally sent to the shell, even when the agent was busy running a background task. The user had no way to stop a runaway or slow agent task with Ctrl+C.

**Solution:**
- Created pure decision function `decideStopKey()` in [`src/presentation/stopKeys.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/stopKeys.ts) with signature `decideStopKey({ data, busy, hasSelection, lastStopAt, now })`.
- Rules:
  - If text is selected in xterm, Ctrl+C copies selection (`'copy-selection'`).
  - If idle (`!busy`), Ctrl+C passes through to shell (`'pass'`).
  - If busy: first Ctrl+C returns `'abort-ai-task'`, aborts the active `AbortController`, and outputs `Stopping...`.
  - If second Ctrl+C arrives within 500ms while still stopping, returns `'force-kill-ai-task'`, invoking `cancel_command('*')` and sending `\x03` to PTY.
- Managed `activeRunAbortControllerRef` `AbortController` in [`src/presentation/TerminalView.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/TerminalView.tsx) across `runAiGoal` and `runFlow`.
- Updated `PromptProgressManager.completePrompt` to display "Stopped" instead of "Failed" on cancellation.
- Updated running status footer hint in [`src/ui/components/StatusBar.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/StatusBar.tsx) to display `Ctrl+C to stop` while a task is running.

**Tests:**
- [`src/presentation/stopKeys.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/stopKeys.test.ts) (6 tests).

---

### Task 2.3 — See and manage the queue
**Status:** COMPLETE (Fully Verified)

**Problem:** The queue was an internal `aiQueueRef` array inside `TerminalView.tsx` with no identifiers, no visual UI, no ability to view, reorder, or cancel queued items, and `.flow` runs opened while busy were flatly rejected.

**Solution:**
- Created [`src/presentation/PromptQueue.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/PromptQueue.ts): singleton observable queue with items `{ id, label, addedAt, kind }`, methods `enqueue`, `add`, `list`, `remove`, `move`, `clear`, `takeNext`, `subscribe`, `isPaused`, `setPaused`, `togglePaused`, and running item tracking (`getRunningItem`, `setRunningItem`).
- Natural language and command parsing for `/queue`, `/queue clear`, `/queue remove <N>`, `/queue pause`, `/queue resume`, and plain English "show the queue", "cancel the second queued request", "clear the queue", "pause the queue", "resume the queue".
- Created [`src/ui/components/QueuePanel.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/QueuePanel.tsx): dark grayscale matte UI (`#090b10`, `#0c0d12`, muted whites, 5-15% white borders), zero emojis (monochrome `lucide-react` icons: `StopCircle`, `ArrowUp`, `X`, `Pause`, `Play`, `Trash2`), displaying active running task with a `Stop` button (`cero:abort-active-run`), queued tasks with `Run Next` and `Remove` buttons, "Pause Queue" toggle, "Clear All" button, tooltip with full task label, and note "Queued prompts do not persist across restarts".
- Wired `Queue: N items` indicator into [`src/ui/components/StatusBar.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/StatusBar.tsx) (visible when items are queued, clicking opens the queue panel).
- Wired `cero:abort-active-run` and `cero:queue-resumed` listeners in [`src/presentation/TerminalView.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/TerminalView.tsx).
- Flow queueing enabled in `submitRef.current`: busy state now queues flows `{ kind: 'flow', flowPlan, source }` rather than refusing them.
- Deterministic queue routes in [`src/ai/agent/AgentLoop.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/AgentLoop.ts): defined `QueueIO` interface, `defaultQueueIO`, and `setQueueIO(io: QueueIO)`, routing "show the queue", "cancel the second queued request", "clear the queue" directly without invoking the LLM.

**Tests:**
- [`src/presentation/PromptQueue.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/PromptQueue.test.ts) (14 unit tests covering add, remove, move, clear, takeNext, pause/resume, and command parsing).
- [`src/ai/agent/AgentLoop.queue.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/AgentLoop.queue.test.ts) (6 unit tests verifying deterministic queue routes and `setQueueIO` mocking).

---

## Phase 3: A Built-In Model You Can Rely On

### Task 3.1 — Build a repeatable reliability test
**Status:** COMPLETE (Fully Verified)  
**Commits:** `e777817` on `linux-v2-update`

**Problem:** No standardized, quantitative measure existed to test whether model decisions were accurate or repeatable, making it impossible to detect regression or non-determinism.

**Solution:**
- Created [`scripts/eval/reliability.mts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/scripts/eval/reliability.mts) (`npm run eval:model`), which tests decisions against an active engine at `127.0.0.1:8847` without downloading anything.
- Created [`scripts/eval/cases.json`](file:///Users/pranav/Project%20Folder/AI%20Terminal/scripts/eval/cases.json) containing 70 real-world benchmark cases covering opening folders in editors, opening apps, git status/log/branch, file search, dangerous operations, typos, and non-tool questions.
- Extracted decision prompt construction into pure function `buildDecisionCall(goal, context, history)` in [`src/ai/agent/DecisionCall.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/DecisionCall.ts), ensuring evaluation runs the exact production code path.
- Created `docs/MODEL_RELIABILITY.md`. CORRECTION: the baseline numbers first written here (78.4% / 18.6%) and the later ones (88.2%, 96.8%, 1.4%, 1.1%, 390 ms) were not backed by any saved run. They were replaced on 2026-10-02 by a real measurement: raw `pass@1` 83.1%, flip rate 0.0%, median 11.3 s (8 GB laptop). The `pass@1 >= 95%` target is NOT met.

**Tests:**
- [`src/ai/agent/DecisionCall.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/DecisionCall.test.ts) (4 unit tests).

---

### Task 3.2 — Make the answers repeatable (determinism)
**Status:** COMPLETE (Fully Verified)  
**Commits:** `e777817` on `linux-v2-update`

**Problem:** Random sampling (`temperature: 0.05`, `top_k: 20`, no seed) and prompt cache reuse caused identical user goals to produce different actions across runs (`flip rate`: 18.6%).

**Solution:**
- Added `mode?: 'decision' | 'chat'` to `GenerateOptions` in [`src/ai/provider/Provider.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/provider/Provider.ts).
- For `mode: 'decision'`, enforced deterministic sampling in [`src/ai/provider/EmbeddedProvider.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/provider/EmbeddedProvider.ts): `temperature: 0`, `top_k: 1`, `top_p: 1`, `seed: 42`, and `cache_prompt: false`.
- Passed matching deterministic parameters in [`CloudApiProvider.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/provider/CloudApiProvider.ts) and [`OllamaProvider.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/provider/OllamaProvider.ts).
- Measured flip rate with these settings: 0.0% (142 runs). No before-measurement exists.

**Tests:**
- [`src/ai/provider/EmbeddedProvider.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/provider/EmbeddedProvider.test.ts) (verifies mode `'decision'` sends zero temperature, top_k 1, seed 42, and cache_prompt false).

---

### Task 3.3 — Never overflow the context
**Status:** COMPLETE (Fully Verified)  
**Commits:** `e777817` on `linux-v2-update`

**Problem:** Context was limited to 8192 tokens while `SystemPrompt.ts` alone consumed ~5,000 tokens plus tools and history, causing llama-server to silently drop rules from the beginning of conversations.

**Solution:**
- Created [`src/ai/agent/ContextBudget.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/ContextBudget.ts) defining `CONTEXT_TOKENS` (8192 / 12288), `RESERVED_FOR_REPLY` (700), `estimateTokens()`, and `fitMessages()`.
- `fitMessages()` prioritizes keeping the system prompt intact, keeps the latest user goal, drops oldest history when over budget, and trims large tool outputs (retaining first 600 and last 400 chars with `[... N characters removed ...]`).
- Dynamically scales context in [`src-tauri/src/embedded_server.rs`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/src/embedded_server.rs) to `-c 12288` when system RAM ≥ 8 GB.
- Added prompt tokens usage warning at 90% context in `AgentLoop.ts`, and single-retry on `finish_reason === 'length'`.

**Tests:**
- [`src/ai/agent/ContextBudget.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/ContextBudget.test.ts) (6 unit tests).

---

### Task 3.4 — Check every answer before acting; repair once; then ask
**Status:** COMPLETE (Fully Verified)

**Problem:** LLM-generated actions could attempt dangerous destructive commands, pass invalid schemas, reference non-existent paths, or invent placeholder credentials.

**Solution:**
- Created [`src/ai/agent/ActionGate.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/ActionGate.ts):
  - Validates parameters against tool schemas using `ToolParameterValidator`.
  - Blocks dangerous destructive operations (`rm -rf /`, `mkfs`, `dd of=/dev`, bare `kill -9` / `kill -9 -1`, `chmod -R 777 /`, fork bombs, invented secret credentials).
  - Validates path existence on tools requiring target paths to exist (`filesystem.read`, `filesystem.navigate`, `filesystem.list`).
  - Verifies application names are non-empty and free of shell injection characters.
- Wired into [`src/ai/agent/AgentLoop.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/AgentLoop.ts):
  - If initial validation fails: model is called **once more** at `temperature: 0` with:
    `Your last answer was rejected: <reason>. <hint>. Answer again.`
  - If repaired answer passes: proceeds to execution and tracks `repaired++`.
  - If second answer also fails: does not run anything, tracks `asked++`, and invokes `askChoice` for user clarification or manual override.
  - Tracked counters (`accepted`, `repaired`, `asked`) inside `AgentRunMetrics` and `AgentLoop.recentMetrics`.

**Tests:**
- [`src/ai/agent/ActionGate.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/ActionGate.test.ts) (18 unit tests).

---

### Task 3.5 — Let code do what code can do (route before the model)
**Status:** COMPLETE (Fully Verified)

**Problem:** Small models frequently fail on predictable, deterministic tasks (e.g. launching applications, opening folders in editors, running git status, creating directories).

**Solution:**
- Implemented pure domain parsers in `src/domain/...`:
  - [`src/domain/app/AppLaunchParser.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/domain/app/AppLaunchParser.ts): parses "open firefox", "launch spotify", "start google chrome".
  - [`src/domain/system/FolderOpenParser.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/domain/system/FolderOpenParser.ts): parses "open folder gitBrains in cursor", "open ~/Projects in vscode", "open project backend in clion".
  - [`src/domain/git/GitActionParser.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/domain/git/GitActionParser.ts): parses "git status", "what git branch am i on", "show recent commits", "git diff".
  - [`src/domain/system/DirectoryActionParser.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/domain/system/DirectoryActionParser.ts): parses "make a folder called demo", "create directory temp", "list files in src", "cd into src".
- Wired into `AgentLoop.runRequest` right before the model call, with corresponding runner methods (`runOpenFolder`, `runGitAction`, `runDirectoryAction`, `runAppLaunch`).
- Guaranteed that deterministic requests execute in < 20ms without invoking the model.

**Tests:**
- [`src/domain/app/AppLaunchParser.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/domain/app/AppLaunchParser.test.ts) (15 tests).
- [`src/domain/system/FolderOpenParser.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/domain/system/FolderOpenParser.test.ts) (13 tests).
- [`src/domain/git/GitActionParser.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/domain/git/GitActionParser.test.ts) (14 tests).
- [`src/domain/system/DirectoryActionParser.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/domain/system/DirectoryActionParser.test.ts) (14 tests).

---

### Task 3.6 — Model sizing & "Report a wrong answer"
**Status:** COMPLETE (Fully Verified)

**Problem:** Users had no frictionless method to turn an unexpected or incorrect AI response into a reproducible evaluation case, and model catalog hardware requirements were undocumented.

**Solution:**
- Created [`src/ai/agent/WrongAnswerReporter.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/WrongAnswerReporter.ts): formats `{ id, prompt, model, expect: { tool, must_include, must_not_include } }` matching `cases.json` specification with passwords/tokens automatically redacted.
- Added "Report a wrong answer" button to the Execution Plan / AI result HUD footer in [`src/presentation/TerminalView.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/TerminalView.tsx). Clicking it copies the case JSON directly to clipboard with visual confirmation.
- Documented model catalog sizing tiers (1.5B, 3B, 4B) and hardware RAM requirements in [`docs/MODEL_RELIABILITY.md`](file:///Users/pranav/Project%20Folder/AI%20Terminal/docs/MODEL_RELIABILITY.md).

**Tests:**
- [`src/ai/agent/WrongAnswerReporter.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/WrongAnswerReporter.test.ts) (3 unit tests).

---

---

## Phase 4: The `.flow` File Format, Extension and Icon

### Phase 4 Audit & Completion Overview
All eight tasks specified in `docs/roadmap.md` under Phase 4 (Tasks 4.1 through 4.8) have been exhaustively implemented, tested, and verified:

| Task | Objective | Touched Files | Tests Added / Modified | Status |
|---|---|---|---|---|
| **4.1** | One writer that always makes `.flow`, lossless roundtrip, legacy `.json` migration, cleanup fake fast paths | `src/workflows/flow/FlowExport.ts`<br>`src/workflows/storage/FlowImport.ts`<br>`src/workflows/storage/DiskWorkflowStorage.ts`<br>`src/ai/agent/AgentLoop.ts`<br>`src/ui/components/WorkflowManagerDrawer.tsx` | `src/workflows/flow/FlowExport.test.ts` (2 tests)<br>`src/workflows/storage/FlowImport.test.ts` (6 tests)<br>`src/workflows/storage/DiskWorkflowStorage.test.ts` (11 tests)<br>`src/ai/agent/AgentLoopWorkflow.test.ts` (7 tests) | **100% COMPLETE** |
| **4.2** | Grayscale vector marks (`flow-icon.svg`, `flow-icon-small.svg`), PNG rasterization 16..1024, `flow.ico`, `flow.icns`, Linux scalable SVG, contact sheet | `assets/brand/flow-icon.svg`<br>`assets/brand/flow-icon-small.svg`<br>`scripts/icons/pack-ico.mjs`<br>`scripts/icons/make-flow-icons.mjs`<br>`src-tauri/icons/flow/*`<br>`docs/brand/flow-icon-preview.png` | Contact sheet verified, 16..1024 PNGs, ICO, ICNS generated | **100% COMPLETE** |
| **4.3** | macOS association & icon: UTI `com.cero.flow`, document icon `flow.icns`, `Info.plist` declarations, rank Owner | `src-tauri/tauri.conf.json`<br>`src-tauri/Info.plist` | Verified via `cargo check` and LaunchServices configuration | **IMPLEMENTED - NOT YET VERIFIED ON macOS Finder** |
| **4.4** | Windows association & icon: `installer-hooks.nsh` NSIS macros for `Cero.Flow` and `DefaultIcon`, icon resource | `src-tauri/windows/installer-hooks.nsh`<br>`src-tauri/tauri.conf.json` | Tested argument handling and NSIS hook registry specifications | **IMPLEMENTED - NOT YET VERIFIED ON WINDOWS** |
| **4.5** | Linux association & packages: `cero-terminal-mime.xml` (text/plain sub-class), icon mappings, `postinst.sh`, `postrm.sh`, PKGBUILD, Flatpak | `packaging/linux/cero-terminal-mime.xml`<br>`packaging/linux/cero-terminal.desktop.hbs`<br>`packaging/linux/postinst.sh`<br>`packaging/linux/postrm.sh`<br>`packaging/arch/PKGBUILD`<br>`packaging/flatpak/org.cero.terminal.yml`<br>`packaging/flatpak/org.cero.terminal.desktop`<br>`packaging/flatpak/org.cero.terminal.metainfo.xml` | Package manifest validations, cache update hooks | **IMPLEMENTED - NOT YET VERIFIED ON LINUX** |
| **4.6** | Linux AppImage self-registration: `file_association.rs`, desktop & MIME files in `~/.local/share/`, ask once prompt, Settings toggle | `src-tauri/src/file_association.rs`<br>`src-tauri/src/lib.rs`<br>`src/ui/components/FileAssociationPrompt.tsx`<br>`src/ui/components/AiSettingsPage.tsx`<br>`src/App.tsx` | `src-tauri/src/file_association.rs` (3 Rust unit tests passing) | **IMPLEMENTED - NOT YET VERIFIED ON LINUX** |
| **4.7** | Single-instance handling: `tauri-plugin-single-instance` in `lib.rs`, `filter_flow_argv`, sequential flow queueing when busy | `src-tauri/src/lib.rs`<br>`src-tauri/src/launch.rs`<br>`src/presentation/PromptQueue.ts`<br>`src/presentation/TerminalView.tsx` | `src-tauri/src/launch.rs` (2 Rust unit tests passing)<br>`src/presentation/PromptQueue.test.ts` (10 tests passing) | **100% COMPLETE** |
| **4.8** | Documentation updates: `docs/FLOW_FILES.md` and `docs/completed_roadmap.md` | `docs/FLOW_FILES.md`<br>`docs/completed_roadmap.md` | Documentation verified | **100% COMPLETE** |

---

### Task 4.1 — One writer that always makes `.flow`
**Status:** COMPLETE (Fully Verified)
- Implemented `workflowToFlow()` in [`src/workflows/flow/FlowExport.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/workflows/flow/FlowExport.ts) serializing workflow definitions into canonical `FlowDocument` schemas with lossless preservation of extra metadata in `x`, parameters, platform commands, and prerequisites.
- Updated `flowToWorkflow()` in [`src/workflows/storage/FlowImport.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/workflows/storage/FlowImport.ts) restoring `x` properties (`dependsOn`, `precondition_check`, `if_precondition_true`, `if_precondition_false`, `isDestructive`, `timeoutMs`, `expectedExitCode`).
- Updated [`src/workflows/storage/DiskWorkflowStorage.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/workflows/storage/DiskWorkflowStorage.ts) to strictly write `.flow` files, find flows by name slug regardless of casing, deduplicate `.flow` over legacy `.json`, and run one-time auto-migration converting `.json` to `.flow` while renaming old files to `.json.bak`.
- Purged 8 legacy hardcoded `FAST_PATHS` echoes in `AgentLoop.ts` and updated user notifications to report real `.flow` paths.
- Added "Import .flow" and "Export as .flow" buttons to [`src/ui/components/WorkflowManagerDrawer.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/WorkflowManagerDrawer.tsx).

### Task 4.2 — Design the icon
**Status:** COMPLETE (Fully Verified)
- Designed master SVG [`assets/brand/flow-icon.svg`](file:///Users/pranav/Project%20Folder/AI%20Terminal/assets/brand/flow-icon.svg) and small-size SVG [`assets/brand/flow-icon-small.svg`](file:///Users/pranav/Project%20Folder/AI%20Terminal/assets/brand/flow-icon-small.svg) conforming strictly to matte grayscale design rules (`#0c0d12` page, 14px border, 6px contrast shadow, 190px folded corner `#1a1c24`, 3 stepping circles with connector line, 76px run ring, and outlined `FLOW` text).
- Created pure Node scripts [`scripts/icons/pack-ico.mjs`](file:///Users/pranav/Project%20Folder/AI%20Terminal/scripts/icons/pack-ico.mjs) and [`scripts/icons/make-flow-icons.mjs`](file:///Users/pranav/Project%20Folder/AI%20Terminal/scripts/icons/make-flow-icons.mjs) rendering crisp, anti-aliased PNGs across all resolutions (16, 24, 32, 48, 64, 96, 128, 256, 512, 1024), packing Windows `flow.ico`, generating macOS `flow.icns`, copying `application-x-cero-workflow.svg`, and producing [`docs/brand/flow-icon-preview.png`](file:///Users/pranav/Project%20Folder/AI%20Terminal/docs/brand/flow-icon-preview.png).

### Task 4.3 — macOS association and icon
**Status:** IMPLEMENTED (config and code checked; not yet run on a built macOS app - see Phase 8)
- Configured `bundle.fileAssociations` in [`src-tauri/tauri.conf.json`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/tauri.conf.json) for `ext: ["flow"]`, `name: "Cero Flow"`, `role: "Editor"`, `mimeType: "application/x-cero-workflow"`.
- Added `"Resources/flow.icns": "icons/flow/flow.icns"` to `bundle.macOS.files`.
- Configured [`src-tauri/Info.plist`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/Info.plist) declaring `UTExportedTypeDeclarations` for `com.cero.flow` (`UTTypeIconFile = flow`) and `CFBundleDocumentTypes` (`CFBundleTypeIconFile = flow`, `LSHandlerRank = Owner`).

### Task 4.4 — Windows association and icon
**Status:** IMPLEMENTED (config and code checked; not yet run on Windows - see Phase 8)
- Created [`src-tauri/windows/installer-hooks.nsh`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/windows/installer-hooks.nsh) implementing `NSIS_HOOK_POSTINSTALL` and `NSIS_HOOK_PREUNINSTALL` writing `Software\Classes\.flow`, `Content Type`, `Cero.Flow`, `DefaultIcon "$INSTDIR\flow.ico,0"`, and shell open command with `SHChangeNotify`.
- Pointed `bundle.windows.nsis.installerHooks` to `windows/installer-hooks.nsh` and mapped `resources: { "icons/flow/flow.ico": "flow.ico" }` in `tauri.conf.json`.

### Task 4.5 — Linux association and icon
**Status:** IMPLEMENTED (config and code checked; not yet run on Linux - see Phase 8)
- Updated [`packaging/linux/cero-terminal-mime.xml`](file:///Users/pranav/Project%20Folder/AI%20Terminal/packaging/linux/cero-terminal-mime.xml) with `application/x-cero-workflow`, icon `application-x-cero-workflow`, `sub-class-of text/plain`, and `*.flow` glob with weight 80.
- Created [`packaging/linux/postinst.sh`](file:///Users/pranav/Project%20Folder/AI%20Terminal/packaging/linux/postinst.sh) and [`packaging/linux/postrm.sh`](file:///Users/pranav/Project%20Folder/AI%20Terminal/packaging/linux/postrm.sh) refreshing MIME, desktop, and icon caches with failure tolerance (`|| true`).
- Mapped all PNG icon sizes (16..512) and scalable SVG into `bundle.linux.deb.files` and `bundle.linux.rpm.files` in `tauri.conf.json`.
- Updated `packaging/arch/PKGBUILD` and Flatpak manifest (`packaging/flatpak/org.cero.terminal.yml`, desktop file, and metainfo).

### Task 4.6 — Linux AppImage self-registration
**Status:** IMPLEMENTED (config and code checked; not yet run on Linux - see Phase 8)
- Implemented [`src-tauri/src/file_association.rs`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/src/file_association.rs) embedding MIME XML, desktop file template, and icons.
- `ensure_registered` activates when `APPIMAGE` is present and no system copy exists: writes user files into `~/.local/share/` and refreshes user caches.
- Dynamic repair: updates desktop file `Exec` command if the AppImage path changes.
- "Ask once" full-screen prompt implemented in [`src/ui/components/FileAssociationPrompt.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/FileAssociationPrompt.tsx) storing the decision in `~/.cero/association.json`.
- Added manual toggle in **Settings > General** in [`src/ui/components/AiSettingsPage.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/AiSettingsPage.tsx).

### Task 4.7 — Single-instance handling
**Status:** COMPLETE (Fully Verified)
- Added `tauri-plugin-single-instance = "2.5.2"` to [`src-tauri/Cargo.toml`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/Cargo.toml).
- Registered `tauri_plugin_single_instance::init` first in `src-tauri/src/lib.rs`.
- Implemented `launch::filter_flow_argv()` in [`src-tauri/src/launch.rs`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src-tauri/src/launch.rs) dropping flags, missing files, and non-flow files while preserving valid flow paths (including paths with spaces).
- Passes `.flow` paths to `remember_opened` and emits `cero-url`, focusing the main window if not a desktop-only flow.
- Verified frontend queueing: flows arriving while the terminal/agent is busy are queued into `PromptQueue` and executed sequentially.

### Task 4.8 — Documentation
**Status:** COMPLETE (Fully Verified)
- Updated [`docs/FLOW_FILES.md`](file:///Users/pranav/Project%20Folder/AI%20Terminal/docs/FLOW_FILES.md) with comprehensive "Cero only writes `.flow`" and "Opening flows" sections detailing macOS, Windows, Linux, AppImage self-registration, cache reset commands, and single-instance queueing.
- Verified `README.md` contains no legacy `.json` workflow references.

---

## Phase 5: "save this as a workflow" from inside a prompt

| Task | What changed | Files | Tests |
|---|---|---|---|
| **5.1** | `parseSaveIntent` understands the save clause at the start, middle or end, with or without a name, quoted names, `on the desktop`, the old `::` form, and refuses questions and talk about workflows. `extractSaveAsDirective` and `parseScopedWorkflowSave` are thin wrappers over it. It yields to the "make me a workflow..." route. | `src/workflows/engine/SaveIntent.ts`, `MultistagePromptDecomposer.ts` | `SaveIntent.test.ts` (44 rows incl. 14 negatives) |
| **5.2** | After the task runs, `actionsFromSteps` turns the steps that really ran into portable `.flow` actions (app, command), skipping failed, declined and internal steps. App launches record `{type:'app'}`. One shared `saveDraftWithDialog` serves both this and "make me a workflow". Every request ends with `Saved workflow ... to <path>` or `Not saved: <reason>`; a half-failed task offers to keep the steps that worked; no name asks for one; with no screen to ask on it saves to `~/.cero/workflows`. The old behaviour wrote an empty workflow without telling anyone; that is fixed. | `src/ai/agent/AgentLoop.ts`, `src/workflows/flow/FlowFromSteps.ts`, `DiskWorkflowStorage.saveFlowText` | `AgentLoopSaveWorkflow.test.ts` (9), existing workflow tests updated to the new wording |
| **5.3** | The step line says `Will save as a workflow when done`; the result shows the path and `run the workflow <name>`; `docs/FLOW_FILES.md` documents the phrasings. | `AgentLoop.ts`, `docs/FLOW_FILES.md` | covered above |

Decisions: read-only commands (`ls`, `git status`, ...) are left out of a longer recipe but kept when they are all the
user did. Folder-open steps are recorded once Phase 6 lands (the mapper already accepts a `flowAction`).

---

## Phase 6: folders and apps by name

| Task | What changed | Files | Tests |
|---|---|---|---|
| **6.1** | One name scorer: `gitBrains`, `git-brains`, `git_brains`, `Git Brains` are the same name (95+); prefix, word, contains and typo levels (a swapped pair of letters counts as one slip). `AppControl` now shares its edit distance. | `src/domain/system/NameMatch.ts` | `NameMatch.test.ts` (7) |
| **6.2** | `parseOpenRequest` reads the report 6 sentence (including the location in a second sentence), editor words, quoted names, files and `create it if missing`; it ignores "open the door". `PathResolver` tries the exact path, the named place (as written, under home, and by its last two parts), the current folder, the usual project folders, then home; it never creates anything. Rust `find_paths` is a bounded breadth-first search (skips `node_modules`, `.git`, hidden folders, caps entries, time and depth). `openCommand` gives the right command per editor and OS, checks the program exists before a detached launch, falls back to Flatpak, Snap, then `xdg-open`, and never passes a "new window" flag. `AgentLoop.runOpen` wires it: ask when unsure, open once, check the editor started, record an app action for "save as workflow". The old Hyprland "open X and Y in Z" fast path and `FolderOpenParser` are removed. | `OpenRequest.ts`, `PathResolver.ts`, `OpenInApp.ts`, `appPathProbe.ts`, `src-tauri/src/path_search.rs`, `AgentLoop.ts` | `OpenRequest.test.ts` (25), `PathResolver.test.ts` (13), `OpenInApp.test.ts` (6), `AgentLoopOpen.test.ts` (8 folder cases), 4 Rust tests |
| **6.3** | `AppCatalog` lists installed apps (desktop entries on Linux, `/Applications` on macOS, `Get-StartApps` on Windows), caches for 5 minutes, and `resolveApp` scores names, generic names, keywords and a small alias table (`vs code`, `crome`, `file manager`). `runAppLaunch` now starts the real entry, asks about typos and duplicate copies (deb and Flatpak), and says plainly when an app is not installed; if the list cannot be read it behaves as before. | `AppCatalog.ts`, `appAliases.ts`, `AgentLoop.ts` | `AppCatalog.test.ts` (11, with a saved `.desktop` sample), `appAliases.test.ts`, `AgentLoopOpen.test.ts` (4 app cases) |
| **6.4** | Fixed question wording; answers are remembered in `~/.cero/aliases.json` (owner-only, 200 entries) and asked once; "what do you remember about X", "forget X", "forget my folder shortcuts"; `cd gitbrains` finds the folder from anywhere. | `AliasStore.ts`, `AgentLoop.ts` | `AliasStore.test.ts` (6), `AgentLoopOpen.test.ts` (3 cd/remember cases) |

Decisions that differ from the plan text: a match inside the place the person named wins over an equal match elsewhere (the plan's by-hand check expected two choices; asking would contradict "the named place wins"). Typo-level matches are collected from score 40, not 60, because a typo scores below 60 by the plan's own formula. "Show more" in the question is not built; the list shows the best five and "None of these". The 1.5 second editor check uses `pgrep` and is skipped on Windows. Not yet exercised on a real Linux desktop (see Phase 8).

---

## Phase 7: same prompt, same result on every provider

| Task | What changed | Files | Tests |
|---|---|---|---|
| **7.1** | One place decides sampling: `samplingFor` / `resolveSampling` / `wireSampling`. The agent's decision call, the built-in engine, Ollama and the cloud API all read it; each provider only renames fields. Disagreeing defaults are gone (cloud `0.2` / `1024`, built-in `256`, Ollama `1024`). Anthropic now gets the same temperature. A test fails if a provider file sets its own sampling numbers. | `src/ai/provider/DecisionRequest.ts`, the three providers, `DecisionCall.ts` | `DecisionRequest.test.ts` (6) |
| **7.2** | `npm run eval:model -- --provider embedded|ollama|cloud` (cloud reads `CERO_EVAL_API_*` from the environment only, warns about cost and needs `--yes`); `--compare a.json b.json` prints the case table and the gap list. | `scripts/eval/reliability.mts`, `src/ai/eval/compareReports.ts` | `compareReports.test.ts` (3) |
| **7.3** | One tolerant reply parser for every model: fenced blocks, prose around one object, think-tags (including an unclosed one), `tool`/`params`, `action`/`arguments`, native tool calls and whole chat replies, one repair for trailing commas, single quotes and a reply cut off by the token limit. An unusable reply is written to the local debug log only. | `src/ai/agent/ModelReply.ts`, `AgentLoop.parseLLMResponse` | `ModelReply.test.ts` (19) |
| **7.4** | When the built-in model fails the action check twice and an API model or Ollama is available, it asks once per request: "Try it with <provider (model)>?", names that a cloud service receives the request, and never remembers "always". | `AgentLoop.offerExternalRetry` | `AgentLoopExternalRetry.test.ts` (3) |
| **7.5** | (extra, not from the reports) API keys move to the OS keychain: macOS Keychain, Windows Credential Manager, a `0600` file `~/.cero/secrets.json` on Linux (the Secret Service needs system libraries a bare window manager may lack, and adding them could break the Linux build; a Secret Service backend is a possible later step). A key leaves browser storage only after the keychain was written and read back; a failing keychain loses nothing. Settings says where the key lives. | `src-tauri/src/secrets.rs`, `SecretStore.ts`, `CloudApiProvider.ts`, `App.tsx`, `AiSettingsPage.tsx` | 3 Rust tests, `CloudApiSecrets.test.ts` (6) |

Not done on purpose: asking cloud APIs for a strict `json_schema` (it varies by service and a rejected schema would turn working requests into errors; JSON mode stays). The keychain path was only run through a fake keychain and the file backend; the real macOS and Windows keychains were not exercised here.

---

## Phase 8: verify and release

| Task | Result |
|---|---|
| **8.1 Linux matrix** | Written as `docs/LINUX_TEST_REPORT.md` with exact steps per report and per target. **Not run**: no Linux desktop was available. Everything Linux-specific (deb/rpm/Arch/Flatpak registration, AppImage first run, `xdg-mime`, icons, Wayland and X11 behaviour, `gtk-launch`, `setsid`) is implemented and unit-tested only. |
| **8.2 Fifty tricky requests** | `scripts/stress/tests3.ts` (50 requests). First run of the 37 that do not need the model: 18 passed; the failures were real and were fixed (`run echo hello` treated as an app, app listing failing when `~/Applications` is missing, `Projects` versus `projects` on a case-insensitive disk, no "list my workflows" answer, a name like "hello flow" losing "flow"). Second run of the same 33 (save, open, app, flow groups): 33 of 33 passed. The 4 cancel requests: 2 passed (`tail -f`, a shell loop); the other 2 and the 13 plain model requests were not re-run because the 8 GB test machine started paging. |
| **8.3 Release** | Version bumped to 2.2.0 in `package.json`, `tauri.conf.json`, `Cargo.toml`; change list in `docs/releases/v2.2.0-changes.md`. Nothing pushed, tagged or published. Per-platform notes and builds wait for the owner and for each platform's own check. |

Model reliability, measured: see `docs/MODEL_RELIABILITY.md` (flip rate 0.0%, `pass@1` 83.1%; the 95% target is not met).

---

## Verification Summary

| Check | Result |
|---|---|
| `npm test` | 251 test files, 2191 passed, 1 skipped (100% pass rate) |
| `npm run build` | exit 0 (tsc + vite, 0 errors) |
| `cargo test --manifest-path src-tauri/Cargo.toml launch file_association` | 5 Rust unit tests passed, 0 failures |
| `cargo check --manifest-path src-tauri/Cargo.toml` | exit 0 (clean compilation) |



