# Workflows

A workflow is a `.flow` file: a list of actions (install, run, clone, download, open a site, app or folder) that Cero
can run again, on any OS. The file format, how to write one by hand, and what the approval looks like are in
[FLOW_FILES.md](FLOW_FILES.md). This page is about how workflows get made, stored and replayed in the app.

## Making one
1. **Save what just ran.** Add the save words anywhere in a request. Cero runs the task, then writes a `.flow` from the
   steps that really ran:
   ```text
   >clean build output, run the tests and package it :: save as workflow release-prep
   >open spotify and save this as a workflow called music
   >save the last 3 steps as a workflow called deploy
   ```
   (`SaveIntent.ts`, `MultistagePromptDecomposer.ts`, `WorkflowRecorder.ts`, `FlowFromSteps.ts`.)
2. **Ask for one.** `>make me a workflow called morning that opens gmail and spotify`; Cero asks where to save it
   (`FlowAuthoring.ts`).
3. **Write the JSON yourself.**

Every request to save ends with `Saved workflow "name" (N steps) to <path>` or `Not saved: <reason>` (the task failed, you
cancelled, nothing in it can be repeated, or there was nothing earlier to save). Failed steps and your own questions are
never saved. An existing file is never replaced (`name-2.flow`).

## Where they live
`~/.cero/workflows/<name>.flow` (or the place you choose: Desktop, this folder, a path). Older `.json` workflows are
migrated on first launch and the originals are kept as `.json.bak`. Starter workflows for Linux come from
`templates/StarterWorkflows.ts`.

## Running one
- `run the workflow <name>`, `run the workflow in deploy.flow`, or double-click the file.
- Replay costs no model call. Commands are chosen for the current OS (`CrossPlatformCommandAdapter.ts`).
- Anything that installs or runs a command shows one approval card listing every command; nothing runs until you click
  **Run**. Each step is then typed into the terminal so you can answer prompts, and the run stops at the first failure.
- Desktop-only flows (open sites, apps, folders) run without a terminal.

## Workflow Manager (`Ctrl+Shift+W`)
Lists saved workflows with their steps and run history, and replays or deletes them. In Visual mode the status bar has a
Workflows button for the same drawer.

## Not built yet
Variables and parameters, branching and loops, triggers (cron, login, file changes), sharing by link and workflow
templates exist as modules in `src/workflows/` but are not connected to the app. See
[FUTURE_SCOPE.md](FUTURE_SCOPE.md) and [WORKFLOW_FOLDER.md](WORKFLOW_FOLDER.md).
