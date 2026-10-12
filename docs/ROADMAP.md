# Roadmap (2.2.0 record)

The plan for the twelve findings of the first Linux test is finished as far as it could be checked.
The record of what was done, how, and what was measured is `docs/completed_roadmap.md`. The original plan is in git
history (`git show 18a7e44:docs/ROADMAP.md`).

## Done

| Phase | Subject | Status |
|---|---|---|
| 1 | Esc, saved provider, status bar, arrow keys | done, logic tested |
| 2 | Cancel signal, Ctrl+C, queue panel | done, logic tested |
| 3 | Built-in model: eval harness, determinism, context budget, action gate | done; flip rate 0.0%, `pass@1` 83.1% (target 95% not met) |
| 4 | `.flow` writer, icon, OS registration, single instance | implemented; not run on Linux, Windows or a built macOS app |
| 5 | Save a workflow from a prompt | done, tested headless |
| 6 | Open folders and apps by name, ask, remember | done, tested headless |
| 7 | Same sampling and parsing for every provider, API retry offer, keychain | done; real keychains and a real API model not exercised |
| 8 | Verify and release | matrix written, not run; 2.2.0 prepared, not published |

## Next

The plan for this branch is the Windows port: [../ROADMAP.md](../ROADMAP.md) (phases 0 to 10), with progress in
[../COMPLETION.md](../COMPLETION.md). Linux changes made after the port began are reviewed and ported one by one
(roadmap 1.5).
