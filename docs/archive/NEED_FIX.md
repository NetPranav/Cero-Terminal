# Sentinel Terminal — Analysis & Fix Roadmap (NEED_FIX.md)

This document provides technical root-cause analyses, architectural impact assessments, and remediation plans for core issues identified across the AI connection test, workflow planner, notification overlay, desktop integrations, CLI launcher, clipboard management, terminal navigation, and tab aesthetics.

---

## Table of Contents
1. [Issue 1: Cloud API "Test Connection" Transient Failures](#issue-1-cloud-api-test-connection-transient-failures)
2. [Issue 2: Workflow Plan Failure on Complex Multi-Step Prompt](#issue-2-workflow-plan-failure-on-complex-multi-step-prompt)
3. [Issue 3: Persistent Execution Plan HUD Notification Overlay](#issue-3-persistent-execution-plan-hud-notification-overlay)
4. [Issue 4: Linux Desktop / File Manager Context Actions Integration](#issue-4-linux-desktop--file-manager-context-actions-integration)
5. [Issue 5: VS Code & Cursor IDE Profiles Usability](#issue-5-vs-code--cursor-ide-profiles-usability)
6. [Issue 6: Sentinel CLI Launcher Installation & Execution](#issue-6-sentinel-cli-launcher-installation--execution)
7. [Issue 7: Workflows Section Cleanup & Onboarding Selection](#issue-7-workflows-section-cleanup--onboarding-selection)
8. [Issue 8: Clipboard Paste Failure on Prompt Entry (Ctrl+Shift+V / Ctrl+V)](#issue-8-clipboard-paste-failure-on-prompt-entry-ctrlshiftv--ctrlv)
9. [Issue 9: Arrow Key In-Buffer Line Navigation vs. History Ingestion in Long Prompts](#issue-9-arrow-key-in-buffer-line-navigation-vs-history-ingestion-in-long-prompts)
10. [Issue 10: Diminutive Tab Close Button Hit-Target and Sub-Pixel Dot Artifact](#issue-10-diminutive-tab-close-button-hit-target-and-sub-pixel-dot-artifact)
11. [Issue 11: Prompt Abnormally Magnifying / Canvas Scaling Glitch on Tab Close](#issue-11-prompt-abnormally-magnifying--canvas-scaling-glitch-on-tab-close)
12. [Issue 12: Release Webview White Screen & Live Diagnostic Logging System](#issue-12-release-webview-white-screen--live-diagnostic-logging-system)

---

## Issue 1: Cloud API "Test Connection" Transient Failures

### 1.1 Problem Statement
When attaching an API key (OpenAI, Groq, Anthropic, DeepSeek, OpenRouter, or Custom) and clicking **"Test Connection"**, the request frequently fails with a red error badge for the first 2-3 attempts before succeeding on the 3rd or 4th attempt. This misleads users into believing their API key or base URL is invalid.

**Status: RESOLVED & VERIFIED** (Commit: `5daff74` — Full resolution log in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-1-cloud-api-test-connection-transient-failures))

### 1.2 Code Locations
- [src/ui/components/AiSettingsPage.tsx](file:///home/user/project/src/ui/components/AiSettingsPage.tsx#L249-L269) (`handleTestConnection`)
- [src/ai/provider/CloudApiProvider.ts](file:///home/user/project/src/ai/provider/CloudApiProvider.ts#L77-L122) (`normalizeEndpointUrl`, `httpFetch`)
- [src/ai/provider/CloudApiProvider.ts](file:///home/user/project/src/ai/provider/CloudApiProvider.ts#L225-L283) (`testConnection`)
- [src/ai/provider/CloudApiProvider.test.ts](file:///home/user/project/src/ai/provider/CloudApiProvider.test.ts) (Automated test coverage)

### 1.3 Technical Root Causes
1. **Zero-Retry Single-Shot Network Probe:**
   - In [CloudApiProvider.ts](file:///home/user/project/src/ai/provider/CloudApiProvider.ts#L225), `testConnection()` executes a single, un-retried HTTP POST request.
   - Initial connections to cloud endpoints encounter cold TCP/TLS handshakes, DNS resolution latency, proxy route establishment, or transient server-side cold starts (e.g. Groq/OpenRouter rate limiter spikes, 429 concurrency blips, 502/503/504 gateway timeouts).
   - Any single transient error immediately surfaces as an error in the UI. When the user clicks the button again after 2-3 seconds, the socket/TLS session is warm and DNS is cached, leading to a delayed success.
2. **Missing Request Timeout Budget:**
   - `httpFetch()` lacks an explicit `AbortSignal.timeout(...)`. If an initial probe request encounters socket contention, it may either stall or abort abruptly with an uncaught `TypeError: Failed to fetch`.
3. **URL Normalization Defects for Provider Base URLs:**
   - In `normalizeEndpointUrl()`:
     ```typescript
     if (url.endsWith('/v1')) return `${url}/chat/completions`;
     if (url.includes('nvidia.com')) return `${url}/v1/chat/completions`;
     return `${url}/chat/completions`;
     ```
   - If a user inputs standard base URLs such as `https://api.openai.com` or `https://api.deepseek.com` (without `/v1`), the function incorrectly outputs `https://api.openai.com/chat/completions` (omitting `/v1/`), returning HTTP 404 until the user modifies the URL or re-enters it.
4. **Dynamic Import Latency in Tauri HTTP Client:**
   - In `httpFetch()`, `await import('@tauri-apps/plugin-http')` is executed dynamically on the initial call. In WebKit GTK environments, the first invocation can experience IPC registration delay or race against native fetch CORS preflight options.

### 1.4 Implemented Resolution
1. **Built-in Auto-Retry with Progressive Backoff:**
   - [CloudApiProvider.ts](file:///home/user/project/src/ai/provider/CloudApiProvider.ts) executes up to 3 automatic attempts with progressive backoff (350ms, 700ms) before reporting failure to the UI.
   - Fast abort on non-retryable 401 Unauthorized / 403 Forbidden errors (verified API key errors return immediately).
2. **Robust URL Normalization:**
   - Expanded `normalizeEndpointUrl` to handle root domains for OpenAI (`api.openai.com`), Groq (`api.groq.com`, `api.groq.com/openai`), OpenRouter (`openrouter.ai`, `openrouter.ai/api`), Anthropic (`api.anthropic.com`), and DeepSeek.
3. **8-Second Timeout Budget per Probe:**
   - Enforced an 8,000ms `AbortController` timeout budget per attempt.
4. **Reasoning Model Payload Adaptation:**
   - Automatically adapts payloads for `o1`, `o3-mini`, and reasoning models to use `max_completion_tokens` instead of `max_tokens`, with fallback probe on `/models`.
5. **UI State Indication:**
   - Added rotating spinner indicator and "Verifying Connection..." label during active verification.
6. **Cached Dynamic Imports:**
   - Cached `@tauri-apps/plugin-http` import to eliminate repeated IPC module resolution latency.

---

## Issue 2: Workflow Plan Failure on Complex Multi-Step Prompt

### 2.1 Problem Statement
When executing the prompt:
```
Create a temporary testing workspace at /tmp/sentinel-workflow-test.

Inside it:
1. Create a directory called project.
2. Inside project create three files: frontend.txt, backend.txt, and README.md.
3. Put "Frontend module" inside frontend.txt.
4. Put "Backend module" inside backend.txt.
5. Put "Sentinel Workflow Test" inside README.md.
6. Finally list the project directory and display the contents of all three files.

After successfully completing all of these steps, save the verified execution as a workflow named workflow-basic-test.
```
Execution failed with:
- Intent routed: `workflow.run (98% confidence, 12ms CPU tier)`
- Terminal error: `✗ Workflow plan failed: Command string required for shell.execute; Command string required for shell.execute`
- No directories or files were created, and the workflow was not saved.

**Status: RESOLVED & VERIFIED** (Full resolution log in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-2-workflow-plan-failure-on-complex-multi-step-prompt))

### 2.2 Code Locations
- [src/sdk/capabilities/drivers/ShellSDKCapability.ts](file:///home/user/project/src/sdk/capabilities/drivers/ShellSDKCapability.ts#L41-L43) (`Command string required for shell.execute`)
- [src/ai/agent/AdaptivePlanEngine.ts](file:///home/user/project/src/ai/agent/AdaptivePlanEngine.ts#L112-L139) (`createPlan`)
- [src/ai/agent/AdaptivePlanEngine.ts](file:///home/user/project/src/ai/agent/AdaptivePlanEngine.ts#L255-L310) (`executeSinglePhase`)
- [src/ai/agent/AdaptivePlanEngine.ts](file:///home/user/project/src/ai/agent/AdaptivePlanEngine.ts#L848-L896) (`resolveShellCommandForPhase`)
- [src/ai/agent/AdaptivePlanEngine.ts](file:///home/user/project/src/ai/agent/AdaptivePlanEngine.ts#L898-L936) (`buildPhasePlanningPrompt`, `parsePlanResponse`)
- [src/ai/models/IntentModel.ts](file:///home/user/project/src/ai/models/IntentModel.ts#L274-L277) (`classifyHeuristic` workflow regex)
- [src/ai/agent/AgentLoop.ts](file:///home/user/project/src/ai/agent/AgentLoop.ts#L2110-L2160) (`requiresExecutionPlan`)

### 2.3 Technical Root Causes
1. **Flawed LLM Planning Prompt and Schema in `AdaptivePlanEngine`:**
   - In `buildPhasePlanningPrompt()`:
     ```
     Break the user request into 2 to 5 clear, sequential execution phases.
     Return ONLY one valid JSON object formatted as:
     {
       "summary": "Brief description of overall goal",
       "phases": [
         { "id": "1", "title": "Phase title", "tool": "optional.tool.id" },
         { "id": "2", "title": "Phase title", "tool": "optional.tool.id" }
       ]
     }
     ```
   - The planning prompt asks the model to emit only `id`, `title`, and `tool`. It provides **no schema or instruction to include shell commands or tool parameters**.
   - It artificially clamps planning to 2-5 phases, forcing a 6-step prompt to be compressed into two vague phases:
     - Phase 1: `Create the workspace directory`
     - Phase 2: `Verify the workspace exists and is accessible`
   - `maxTokens` was capped at 350, truncating responses on compound instructions.
2. **Missing Command in `shell.execute` Driver Invocation:**
   - In `executeSinglePhase()`:
     ```typescript
     if (!phase.tool || (phase.tool === 'shell.execute' && !phase.params?.command)) {
       const resolvedCmd = this.resolveShellCommandForPhase(phase.title, goal, options.cwd, options.os);
       if (resolvedCmd) {
         phase.tool = 'shell.execute';
         phase.params = { command: resolvedCmd, explanation: phase.title };
       }
     }
     ```
   - `resolveShellCommandForPhase()` attempts regex matching on `phase.title`:
     `phaseTitle.match(/(?:directory|folder|mkdir|at|to)\s+['"]?([~/a-z0-9_.-]+)['"]?/i)`
   - For `"Create the workspace directory"`, `directory` is at the end of the string with no trailing argument. The regex match fails (`null`), and the target `/tmp/sentinel-workflow-test` is in `goal`, not `phase.title`.
   - Because `resolvedCmd` evaluates to `null`, `phase.params` remains `{}`.
   - `options.toolExecutor.execute('shell.execute', {})` is called with an empty command object.
   - [ShellSDKCapability.ts:42](file:///home/user/project/src/sdk/capabilities/drivers/ShellSDKCapability.ts#L42) returns:
     `{ success: false, error: { code: 'MISSING_SHELL_CMD', message: 'Command string required for shell.execute' } }`
   - This failure occurs for both Phase 1 and Phase 2, producing:
     `✗ Workflow plan failed: Command string required for shell.execute; Command string required for shell.execute`.
3. **Keyword Overlap in Intent Classification:**
   - [IntentModel.ts:275](file:///home/user/project/src/ai/models/IntentModel.ts#L275) checks:
     `if (/\b(?:workflow|save\s+workflow|run\s+workflow)\b/i.test(clean))`
   - Because the user ended their instruction with "save the verified execution as a workflow", the regex routed the prompt to the `workflow` domain rather than `developer` / multi-step workspace execution.
4. **Missing Workflow Auto-Save on Completion:**
   - Sentinel lacks a post-execution hook to automatically capture and serialize successful multi-step executions to `~/.sentinel/workflows/<name>.json` when the prompt requests saving upon completion.

### 2.4 Proposed Remediation
1. **Structured Phase Planning Contract:**
   - Update `buildPhasePlanningPrompt()` to require the model to emit explicit bash command lines for each phase:
     `{ "id": "1", "title": "...", "tool": "shell.execute", "params": { "command": "mkdir -p /tmp/sentinel-workflow-test/project" } }`
   - Increase `maxTokens` from 350 to 1,024 to accommodate detailed multi-phase plans.
2. **Context-Aware Command Fallback:**
   - In `resolveShellCommandForPhase()`, if `phase.title` lacks an explicit target path, parse the overall `goal` to extract path arguments (e.g. `/tmp/sentinel-workflow-test`).
   - If `phase.tool === 'shell.execute'` and `params.command` is missing, use a fallback LLM synthesis call to generate the exact bash command line rather than invoking `ShellSDKCapability` with an empty object.
3. **Compound Intent Disambiguation:**
   - In `IntentModel.ts`, refine the workflow rule so that instructions containing verbs like `create`, `mkdir`, `put`, `echo`, `write` alongside "save as a workflow" are classified as compound procedural execution with post-save hooks.
4. **Post-Execution Workflow Persistence:**
   - Add a completion listener in `AgentLoop.ts`: if the prompt includes `save ... as a workflow named <id>`, take the executed steps upon success and invoke `DiskWorkflowStorage.getInstance().saveWorkflow(...)`.

---

## Issue 3: Persistent Execution Plan HUD Notification Overlay

### 3.1 Problem Statement
When a workflow plan fails (or finishes), a floating HUD card remains stuck on the top-right corner of the terminal window indefinitely. The card:
1. Does not auto-dismiss or vanish after a timeout.
2. Has no manual close/dismiss button (`X`).
3. Lacks configuration options in Settings to adjust timing or disable floating notifications.
4. Uses saturated purple colors (`#d8b4fe`, `rgba(192, 132, 252, 0.28)`), violating the project's strict grayscale / matte-dark design standard.

**Status: RESOLVED & VERIFIED** (Commit: `8613aca` — Full resolution log in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-3-persistent-execution-plan-hud-notification-overlay))

### 3.2 Code Locations
- [src/presentation/TerminalView.tsx](file:///home/user/project/src/presentation/TerminalView.tsx) (Floating HUD overlay, auto-dismiss timers, manual dismiss, and hover pause)
- [src/ui/components/AiSettingsPage.tsx](file:///home/user/project/src/ui/components/AiSettingsPage.tsx) (Execution Plan HUD & notification duration configuration in General tab)
- [src/ui/__tests__/SettingsCenter.test.ts](file:///home/user/project/src/ui/__tests__/SettingsCenter.test.ts) (Automated test coverage for settings and event propagation)

### 3.3 Technical Root Causes
1. **Unconditional State Persistence on Error:**
   - In `TerminalView.tsx`:
     ```typescript
     } else if (event.type === 'done') {
       setIsPlanOpen(false);
       PromptProgressManager.getInstance().completePrompt(true, event.message);
     } else if (event.type === 'error') {
       PromptProgressManager.getInstance().completePrompt(false, event.message);
     }
     ```
   - On `error`, neither `setIsPlanOpen(false)` nor `setLatestPlan(null)` was called. The `latestPlan` state variable remained populated indefinitely.
2. **Missing Manual Dismiss Button:**
   - The `<details>` HUD card had no dismiss action. Clicking the summary merely toggled collapse, leaving the summary bar on screen permanently.
3. **No Auto-Dismiss Timer:**
   - There was no `setTimeout` to clear `latestPlan` after a completion or failure event.
4. **Missing Settings Options:**
   - No preference existed in `localStorage` or `AiSettingsPage.tsx` to configure notification durations (e.g. 5s, 8s, 15s, persistent, or disabled).
5. **Violation of Grayscale Aesthetic Standards:**
   - The card used saturated purple accent tones (`#d8b4fe`, `rgba(192, 132, 252, 0.28)`), in conflict with AGENTS.md Rule 3.

### 3.4 Implemented Remediation
1. **Manual Dismiss & Collapse Header Actions:**
   - Replaced `<details>` with a floating HUD card component in [TerminalView.tsx](file:///home/user/project/src/presentation/TerminalView.tsx).
   - Added a monochrome `X` dismiss button that immediately cancels any pending dismiss timer and sets `latestPlan(null)`.
   - Added a `ChevronUp` / `ChevronDown` button with click-to-expand/collapse on the header row.
2. **Configurable Auto-Dismiss Timer with Hover Pausing:**
   - Added `schedulePlanDismiss()` and `clearPlanDismissTimer()` in `TerminalView.tsx`.
   - Automatically scheduled dismiss on `done`, `error`, and `agentLoop.run` promise resolution/rejection according to user settings (default: 8 seconds).
   - Attached `onMouseEnter` / `onMouseLeave` handlers to pause dismissal when the user hovers over the card to inspect details, and resume dismissal when the mouse leaves.
3. **User Preferences in Settings Center:**
   - In [AiSettingsPage.tsx](file:///home/user/project/src/ui/components/AiSettingsPage.tsx) under the **General** tab, added a dedicated "Workflow Execution Plan HUD & Notifications" card.
   - Added toggle to enable/disable the HUD overlay (`sentinel_hud_plan_enabled`).
   - Added segmented pill selector for duration (`5s`, `8s (Default)`, `15s`, `Persistent / Manual Close Only`) backed by `sentinel_hud_plan_duration`.
   - Dispatches `sentinel:hud-settings-changed` CustomEvents so all open terminal panes update dynamically without reload.
4. **Strict Grayscale & No-Emoji Standards:**
   - Reskinned the entire card into the project matte dark palette (`rgba(12, 13, 18, 0.96)`, borders `rgba(255, 255, 255, 0.12)` - `0.25`, pure white and muted white typography).
   - Standardized typographical status indicators (`✓` Completed, `✗` Failed, `▸` Running, `⊘` Skipped, `○` Pending).
5. **Automated Test Validation:**
   - Added unit tests in `src/ui/__tests__/SettingsCenter.test.ts` verifying settings persistence and event broadcasting. 100% test pass rate across all 191 test files (1,368 tests).

---

## Issue 4: Linux Desktop / File Manager Context Actions Integration

### 4.1 Problem Statement
On the onboarding screen, the option titled **"Linux Desktop / File Manager Actions"** claims:
> "Registers desktop context menu actions with your graphical file manager (GNOME Nautilus, Nemo, Dolphin, Thunar). Right-click any folder or desktop workspace to spawn Sentinel there."

We need to ensure this option functions across graphical file managers and that clicking "Open in Sentinel" launches the terminal directly within the selected target directory.

**Status: RESOLVED & VERIFIED** (Full resolution log in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-4-linux-desktop--file-manager-context-actions-integration))

### 4.2 Code Locations
- [src/domain/integration/InstallerService.ts](file:///home/user/project/src/domain/integration/InstallerService.ts#L152-L186) (`enableFinderIntegration`)
- [src/ui/components/InstallerWizard.tsx](file:///home/user/project/src/ui/components/InstallerWizard.tsx#L520-L577) (Onboarding option)
- [src/presentation/TerminalView.tsx](file:///home/user/project/src/presentation/TerminalView.tsx#L344-L352) (`createSession`)
- [src/App.tsx](file:///home/user/project/src/App.tsx#L104-L106), [src/App.tsx](file:///home/user/project/src/App.tsx#L705) (`panePaths` initialization)
- [src-tauri/src/process_cmds.rs](file:///home/user/project/src-tauri/src/process_cmds.rs#L120-L123) (`get_launch_args`)
- [packaging/desktop/com.pranav.sentinel-terminal.desktop](file:///home/user/project/packaging/desktop/com.pranav.sentinel-terminal.desktop)

### 4.3 Technical Root Causes
1. **Incomplete File Manager Coverage:**
   - Currently, `enableFinderIntegration()` on Linux only creates scripts in:
     - `~/.local/share/nautilus/scripts/Open in Sentinel Terminal`
     - `~/.local/share/nemo/scripts/Open in Sentinel Terminal`
   - It **does not install actions for Dolphin (KDE Plasma)** (`~/.local/share/kio/servicemenus/sentinel.desktop` or `~/.local/share/kservices5/ServiceMenus/`).
   - It **does not install actions for Thunar (XFCE)** (`~/.config/Thunar/uca.xml`).
   - It **does not register the FreeDesktop MIME action** in `~/.local/share/applications/sentinel.desktop` for `inode/directory`.
2. **Application Ignores CLI Launch Path on Startup:**
   - Even if the file manager executes `sentinel-terminal "/path/to/folder"`, `App.tsx` on startup never calls `invoke('get_launch_args')`.
   - `panePaths` defaults to `~`, meaning the app always starts in the home directory rather than the folder passed via CLI arguments.
3. **Hardcoded Binary Reference in Script:**
   - The launcher script relies on `command -v sentinel-terminal || command -v sentinel`. If the binary is running as a localized executable or AppImage not in the user's `$PATH`, execution fails silently.

### 4.4 Proposed Remediation
1. **Multi-File Manager Registration in `InstallerService.ts`:**
   - **GNOME Nautilus & Nemo:** Maintain scripts in `~/.local/share/nautilus/scripts/` and `~/.local/share/nemo/scripts/`.
   - **KDE Dolphin:** Create `~/.local/share/kio/servicemenus/sentinel_open.desktop` with `ServiceTypes=inode/directory` and `Exec=sentinel "%f"`.
   - **XFCE Thunar:** Register custom action in `~/.config/Thunar/uca.xml` for folder patterns `*`.
   - **FreeDesktop Universal:** Write `~/.local/share/applications/sentinel-terminal.desktop` with `MimeType=inode/directory;x-scheme-handler/sentinel;` and execute `update-desktop-database ~/.local/share/applications` if installed.
2. **Startup Argument Processing in `App.tsx`:**
   - In `App.tsx`, invoke `get_launch_args` during initial mount.
   - If an argument matches an existing directory path or a URL (`sentinel://open?path=...`), set the initial pane path of the first terminal pane to that directory.
3. **Dynamic Binary Path Resolution:**
   - Have the Tauri backend expose the current executable path via `std::env::current_exe()` so the launcher script points directly to the active binary.

---

## Issue 5: VS Code & Cursor IDE Profiles Usability

### 5.1 Problem Statement
The onboarding screen includes:
> "VS Code & Cursor IDE Profiles — Safely registers sentinel under `terminal.integrated.profiles.linux` in your IDE settings. Switch to Sentinel inside your editor's terminal dropdown."

We need to ensure this option is functional, reliable, and provides a proper shell environment inside the editor.

**Status: RESOLVED & VERIFIED** (Full resolution log in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-5-vs-code--cursor-ide-profiles-usability))

### 5.2 Code Locations
- [src/domain/integration/InstallerService.ts](file:///home/user/project/src/domain/integration/InstallerService.ts#L242-L302) (`updateIdeSettings`, `configureVsCodeIntegration`, `configureCursorIntegration`)
- [src/ui/components/InstallerWizard.tsx](file:///home/user/project/src/ui/components/InstallerWizard.tsx#L580-L640)

### 5.3 Technical Root Causes
1. **VS Code Integrated Terminals Expect a Shell / PTY Executable, Not a GUI Window:**
   - `updateIdeSettings()` currently writes:
     ```json
     "terminal.integrated.profiles.linux": {
       "Sentinel Terminal": {
         "path": "sentinel",
         "icon": "terminal",
         "overrideName": true
       }
     }
     ```
   - When a user selects a terminal profile in VS Code or Cursor, the IDE spawns the binary inside the embedded terminal pane using `node-pty`.
   - If `sentinel` points to a GUI window launcher (which spawns Tauri), launching it inside VS Code's terminal pane either crashes the PTY, fails with a WebKit/display error, or spawns a detached external window while the embedded tab sits blank.
2. **Non-Absolute Path Dependency:**
   - `"path": "sentinel"` assumes `sentinel` is accessible in the environment PATH of the process running VS Code. When VS Code is launched from a desktop environment (GNOME Dash / systemd user session), `~/.local/bin` is frequently omitted from PATH, causing VS Code to throw `The terminal process failed to launch: Path does not exist`.
3. **Missing Shell Mode / Subshell Script:**
   - To function properly as an integrated terminal profile, Sentinel needs to provide an interactive CLI shell wrapper (e.g. running `bash` with Sentinel's AI CLI prompt hooks pre-loaded) rather than attempting to render a full Tauri window inside VS Code.

### 5.4 Proposed Remediation
1. **Absolute Binary / Wrapper Path:**
   - In `updateIdeSettings()`, write the absolute path to the executable (e.g. `/home/<user>/.local/bin/sentinel`) rather than the bare command name `sentinel`.
2. **Terminal Shell Wrapper Mode:**
   - Provide a dedicated shell profile script `~/.local/bin/sentinel-shell` that spawns the user's default shell (`bash`/`zsh`) with the Sentinel CLI environment and aliases pre-configured.
   - For users who want the external window, configure `terminal.external.linuxExec` to point to Sentinel Terminal.
3. **Verification in `InstallerWizard.tsx`:**
   - Verify whether VS Code or Cursor settings directories exist prior to configuring, and provide clear user feedback if the editor configuration was applied successfully.

---

## Issue 6: Sentinel CLI Launcher Installation & Execution

### 6.1 Problem Statement
The onboarding screen allows users to install the Sentinel command-line launcher (`sentinel`). We must ensure that the installation succeeds, the binary is placed in PATH, and the command functions properly without errors or recursive loops.

**Status: RESOLVED & VERIFIED** (Full resolution log in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-6-sentinel-cli-launcher-installation--execution))

### 6.2 Code Locations
- [src/domain/integration/InstallerService.ts](file:///home/user/project/src/domain/integration/InstallerService.ts#L70-L145) (`installCli`)
- [src/ui/components/InstallerWizard.tsx](file:///home/user/project/src/ui/components/InstallerWizard.tsx#L418-L515)
- [packaging/desktop/com.pranav.sentinel-terminal.desktop](file:///home/user/project/packaging/desktop/com.pranav.sentinel-terminal.desktop)

### 6.3 Technical Root Causes
1. **Dangerous Recursive Fallback Loop in Launcher Script:**
   - In `InstallerService.ts:110-112`:
     ```bash
     resolved_path=$(cd "$target" 2>/dev/null && pwd || echo "$target")
     if command -v xdg-open >/dev/null 2>&1; then
       xdg-open "sentinel://open?path=$resolved_path" 2>/dev/null || "$APP_BIN" "$resolved_path" 2>/dev/null || sentinel "$resolved_path" 2>/dev/null || true
     else
       "$APP_BIN" "$resolved_path" 2>/dev/null || sentinel "$resolved_path" 2>/dev/null || true
     fi
     ```
   - If `xdg-open` fails and `APP_BIN` ("sentinel-terminal") is not found in PATH, the script calls `sentinel "$resolved_path"`.
   - Because the script itself is named `sentinel`, it executes itself recursively until the shell process limit or stack overflows!
2. **Missing Desktop Scheme Registration:**
   - The script attempts `xdg-open "sentinel://open?path=..."`. However, `com.pranav.sentinel-terminal.desktop` is never installed to `~/.local/share/applications/` during CLI installation. Therefore, `xdg-open` fails on fresh installations.
3. **Hardcoded `$APP_BIN` Assumption:**
   - `$APP_BIN` is hardcoded to `"sentinel-terminal"`. If the user is running the AppImage, Flatpak, or a development build, `sentinel-terminal` is not in `$PATH`.
4. **`~/.local/bin` PATH Presence:**
   - In standard Ubuntu/Debian/Arch installations, `~/.local/bin` is only in PATH if the directory existed when the login shell was created. If `~/.local/bin` was newly created by Sentinel, subsequent commands in active shells will fail with `command not found: sentinel`.

### 6.4 Proposed Remediation
1. **Eliminate Recursive Fallback:**
   - Remove `|| sentinel "$resolved_path"` from the launcher script.
2. **Resolve Real Binary Path on Installation:**
   - In `InstallerService.ts:installCli()`, obtain the actual path of the running executable via Tauri backend and bake it directly into `APP_BIN`.
3. **Install Desktop Entry with Scheme Handler:**
   - When installing the CLI, also copy/write `com.pranav.sentinel-terminal.desktop` into `~/.local/share/applications/` and register the `x-scheme-handler/sentinel` MIME type.
4. **PATH Check & User Guidance:**
   - Verify whether `~/.local/bin` is present in the current PATH. If not, notify the user in the onboarding UI and offer to append `export PATH="$HOME/.local/bin:$PATH"` to their shell configuration (`~/.bashrc` / `~/.zshrc`).

---

## Issue 7: Workflows Section Cleanup & Onboarding Selection

### 7.1 Problem Statement
When opening the Workflows drawer in the terminal, users see 17 pre-existing workflows stored in `~/.sentinel/workflows/` (e.g. `desktop-reset.json`, `cargo-build.json`, `dry-run-pipeline.json`, `db-sync.json`, etc.). Many of these are incomplete stubs left behind from benchmark and CLI test runs.
Users should have an onboarding screen option allowing them to select which starter workflows they want to keep; only the chosen workflows should be installed and displayed.

**Status: RESOLVED & VERIFIED** (Full resolution log in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-7-workflows-section-cleanup--onboarding-selection))

### 7.2 Code Locations
- Current disk workflows: `~/.sentinel/workflows/*.json`
- [src/workflows/templates/StarterWorkflows.ts](file:///home/user/project/src/workflows/templates/StarterWorkflows.ts) (Curated blueprints)
- [src/workflows/storage/DiskWorkflowStorage.ts](file:///home/user/project/src/workflows/storage/DiskWorkflowStorage.ts) (`purgeTestStubs`, `purgeAllWorkflows`, `initializeStarterWorkflows`)
- [src/ui/components/InstallerWizard.tsx](file:///home/user/project/src/ui/components/InstallerWizard.tsx) (Curated Starter Workflows onboarding section)
- [src/ui/components/WorkflowManagerDrawer.tsx](file:///home/user/project/src/ui/components/WorkflowManagerDrawer.tsx) (Clean Stubs & Seed Starters header actions and stubs banner)

### 7.3 Technical Root Causes
1. **Test and Benchmark Artifact Pollution:**
   - Test suites (`AgentLoopWorkflow.test.ts` and `FeatureEnginesIntegration.test.ts`) used `(storage as any).workflowsDir = tmpDir` instead of calling `storage.setCustomBaseDir(tmpDir)`. Because `workflowsDir` was undefined in `DiskWorkflowStorage`, test runs wrote dummy JSON files directly into `~/.sentinel/workflows/`.
   - Sentinel's `DiskWorkflowStorage` reads all `.json` files in that folder, cluttering the drawer with non-functional workflows.
2. **Lack of a Curated Starter Workflow Catalog:**
   - Sentinel lacked a clean, predefined catalog of high-value Linux starter workflows (e.g., Git commits, system health checks, Docker maintenance, port diagnostics).
3. **No Onboarding Selection Step:**
   - `InstallerWizard.tsx` did not include a workflow selection step to allow users to pick what starter templates they want installed.

### 7.4 Implemented Remediation
1. **Curated Starter Workflow Catalog (`StarterWorkflows.ts`):**
   - Created production-ready Linux starter workflows with `schemaVersion: 1`:
     - **Git Quick Sync (`git-quick-sync`):** `git status -s`, `git add -u`, `git commit`, `git push`.
     - **System Diagnostics (`system-diagnostics`):** RAM/swap (`free -h`), CPU load/uptime (`uptime`), root storage (`df -h /`), failed systemd units (`systemctl --failed`).
     - **Network & Open Ports (`network-open-ports`):** Listening sockets (`ss -tulpn`), gateway ping (`ping -c 3 1.1.1.1`), DNS resolution (`getent hosts github.com`).
     - **Docker Hygiene & Cleanup (`docker-prune-clean`):** Container inventory, Docker disk usage (`docker system df`), resource prune (`docker system prune -f`).
     - **Workspace Clean & Rebuild (`workspace-rebuild`):** Clean build caches, toolchain verification, and project compilation.
2. **Onboarding Wizard Starter Workflows Step (`InstallerWizard.tsx`):**
   - Added dedicated "Section 3: Curated Starter Workflows & Macros" in the onboarding wizard.
   - Includes quick-selection actions ("Recommended", "Select All", "Clear").
   - Provides a toggle checkbox: "Clean and remove obsolete test & benchmark stubs from workspace".
   - Renders selectable cards with category icons, step counts, command previews, and recommended badges.
3. **Storage Seeding & Purging Engine (`DiskWorkflowStorage.ts`):**
   - Added `purgeTestStubs()` to detect and remove benchmark artifacts and empty stubs without affecting custom user workflows.
   - Added `purgeAllWorkflows()` and `initializeStarterWorkflows(selectedIds, purgeExisting)`.
4. **Active Workflow Drawer Management (`WorkflowManagerDrawer.tsx`):**
   - Added "Clean Stubs" and "Seed Starters" actions in the drawer header.
   - Displays a banner when test/benchmark stubs are detected in `~/.sentinel/workflows/`.
   - Enhanced empty state with a 1-click "Seed Curated Starter Workflows" button.
5. **Test Fixture Directory Isolation:**
   - Fixed `AgentLoopWorkflow.test.ts` and `FeatureEnginesIntegration.test.ts` to use `storage.setCustomBaseDir(tmpDir)` and reset to `undefined` in `afterEach()`, permanently eliminating test artifact leakage into `~/.sentinel/workflows/`.

---

## Issue 8: Clipboard Paste Failure on Prompt Entry (Ctrl+Shift+V / Ctrl+V)

### 8.1 Problem Statement
When typing an AI prompt starting with `>` (or typing any command) in the terminal and attempting to paste text (such as an instruction, code snippet, or prompt) using `Ctrl+Shift+V` or `Ctrl+V`, nothing is pasted into the terminal buffer. The keystroke is swallowed silently without error feedback or output.

**Status: RESOLVED & VERIFIED** (Commit: `224a50e` — See full resolution post-mortem in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-8-clipboard-paste-failure-on-prompt-entry-ctrlshiftv--ctrlv))

### 8.2 Code Locations
- [src/presentation/TerminalView.tsx](file:///home/user/project/src/presentation/TerminalView.tsx#L310-L320) (`term.attachCustomKeyEventHandler` paste handler)
- [src/presentation/TerminalView.tsx](file:///home/user/project/src/presentation/TerminalView.tsx#L372) (`currentSessionId` vs `sessionId` scope)
- [src/domain/capabilities/ClipboardCapability.ts](file:///home/user/project/src/domain/capabilities/ClipboardCapability.ts) (`@tauri-apps/plugin-clipboard-manager`)

### 8.3 Technical Root Causes
1. **Stale Closure Bug on `sessionId` in `attachCustomKeyEventHandler`:**
   - In `TerminalView.tsx`:
     ```typescript
     // Paste: Ctrl+Shift+V OR Ctrl+V
     if (isCmdOrCtrl && (k === 'v' || event.code === 'KeyV')) {
       if (event.type === 'keydown') {
         navigator.clipboard.readText().then(text => {
           if (text && sessionId) {
             SessionManager.getInstance().write(sessionId, text);
           }
         }).catch(() => {});
       }
       return false;
     }
     ```
   - `attachCustomKeyEventHandler` is registered inside a mount `useEffect(() => {}, [])`.
   - It captures `sessionId` from the component scope, which starts as `initialSessionId` (`undefined`).
   - When `initSession()` runs asynchronously and creates the actual PTY session (`setSessionId(currentSessionId)`), `sessionId` inside the event handler closure remains permanently `undefined`.
   - Consequently, `if (text && sessionId)` constantly evaluates to `false`, and `SessionManager.write` is never called.
2. **Event Cancellation Swallowing Fallback Paste:**
   - The handler unconditionally returns `false`.
   - Returning `false` from `attachCustomKeyEventHandler` instructs xterm.js to halt event propagation and suppress all default terminal paste mechanisms.
   - Because Sentinel's custom handler fails silently due to the stale `sessionId`, and default paste is suppressed, the keystroke is completely swallowed.
3. **Web API Clipboard Permissions in Linux WebViews:**
   - `navigator.clipboard.readText()` is a browser Web API that requires transient user activation and document focus in WebKitGTK / Chromium webviews. Under Linux (X11 / Wayland), it frequently throws `NotAllowedError` or returns empty strings when invoked from a keyboard event hook without an active selection.
   - Sentinel already has `@tauri-apps/plugin-clipboard-manager` installed, which communicates directly with native desktop clipboards via Rust (`wl-clipboard` / `x11-clipboard`), but does not use it inside the terminal view keyboard handler.

### 8.4 Proposed Remediation
1. **Use Mutable Session Ref in Key Event Handler:**
   - Store `currentSessionId` in a mutable React ref (`sessionIdRef.current = currentSessionId`), or reference `currentSessionId` directly inside the session lifecycle, so paste events always resolve the active PTY session.
2. **Native Clipboard Integration with Fallback:**
   - Use `@tauri-apps/plugin-clipboard-manager` `readText()` to reliably read the OS clipboard on Linux (Wayland / X11), with fallback to `navigator.clipboard.readText()`.
3. **Safe Event Propagation:**
   - Once clipboard text is retrieved, write directly to the PTY via `SessionManager.getInstance().write(activeSessionId, text)`. If clipboard access fails or is empty, allow fallback handling rather than silently dropping input.

---

## Issue 9: Arrow Key In-Buffer Line Navigation vs. History Ingestion in Long Prompts

### 9.1 Problem Statement
When a user enters a multi-step or long prompt (e.g. `> Create a temporary testing workspace...`) that wraps across multiple terminal rows, moving the cursor backwards into the text using Left/Right arrow keys and subsequently pressing Up Arrow (`↑`) does not move the cursor to the line above in the prompt. Instead, the underlying shell triggers `previous-history`, obliterating the draft prompt and replacing it with the last executed shell command from history (e.g., `git status` or `ls`).

**Status: RESOLVED & VERIFIED** (Full resolution log in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-9-arrow-key-in-buffer-line-navigation-vs-history-ingestion-in-long-prompts))

### 9.2 Code Locations
- [src/presentation/TerminalView.tsx](file:///home/user/project/src/presentation/TerminalView.tsx#L481-L509) (`term.onData` key routing)
- [src/presentation/TerminalView.tsx](file:///home/user/project/src/presentation/TerminalView.tsx#L280-L330) (`attachCustomKeyEventHandler`)
- [src/domain/terminal/PtyStateTracker.ts](file:///home/user/project/src/domain/terminal/PtyStateTracker.ts)

### 9.3 Technical Root Causes
1. **Direct Unchecked Forwarding of Escape Sequences:**
   - In `term.onData`:
     `sessionManager.write(currentSessionId, data);`
   - When the user presses Up Arrow, `\x1b[A` is passed directly and unmodified to the shell PTY process.
2. **GNU Readline Buffer Model in Bash:**
   - Readline's default keybinding for `\e[A` is `previous-history`.
   - Readline does not treat terminal-wrapped lines as multi-line editing buffers. Even if the cursor is navigated 50 characters to the left (placing it visually on the preceding row of the prompt), pressing Up Arrow commands Readline to discard the line and load the previous history entry.
3. **Lack of In-Prompt State Tracking in TerminalView:**
   - Sentinel intercepts Enter (line 512) and Tab / Right Arrow (line 482 for ghost text completion), but lacks any intercept for Up/Down arrow keys when editing natural language prompts starting with `>`.

### 9.4 Proposed Remediation
1. **Detect Multi-Row Prompts and Contextual Cursor Movement:**
   - In `attachCustomKeyEventHandler` or `term.onData`, inspect `term.buffer.active` when Up Arrow is pressed:
     - Check if the active buffer line starts with `>` or spans multiple visual rows (`buffer.cursorY > startY`).
     - If the cursor is positioned on row 2 or higher of a multi-row prompt, or if the cursor has navigated horizontally within the prompt text, intercept the key event and emit horizontal cursor movements (e.g., `term.cols` Left-Arrow sequences `\x1b[D` to move up one visual line) instead of sending `\x1b[A`.
2. **Shell Readline / Zsh Configuration:**
   - In the managed environment profiles or generated `.inputrc`, bind `\e[A` to `up-line-or-history` and `\e[B` to `down-line-or-history` so shells that support multi-line navigation move lines before switching history entries.

---

## Issue 10: Diminutive Tab Close Button Hit-Target and Sub-Pixel Dot Artifact

### 10.1 Problem Statement
The close button on terminal tabs is barely visible, appearing as a tiny, faint dot or blurry smudge instead of a distinct 'X' vector icon. Users struggle to click it because the hit-target is undersized and visually imperceptible.

**Status: RESOLVED & VERIFIED** (Full resolution log in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-10-diminutive-tab-close-button-hit-target-and-sub-pixel-dot-artifact))

### 10.2 Code Locations
- [src/App.tsx](file:///home/user/project/src/App.tsx#L819-L822) (`<X size={13} strokeWidth={2} />` in `.pill-close-btn`)
- [src/App.css](file:///home/user/project/src/App.css#L85-L120) (`.tab-pill` styles)
- [src/App.css](file:///home/user/project/src/App.css#L130-L153) (`.pill-close-btn` styles)

### 10.3 Technical Root Causes
1. **Microscopic Vector Dimensions:**
   - In `App.tsx:820`:
     `<button className="pill-close-btn" onClick={(e) => closeTab(tab.id, e)} title="Close Tab"><X size={10} /></button>`
   - `size={10}` renders a 10px by 10px SVG box with a 2px stroke. The diagonal vector arms of the 'X' glyph span less than 5 pixels across.
2. **Compounded CSS Opacity Attenuation:**
   - In `App.css`:
     - `.tab-pill` (inactive): `opacity: 0.55;`
     - `.pill-close-btn`: `opacity: 0.45;`
   - The compounded effective opacity is `0.55 × 0.45 ≈ 0.247` (under 25% opacity against a dark background `#101218`).
3. **Sub-Pixel Antialiasing Degradation:**
   - On standard 96-120 DPI Linux monitors, a 10px SVG path rendered at 24% opacity is antialiased down to a 2x2 pixel faint gray blob or single indistinct dot.
4. **Constrained Hit-Box:**
   - The `16px × 16px` button container provides an inadequate click target, leading to frequent mis-clicks that activate or switch tabs rather than closing them.

### 10.4 Implemented Remediation
1. **Expanded Vector Icon Dimensions & Stroke Width:**
   - Upgraded tab close vector icon from `<X size={10} />` to `<X size={13} strokeWidth={2} />` in [`src/App.tsx`](file:///home/user/project/src/App.tsx).
   - Also upgraded split pane close button from `<X size={11} />` to `<X size={12} strokeWidth={2} />`.
2. **Enlarged Container Hit-Target:**
   - Resized `.pill-close-btn` in [`src/App.css`](file:///home/user/project/src/App.css) from `16px × 16px` to a generous `20px × 20px` target with flex centering and a 4px rounded radius.
3. **Enhanced Base Opacity & Grayscale Contrast:**
   - Increased base button opacity to `0.65`, ramping to `0.85` on `.tab-pill:hover`.
   - On `.pill-close-btn:hover`, applied `background-color: rgba(255, 255, 255, 0.12)`, `color: #ffffff`, and `opacity: 1`. Eliminated saturated red accents in strict accordance with grayscale design rules.

---

## Issue 11: Prompt Abnormally Magnifying / Canvas Scaling Glitch on Tab Close

### 11.1 Problem Statement
When closing a terminal tab (or closing a split pane), the shell prompt (`username@hostname:~$`) displayed in front of all commands on screen momentarily balloons or magnifies abnormally before snapping back to normal size, creating a jarring visual UI glitch.

**Status: RESOLVED & VERIFIED** (Full resolution log in [FIXED.md](file:///home/user/project/docs/FIXED.md#issue-11-prompt-abnormally-magnifying--canvas-scaling-glitch-on-tab-close))

### 11.2 Code Locations
- [src/presentation/TerminalView.tsx](file:///home/user/project/src/presentation/TerminalView.tsx#L1057-L1095) (Immediate refit, requestAnimationFrame sync, and visibility control)
- [src/App.tsx](file:///home/user/project/src/App.tsx#L284-L291) (`closeTab` adjacent tab selection)
- [src/App.tsx](file:///home/user/project/src/App.tsx#L1107-L1128) (`terminal-container` tab preservation with `visibility: hidden; position: absolute; inset: 0`)
- [src/App.css](file:///home/user/project/src/App.css#L192-L195) (Crisp canvas bitmap rendering)

### 11.3 Technical Root Causes
1. **HTML5 Canvas Bitmap Stretch During Container Relayout:**
   - In xterm.js (under WebGL or Canvas rendering), characters and glyphs are rendered into an HTML5 `<canvas>` element possessing an internal raster resolution (`canvas.width`, `canvas.height`).
   - When an active tab is closed, the newly selected tab switches from `display: none` (`width: 0, height: 0`) to `display: flex` / `block`.
   - The browser's layout engine instantly expands the canvas display style (`width: 100%; height: 100%`) to fill the full viewport.
   - Because the internal raster buffer retains its previous dimensions, the browser GPU compositor stretches the bitmap to fit the enlarged container, magnifying all rendered text (most noticeably the high-contrast `username@hostname:~$` prompt) by 200%-300%.
2. **Asynchronous 50ms Fit Delay:**
   - In `TerminalView.tsx:942`:
     ```typescript
     if (isActive && fitAddonRef.current && xtermRef.current) {
       setTimeout(() => {
         fitAddonRef.current?.fit();
         ...
       }, 50);
     }
     ```
   - For 50 milliseconds (3 to 6 display frames at 60Hz/120Hz), the stretched, pixelated canvas remains visible on screen before `fitAddon.fit()` recalculates cell dimensions and redraws the canvas at native resolution.
3. **DOM Renderer Fallback on Component Disposal:**
   - When `term.dispose()` runs on the closing tab, `WebglAddon.dispose()` destroys the WebGL context, temporarily falling back to unstyled DOM rows (`<span>` tags) before unmounting from the DOM.
4. **Split Pane Expansion:**
   - When a split pane is closed, the remaining pane's container width immediately doubles from 50% to 100%, causing the existing canvas bitmap to stretch horizontally by 200% until `ResizeObserver` triggers a refit.

### 11.4 Implemented Remediation
1. **Preserve Viewport Geometry with Visibility Toggling:**
   - In [`src/App.tsx`](file:///home/user/project/src/App.tsx) and [`src/presentation/TerminalView.tsx`](file:///home/user/project/src/presentation/TerminalView.tsx), replaced `display: activeTabId === tab.id ? 'flex' : 'none'` with `visibility: isTabActive ? 'visible' : 'hidden'`, `position: isTabActive ? 'relative' : 'absolute'`, `inset: 0`, and `pointerEvents: isTabActive ? 'auto' : 'none'`.
   - Inactive tabs remain fully mounted with exact viewport dimensions in the background DOM, preventing canvas resolution collapse to 0x0.
2. **Immediate Synchronous Refit with RequestAnimationFrame Follow-up:**
   - Removed the 50ms `setTimeout` completely. When a tab becomes active, `TerminalView` executes `fitAddon.fit()` synchronously on the current thread, followed by an immediate `requestAnimationFrame` pass to guarantee zero-latency raster synchronization.
3. **Smooth Adjacent Tab Selection:**
   - Updated `closeTab` in [`src/App.tsx`](file:///home/user/project/src/App.tsx) to select the neighbor tab at the closing index (`newTabs[Math.min(closingIndex, newTabs.length - 1)]`) rather than jumping unconditionally to the end of the tab strip.
4. **Crisp Canvas Rendering:**
   - Added `image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;` to `.terminal-container .xterm-screen canvas` in [`src/App.css`](file:///home/user/project/src/App.css) to eliminate GPU bilinear interpolation blur during container transitions.

---

## Summary Matrix of Required Changes

| Item | Primary Components | Type | Complexity | Status |
|---|---|---|---|---|
| **1. Cloud API Connection Test** | `CloudApiProvider.ts`, `AiSettingsPage.tsx` | Bug Fix & Resilience | Low-Medium | **Resolved** (`5daff74`) |
| **2. Multi-Step Workflow Failure** | `AdaptivePlanEngine.ts`, `ShellSDKCapability.ts`, `IntentModel.ts` | Bug Fix & Architecture | Medium-High | Needs Fix |
| **3. Persistent HUD Overlay** | `TerminalView.tsx`, `AiSettingsPage.tsx` | UI Bug Fix & Settings | Low-Medium | **Resolved** (`8613aca`) |
| **4. Linux File Manager Actions** | `InstallerService.ts`, `App.tsx`, `TerminalView.tsx` | Feature & Bug Fix | Medium | **Resolved** |
| **5. IDE Profiles Integration** | `InstallerService.ts`, `InstallerWizard.tsx` | Refactor & Reliability | Medium | **Resolved** |
| **6. Sentinel CLI Launcher** | `InstallerService.ts`, `packaging/` | Bug Fix & Safety | Medium | **Resolved** |
| **7. Workflows Onboarding Selection** | `InstallerWizard.tsx`, `DiskWorkflowStorage.ts`, `StarterWorkflows.ts` | New Feature & Cleanup | Medium | **Resolved** |
| **8. Clipboard Paste on Prompt Entry** | `TerminalView.tsx`, `src/utils/clipboard.ts` | Bug Fix | Low-Medium | **Resolved** (`224a50e`) |
| **9. Arrow Key In-Buffer Navigation** | `TerminalView.tsx`, `PromptNavigationEngine.ts` | Architecture & UX | Medium | **Resolved** |
| **10. Tab Close Button Visibility** | `App.tsx`, `App.css` | UI Polish | Low | **Resolved** |
| **11. Tab Close Canvas Scaling Glitch** | `TerminalView.tsx`, `App.tsx`, `App.css` | UI Bug Fix | Low-Medium | **Resolved** |
| **12. Release Webview White Screen & Live Logging** | `src-tauri/`, `packaging/`, `DiagnosticLogger.ts` | Bug Fix & Diagnostics | Medium | **Resolved** |

---

## Issue 12: Release Webview White Screen & Live Diagnostic Logging System

### 12.1 Problem Statement
When installing and launching Sentinel Terminal from the Arch Linux release package (`sentinel-terminal-bin-2.0.0-3-x86_64.pkg.tar.zst`), the application opened to a blank white screen with:
```
Could not connect to localhost: Connection refused
```
No interface rendered, terminal prompts were inaccessible, and when launched via terminal, silent background disowning prevented diagnosing the failure.

### 12.2 Resolution Status
- **Status:** **Resolved & Verified** (Release: `2.0.0-4`)
- **Automated Validation:** 100% test pass rate across 193 test files (1,388 tests, 0 failures).
- **Packaging:** Automated build script verified asset embedding with `tauri://localhost` and generated `sentinel-terminal-bin-2.0.0-4-x86_64.pkg.tar.zst`.

### 12.3 Root Cause & Remediation Summary
1. **Root Cause**: `src-tauri/Cargo.toml` lacked default `custom-protocol = ["tauri/custom-protocol"]`. In Tauri v2, `tauri-macros::generate_context` checks `cfg!(not(feature = "custom-protocol"))`, defaulting to development mode (`cargo:dev=true`) and loading `devUrl` (`http://localhost:1420`).
2. **Remediation**:
   - Added `[features]` default with `custom-protocol = ["tauri/custom-protocol"]`.
   - Built native diagnostic logger in `src-tauri/src/logger.rs` with zero-emoji format and flag detection (`--debug`, `-d`, `--verbose`, `-v`, `SENTINEL_DEBUG=1`).
   - Attached webview URL validation in `src-tauri/src/lib.rs`.
   - Created frontend `DiagnosticLogger` in `src/infrastructure/logging/DiagnosticLogger.ts` bridging `window.onerror`, `unhandledrejection`, `console.error`, and `console.warn` into the terminal stream.
   - Enhanced CLI launchers (`packaging/arch/sentinel` and `InstallerService.ts`) to stream logs attached in the foreground when debug flags are provided.
   - Hardened `packaging/arch/build-pacman.sh` and bumped `PKGBUILD` to `pkgrel=4`.

---
*Document generated for pair-programming reference following repository guidelines (Zero Emojis, Grayscale Standards, Full Screens).*
