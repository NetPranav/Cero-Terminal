# Roadmap

The plan for the twelve Linux findings is finished as far as it can be checked without a Linux desktop.
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

1. Run `docs/LINUX_TEST_REPORT.md` on Ubuntu, Fedora, Arch, AppImage and Flatpak; fix what fails.
2. Re-run `npm run eval:model -- --agent --runs 2` on a machine with more memory and lift `pass@1` toward 95%
   (typo prompts, questions answered with a command, the remaining model-routed requests).
3. Check the macOS Finder icon and the Windows installer registration, then release each platform from its own branch.
4. Re-run the 17 stress requests that need the model (`TESTS=tests3.ts npm run stress`).
