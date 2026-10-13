# Linux port log

`windows` never merges `linux-v2-update` again (ROADMAP 1.5). Linux changes are reviewed here and ported by hand.

**Last reviewed Linux commit: `2b1b561`** (`linux-v2-update`, reviewed 2026-10-13)

## How to review
1. `git log --oneline <last reviewed>..linux-v2-update`
2. Per commit, decide one of:
   - **cherry-pick**: OS-neutral change. `git cherry-pick -x <commit>`, then remove any Linux-only part.
   - **port**: fixes Linux-specific code. Write the Windows equivalent with a test and name the Linux commit in the message.
   - **skip**: Linux only, nothing to do on Windows.
3. Run `npm run check:triple`, then add rows below and move "Last reviewed" forward.

Fixes for OS-neutral bugs found on Windows go to `linux-v2-update` first (or are cherry-picked there, as below), so
the two lines do not fork on shared code.

## Log

| Linux commit | Date | Decision | Windows commit | Note |
|---|---|---|---|---|
| `77fd178` | 2026-10-12 | merged once | `0342a4f` | The single merge (1.3). Everything up to here is in `windows`; Linux-only parts were removed in 1.4. |
| `2b1b561` | 2026-10-12 | already on Windows | `1de1eb8` | `fix(test): escape listener is removed when Settings closes`. The change started on `windows` (Node 22 ignores the bare `true` capture flag on `removeEventListener`, so CI failed on every OS) and was cherry-picked to `linux-v2-update` with `-x`. Do not port it back. |
