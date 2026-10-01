# Sentinel Terminal — Completed Roadmap

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
1. **Single Writer Pattern:** Implemented private `persistChoice(providerId, modelId)` in `ModelManager.ts` that safely writes `sentinel_active_ai_provider` and `sentinel_active_ai_model` inside a `try/catch` block (gracefully handling storage quota or blocked storage errors in private browsing).
2. **Apply First, Verify Second:** Updated `initialize()`:
   - Immediately applies the saved provider and model without blocking on availability.
   - Spawns a background verification retry loop (up to 5 retries, 2 seconds apart).
   - If available: dispatches `sentinel:ai-status-changed` and marks `isReady: true`.
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
  - `setModel()` writes `sentinel_active_ai_model` to localStorage.
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
   - **Embedded:** Running = `ready` ("AI: Qwen 2.5 Coder 3B" / "AI: Qwen 2.5 Coder 3B (CPU)"); Warming = `starting` ("AI: Warming..."); Stopped = `off` ("Built-in AI is stopped. Click to start it.").
   - **Cloud API:** Configured & Ready = `ready` ("AI: <model> (API)"); Unconfigured = `unavailable` ("No API key set").
   - **Ollama:** Ready = `ready` ("AI: <model> (local)"); Unavailable = `unavailable` with `unavailableReason`.
   - **Strict Invariant:** External providers NEVER return `off` ("Off" is strictly reserved for the stopped embedded engine).
2. **Label Truncation & Host Disclosure:**
   - Truncates status bar badge labels longer than 24 characters with an ellipsis (`...`).
   - Detailed tooltip includes provider name, model identifier, host/port (`127.0.0.1:8847`, `localhost:11434`, or cloud host domain), and operational state. Never exposes API keys.
3. **Monochrome Grayscale UI Mapping:**
   - In [`src/ui/components/StatusBar.tsx`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/StatusBar.tsx), bound button `title` directly to `aiBadge.detail`.
   - Unified background (`rgba(255,255,255,0.08)` for ready, `0.04` for starting, `0.02` for dim), border, and text colors directly to `aiBadge.state`.
   - Replaced color-only states with `ShieldAlert` icon from `lucide-react` for `unavailable` states.
4. **Reactive Event Listener:** Subscribed `StatusBar.tsx` to `sentinel:ai-status-changed` events dispatched by `ModelManager`.

**Automated Verification:**
- 11 unit tests in [`src/ai/management/AiStatus.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/management/AiStatus.test.ts):
  - Embedded running (GPU & CPU mode).
  - Embedded warming up.
  - Embedded stopped.
  - Cloud API configured and ready with API host in tooltip.
  - Cloud API unconfigured with missing key guidance.
  - Ollama ready with `localhost:11434` host in tooltip.
  - Ollama unreachable with custom `unavailableReason`.
  - API keys strictly omitted from tooltip detail.
  - Status bar label truncation to 24 characters with ellipsis.
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
   - Defaults to `true` and persists under `sentinel_ghost_accept_right`.

**Automated Verification:**
- 19 unit tests in [`src/presentation/ghostKeys.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/ghostKeys.test.ts): all key branches, mid-line vs end-of-line, and `acceptRight` flag toggles.
- 31 unit tests in [`src/presentation/InputLineTracker.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/presentation/InputLineTracker.test.ts): single line, multi-line wrapped buffers, and cursor position calculations.
- 4 unit tests in [`src/ui/components/GhostText.test.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ui/components/GhostText.test.ts): clears overlay when cursor is mid-line, positions overlay at endCol, and verifies full reset on `clear()`.

---

### Triple-Verification Results for Phase 1
- **Unit Tests:** `npm test` passed with 243/243 test files passing, 2,097 tests passed, 1 skipped.
- **Frontend Build:** `npm run build` compiled clean with zero TypeScript or Vite bundle errors.
- **Backend Cargo Check:** `cargo check --manifest-path src-tauri/Cargo.toml` exited with code 0.

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
| `npm test` | 243 files, 2097 passed, 1 skipped |
| `npm run build` | exit 0 (tsc + vite) |
| `cargo check` | exit 0 (3 pre-existing warnings) |

