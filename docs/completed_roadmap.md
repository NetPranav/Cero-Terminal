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

## Verification Summary

| Check | Result |
|-------|--------|
| `npm test` | 235 files, 2047 passed, 1 skipped |
| `npm run build` | exit 0 (tsc + vite) |
| `cargo check` | exit 0 (3 pre-existing warnings) |
