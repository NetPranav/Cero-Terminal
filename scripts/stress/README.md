# Headless stress test

Runs complex requests through the real `AgentLoop` with the local model, the way the app does
(`os` from the host, a pane id, the terminal registry). Other terminals are real pseudo-terminals
(`ptyrelay.py`), so tabs, busy state, prompts and Ctrl+C behave as in the app.

- `tests.ts`: 50 requests (chains, tricky commands, diagnosis and editing, terminals, refusals,
  app functions, workflows, ROS).
- `tests2.ts`: 20 holdout requests, written after the fixes, to check that they generalise.
- Each request has an automatic check (files created, output, refusals).
- Every confirmation is recorded. Commands with `rm`, `kill`, `sudo`, `open`, `osascript` and
  similar are denied unless a test allows them.
- The agent runs with a sandbox `HOME`.

Requirements: macOS or Linux, `python3`, and llama-server on port 8847 (see `run.sh`).

```
npm run stress
TESTS=tests2.ts npm run stress
```

Results from the 2026-09-29 pass are in git history (`git show 4c5fff9:docs/ROADMAP.md`, section 8). Task 8.2 of the current `docs/ROADMAP.md` extends this suite.
