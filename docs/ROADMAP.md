# Sentinel Terminal Roadmap: the Linux fix list

This is the work plan for the problems found while testing Sentinel Terminal 2.1.0 on Linux. It is written
so that a small model (or a new contributor) can do each task alone: every task names the exact files, the
cause, the change, the tests and the check to run by hand. The phases group the work by theme, but some tasks
need a task from another phase first (for example 5.2 needs 6.2). **Follow the table "Order of work and size"
at the end of this file, not the phase numbers.** Its "Needs" column lists every dependency. Commit after each task.

## Contents

| Phase | Theme | Tasks |
|---|---|---|
| [Start](#before-you-start) | Rules and how to work | none |
| [1](#phase-1-quick-fixes) | Quick fixes | 1.1 Esc closes Settings, 1.2 provider and model persist, 1.3 honest AI status bar, 1.4 arrow keys and ghost text |
| [2](#phase-2-stopping-and-queueing) | Stopping and queueing | 2.1 cancellation plumbing, 2.2 Ctrl+C stops a task, 2.3 queue view |
| [3](#phase-3-a-built-in-model-you-can-rely-on) | Built-in model reliability | 3.1 to 3.6 |
| [4](#phase-4-the-flow-file-format-extension-and-icon) | `.flow` extension, icon, association | 4.1 to 4.8 |
| [5](#phase-5-save-as-a-workflow-from-inside-a-prompt) | "Save this as a workflow" in a prompt | 5.1 to 5.3 |
| [6](#phase-6-folders-and-apps-by-name) | Folders and apps by name | 6.1 to 6.4 |
| [7](#phase-7-same-prompt-same-result-on-every-provider) | Built-in AI and API AI agree | 7.1 to 7.5 |
| [8](#phase-8-verify-on-linux-and-release) | Linux test matrix and release | 8.1 to 8.3 |

## The twelve reports this plan answers

| # | Report (as found on Linux) | Where it is fixed |
|---|---|---|
| 1 | Writing "save this as a workflow" inside the prompt runs the task but saves nothing | Phase 5 |
| 2 | Left and Right arrow keys misbehave; the grey suggestion follows the cursor and is added to the real text | Task 1.4 |
| 3 | Queued prompts cannot be seen, inspected, cancelled or removed | Task 2.3 |
| 4 | The same prompt works with an API model and fails with the built-in model | Phases 3 and 7 |
| 5 | Esc does not close the Settings screen | Task 1.1 |
| 6 | "Open the folder gitBrains in VS Code" (the folder exists inside `~/Projects`): Sentinel made files and opened a second VS Code window instead of opening the folder | Phase 6 |
| 7 | Wrong folder or app names are not handled: no closest-match search, no question when several match | Phase 6 |
| 8 | The chosen AI provider and model are forgotten after a restart | Task 1.2 |
| 9 | The status bar says "AI: Off" while an external or local AI works | Task 1.3 |
| 10 | Ctrl+C does not stop a running task | Tasks 2.1 and 2.2 |
| 11 | The built-in model is not reliable: right once, wrong or random the next time | Phase 3 |
| 12 | On Linux a flow is saved as `.json`; `.flow` needs a real extension, an icon, and to open in Sentinel on every OS | Phase 4 |

---

## Before you start

### Rules that apply to every task

These come from `AGENTS.md`. They are not optional.

1. **Commits.** One commit per task. Use Conventional Commits (`fix(ui): ...`, `feat(flow): ...`). The author must
   be NetPranav: run `git config user.name` and `git config user.email` first; they must print `NetPranav` and
   `162047134+NetPranav@users.noreply.github.com`. Stage only the files you changed. Do not push unless asked.
2. **Checks before every commit.** `npm test` and `npm run build`. Before the last commit of a phase also run
   `cargo check --manifest-path src-tauri/Cargo.toml`. `npm run check:triple` runs all three.
3. **No emoji** anywhere a user can see. Icons come from `lucide-react`.
4. **Grayscale only.** Backgrounds `#090b10` and `#0c0d12`, text in muted whites, borders at 5 to 15 percent white.
   No saturated colours, not even for errors (use a brighter white and the words "failed" or "error").
5. **Full screens, not modals,** for Settings and other primary views (`position: fixed; inset: 0`).
6. **Tests first when you can.** Add the failing test, see it fail, then make it pass. Tests live next to the
   file: `Foo.ts` has `Foo.test.ts`. The runner is Vitest (`npx vitest run path/to/file.test.ts` for one file).
7. **Never guess when acting on the computer.** A named app, folder or process is looked up first. If nothing
   or several things match, say so and ask. (Tasks 6.1 to 6.3 build the shared tools for this.)
8. **No new network calls, no model downloads, no `npx` fetching of packages** from tests or from your changes. Everything you need is already in `node_modules` (`tsx`, `vitest`); there is no `jsdom` and no React Testing Library, so put logic in plain functions and test those (the tasks say how).

### Commands you will use

```bash
npm test                                        # all unit tests (about 980 must pass)
npx vitest run src/path/to/file.test.ts         # one file
npm run build                                   # TypeScript compile + Vite build, must have zero errors
cargo check --manifest-path src-tauri/Cargo.toml
npm run check:triple                            # all three above
npm run tauri dev                               # run the real app to check by hand
```

### Map of the code you will touch

| Area | Files |
|---|---|
| Terminal screen, keys, queue | `src/presentation/TerminalView.tsx`, `src/ui/components/GhostText.ts` |
| App shell, global shortcuts, Settings overlay | `src/App.tsx`, `src/ui/components/AiSettingsPage.tsx`, `src/ui/components/StatusBar.tsx` |
| The agent (understands a request, picks tools) | `src/ai/agent/AgentLoop.ts` (large: search by function name, not line number), `SystemPrompt.ts`, `ToolExecutor.ts` |
| Providers and settings | `src/ai/management/ModelManager.ts`, `src/ai/provider/EmbeddedProvider.ts`, `CloudApiProvider.ts`, `OllamaProvider.ts`, `src/ai/models/EmbeddedEngineManager.ts`, `GbnfGrammarManager.ts` |
| Built-in engine (Rust) | `src-tauri/src/embedded_server.rs` |
| Running commands (Rust) | `src-tauri/src/process_cmds.rs` |
| Workflows and `.flow` | `src/workflows/flow/*` (`FlowPlan`, `FlowRunner`, `FlowAuthoring`, `FlowStore`), `src/workflows/storage/DiskWorkflowStorage.ts`, `FlowImport.ts`, `src/workflows/engine/MultistagePromptDecomposer.ts` |
| Named things on the computer | `src/domain/system/AppControl.ts`, `PortControl.ts`, `SystemControl.ts`, `src/ai/agent/DirectoryNavigationEngine.ts` |
| Packaging | `src-tauri/tauri.conf.json`, `src-tauri/Info.plist`, `src-tauri/icons/`, `packaging/linux/*`, `packaging/arch/PKGBUILD` |

Line numbers drift. When this document names a function, search for the function name.

### How each task is written

Every task has the same parts: **Symptom** (what the user sees), **Cause** (why, with the file), **Change**
(numbered steps), **Tests** (what to add), **Check by hand** (what to do in the real app on Linux), and
**Done when** (the line you can tick). If a step is unclear, read the cited function first; the cause section
tells you what to look for.

---

## Phase 1: quick fixes

Four small, independent fixes. They are first because each one is visible the moment the app opens.

### Task 1.1: Esc closes the Settings screen (report 5)

**Symptom.** Settings is open; pressing Esc does nothing.

**Cause.** `src/App.tsx` has a global `keydown` effect. Inside it there is a branch
`if (e.key === 'Escape' && showAiSettings) { ... setShowAiSettings(false) }`, but the effect's dependency list is
`[tabs, activeTabId, activeTab, activeTerminal, addTab]`. `showAiSettings` is not in it, so the handler keeps the
value `showAiSettings === false` from the render when it was created and the branch never runs. Also, when
Settings is open, keyboard focus sits in a Settings input, and the terminal (xterm) may swallow Esc before the
window listener sees it.

**Change.**
1. In `src/App.tsx`, find the `useEffect` that defines `handleKeyDown` (search for `handleToggleHistory`). Add
   `showAiSettings` to its dependency array.
2. Move the Esc handling out of that big effect into its own small effect so it cannot be broken by the other
   dependencies again:
   ```tsx
   useEffect(() => {
     if (!showAiSettings) return;
     const onKey = (e: KeyboardEvent) => {
       if (e.key !== 'Escape' || e.defaultPrevented) return;
       // A dropdown or text field inside Settings gets the first Esc (see step 3)
       if (document.querySelector('[data-esc-owner="true"]')) return;
       e.preventDefault();
       e.stopPropagation();
       setShowAiSettings(false);
     };
     window.addEventListener('keydown', onKey, true); // capture phase: runs before xterm
     return () => window.removeEventListener('keydown', onKey, true);
   }, [showAiSettings]);
   ```
   Delete the old `Escape && showAiSettings` branch from `handleKeyDown`.
3. In `src/ui/components/AiSettingsPage.tsx`, any control that has its own Esc meaning (an open dropdown, an
   inline editor for an API key) should set `data-esc-owner="true"` while it is open, and close itself on Esc.
   If there is no such control today, skip this step but keep the check in step 2.
4. When Settings closes, give focus back to the terminal that was focused before it opened. `App.tsx` already
   tracks the active terminal; call its `focus()` in the same handler (look at how `Cmd/Ctrl+,` closes it).
5. Add an accessible label: the Settings header already has a close control; give it `aria-label="Close settings (Esc)"`.

**Tests.** The repository has no component test setup, so move the decision into a plain function in
`src/presentation/escapeKey.ts`: `shouldCloseSettings({ key, defaultPrevented, settingsOpen, escOwnerOpen }): boolean`
and call it from the effect. `escapeKey.test.ts`: true for Escape with Settings open; false when Settings is
closed, when the key is not Escape, when `defaultPrevented`, and when `escOwnerOpen` is true.

**Check by hand.** Open Settings with `Ctrl+,`, press Esc: it closes and typing goes to the terminal.
Open Settings by clicking the status bar AI button, press Esc: it closes.

**Done when** both ways of opening Settings close with one Esc, and the terminal has focus afterwards.

### Task 1.2: The chosen AI provider and model are remembered (report 8)

**Symptom.** Pick Ollama or an API model in Settings, restart, and the app is back on the built-in model.

**Cause.** Three separate gaps in `src/ai/management/ModelManager.ts`:
- `setActiveProviderId(providerId, modelId?)` saves both keys, but `setModel(modelId)` (used when the model is
  changed without changing the provider) saves nothing, so a model change is lost.
- `initialize()` only honours the saved provider if `await match.isAvailable()` is true *at that moment*.
  Ollama may still be starting, and the cloud provider may not have loaded its saved key yet. The check fails,
  the code falls through to "Sentinel's own engine is the default", and then nothing re-applies the saved choice.
- When it falls through, the saved preference is not cleared, but it is also never retried, so the user sees the
  built-in model with no explanation.

**Change.**
1. Add one private method in `ModelManager` that is the only writer of the two keys:
   ```ts
   private persistChoice(providerId: string, modelId?: string): void {
     try {
       localStorage.setItem(ModelManager.PREF_PROVIDER_KEY, providerId);
       if (modelId) localStorage.setItem(ModelManager.PREF_MODEL_KEY, modelId);
       else localStorage.removeItem(ModelManager.PREF_MODEL_KEY);
     } catch { /* private mode or storage blocked: the choice lasts this session only */ }
   }
   ```
   Call it from `setActiveProviderId` and from `setModel` (after the model is confirmed ready). Keep the
   existing `typeof localStorage !== 'undefined'` guards; the try/catch is for blocked storage.
2. Change `initialize()` so a saved choice is *applied first, verified second*:
   - If a saved provider id exists and the provider exists in `this.providers`, set it active **immediately**
     (provider, model id, display name) without waiting for `isAvailable()`.
   - Then check availability with up to 5 tries, 2 seconds apart, in the background (do not block startup).
   - If it becomes available: dispatch `sentinel:ai-status-changed` and stop.
   - If it never becomes available: keep the saved choice, mark `isReady: false`, and set a new field
     `unavailableReason: string` on `ActiveModelInfo` (for example `Ollama is not running`). Do **not** silently
     switch to the built-in model, and do **not** erase the saved keys. The status bar (Task 1.3) shows the reason.
   - Add a small "Use the built-in model instead" action in Settings that calls `setActiveProviderId('embedded')`.
3. The cloud provider keeps its configuration in `CloudApiProvider` (localStorage). Make sure
   `CloudApiProvider.getInstance().getActiveConfig()` is loaded **before** `ModelManager.initialize()` runs. Find
   where both are created at startup (search for `ModelManager.getInstance().initialize`) and call the config
   loader first.
4. Where the Settings page selects a model (`AiSettingsPage.tsx`, search `setActiveProviderId` and `setModel`),
   always pass the model id, never only the provider.
5. Write the display name from the saved model id when the provider is not reachable yet, so the UI shows
   "Ollama (qwen3:4b)" and not "default".

**Tests.** `ModelManager.test.ts`:
- Save `sentinel_active_ai_provider = 'ollama'` and a model id; stub `isAvailable` to return false twice and then
  true; run `initialize()` with fake timers; assert the active provider is `ollama` from the first moment and
  stays `ollama` after the retries.
- Stub it to never become available: assert the provider is still `ollama`, `isReady` is false and
  `unavailableReason` is set; assert the localStorage keys are unchanged.
- `setModel('x')` writes `sentinel_active_ai_model`.
- Blocked storage (`localStorage.setItem` throws): `setActiveProviderId` still returns true.

**Check by hand.** Select an API model, quit Sentinel completely, start it again: Settings and the status bar
show the same model. Repeat with Ollama stopped: the app shows "Ollama is not running" and does not change the
choice; start Ollama and it turns ready without restarting Sentinel.

**Done when** provider and model survive three restarts in a row, and an unreachable provider is reported, not replaced.

### Task 1.3: The status bar tells the truth about the AI (report 9)

**Symptom.** An API or Ollama model works, but the bar says "AI: Off".

**Cause.** `src/ui/components/StatusBar.tsx` builds the label only from the embedded engine status
(`aiStatus.isRunning`, `isWarming`, `isCpuFallback`). It never asks `ModelManager` which provider is active.
An external provider keeps the embedded engine stopped, which the bar reads as "Off".

**Change.**
1. Add `src/ai/management/AiStatus.ts` with one pure function, easy to test:
   ```ts
   export type AiBadgeState = 'ready' | 'starting' | 'unavailable' | 'off';
   export interface AiBadge {
     state: AiBadgeState;
     label: string;      // shown in the bar: "AI: Qwen 3B", "AI: gpt-4o (API)", "AI: unavailable"
     detail: string;     // tooltip: provider, model, port or host, reason
   }
   export function describeAi(input: {
     active: ActiveModelInfo;
     embedded: EmbeddedStatus | null;
     cloudConfigured: boolean;
   }): AiBadge;
   ```
   Rules, in order:
   - Provider `embedded`: running gives `ready` and label `AI: <short model name>` (add ` (CPU)` when on CPU);
     warming gives `starting`; otherwise `off` with the detail "Built-in AI is stopped. Click to start it."
   - Provider `cloud_api`: configured and `isReady` gives `ready` with `AI: <model> (API)`; no key configured gives
     `unavailable` with "No API key set".
   - Provider `ollama`: `isReady` gives `ready` with `AI: <model> (local)`; else `unavailable` with `unavailableReason`.
   - Never return `off` for an external provider. "Off" is only for the built-in engine being stopped.
2. In `StatusBar.tsx` replace the inline ternaries (the `AI: Ready` / `AI (CPU)` / `AI: Warming...` / `AI: Off`
   text and the three colour expressions) with `describeAi(...)`. Keep the grayscale look: `ready` is bright
   white with the glow, `starting` is half white, `unavailable` and `off` are dim; `unavailable` also gets a
   `ShieldAlert` icon from lucide so it is not colour-only.
3. Subscribe to `window` event `sentinel:ai-status-changed` (already dispatched by `setActiveProviderId`) and
   re-read the active model. Also dispatch it from `setModel` and when `initialize()` finishes its retries (Task 1.2).
4. The tooltip must list: provider name, model id, where it runs (`127.0.0.1:8847`, `localhost:11434` or the API
   host without the key), and the current state. Never show the API key.
5. Truncate long model names to 24 characters with an ellipsis in the bar; the full name is in the tooltip.

**Tests.** `AiStatus.test.ts` with a table of inputs: embedded running, embedded warming, embedded stopped,
cloud configured, cloud without key, ollama ready, ollama unavailable. Assert `state`, `label` and that no label
contains the text "Off" for external providers. (No component test: `describeAi` holds all the logic and the bar only prints its result.)

**Check by hand.** With an API model active and the built-in engine stopped the bar shows `AI: <model> (API)`.
Stop Ollama while it is selected: the bar changes to `AI: unavailable` and the tooltip says why.

**Done when** the bar never shows "Off" while any provider is answering requests.

### Task 1.4: Arrow keys move the cursor, nothing else (report 2)

**Symptom.** Press Left, then Right: the grey suggestion text moves with the cursor and the next Right adds
the suggestion to the real command line.

**Cause.** `src/presentation/TerminalView.tsx`, in the `term.onData` handler, treats the Right-arrow sequence
`\x1b[C` exactly like Tab: if `ghostText.getRemaining()` returns text, it writes the text to the shell and
returns. That is correct only when the cursor is at the end of what was typed. When the cursor is in the middle
of the line, the "remaining" suggestion is still computed from the whole line, so Right inserts it. In
`src/ui/components/GhostText.ts` the overlay is positioned at `cursorX`, so it appears at the cursor instead of
at the end of the line. Finally the ghost is only recomputed after a keystroke that reaches the shell, and
Left/Right never clears it.

**Change.**
1. Decide where the cursor is. In `TerminalView.tsx` there is `inputLineRef` (an `InputLineTracker`) that records
   where typing started. Add a method `isCursorAtEnd(term)` to it: the cursor column (`buffer.cursorX`, plus
   row) must equal the column of the last non-space character of the line plus one. Wrapped lines are the edge
   case: compare using `baseY + cursorY` and the translated line length of the last wrapped row.
2. Change the key handling:
   - `\t` (Tab): accept the suggestion only when `isCursorAtEnd`. Otherwise pass Tab to the shell untouched
     (it does shell completion).
   - `\x1b[C` (Right) and `\x1bOC`: **accept only when the cursor is at the end of the line and a suggestion is
     showing.** In every other case pass the key to the shell and clear the ghost. This keeps the familiar
     fish-style "Right at the end accepts" while making sure arrows never insert text mid-line.
   - `\x1b[D` (Left), `\x1bOD`, `\x1b[H`, `\x1b[F`, `\x1b[1;5D`, `\x1b[1;5C` (word moves), Up, Down, Home, End:
     clear the ghost first, then pass the key through.
3. After any key that is not a printable character, Enter or Backspace, do not recompute the ghost in the
   `setTimeout` at the end of `onData` (the block that calls `autocompleteEngine.getSuggestions`). Only
   printable input and Backspace recompute it, and only when `isCursorAtEnd` is true after the key is applied.
4. In `GhostText.render`, position the overlay at the end of the input, not at `cursorX`: pass the end column
   (computed in step 1) as a third argument. If the cursor is not at the end, `render` must clear and return.
5. Make this the default, and add a setting "Accept suggestion with Right arrow" (on by default) in
   `AiSettingsPage.tsx` stored under the key `sentinel_ghost_accept_right`. When off, only Tab accepts. People
   who dislike the behaviour can turn it off without losing Tab.
6. Do not touch the bytes sent to the shell for ordinary Left and Right: the shell moves its own cursor and xterm
   follows. The terminal must never write a suggestion unless the user pressed Tab (or Right at the end).

**Tests.** Extract the decision into a pure function so it can be tested without xterm, in
`src/presentation/ghostKeys.ts`:
```ts
export type KeyAction = 'accept-ghost' | 'clear-ghost-and-pass' | 'pass';
export function decideGhostKey(data: string, ctx: {
  cursorAtEnd: boolean; hasGhost: boolean; acceptRight: boolean;
}): KeyAction;
```
Table tests: Tab at end with ghost gives accept; Tab mid-line gives pass; Right at end with ghost gives accept;
Right mid-line gives clear-ghost-and-pass; Right at end without ghost gives pass; Left always clears; every
sequence in the list above is covered; `acceptRight: false` makes Right never accept. Use the function in `onData`.
Add a `GhostText.test.ts` case: `render` with a cursor not at the end clears the overlay.

**Check by hand.** Type `git sta` (ghost shows `tus`). Press Left twice: the ghost disappears. Press Right
twice: the cursor returns to the end and nothing was inserted. Press Right again with the ghost visible: it
accepts. Press Tab mid-line: no suggestion text is inserted.

**Done when** no key except Tab (or Right at the end) can ever add suggestion text.

---

## Phase 2: stopping and queueing

Two tasks that make the app feel in your control: Ctrl+C really stops, and waiting requests can be seen.
Do 2.1 before 2.2 because 2.2 needs the cancel signal.

### Task 2.1: A cancel signal that reaches everything (report 10, part 1)

**Symptom.** A task is running, and nothing the user presses stops it.

**Cause.** Nothing in the agent can be cancelled today:
- `AgentLoop.run(goal, context)` takes no cancel signal. Its loop (`for (let step = 0; step < MAX_STEPS ...)`)
  and the multi-step runners (`runChain`, `runWorkflow`, `runFlow` in `TerminalView.tsx`) never check one.
- `provider.generate(...)` (used for every model call) cannot be aborted; `fetch` is called without a `signal`.
- Commands run by the agent go through the Rust command `execute_command` (`src-tauri/src/process_cmds.rs`).
  `ShellSDKCapability.cancel()` calls `kill_process` with `runningPid`, but `runningPid` is only set *after*
  `execute_command` returns, that is, after the command has already finished. So `cancel()` has never had a pid to kill.

**Change.**
1. **Rust: register running commands.** In `process_cmds.rs`:
   - Add a global registry `static RUNNING: Mutex<HashMap<String, u32>>` (use `std::sync::{Mutex, OnceLock}`).
   - Add an optional argument `run_id: Option<String>` to `execute_command` and `run_command`. After `spawn()`,
     if `run_id` is given, insert `run_id -> pid`. Remove it when the command ends (use a small guard struct with
     `Drop`, so every return path cleans up).
   - Add a new command:
     ```rust
     #[tauri::command]
     pub async fn cancel_command(run_id: String) -> Result<bool, String> {
         let pid = RUNNING.get_or_init(Default::default).lock().map_err(|e| e.to_string())?.get(&run_id).copied();
         match pid {
             Some(pid) => { kill_group(pid); Ok(true) }
             None => Ok(false),
         }
     }
     ```
     `kill_group` reuses the `killpg(pid, SIGKILL)` logic of `kill_process_tree`. On Windows use
     `taskkill /PID <pid> /T /F`. Try `SIGTERM` first and `SIGKILL` after 800 ms so programs can clean up.
   - The result of a cancelled command must say so: add `cancelled: bool` to `CommandOutput` and set it when
     `cancel_command` ended the run. Exit code `130`.
   - Register `process_cmds::cancel_command` next to `execute_command` in `src-tauri/src/lib.rs`.
2. **TypeScript: one cancel object per request.** Add to `AgentRunContext` (in `AgentLoop.ts`):
   ```ts
   /** Set by the caller; aborting it stops the request at the next safe point */
   signal?: AbortSignal;
   ```
   Add a helper `throwIfAborted(signal)` that throws a `CancelledError` (a small class in
   `src/ai/agent/Cancelled.ts`). Call it at the top of each iteration of every loop in `AgentLoop` (the main
   step loop, `runChain`, `runWorkflow`, the staged-plan loop) and before each tool call.
3. **Providers.** Add `signal?: AbortSignal` to `GenerateOptions` (`src/ai/provider/Provider.ts`). In
   `EmbeddedProvider.executeInference`, `CloudApiProvider` and `OllamaProvider`, pass it to `fetch`
   (`fetch(url, { ..., signal })`). An aborted fetch must reject with `CancelledError`, not be retried by the
   OOM or grammar fallbacks. For the embedded engine no extra call is needed: closing the HTTP connection makes
   llama-server stop generating.
4. **Tools.** `ShellSDKCapability.performExecution`: create `runId = crypto.randomUUID()`, pass it to
   `invoke('execute_command', { ..., runId })`, store it in `this.runningRunId`, and make `cancel()` call
   `invoke('cancel_command', { runId })`. Remove the dead `runningPid` code. `ToolExecutor` must forward the
   request's `signal`: when it aborts, call `cancel()` on the running capability.
5. **Commands typed into the visible terminal** (long-running ones the agent starts in a pane, and `.flow`
   steps) are not run through `execute_command`. For those the cancel action is to write `\x03` to the pane's
   PTY (`SessionManager.getInstance().write(sessionId, '\x03')`). `FlowRunner` and `runInPane` must check the
   signal between steps and send `\x03` when it aborts.

**Tests.**
- Rust unit test in `process_cmds.rs`: spawn `sleep 30` through `run_command` with a `run_id`, call the cancel
  helper after 100 ms, expect it to return within one second with `cancelled == true` and the registry empty.
  Also a grandchild test: `sh -c 'sleep 30 & wait'` must leave no `sleep` behind.
- `AgentLoop.cancel.test.ts`: a fake provider whose `generate` waits; abort; expect `CancelledError`/a result
  with `cancelled: true` in under 100 ms and no further tool calls.
- `ShellSDKCapability.test.ts`: `cancel()` calls `cancel_command` with the id given to `execute_command`.

**Check by hand.** Ask the agent for something that takes a while (for example "find every .log file on this
computer"), then cancel it with Task 2.2 and confirm with `pgrep -f "find / "` that nothing is left.

**Done when** aborting the signal ends model calls, hidden commands and visible commands within one second, and
no process from the cancelled command is left (`pgrep -f` shows nothing).

### Task 2.2: Ctrl+C stops the running task (report 10, part 2)

**Symptom.** Ctrl+C while Sentinel is working does nothing visible.

**Cause.** In the `term.onData` handler of `TerminalView.tsx`, Ctrl+C (`\x03`) is sent to the shell, which is
idle (the agent is working somewhere else). `aiBusyRef.current` is true, but nothing reads it for `\x03`.

**Change.**
1. In `TerminalView.tsx`, create the request's controller where a request starts: in `runAiGoal` (and in
   `runFlow`) set `activeRunRef.current = new AbortController()` and pass `signal: controller.signal` in the
   context given to `agentLoop.run(...)`. Clear it in the `finally` that already resets `aiBusyRef`.
2. At the very top of `onData`, before anything else:
   ```ts
   if (data === '\x03' && aiBusyRef.current && activeRunRef.current) {
     // Ctrl+C with an unselected terminal means "stop what Sentinel is doing"
     if (!term.hasSelection()) {
       activeRunRef.current.abort();
       return; // do not also send ^C to the shell
     }
   }
   ```
   With a text selection, Ctrl+C keeps copying (Linux users expect `Ctrl+Shift+C` for copy, and it must keep
   working; only treat plain Ctrl+C as stop).
3. The first Ctrl+C asks politely: abort the signal, print one grey line `Stopping...`. A second Ctrl+C within 3
   seconds is forceful: call `cancel_command` for every registered run and send `\x03` to the PTY as well.
4. When the run ends because of the abort, print `Stopped.` and do not print an error. `AgentResult` gets
   `cancelled?: true`; `PromptProgressManager.completePrompt` must show "Stopped", not "Failed".
5. Ctrl+C stops only the running task, not the queue. The next queued item starts as normal unless the queue is
   paused or the user chose "Stop and clear queue" in the queue panel (Task 2.3).
6. The confirmation dialog (a command waiting for approval) counts as running: Ctrl+C or Esc declines it.
7. Update the footer hint while a task runs: `Ctrl+C to stop`.

**Tests.** Extract the key decision to `src/presentation/stopKeys.ts`
(`decideStopKey({ data, busy, hasSelection, lastStopAt, now }): 'stop' | 'force-stop' | 'pass'`) and test the table.
Add an `AgentLoop` cancel test (Task 2.1) that is triggered through the same function.

**Check by hand.** Ask for something slow, press Ctrl+C: "Stopping..." then "Stopped." appear, the prompt returns,
and `ps aux | grep` shows nothing from the task. Press Ctrl+C when idle: the shell gets it as usual.

**Done when** Ctrl+C stops a model call, a hidden command and a flow step; idle Ctrl+C is unchanged.

### Task 2.3: See and manage the queue (report 3)

**Symptom.** Type a second request while one is running: it says "Queued" and then you cannot see, edit or
cancel it.

**Cause.** The queue is `aiQueueRef` in `TerminalView.tsx`, a plain array of `{ goal, runner }` that is
pushed to and shifted from. No UI reads it, items have no ids, and a flow opened while busy is refused outright
("open the flow again when it is done").

**Change.**
1. Move the queue out of the component into `src/presentation/PromptQueue.ts`, a small class with an event
   emitter (no React in it):
   ```ts
   export interface QueuedPrompt { id: string; label: string; addedAt: number; kind: 'goal' | 'workflow' | 'flow'; }
   export class PromptQueue {
     add(item: Omit<QueuedPrompt,'id'|'addedAt'>, run: () => void): QueuedPrompt;
     list(): readonly QueuedPrompt[];
     remove(id: string): boolean;
     move(id: string, toIndex: number): void;
     clear(): void;
     takeNext(): { item: QueuedPrompt; run: () => void } | null;
     subscribe(listener: () => void): () => void;
   }
   ```
   One queue per terminal tab (`TerminalView` owns one instance in a `useRef`).
2. Replace the three `aiQueueRef.current.push/shift` call sites with the class. Make flows queueable too.
3. Add `src/ui/components/QueuePanel.tsx`: a compact panel anchored above the status bar, hidden when the
   queue is empty. It shows `Queue (2)` and a numbered list: label (truncated to one line, full text in a
   tooltip), buttons `Remove` (X icon) and `Run next` (arrow-up icon). A `Clear all` link. It also shows the
   currently running item at the top with a `Stop` button (calls the Task 2.2 abort).
4. Slash commands in the terminal: `/queue` prints the list in the terminal; `/queue clear`; `/queue remove 2`.
   And in plain words (AI first): "show the queue", "cancel the second queued request", "clear the queue" should
   be handled by a deterministic route in `AgentLoop` (see how `runQuitApp` is routed) that calls a callback
   `setQueueIO(...)` the same way `setFlowIO` works.
5. Show the number in the status bar: `Queue 2` next to the AI badge, clickable to open the panel.
6. Persist nothing: a queue does not survive a restart (state this in the panel help text).
7. If the running task ends with an error or is stopped, the next item still starts after a 150 ms delay
   unless the panel's `Pause queue` toggle is on. The toggle state lives in the `PromptQueue` (`paused` flag).

**Tests.** `PromptQueue.test.ts`: add/list/remove/move/clear/takeNext order; subscribe fires on every change;
removing a missing id returns false. A route test for "show the queue" in `AgentLoop`.

**Check by hand.** Start a slow request, type three more, open the panel, remove the second, move the third to
the top, press Stop on the running one: the queue continues in the order shown.

**Done when** every waiting request is visible, removable and reorderable, and flows queue like any other.

---

## Phase 3: a built-in model you can rely on

**Report 11:** "The built-in model is not reliable: correct sometimes, wrong or random the next time."

This phase is different from the others: it is a measurement and engineering phase. Do not start by changing
the prompt. First measure, then fix the biggest cause, then measure again. Work through the tasks in order.

### What we know (read this before touching anything)

These are facts from the code, not guesses:

| Fact | Where | Why it causes "right once, wrong next time" |
|---|---|---|
| Sampling is random: `temperature: 0.05`, `top_p: 0.9`, `top_k: 20`, no `seed` | `AgentLoop.ts` model call; `EmbeddedProvider.executeInference` | Even a small temperature makes a 3B model pick different tokens on equal-probability choices; no seed means no repeat |
| `cache_prompt: true` and `--cache-reuse 256` with a single slot (`-np 1`) | `EmbeddedProvider`, `embedded_server.rs` `build_server_args` | Reused prompt state can differ slightly from a fresh evaluation; results depend on what ran before |
| Context is 8192 tokens (`-c 8192`) while `SystemPrompt.ts` alone is about 19.6 KB (roughly 5,000 tokens) plus tool list plus history | `embedded_server.rs`, `SystemPrompt.ts` | When the total goes over, llama-server drops tokens from the start of the conversation, which is the system prompt and rules. A long session then behaves differently from a short one |
| The model must emit JSON under a grammar with `maxTokens: 512` | `AgentLoop.ts` | A reply cut at 512 tokens is invalid JSON; the code then falls back to heuristics (`tryHeuristicFallback`) or treats the text as chat. Different outcome, same request |
| A 3B model (Qwen2.5-Coder-3B Q4_K_M) chooses among many tools and writes shell commands | `EmbeddedEngineManager.ts` | It is the smallest size at which tool choice is only mostly right; the rest must be enforced by code |
| The grammar fallback silently drops the grammar when llama-server rejects it | `EmbeddedProvider.executeInference` | The same request can return constrained JSON once and free text the next time |

The design answer, in one sentence: **the model proposes, code checks, and anything unchecked is asked or
refused, never run.** The tasks below do that.

### Task 3.1: Build a repeatable reliability test (do this first)

**Goal.** A number that says how reliable the built-in model is, so every later change can be judged.

**Change.**
1. Create `scripts/eval/reliability.mts` (run with `npm run eval:model`, see step 5). It must work
   against an already running engine at `http://127.0.0.1:8847`; if none is running it prints
   `Start Sentinel first (the built-in engine must be running)` and exits 2. It never downloads anything.
2. Create `scripts/eval/cases.json`: at least 60 cases, each
   `{ "id": "open-folder-1", "prompt": "...", "expect": { "tool": "...", "must_include": ["..."], "must_not_include": ["rm -rf", "sudo"] } }`.
   Cover: opening a folder in an editor (including the `gitBrains` request from report 6), opening apps, finding
   files, git status/commit, installing a package, closing a port, quitting an app, making a folder and
   changing into it, saving a workflow, a question that needs no tool (must answer without running anything), and
   a dangerous request (must refuse or ask). Include 15 cases with typos and 10 with wrong names.
3. For each case the script must run the real agent decision path, not a copy of the prompt. Today the prompt and
   the options are built inline inside `AgentLoop.runRequest` (search for `chatMessages` and
   `provider.generate(fullPrompt, modelId, {`), so **first extract that code** into an exported function
   `buildDecisionCall(goal, context, history): { messages, options }` in a new file
   `src/ai/agent/DecisionCall.ts`, make `AgentLoop` call it, and run `npm test` (behaviour must not change). The
   eval script then imports `buildDecisionCall` and sends the result to the engine. Run each case **10 times**.
4. Report per case: `pass` count out of 10, and the distinct answers seen. Overall: `pass@1` (percent of single
   runs that pass), and `flip rate` (percent of cases that gave two or more different answers). Write the
   results to `scripts/eval/out/<date>-<model>.json` and print a table sorted worst first.
5. Add `"eval:model": "tsx scripts/eval/reliability.mts"` to `package.json` scripts (`tsx` is already a dev dependency, as for `npm run agent`). Do not run it in `npm test`.
6. Record the baseline in `docs/MODEL_RELIABILITY.md` (a table: date, model, `pass@1`, `flip rate`, median ms).

**Done when** the script runs on the current build and a baseline is committed. Targets for the end of this
phase: `pass@1 >= 95%`, `flip rate <= 3%`, on the same cases.

### Task 3.2: Make the answers repeatable (determinism)

**Change.**
1. In `src/ai/provider/EmbeddedProvider.ts` `executeInference`, send for every agent decision:
   `temperature: 0`, `top_k: 1`, `top_p: 1`, `seed: 42`, `cache_prompt: false`. Keep other values for free chat
   (`options.mode === 'chat'`): add a `mode?: 'decision' | 'chat'` option to `GenerateOptions`; `AgentLoop`'s
   action calls set `'decision'`, conversational answers set `'chat'` with `temperature: 0.4`.
2. In `embedded_server.rs` `build_server_args`, remove `--cache-reuse 256` when the engine is used for decisions.
   If speed drops by more than 25 percent on the eval, instead keep it and add a test that the same case gives
   the same answer twice in a row on a cold and a warm engine; decide by the numbers.
3. In `CloudApiProvider.ts` and `OllamaProvider.ts`, pass the same decision settings (`temperature: 0`, `seed`
   where the API supports it) so Phase 7 can compare like with like.
4. Re-run `npm run eval:model`. Expect the flip rate to fall sharply. Record it.

**Tests.** `EmbeddedProvider.test.ts`: with `mode: 'decision'` the request body has `temperature === 0`,
`top_k === 1` and a numeric `seed`; with `mode: 'chat'` it does not.

**Done when** the flip rate is under 5 percent (the rest is a wrong-but-consistent answer, fixed by 3.3 to 3.6).

### Task 3.3: Never overflow the context

**Change.**
1. Add `src/ai/agent/ContextBudget.ts`:
   ```ts
   export const CONTEXT_TOKENS = 8192;        // must equal -c in embedded_server.rs; share one constant
   export const RESERVED_FOR_REPLY = 700;
   export function estimateTokens(text: string): number   // Math.ceil(text.length / 3.2) for code-heavy text
   export function fitMessages(system: string, history: Msg[], budget: number): { messages: Msg[]; dropped: number }
   ```
   `fitMessages` keeps the system prompt whole, always keeps the newest user message, then keeps history from
   newest to oldest until the budget is full. Old tool outputs are cut first (keep the first 600 and last 400
   characters with `[... N characters removed ...]` between them).
2. Use it in `AgentLoop` where `chatMessages` is built (search `chatMessages`). Never send a prompt over
   `CONTEXT_TOKENS - RESERVED_FOR_REPLY`.
3. Shrink the system prompt: `SystemPrompt.ts` is about 19.6 KB. Target 9 KB. Method: keep rules and 8 short
   examples; move the tool descriptions out (they come from `DynamicToolPruner` per request, only the 6 to 10
   relevant tools); delete duplicated rules. After each deletion run `npm run eval:model`; keep the deletion only if
   `pass@1` does not fall.
4. Raise the engine context to `-c 12288` only if the machine has enough memory: in `embedded_server.rs`, pick
   `8192` below 8 GB of RAM and `12288` otherwise (`sysinfo` is already a dependency). Export the chosen value to
   the frontend with an existing status command so `CONTEXT_TOKENS` stays equal to the real one.
5. When the response includes `usage.prompt_tokens`, log it (debug level) and warn once per session if it is
   above 90 percent of the context.
6. `maxTokens` for decisions: 512 is too small for a long plan and too large for a one-line action. Use 400 for
   single actions; for a planner call allow 1024. If `finish_reason === 'length'`, do not parse: retry once with
   a message that asks for a shorter answer (Task 3.4 retry path).

**Tests.** `ContextBudget.test.ts`: system prompt kept; newest user message kept; oldest history dropped
first; a 20,000-character tool output is trimmed; the total is always under budget.

**Done when** no request exceeds the budget and `pass@1` has not fallen.

### Task 3.4: Check every answer before acting; repair once; then ask

**Change.** Add `src/ai/agent/ActionGate.ts`, called in `AgentLoop` between "the model answered" and "run the tool".
1. `validate(action, context)` returns `{ ok: true } | { ok: false, reason, hint }`. Checks:
   - the tool exists and the parameters match its schema (`ToolParameterValidator` already does this: call it);
   - a path parameter that is meant to exist does exist (`check_path_exists`), or is a legal new path;
   - an app name resolves to something installed (Task 6.3);
   - the command is not on the dangerous list (`rm -rf /`, `mkfs`, `dd of=/dev`, a bare `kill -9`, `chmod -R 777 /`)
     and does not contain text the model invented as a secret (passwords, tokens).
2. If `ok: false`, call the model **once more** with the original request plus
   `Your last answer was rejected: <reason>. <hint>. Answer again.` at temperature 0. Validate again.
3. If it is still not ok: do not run anything. Ask the user a short question (`askChoice`, see
   `ChoiceRequests.ts`) or print what is missing. This is the rule that ends "random" behaviour: a wrong guess is
   turned into a question.
4. Count outcomes (`accepted`, `repaired`, `asked`) into `AgentLoop.recentMetrics` so the eval can print them.

**Tests.** `ActionGate.test.ts`: each check passes and fails on a real example; the repair path is called at most
once; the "ask" path is taken when both answers are bad.

**Done when** none of the cases in the eval's `must_not_include` lists ever reaches the executor.

### Task 3.5: Let code do what code can do (route before the model)

The model should only be asked what code cannot decide. The repository already follows this: `FAST_PATHS`,
`parseQuitRequest`, `parseClosePort`, the Wi-Fi routes. Continue it:

1. After the Phase 3.1 baseline, list the ten failing cases that code can parse (open/launch an app, open a
   folder, `cd`, git status, list files, make a folder, show the queue, save a workflow). For each add a parser
   module in `src/domain/...` with `parseX(goal): Request | null` and a `runX` method in `AgentLoop`, wired in
   `runRequest` **before** the model call. Follow `AppControl.ts` and `PortControl.ts` as the pattern: pure
   parser, tests with at least 10 phrasings each, no side effects in the parser.
2. A parser answers only when it is certain. When two parsers match, the more specific one wins; when unsure it
   returns `null` and the model decides.
3. Remove the old narrow `FAST_PATHS` entries that a new parser replaces (the `open <app> and <path> in <editor>`
   pattern near the top of `AgentLoop.ts` is replaced by Task 6.2).
4. Re-run the eval after each parser. Stop when the remaining failures are open-ended requests.

**Done when** deterministic requests never reach the model, and each new parser has its own test file.

### Task 3.6: Pick the best model that fits the machine, and say which one

**Change.**
1. In `EmbeddedEngineManager.ts` the catalog already lists Qwen2.5-Coder 1.5B and 3B and Qwen3-4B-Instruct-2507.
   Run `npm run eval:model` for each one that is already on disk (never trigger a download from a script) and
   record the results in `docs/MODEL_RELIABILITY.md`.
2. If a larger catalog model has a clearly higher `pass@1` (5 points or more) and the machine has the memory,
   offer it in Settings: "A more accurate model is available (about N GB). Download it?" The user decides; it
   is never switched silently, and a switch keeps the old one as a fallback.
3. Show the model name and size on the Settings screen and in the status tooltip (Task 1.3), so users can tell
   which model produced a result.
4. Add `Report a wrong answer` to the AI result footer: it copies the prompt, the model name, and the chosen
   action (no file contents, no secrets) to the clipboard in the case format of `cases.json`, so every wrong
   answer can become a new eval case.

**Done when** the baseline, the final numbers and the model comparison are in `docs/MODEL_RELIABILITY.md`, and
the phase targets (`pass@1 >= 95%`, flip rate `<= 3%`) are met or the gap is written down with its cause.

---

## Phase 4: the `.flow` file format, extension and icon

**Report 12:** on Linux a flow is saved as a `.json` file; `.flow` must be one real extension with its own icon
that opens in Sentinel on every OS.

### What is wrong today (facts)

1. **Two writers, two formats.** `FlowAuthoring`/`FlowStore` (the "make me a workflow..." route) write real
   `.flow` files. But "save workflow <name>" and `task :: save as workflow <name>` go through
   `DiskWorkflowStorage.saveWorkflow`, whose `getWorkflowFilePath(name)` is
   `` `${cleanName}.json` `` and which writes a `SavedWorkflowDefinition` (a different shape: `steps[]`). The
   messages in `AgentLoop.ts` also print `~/.sentinel/workflows/<name>.json` (three places), and there are fake
   `save workflow release-gate` fast paths that `echo` JSON into a `.json` file.
2. **No icon anywhere.** The MIME file `packaging/linux/sentinel-terminal-mime.xml` has no `<icon>`, no icon
   files are shipped for the type, `src-tauri/Info.plist` has no document type or UTI, Windows has no
   registered `DefaultIcon`. `src-tauri/icons/` only holds the app icon.
3. **Linux association is incomplete.** The `.deb`/`.rpm` install the MIME file but run no
   `update-mime-database`/`update-desktop-database`; the AppImage installs nothing at all; Flatpak and Snap
   declare nothing. The MIME type is a sub-class of `application/json`, so a double-click can open a text
   editor.
4. **A second double-click** while Sentinel is already running starts another process (there is no
   single-instance handling), which may open a second window or lose the file.

### The target

| | Decision |
|---|---|
| Extension | `.flow` only, lower case. Never write `.json` for a flow again. Old `.json` workflows still load. |
| Format | The JSON "actions" document described in `docs/FLOW_FILES.md`. One schema for authored and recorded flows. |
| MIME type | `application/x-sentinel-workflow` (Linux), UTI `com.sentinel.flow` (macOS), ProgID `Sentinel.Flow` (Windows) |
| Icon | One designed document icon in grayscale, in every size and format each OS needs |
| Double-click | Opens Sentinel and runs/offers the flow on macOS, Windows, Linux (deb, rpm, AppImage, Flatpak, Snap, Arch) |

### Task 4.1: One writer that always makes `.flow`

**Change.**
1. In `src/workflows/flow/FlowStore.ts` there is already a safe writer (`freeFlowPath`: never replaces a file,
   uses `name-2.flow`). Make it the only way a workflow gets written to disk.
2. Add `src/workflows/flow/FlowExport.ts`: `workflowToFlow(def: SavedWorkflowDefinition): FlowDocument`, the
   reverse of `flowToWorkflow` in `src/workflows/storage/FlowImport.ts`:
   ```ts
   {
     schemaVersion: '1.0',
     metadata: { id: slug(def.name), name: def.name, description: def.description, createdAt, updatedAt, author, tags },
     actions: def.steps.map(step => ({
       type: 'command',
       name: step.name,
       command: step.command,
       cwd: step.cwd,                                   // absolute or ~ paths only
       macos: step.platformCommands?.macos,
       linux: step.platformCommands?.linux,
       windows: step.platformCommands?.windows,
       // everything the flow format has no field for travels here so nothing is lost
       x: { dependsOn, precondition_check, if_precondition_true, if_precondition_false,
            isDestructive, timeoutMs, expectedExitCode, validationCriteria }
     })),
     parameters: def.parameters
   }
   ```
   Omit `undefined` fields. `FlowPlan` must ignore `x` and `parameters` it does not know (check
   `planFlow`; it skips unknown fields, but add a test).
3. In `FlowImport.flowToWorkflow` read `x` back into the step (`...action.x`) so a round trip is lossless.
4. In `DiskWorkflowStorage`:
   - `getWorkflowFilePath(name)` returns `<slug>.flow`. Keep the existing character rule, and keep the lower-casing (`My Flow` is saved as `my_flow.flow`).
     Lookups (`loadWorkflow`, `hasWorkflow`, `deleteWorkflow`) compare the slug of the requested name with the
     slug of each file name, so a file someone else named `MyFlow.flow` is still found.
   - `saveWorkflow(def)` writes `JSON.stringify(workflowToFlow(def), null, 2)` plus a trailing newline.
   - `loadWorkflow(name)` tries `<slug>.flow` first, then `<slug>.json` (legacy).
   - `listWorkflows`/`hasWorkflow`/`deleteWorkflow` handle both extensions; when both exist for one name the
     `.flow` wins and the list shows it once.
   - `parseAndMigrate` accepts both shapes (the `actions` document and the old `steps` document).
5. **Migration of old files.** On start (once, guarded by a marker file `~/.sentinel/workflows/.migrated-flow`),
   for every `x.json` in the workflows folder that parses as a workflow and has no `x.flow` next to it: write
   `x.flow`, then rename the original to `x.json.bak`. Never delete. Log how many were converted.
6. Replace the three user-visible messages in `AgentLoop.ts` that say `.json` (search for
   `.sentinel/workflows/${`) with the real path returned by the writer. Delete the eight fake
   `save workflow release-gate|dev-boot|...` entries from `FAST_PATHS`; they are test leftovers that `echo` fake JSON.
7. `WorkflowManagerDrawer.tsx` shows names without extension; its "Export" and "Import" actions must use
   `.flow` (file dialog filter: name `Sentinel flow`, extension `flow`).

**Tests.** `FlowExport.test.ts`: round trip `def -> workflowToFlow -> flowToWorkflow` equals `def` for a recorded
workflow with parameters and preconditions; a platform command survives. `DiskWorkflowStorage.test.ts`:
`saveWorkflow` creates `name.flow`, never `name.json`; `listWorkflows` shows a legacy `.json` once; migration
creates the `.flow` and leaves `.json.bak`. A grep test: no source file builds a path ending in
`.json` under `workflows/` (read the sources in the test and fail on the pattern).

**Check by hand (Linux).** Say "save workflow demo" after running two commands: `ls ~/.sentinel/workflows`
shows `demo.flow` and no `demo.json`; opening it from Sentinel runs the steps.

**Done when** no code path can create a `.json` flow, old `.json` flows still open, and nothing is lost on a round trip.

### Task 4.2: Design the icon

**Goal.** A document icon that is recognisable at 16 px and at 512 px, grayscale, matching the app.

**Design (follow this; do not invent colours).**
- Canvas 1024 x 1024 SVG, transparent background.
- A rounded page: width 660, height 820, corner radius 72, centred; fill `#0c0d12`, 14 px border `rgba(255,255,255,0.18)`.
- Top-right corner folded: a 190 px triangle in `#1a1c24`, its fold edge `rgba(255,255,255,0.28)`.
- Centre mark (the "flow"): three filled circles (radius 44, white at 92 percent) joined by a 22 px rounded white line,
  placed as a gentle step down from left to right so it reads as a path; the last circle has a ring around it
  (radius 76, 10 px, white at 40 percent) meaning "run".
- Below the mark, the word `FLOW` in a bold monospace face (JetBrains Mono ExtraBold, drawn as outlines so no
  font is needed), letter spacing 0.18 em, white at 85 percent, height 110. **Omit the word below 48 px output** (it is unreadable).
- No gradients, no glow, no emoji, no colour. A 6 percent white inner highlight along the top edge is allowed.

**Change.**
1. Save the master as `assets/brand/flow-icon.svg` (new folder). Keep it hand-editable: one `<g>` per part, ids
   `page`, `fold`, `mark`, `label`.
2. Make `assets/brand/flow-icon-small.svg` (the same without the label, the circles bigger) for sizes under 48 px.
3. Add `scripts/icons/make-flow-icons.mjs`. It renders PNGs into `src-tauri/icons/flow/flow-<size>.png` for sizes
   16, 24, 32, 48, 64, 96, 128, 256, 512, 1024, using the small SVG for sizes below 48. Use the first renderer
   that exists, in this order: `rsvg-convert -w <size> -h <size> in.svg -o out.png`; ImageMagick
   (`magick -background none -density 384 in.svg -resize <size>x<size> out.png`); headless Chrome or Chromium
   (`chrome --headless --screenshot=out.png --window-size=<size>,<size> --default-background-color=00000000 file:///.../in.svg`,
   with the SVG wrapped in a page whose body has no margin). If none exists the script prints which three to
   install and stops; it never downloads anything. Then:
   - `flow.ico` (Windows): sizes 16, 24, 32, 48, 64, 128, 256 packed into one ICO. Use ImageMagick if present
     (`magick flow-16.png flow-24.png ... flow.ico`), else the pure script `scripts/icons/pack-ico.mjs` you also
     write (an ICO file is a 6 byte header, 16 byte entries and embedded PNGs).
   - `flow.icns` (macOS): build an `.iconset` folder with the standard names (`icon_16x16.png`,
     `icon_16x16@2x.png`, ... `icon_512x512@2x.png`) and run `iconutil -c icns` (macOS only). Commit the
     result so Linux and Windows builders do not need `iconutil`.
   - `application-x-sentinel-workflow.svg` (Linux scalable) copied from the master.
4. Commit the generated files (they are small) and `docs/brand/flow-icon-preview.png`, a contact sheet of all sizes
   on a dark and a light background. Look at it: the mark must be clear at 16 px on both.
5. Check the contrast: white on `#0c0d12` is above 15:1; the border must still show on a light file-manager
   background (the 18 percent border is not enough there, so also draw a 6 px `rgba(0,0,0,0.35)` outer edge).

**Done when** the contact sheet is committed and reviewed at 16, 32, 128 and 512 px.

### Task 4.3: macOS association and icon

**Change.**
1. In `src-tauri/tauri.conf.json` `bundle.fileAssociations[0]` add:
   ```json
   {
     "ext": ["flow"],
     "name": "Sentinel Flow",
     "description": "Sentinel Terminal workflow",
     "role": "Editor",
     "mimeType": "application/x-sentinel-workflow",
     "contentTypes": ["com.sentinel.flow"],
     "exportedType": { "identifier": "com.sentinel.flow", "conformsTo": ["public.json", "public.data"] }
   }
   ```
   `exportedType` makes macOS know the type exists (UTI), which is what gives it an icon and a "Kind" name.
2. Ship the icon inside the app: add to `bundle.macOS.files` (a map of destination inside `Contents` to source):
   `"Resources/flow.icns": "icons/flow/flow.icns"`.
3. In `src-tauri/Info.plist` (merged by Tauri) add the icon keys that Tauri does not set itself:
   `UTExportedTypeDeclarations` entry for `com.sentinel.flow` with `UTTypeIconFile = flow` and
   `UTTypeTagSpecification` `public.filename-extension = [flow]`; and in `CFBundleDocumentTypes` the matching
   `CFBundleTypeIconFile = flow`. **Build the app and read the generated
   `Sentinel Terminal.app/Contents/Info.plist` (`plutil -p`) to see which keys Tauri already wrote, and only add
   the missing ones.** Duplicated declarations make Launch Services ignore both.
4. Test on a real build: `lsregister -f "<app>"`, then in Finder `.flow` files show the new icon and the kind
   "Sentinel Flow"; double-click opens Sentinel with the file (`RunEvent::Opened` in `src-tauri/src/lib.rs`).
   If the icon is stale, `killall Finder` and `sudo rm -rf /Library/Caches/com.apple.iconservices.store`.
5. "Open With" must list Sentinel first for `.flow`: `LSHandlerRank = Owner` through `"rank": "Owner"` in
   the association entry if Tauri's schema accepts it (run `npx tauri build` once to see; remove the key if it errors).

**Done when** a new `.flow` on the Desktop shows the icon and opens in Sentinel with a double-click, on a Mac that never ran the dev build.

### Task 4.4: Windows association and icon

**Change.**
1. Find which installer the release uses (`.github/workflows/release.yml`, `build-installers.yml`). Tauri makes
   NSIS (`.exe`) and WiX (`.msi`). Do NSIS first; add WiX if the `.msi` is published.
   **Then build once on Windows and read what Tauri already writes** (`src-tauri/target/release/nsis/x64/installer.nsi`
   after `npm run tauri build`; search it for `.flow` and `Software\Classes`). Tauri's own template registers
   the extension from `bundle.fileAssociations`, using its own ProgID. Do not add a second ProgID next to it:
   the hook in step 3 must only add what the template lacks (the `DefaultIcon` value under the ProgID that the
   template wrote, and `Content Type`), using that ProgID's name. Use the full `Sentinel.Flow` keys below only if
   the template wrote nothing for `.flow`.
2. Ship the icon file: `"bundle": { "resources": { "icons/flow/flow.ico": "flow.ico" } }` so it lands next to the exe.
3. Create `src-tauri/windows/installer-hooks.nsh` and point to it from `bundle.windows.nsis.installerHooks`:
   ```nsis
   !macro NSIS_HOOK_POSTINSTALL
     WriteRegStr SHCTX "Software\Classes\.flow" "" "Sentinel.Flow"
     WriteRegStr SHCTX "Software\Classes\.flow" "Content Type" "application/x-sentinel-workflow"
     WriteRegStr SHCTX "Software\Classes\Sentinel.Flow" "" "Sentinel Flow"
     WriteRegStr SHCTX "Software\Classes\Sentinel.Flow\DefaultIcon" "" "$INSTDIR\flow.ico,0"
     WriteRegStr SHCTX "Software\Classes\Sentinel.Flow\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
     System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
   !macroend
   !macro NSIS_HOOK_PREUNINSTALL
     DeleteRegKey SHCTX "Software\Classes\.flow"
     DeleteRegKey SHCTX "Software\Classes\Sentinel.Flow"
     System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
   !macroend
   ```
   `SHCTX` is HKCU for a per-user install and HKLM for per-machine, which matches Tauri's installer mode.
   Check the exact macro names against the Tauri version in `src-tauri/Cargo.toml` (`tauri-bundler` NSIS template).
4. Windows 10 and 11 keep a per-user choice (`HKCU\...\FileExts\.flow\UserChoice`) that can override the
   registration. This is not ours to overwrite; the first double-click shows "How do you want to open this file"
   and Sentinel is listed with the right icon. Document it in `docs/FLOW_FILES.md`.
5. The app is started with the file as an argument: `get_launch_args` in `process_cmds.rs` already returns
   `std::env::args()`. Check that the frontend takes the first argument that ends in `.flow` (and is quoted correctly
   when the path has spaces; test with `C:\Users\Me\My Flows\a b.flow`).

**Check by hand (Windows VM).** Install, create `x.flow` in Explorer (New > Text Document, rename): icon shows,
double-click opens Sentinel with the flow, uninstall removes the registration.

**Done when** the icon shows and double-click works after a clean install and after an upgrade install.

### Task 4.5: Linux association and icon (deb, rpm, Arch)

**Change.**
1. Rewrite `packaging/linux/sentinel-terminal-mime.xml`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
     <mime-type type="application/x-sentinel-workflow">
       <comment>Sentinel Terminal flow</comment>
       <comment xml:lang="en">Sentinel Terminal flow</comment>
       <icon name="application-x-sentinel-workflow"/>
       <generic-icon name="application-x-sentinel-workflow"/>
       <sub-class-of type="text/plain"/>
       <glob pattern="*.flow" weight="80"/>
     </mime-type>
   </mime-info>
   ```
   Two changes on purpose: it adds the icon and it sub-classes `text/plain` instead of `application/json`, so
   JSON viewers and editors are no longer first choice for the double-click, while any text editor can still open
   the file through "Open with". Drop the `*.workflow.json` glob: that was the old naming.
2. Ship the icons. In `tauri.conf.json` `bundle.linux.deb.files` and `bundle.linux.rpm.files` add, for each size
   in 16, 24, 32, 48, 64, 128, 256, 512:
   `"/usr/share/icons/hicolor/<size>x<size>/mimetypes/application-x-sentinel-workflow.png": "icons/flow/flow-<size>.png"`
   and `"/usr/share/icons/hicolor/scalable/mimetypes/application-x-sentinel-workflow.svg": "../assets/brand/flow-icon.svg"`.
3. Make the desktop file claim the type. Check the generated `.desktop` inside a built `.deb`
   (`dpkg-deb -x ... ; cat usr/share/applications/*.desktop`): it must contain
   `MimeType=application/x-sentinel-workflow;` and `Exec=... %F`. The template
   `packaging/linux/sentinel-terminal.desktop.hbs` already prints `MimeType={{mime_type}}` when Tauri provides one;
   if the built file has none, hard-code the line in the template.
4. Refresh the caches after install and remove. In `tauri.conf.json`:
   `bundle.linux.deb.postInstallScript`, `postRemoveScript`, and `bundle.linux.rpm.postInstallScript`,
   `postRemoveScript` point to `packaging/linux/postinst.sh` and `postrm.sh`:
   ```sh
   #!/bin/sh
   set -e
   command -v update-mime-database >/dev/null 2>&1 && update-mime-database /usr/share/mime || true
   command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
   command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
   exit 0
   ```
   Every command ends in `|| true`: a missing cache tool must never fail an install.
5. **Arch** (`packaging/arch/PKGBUILD`): install the icons (`install -Dm644` for each size into
   `/usr/share/icons/hicolor/<size>x<size>/mimetypes/`) next to the MIME line already there. Pacman's hooks
   refresh the caches. Add `shared-mime-info`, `desktop-file-utils` to `depends`.
6. **Flatpak** (`packaging/flatpak/org.sentinel.terminal.yml`, `org.sentinel.terminal.desktop`): install the MIME
   file to `/app/share/mime/packages/org.sentinel.terminal.xml` and the icons to
   `/app/share/icons/hicolor/<size>/mimetypes/`; add `MimeType=application/x-sentinel-workflow;` and `%F`
   to the `.desktop`; the metainfo gets `<provides><mediatype>application/x-sentinel-workflow</mediatype></provides>`.
   The sandbox must be able to read the file the user opens: the portal passes it automatically on double-click.
7. **Snap** (`packaging/snap/snapcraft.yaml`): investigate only; **not required for the next release**. Snaps
   cannot write `/usr/share/mime`, and file-manager integration for custom types is limited. Record in
   `docs/FLOW_FILES.md` that Snap users open flows with `sentinel-terminal <file>` or from inside the app, and
   keep Flatpak, deb, rpm, AppImage and Arch as the supported ways.

**Check by hand (Ubuntu, Fedora, Arch VMs).** After installing the package, with no logout:
```bash
printf '{"actions":[]}' > /tmp/x.flow
xdg-mime query filetype /tmp/x.flow            # application/x-sentinel-workflow
xdg-mime query default application/x-sentinel-workflow   # sentinel-terminal.desktop
gio info /tmp/x.flow | grep -i icon            # application-x-sentinel-workflow
```
The file manager (Files, Dolphin, Thunar, Nautilus) shows the icon; double-click opens Sentinel.

**Done when** all four commands print the expected values on Ubuntu 24.04 (deb), Fedora (rpm) and Arch.

### Task 4.6: Linux AppImage registers itself (the case that fails today)

An AppImage is not installed, so none of Task 4.5 happens for it. Sentinel must do it for the user, in the user's
own folders, after asking once.

**Change.**
1. Add `src-tauri/src/file_association.rs`, compiled only on Linux (`#[cfg(target_os = "linux")]`). Embed
   the MIME XML, the `.desktop` file and the icons with `include_str!`/`include_bytes!` from `packaging/linux`
   and `src-tauri/icons/flow` so the binary carries them.
2. `pub fn ensure_registered(app: &AppHandle) -> Registration` runs only when the environment variable
   `APPIMAGE` is set (the AppImage runtime sets it to the path of the file) and no system copy exists
   (`/usr/share/mime/packages/sentinel-terminal.xml` is missing). It writes:
   - `~/.local/share/mime/packages/sentinel-terminal.xml`
   - `~/.local/share/applications/sentinel-terminal.desktop` with `Exec="<value of APPIMAGE>" %F`, `Icon=sentinel-terminal`, `MimeType=application/x-sentinel-workflow;`
   - icons in `~/.local/share/icons/hicolor/<size>/apps/sentinel-terminal.png` and `.../mimetypes/application-x-sentinel-workflow.png`
   then runs `update-mime-database ~/.local/share/mime`, `update-desktop-database ~/.local/share/applications`
   and `gtk-update-icon-cache -t -f ~/.local/share/icons/hicolor` (each optional, errors ignored).
3. If the AppImage is moved, `Exec` points at a missing file. On every start, compare the stored path in
   `~/.sentinel/association.json` with `APPIMAGE`; if different, rewrite the `.desktop` file.
4. **Ask once** (a plain full-screen prompt in the app, not a modal, text: "Open .flow files with Sentinel
   Terminal? This adds a launcher and a file type to your user folders. [Yes] [No, never ask]"). Store the answer in
   `~/.sentinel/association.json`. Settings has a switch to turn it on or off later; turning it off deletes the
   files it wrote (only those).
5. Expose `get_association_status` (registered or not, where) so Settings can show it.

**Tests.** Rust unit tests that call the writer with a temporary home directory and check the files and their
contents (the `Exec` line quotes a path with spaces); the "ask once" state machine as a pure function.

**Check by hand.** Download the AppImage, run it, answer Yes, close it, double-click a `.flow` in the file manager: it
opens Sentinel. Move the AppImage, run it again: the launcher is repaired. Answer No: nothing is written.

**Done when** the AppImage opens flows by double-click with the icon, and removing the setting leaves no files behind.

### Task 4.7: One window, any number of double-clicks

**Change.**
1. Add `tauri-plugin-single-instance` (the official plugin) to `src-tauri/Cargo.toml`, and register it first in
   `lib.rs` `Builder`. Its callback receives `(app, argv, cwd)`: pass the `.flow` paths in `argv` to the same
   function the macOS `RunEvent::Opened` branch uses (`launch::remember_opened` and the `sentinel-url`
   event), then focus the existing window.
2. The frontend already handles a flow arriving while busy by saying "open it again when it is done"
   (`submitRef` in `TerminalView.tsx`). Replace that with a queue entry (Task 2.3) so a double-click is never lost.
3. A flow that only opens apps and pages (the "desktop-only" kind in `docs/FLOW_FILES.md`) must still run without
   showing the terminal; check that the single-instance path keeps this rule.
4. Reject anything that is not an existing regular file ending in `.flow` (or the legacy suffixes
   `isWorkflowFilePath` accepts); never run a path just because it is in `argv`.

**Tests.** A Rust test for the argv filter (a `.flow` path is kept, flags and other files are dropped, a
path with spaces survives). A frontend test that a second flow while busy is queued.

**Done when** double-clicking three flows in a row runs three flows in order in one window.

### Task 4.8: Documentation

Update `docs/FLOW_FILES.md` ("Opening flows" section): per-OS behaviour, the AppImage prompt, how to reset an
association (macOS `lsregister`, Windows "Open with", Linux `xdg-mime default sentinel-terminal.desktop application/x-sentinel-workflow`),
and the rule "Sentinel only writes `.flow`". Update `README.md` if it says `.json` anywhere for workflows.

---

## Phase 5: "save this as a workflow" from inside a prompt

**Report 1:** the prompt contains "...and save this as a workflow"; the task runs, nothing is saved.

### Why it fails today (facts)

- `MultistagePromptDecomposer.extractSaveAsDirective` understands only two shapes:
  `task :: save [as] workflow <name>` and one natural tail that needs the exact words
  `... save [the verified] execution|pipeline|result|steps|workflow as a workflow [named|called] <one-token-name>`
  at the **end**. "...and save this as a workflow" has no name, "save it as a workflow called morning setup"
  has a two-word name, and "first save this as a workflow named x, then ..." has it at the start. All of those
  return `isSaveAsWorkflow: false`, so the request runs as a plain task and the words are ignored (or worse, passed to the model).
- When the directive is recognised, `AgentLoop.runRequest` saves only if `result.success`, then records
  `shell.execute` steps from `result.steps`. Requests handled by a deterministic route (open an app, close a
  port, make a flow) produce no `shell.execute` steps, so the code falls to `saveFromUndoLog`, which returns null,
  and **nothing is said**: no file, no error.

### Task 5.1: Understand the request in plain words

**Change.** Replace `extractSaveAsDirective` with `parseSaveIntent(prompt): SaveIntent` in
`src/workflows/engine/SaveIntent.ts` (keep `extractSaveAsDirective` as a thin wrapper so old tests pass):
```ts
export interface SaveIntent {
  task: string;              // the prompt with the save words removed, trimmed; never empty
  save: boolean;
  name?: string;             // "morning setup", already cleaned; undefined when not given
  position: 'start' | 'end' | 'middle' | 'none';
}
```
Rules, all case-insensitive, all removing the matched words from `task`:
1. Verbs: `save`, `store`, `keep`, `record`, `remember`, `turn ... into`, `make ... (into) a`, `create a`.
   Objects: `this`, `it`, `that`, `these steps`, `all this`, `the above`, `the steps`, `everything`, `the result`, `the execution`.
   Targets: `as a workflow`, `as workflow`, `as a flow`, `as a .flow`, `into a workflow`, `as a reusable workflow`, `as a macro`.
2. A name follows `called|named|as|titled|:|=` and is quoted (`"my flow"`, `'my flow'`) or runs up to the next
   comma, full stop, `and`, `then`, `after`, or the end. Maximum 6 words, 60 characters. Strip a trailing `workflow`/`flow`.
   Characters allowed: letters, digits, spaces, `-`, `_`. Anything else ends the name.
3. Position: the clause may be at the start ("save this as a workflow called x: open gmail"), the end, or in the
   middle ("open gmail, save it as a workflow, then open spotify": the task is the text on both sides joined).
4. Must **not** trigger on questions or talk about workflows: "how do I save a workflow?", "what is a workflow",
   "list my workflows", "delete the workflow x", "run the workflow x". Require a verb **and** a target, and no
   leading question word (`how|what|why|can you explain`).
5. The old `::` form still works, with names of any length.
6. If `save` is true but `task` is empty, it is the retrospective form ("save this as a workflow": handled by
   `parseScopedWorkflowSave`, Task 5.2).

**Tests.** `SaveIntent.test.ts` with at least 40 rows: every form above, the old forms, names with spaces, quoted
names, the clause at start/middle/end, and 12 negative rows (questions, list/delete/run). Keep the old
`MultistagePromptDecomposer.test.ts` rows green.

### Task 5.2: Save what really happened, and always say what happened

**Change.**
1. In `AgentLoop.runRequest`, use `parseSaveIntent` where `extractSaveAsDirective` is used today. Run `task`
   first, as now.
2. Record **every kind of step**, not only `shell.execute`. Give each tool/route a recorder: shell command, open
   app, open folder, open URL, quit app, close port, make folder, change folder. The easiest way is for each
   `runX` route to return a `flowAction` in its `AgentResult.steps[i].flowAction` (the same `FlowAction` object
   that `FlowAuthoring` understands: `{ type: 'app', app: 'VS Code', path: '~/Projects/gitBrains' }`). Add
   `flowAction` for: the open-app, open-folder (Phase 6), quit-app, close-port, make-folder routes. For plain
   shell steps keep `{ type: 'command', command }`.
3. Build the flow from those actions with `FlowAuthoring` (the same code the "make me a workflow..." route
   uses), so the saved file is a `.flow` with portable actions (Task 4.1), not a pile of OS-specific commands.
   Paths that were relative become absolute or `~`-based (`absolutizeCwd` already exists for this).
4. Save only steps that succeeded and that are repeatable. Skip: failed steps, steps that were declined,
   read-only checks (`ls`, `git status`, `pwd`) unless they are the only steps, and the model's own questions.
5. **Where to save:** ask with `askChoice` exactly as the "make me a workflow" route does (Desktop, current
   folder, `~/.sentinel/workflows`, or a typed path), using `FlowStore`. If the user included a place in the
   prompt ("save it on the desktop"), skip the question.
6. **Name:** if the prompt had no name, suggest one from the task ("open gitbrains in vs code" becomes
   `open-gitbrains-in-vs-code`) and let the user type another in the same dialog. Never use a name that exists;
   `freeFlowPath` already adds `-2`.
7. **Always report.** The result summary gets exactly one of these lines appended:
   - `Saved workflow "<name>" (N steps) to <full path>`
   - `Not saved: the task failed, so there was nothing reliable to save.`
   - `Not saved: nothing in this task can be repeated (it only read information).`
   - `Not saved: you chose not to.`
   A requested save that ends in silence is a bug.
8. If the task fails half way, offer (do not assume): "The task failed at step 3. Save the 2 steps that worked? [1] Yes [2] No".
9. The retrospective form ("save this as a workflow called x", "save the last 3 steps") uses the same recorder over
   the last N successful steps of the session (`AgentLoop.transcript`), and the same report lines.

**Tests.** `AgentLoopSaveWorkflow.test.ts` with a fake provider and a fake `FlowIO`:
- "open gitBrains in vs code and save this as a workflow called git brains" writes `git-brains.flow` containing
  one `app` action with a `path`, and the summary names the path.
- Same without a name: the name dialog is shown; answering uses the answer.
- A failing task: summary says "Not saved", no file written.
- A task of only `git status`: "Not saved: nothing ... repeated".
- The saved file opens in `planFlow` without skipped actions (round trip).
- The prompt "how do I save a workflow?" runs normally and writes nothing.

### Task 5.3: Say it in the interface

**Change.**
1. When a prompt is recognised as a save request, the live step line says `Will save as a workflow when done`
   so the user knows the words were understood before the task starts.
2. After saving, the result shows the path, an `Open folder` action, and the line `Run it any time: say "run <name>" or double-click the file.`
3. "run the workflow <name>" must find `.flow` files in `~/.sentinel/workflows`, the Desktop and the current folder
   (use the folder list from `flowFolders()`); several matches use `askChoice`.
4. Update `docs/FLOW_FILES.md` ("Make a flow by asking") with the new phrasings.

**Done when** the twelve example phrasings in `SaveIntent.test.ts` each end in a saved `.flow` or a one-line reason.

---

## Phase 6: folders and apps by name

**Reports 6 and 7:** "Please open a folder named gitBrains in VS Code. This folder is inside
/padhai_in_linux/Projects/." Sentinel did not find the folder, made files instead, and opened a separate VS Code
window. Wrong or loosely written folder and app names are not handled at all.

### Why it fails today (facts)

- The request matches no deterministic route. `AgentLoop.ts` has a Hyprland-era fast path
  (`open <app> and <path> in <editor>`) and a bare `open vscode` route, and `DirectoryNavigationEngine` only
  handles `cd`/"open X in terminal" by looking at the **current folder's** direct children (Levenshtein). So the
  model gets the request and improvises: it runs `mkdir`/`touch`, then `code`.
- The location hint (`/padhai_in_linux/Projects/`) is written with a leading slash but means a folder under the
  home directory. Nothing tries `$HOME` + the hint.
- The case differs: the user typed `gitBrains`, the folder may be `gitbrains` or `git-brains`.
- Nothing checks that a named app exists before running it, and nothing offers choices when several match.
  `AppControl.ts` has a good matcher, but only for **running** apps.

### The design in four pieces

```
 request ──> parseOpenRequest ──> { kind: folder|file|app, name, locationHint, withApp }
                  │
        resolvePath (Task 6.2)     resolveApp (Task 6.3)
                  │                       │
      one sure match ──> open it          none ──> say so, never create
      several / fuzzy ──> askChoice (Task 6.4), remember the answer
```

Shared helper first (Task 6.1), then the two resolvers, then the questions.

### Task 6.1: One name matcher for everything

**Change.** Create `src/domain/system/NameMatch.ts` and move the matching ideas out of
`AppControl.matchRunning`/`distance` into it (leave `AppControl` calling the new module; its tests must stay green).
```ts
export function normalizeName(s: string): string;        // lower case, split camelCase ("gitBrains" -> "git brains"),
                                                         // treat - _ . and spaces alike, drop punctuation, collapse spaces
export function compactName(s: string): string;          // normalizeName without any spaces: "gitbrains"
export interface NameScore { score: number; why: 'exact'|'same-letters'|'prefix'|'word'|'contains'|'typo'|'none' }
export function scoreName(query: string, candidate: string): NameScore;
```
Scores (highest wins): exact string 100; same after `compactName` (so `gitBrains`, `git-brains`, `git_brains`,
`Git Brains` all equal) 95; candidate starts with query 85; every word of the query is a word of the candidate
80; candidate contains the compact query 70; edit distance <= 1 (names under 6 letters) or <= 2 (6 to 10) or
<= 3 (longer), score `60 - 8 * distance`; else 0. Also match the plural/singular `s` and a leading `the`.
Add `rankNames(query, candidates, {min: 40, limit: 8})`.

**Tests.** `NameMatch.test.ts`: the five spellings of gitbrains all score at least 95 against each other;
`gitbrian` scores `typo`; `vscode`/`vs code`/`Visual Studio Code` pair through the alias table of Task 6.3, not here;
`zzzz` scores 0; ranking is stable (ties broken alphabetically).

### Task 6.2: Find the real folder or file

**Change.**
1. **Parse.** Add `src/domain/system/OpenRequest.ts`: `parseOpenRequest(goal): OpenRequest | null` with
   ```ts
   interface OpenRequest {
     kind: 'folder' | 'file' | 'app' | 'unknown';
     name: string;            // "gitBrains"
     locationHint?: string;   // "/padhai_in_linux/Projects/" taken from "inside ...", "in ...", "under ...", "from ..."
     withApp?: string;        // "VS Code" from "in VS Code", "with code", "using cursor"
     create: boolean;         // the user said "create", "make", "new" for it
   }
   ```
   It must read all of these (write them as test rows): `open the folder gitBrains in vs code`,
   `please open a folder named gitBrains in VS Code. This folder is inside /padhai_in_linux/Projects/`,
   `open gitbrains with code`, `open my project api in cursor`, `open ~/Projects/gitBrains in code`,
   `launch vscode on the gitBrains directory under Projects`, `open file notes.txt in the Documents folder`.
   Sentence two of the long form ("This folder is inside ...") belongs to the same request: when a goal has
   several sentences, search the later ones for a location hint (`is (located )?(inside|in|under|within) <path>`).
   If the name is followed by "folder"/"directory"/"project" it is a folder; a dotted extension means a file.
2. **Find.** Add a Rust command in a new `src-tauri/src/path_search.rs`, registered in `lib.rs`:
   ```rust
   #[tauri::command]
   pub async fn find_paths(query: String, roots: Vec<String>, kind: String, max_depth: u32, limit: u32)
       -> Result<Vec<FoundPath>, String>
   // FoundPath { path: String, name: String, is_dir: bool }
   ```
   It walks each root breadth-first, returns directories (or files) whose name could match (a loose pre-filter: the
   compact query is a substring, or edit distance <= 3; scoring happens in TypeScript with `scoreName`), and
   stops at `limit * 10` entries, at 20,000 visited entries, or after 2 seconds, whichever comes first. Skip
   `node_modules`, `.git`, `.cache`, `target`, `dist`, `build`, `.venv`, `__pycache__`, `Library`, `AppData`, `proc`, `sys`, `dev`, `snap`, and
   hidden folders unless the query starts with a dot. Do not follow symlinks into folders already visited.
   Expand `~` with `expand_tilde`, which exists in `process_cmds.rs`.
3. **Order of places** (the resolver, `src/domain/system/PathResolver.ts`):
   1. If the name is already a path (`~/x`, `/x`, `./x`, `C:\x`) and exists: done.
   2. The location hint, tried three ways: as written; relative to the home folder (`/padhai_in_linux/Projects`
      becomes `~/padhai_in_linux/Projects`); and, if neither exists, searched by its last two segments under the
      home folder (depth 4). In each existing hint folder, look for the name with `scoreName` over its children.
   3. The current folder of the terminal tab.
   4. Common project places that exist: `~/Projects`, `~/projects`, `~/Project Folder`, `~/code`, `~/dev`, `~/src`,
      `~/work`, `~/Documents`, `~/Desktop`, `~/Downloads`, `~/repos`, `~/git`, `~/github`.
   5. The home folder to depth 3.
   Stop at the first step that gives a match at score >= 95 (`exact`/`same-letters`). Collect every candidate with
   score >= 60 across the steps if none reached 95. A match inside the location hint beats an equal match elsewhere.
4. **Result type:**
   ```ts
   type Resolution =
     | { type: 'found'; path: string }                          // exactly one candidate >= 95, none close behind
     | { type: 'choose'; candidates: { path: string; score: number }[]; reason: 'several' | 'close' | 'typo' }
     | { type: 'missing'; searched: string[] };                 // list of folders looked in
   ```
   `found` also when the top candidate is >= 95 and the next is at least 15 points lower. Several >= 95 candidates
   (two folders called `gitBrains`) is `choose` with reason `several`. Only typo-level matches is `choose`
   with reason `typo`.
5. **Never create when the user asked to open.** `missing` produces: `I could not find a folder called "gitBrains".
   I looked in: ~/padhai_in_linux/Projects, ~/Projects, the current folder, ... Tell me the full path, or say "create it".`
   Creation happens only when `OpenRequest.create` is true or the user answers "create it".
6. **Open it** (`src/domain/system/OpenInApp.ts`): given a path and an app, the command per OS, quoted with
   `src/utils/shellQuote.ts`:
   - editors `code`, `codium`, `cursor`, `windsurf`, `zed`, `subl`, `idea`, `pycharm`, `webstorm`: Linux/Windows
     `<cli> <path>` (the editor focuses an existing window that has the folder open instead of making a second
     one; do not pass `-n`); macOS `open -a "<App Name>" <path>`.
   - If the CLI is missing, try in order: `flatpak run com.visualstudio.code <path>` (Flatpak ids come from the
     app resolver, Task 6.3), `snap run code <path>`, `xdg-open <path>`.
   - No app named: open a folder in the file manager (`xdg-open` / `open` / `explorer`), a file with the default app.
   - Run it detached (`setsid -f` on Linux) so closing Sentinel does not close the editor.
   Verify afterwards: for editors, check the process exists after 1.5 seconds (the running-process listing from
   `AppControl.listRunningCommand`); report "Opened ~/padhai_in_linux/Projects/gitBrains in Visual Studio Code" or the exact failure.
7. **Wire it.** In `AgentLoop.runRequest`, before the model call and before the old regex fast paths, call
   `parseOpenRequest`; add a `runOpen(req, context)` method that does steps 3 to 6, uses `askChoice` for `choose`, and
   returns an `AgentResult` whose step has a `flowAction` (Task 5.2) so "save this as a workflow" works with it.
   Delete the old `open <app> and <path> in <editor>` fast path; it does not resolve anything.
8. The authorization dialog still shows the exact command before running, like every other command.

**Tests.** `OpenRequest.test.ts` (the seven rows above plus ten more, plus negatives: "open the door", "open a
pull request in github"). `PathResolver.test.ts` with a fake file system object (inject `find`/`exists`): hint as
written; hint relative to home; case-different name; `git-brains` found for `gitBrains`; two same-named folders gives `choose: several`;
a typo gives `choose: typo`; nothing gives `missing` with the searched list; the model is never called. `OpenInApp.test.ts`:
the command for each editor on each OS, with a path that has a space and a quote in it. Rust test for `find_paths`
on a temp tree (skips `node_modules`, honours depth and limit).

**Check by hand (Linux).** Make `~/padhai_in_linux/Projects/gitbrains` and `~/Projects/gitBrains`. Say the full
sentence from report 6. Expect a question with two choices (one inside the hint is marked "matches your location"),
and after choosing, one VS Code window on that folder, no files created (`git status` in the Sentinel repo and
`ls` in both folders show nothing new). Then delete one folder and repeat: no question, it opens. Then say `open gitbarins in code`: "Did you mean ...?".

**Done when** the report 6 sentence opens the right folder in one VS Code window with no model call.

### Task 6.3: Find the real application

**Change.**
1. Add `src/domain/system/AppCatalog.ts`: list installed apps once and cache for 5 minutes.
   - **Linux:** read every `*.desktop` in `/usr/share/applications`, `/usr/local/share/applications`,
     `~/.local/share/applications`, `/var/lib/flatpak/exports/share/applications`,
     `~/.local/share/flatpak/exports/share/applications`, `/var/lib/snapd/desktop/applications`. Parse `Name`,
     `GenericName`, `Keywords`, `Exec`, `Icon`, `NoDisplay`, `Hidden`, `StartupWMClass`; skip `NoDisplay=true`.
     Read them with one shell command per root (`grep -H -E '^(Name|GenericName|Keywords|Exec|NoDisplay)=' dir/*.desktop`)
     parsed in TypeScript; no new Rust needed. Also add executables on `PATH` for the known CLI names in the alias table.
   - **macOS:** `ls /Applications ~/Applications /System/Applications /System/Applications/Utilities`, names minus `.app`.
   - **Windows:** `Get-StartApps` (PowerShell, name and AppID) plus the `App Paths` registry keys.
   Type: `{ name, aliases[], launch: { kind: 'exec'|'bundle'|'appid'|'flatpak'|'snap', value }, source }`.
2. A small alias table for what people actually type (all lower case): `vs code, vscode, code, visual studio code, vs`
   to `Visual Studio Code | Code | VSCodium`; `chrome, google chrome, chromium`; `firefox, ff`; `terminal, console`;
   `files, file manager, nautilus, dolphin, thunar, finder`; `settings, system settings, control center`; `cursor`; `slack`;
   `discord`; `spotify`; `obsidian`; `postman`; `docker desktop`; `gimp`; `vlc`. Put it in
   `src/domain/system/appAliases.ts` as plain data with a test that every key maps to at least one name.
3. `resolveApp(query, os): Promise<AppResolution>` scores each app's name, generic name, keywords and aliases
   with `scoreName` (take the best), and returns the same shape as `Resolution`: `found`, `choose` (several >= 60
   within 10 points of each other, or typo-level), `missing` (say what was closest, or "no app like that is
   installed; I can look for a Flatpak or a package named ..." and stop; never run a guessed name).
4. Replace the app opening paths that guess: the `open|launch|start <app>` fast path (`AgentLoop.ts`, the long
   `pattern: /^(?:open|launch|start)\s+(?:the\s+)?(chrome|...)`), the old `open visual studio code` /
   `open google chrome` `which` fast paths, and `FlowPlan`'s app step. They must call `resolveApp` first and use
   the `launch` value it returns (a `gtk-launch <desktop id>` or `flatpak run <id>` on Linux, `open -a "<name>"`
   on macOS, `Start-Process` with the AppID on Windows). Keep `FlowPlan`'s per-OS names as the fallback inside a
   flow file so a flow written on one OS still resolves on another.
5. Reuse it for quitting: `AppControl.matchRunning` already compares names to running apps; make it use the
   same `scoreName` so "quit vs code" and "open vs code" mean the same thing.

**Tests.** `AppCatalog.test.ts` parses three real `.desktop` samples committed as fixtures (one Flatpak with
`Exec=flatpak run ...`, one with `%U` field codes, one `NoDisplay`). `resolveApp` rows: `vs code` finds `Visual Studio Code`;
`crome` is a typo for `Chromium`/`Google Chrome` and asks; `firefox` with both a deb and a Flatpak copy asks; `nonexistentapp` is `missing`.

**Check by hand.** `open vs code`, `open crome`, `open the file manager`, `open something-not-installed` each end
in an open window, a question, an open window, and an honest message.

### Task 6.4: Questions that are short, safe and remembered

**Change.**
1. All questions use `askChoice` (`src/presentation/ChoiceRequests.ts`) and the existing `ChoiceDialog`. Wording is
   fixed so it is consistent:
   - several: `I found 2 folders called "gitBrains". Which one?`, options show the path with `~` and the folder
     modified time ("modified 3 days ago"); a final option `None of these`.
   - typo: `I could not find "gitbarins". Did you mean "gitBrains" in ~/Projects?` options `Yes, open it`, `No, search again`, `Cancel`.
   - missing: no question, the message from Task 6.2 step 5.
   Maximum 6 options; if there are more, show the best 5 and `Show more`.
2. Number keys 1 to 9 choose, Esc cancels, typing a path is accepted (already how `ChoiceDialog` works).
3. **Remember it.** After the user picks, store `{ spoken: "gitbrains", path, app?, chosenAt }` in
   `~/.sentinel/aliases.json` (owner-only file, like the rest of `~/.sentinel`). The next time the same spoken
   name resolves, the saved path is the first candidate and counts as `found` if it still exists. `Forget "gitbrains"` (and
   "forget my folder shortcuts") removes it. Cap the file at 200 entries.
4. Make this reachable in plain words, per the AI-first rule: "what do you remember about gitbrains", "forget gitbrains".
5. Add the same behaviour to `cd`: `DirectoryNavigationEngine.resolve` must use `PathResolver` instead of only the
   current folder's children, so `cd gitbrains` works from anywhere.

**Tests.** `AliasStore.test.ts`: remember, lookup when the path vanished (falls back to search), forget, cap.
A `runOpen` test that, after one `choose`, the second identical request asks nothing.

**Done when** report 7's cases (wrong case, typo, two matches, none) each behave as the table says, and none of them creates a file.

---

## Phase 7: same prompt, same result on every provider

**Report 4:** a prompt works with an API model and fails with the built-in model.

Phase 3 makes the built-in model dependable on its own. This phase finds and removes the differences between
providers, so any remaining gap is the model's ability and not our plumbing.

### What differs today (facts)

| | Built-in (`EmbeddedProvider`) | API (`CloudApiProvider`) |
|---|---|---|
| Output shaping | GBNF grammar `SENTINEL_ACTION` | `response_format: json_object` (when supported) |
| Reply limit | `maxTokens: 512` in the agent call | `max_tokens: 1024` |
| Sampling | `temperature 0.05`, `top_k 20`, `top_p 0.9` | `temperature 0.2` |
| Context | 8192 tokens, shared with a 19 KB system prompt | 128k and more |
| Fallbacks | Grammar dropped on error; `/completion` endpoint fallback | Provider-specific error mapping |

So the API model sees the same prompt but has room to think, is allowed a longer answer and is not boxed in by a grammar.

### Task 7.1: One request builder, differences only where the API forces them

**Change.**
1. Add `src/ai/provider/DecisionRequest.ts`: `buildDecisionRequest(kind: 'embedded'|'cloud'|'ollama', opts)`
   returns the options object for `generate(...)`. It is the **only** place that sets sampling, token limits and
   output shaping for agent decisions (Task 3.2 settings: temperature 0, seed, `mode: 'decision'`). The provider
   classes translate it to their wire format and nothing else.
2. Remove the per-provider defaults that disagree (`CloudApiProvider`'s `temperature 0.2`/`max_tokens 1024`, `EmbeddedProvider`'s
   `?? 0.05`, `?? 256`). A missing option is an error in tests, not a silent default.
3. Cloud models also get the grammar's job through JSON mode plus the JSON Schema
   (`GbnfGrammarManager.SENTINEL_ACTION_JSON_SCHEMA`) where the API supports `json_schema`; where it does not,
   JSON mode and a one-line reminder at the end of the system prompt.
4. The system prompt (Task 3.3 shrinks it) is the same text for every provider. No provider-specific prompt files.

**Tests.** `DecisionRequest.test.ts`: for each kind the options equal the expected object (snapshot); the three
kinds share `temperature`, `seed`, `maxTokens`. A test that fails if a provider file contains the literal
`temperature:` outside the translation code (read the sources).

### Task 7.2: Compare providers on the same cases

**Change.**
1. Extend `scripts/eval/reliability.mts` (Task 3.1) with `--provider embedded|ollama|cloud`. For `cloud`
   read `SENTINEL_EVAL_API_URL`, `SENTINEL_EVAL_API_KEY`, `SENTINEL_EVAL_API_MODEL` from the environment only; never
   write them to the output files, and print a cost warning plus ask for `--yes` before sending anything.
2. Run the 60 cases once each on the API model and ten times on the built-in model. Print a table:
   `case | api | built-in (x/10)`; list the cases where the API passes and the built-in is below 8/10.
3. For each such case choose the cheapest cure, in this order: (a) a deterministic route (Task 3.5), (b) an
   `ActionGate` check (Task 3.4), (c) one short example added to the system prompt, (d) leave it and note it in
   `docs/MODEL_RELIABILITY.md` as a known limit of the built-in model.
4. Add the failing prompt from report 4 as soon as the user sends it; it is the first regression case.

**Done when** the gap list is empty or every remaining row is tagged (d) with a reason.

### Task 7.3: Understand any answer format

**Change.** `AgentLoop.parseLLMResponse` must accept what API models actually return, so the built-in and API
paths take the same route after the call:
1. strip a Markdown code fence (```` ```json ... ``` ````) and a leading/trailing sentence around one JSON object;
2. strip `<think>...</think>` (already done in places; move it into the one parser);
3. accept `{"tool": ..., "params": ...}` and `{"action": ..., "arguments": ...}` and native tool-call objects
   (`tool_calls[0].function.name/arguments`) and normalise to one internal shape;
4. repair the three common JSON slips once (trailing comma, single quotes, an unterminated final string at a
   `finish_reason: length`) and otherwise fail clearly;
5. on failure log the raw reply to the local debug log (never to the screen) and show `The model's answer was not usable. [Try again] [Copy debug info]`.

**Tests.** `parseLLMResponse.test.ts` with 15 raw strings (fenced, with prose, think-tags, tool_calls, trailing
comma, truncated). Each gives the same normalised action or a clear error.

### Task 7.4: When the built-in model cannot, say so and offer the choice

**Change.** If a request fails the `ActionGate` twice (Task 3.4) and an external provider is configured, show
`The built-in model could not do this reliably. Try it with <provider/model>? [Yes, this time] [No]`. Never send
a prompt to a cloud API without that answer, and never remember "always" for cloud providers. Local Ollama may offer `Always`.

### Task 7.5 (security, small): keep API keys out of plain browser storage

`CloudApiProvider` keeps the API key in `localStorage` (plain text, visible in dev tools and in any backup of the
webview data). Store it with the operating system keychain: add the `keyring` crate and two Rust commands,
`secret_set(service, key, value)` and `secret_get(service, key)`, used by `CloudApiProvider` and Settings; move
existing keys on first launch (read from `localStorage`, write to the keychain, delete from `localStorage`).
When no keychain is available (a bare window manager on Linux), fall back to a file `~/.sentinel/secrets.json`
with mode `0600` and say so once in Settings. Test with a fake keychain object.

---

## Phase 8: verify on Linux and release

### Task 8.1: The Linux matrix

Run the whole list on each target and write the result in `docs/LINUX_TEST_REPORT.md` (a table: report
number, steps, pass or fail, notes, date, build).

| Target | Install type | Desktop |
|---|---|---|
| Ubuntu 24.04 | `.deb` | GNOME, X11 and Wayland |
| Fedora (current) | `.rpm` | KDE Plasma |
| Arch | PKGBUILD | Hyprland |
| Any | AppImage | any |
| Any | Flatpak | any |

| Report | Steps | Pass when |
|---|---|---|
| 1 | Say `open gmail and save this as a workflow called mail check`; answer the location question | A `.flow` exists at the chosen place; summary names the path; double-click runs it |
| 2 | Type `git sta`, press Left twice, Right twice, Right at the end | No text inserted by the first three; the last accepts |
| 3 | Run a slow request; type three more; open the queue; remove one; reorder | Queue panel shows, edits work, order is respected |
| 4 | Run the report 4 prompt on built-in and API model | Same result |
| 5 | Open Settings; press Esc | Closes |
| 6 | The full gitBrains sentence | One VS Code window on the right folder, nothing created |
| 7 | `open gitbarins in code`, `open crome` | "Did you mean" questions; no files created |
| 8 | Choose an API model, restart three times | Same model each time |
| 9 | Look at the status bar for each provider | Never "Off" while it works; reason shown when it does not |
| 10 | Run a slow request; press Ctrl+C | Stops in under a second, no leftover process |
| 11 | `npm run eval:model` | `pass@1 >= 95%`, flip rate `<= 3%` |
| 12 | New flow file; `xdg-mime query filetype`; file manager icon; double-click; AppImage first run | Extension `.flow`, type and icon present, opens in Sentinel |

### Task 8.2: Fifty tricky requests, one by one

Run 50 complex requests in the real app, one at a time, with the built-in model (headless is fine when it is
faster, see `scripts/stress/README.md`). Include: multi-step requests with a save clause, requests with typos,
wrong names, two folders with one name, an app that is not installed, a request that must be refused, a request
that needs a question back, a long session of 30 turns (Task 3.3), Ctrl+C in the middle of each kind of task.
Write each failure in a list (request, what happened, what should happen), fix the causes, and run the whole
list again. Stop when a full run has no failures. Keep the list as `scripts/stress/tests3.ts`.

### Task 8.3: Release

1. `npm run check:triple` passes. `git status` is clean except for intended files. Author is NetPranav.
2. Run the macOS and Windows checks that touch shared code (Phases 1, 2, 3, 5, 6, 7 changed shared TypeScript;
   Phase 4 changed packaging for all three systems): macOS Finder icon and double-click, Windows installer
   registration and icon. A platform is released only after its own check.
3. Update `docs/releases` notes with a section per report number (the table at the top of this file), bump
   the version, and publish each platform from its own branch (`linux-v2-update` for Linux), as for 2.1.0.
4. Close the matching GitHub issues with a link to the release.
5. Replace this file's contents with a short "Done" table and the next list of work.

---

## Order of work and size

| Order | Task | Size | Needs |
|---|---|---|---|
| 1 | 1.1 Esc | small | none |
| 2 | 1.2 Persistence | small | none |
| 3 | 1.3 Status bar | small | 1.2 |
| 4 | 1.4 Arrow keys | small | none |
| 5 | 2.1 Cancel signal | medium | none |
| 6 | 2.2 Ctrl+C | small | 2.1 |
| 7 | 2.3 Queue view | medium | none (a flow opened while busy joins the queue once 4.7 is done) |
| 8 | 3.1 Eval harness | medium | none |
| 9 | 3.2 Determinism | small | 3.1 |
| 10 | 3.3 Context budget | medium | 3.1 |
| 11 | 3.4 Action gate (the app-name check is added after 6.3 exists) | medium | 3.1 |
| 12 | 6.1 Name matcher | small | none |
| 13 | 6.2 Find a folder | large | 6.1 |
| 14 | 6.3 Find an app | large | 6.1 |
| 15 | 6.4 Questions | small | 6.2 |
| 16 | 4.1 One writer | medium | none |
| 17 | 5.1 Save intent | medium | none |
| 18 | 5.2 Record and report | large | 4.1, 5.1, 6.2 (the open-folder route supplies the `flowAction`) |
| 19 | 5.3 Interface | small | 5.2 |
| 20 | 3.5 Route more in code | medium | 3.1, 6.2, 6.3 |
| 21 | 4.2 Icon | medium | none |
| 22 | 4.3 macOS | medium | 4.2 |
| 23 | 4.4 Windows | medium | 4.2 |
| 24 | 4.5 Linux packages | medium | 4.2 |
| 25 | 4.6 AppImage | large | 4.2, 4.5 |
| 26 | 4.7 Single instance | small | 2.3, 4.5 |
| 27 | 4.8 Docs | small | 4.x |
| 28 | 7.1 to 7.4 | medium | 3.2, 3.3, 3.4 |
| 29 | 3.6 Model choice | small | 3.1 |
| 30 | 7.5 Keychain (extra, not from the reports) | medium | none |
| 31 | 8.1 to 8.3 | large | everything |

Sizes: small is under half a day, medium about a day, large two days or more.

## Definition of done for the whole plan

- Every row of the matrix in Task 8.1 passes on Ubuntu, Fedora and Arch, in the deb, rpm and AppImage.
- `npm run check:triple` is green and the test count has grown (at least one new test file per task).
- `docs/MODEL_RELIABILITY.md` shows `pass@1 >= 95%` and a flip rate `<= 3%` for the built-in model.
- No code path creates a `.json` flow; every flow file is `.flow` with the icon and opens in Sentinel on macOS, Windows and Linux.
- No named folder or app is acted on without being found first; no request to open something ever creates it.
