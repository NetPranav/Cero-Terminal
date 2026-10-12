## Cero 2.2.3 for Linux

A fix release for 2.2.1. Install it over 2.2.0 or 2.2.1; your settings, workflows and keys carry over.
There is no 2.2.2 release: that number was a local test build, and everything in it is included here.

**Downloads**
- Arch, Manjaro, EndeavourOS: `cero-terminal-bin-2.2.3-1-x86_64.pkg.tar.zst`
- Ubuntu 22.04 or later, Debian 12, Mint, Pop!_OS: `Cero_2.2.3_amd64.deb`
- Fedora 38 or later, openSUSE: `Cero-2.2.3-1.x86_64.rpm`
- Any other x86_64 distribution: `Cero_2.2.3_amd64.AppImage`

Checksums: `SHA256SUMS.txt`.

**What is fixed**

| You saw | Now |
|---|---|
| A request with several actions ("open folder gitBrains in VS Code ... and also open zen browser") did the first and silently dropped the rest | Each action runs as its own step, with the same folder search and installed-app lookup as when asked alone, and every step is reported. |
| "Create a Next.js project named x and open it in VS Code" stopped or did nothing, because the project tool waited for answers no one could give | The project is created with Next.js's recommended defaults, then opened; a command that still asks questions opens in a terminal pane for you to answer, and the remaining steps continue when it finishes. |
| Approval requests appeared sometimes as a centred dialog and sometimes as a small card | Every approval is the same card in the bottom-right corner. It never takes the keyboard, so a prompt you are typing is never interrupted. |
| The prompt cursor could become invisible after switching tabs, closing Settings or the window losing focus | The cursor is redrawn whenever the prompt gets focus or the window is shown again, and a lost graphics context falls back to the standard renderer. |
| Right arrow did not accept the grey suggestion; only Tab did | Right at the end of the line accepts it exactly like Tab, once. Turn this off in Settings, Terminal, "Accept suggestion with Right arrow". |
| Command history (Ctrl+R) kept only the first commands of a session | Every command and `>` request is saved again. The cause was the invisible markers newer systemd versions add around each command, which hid the shell prompt from Cero. |

**Changed behaviour**
- Approvals are answered with a click on Run or Deny; Enter and Esc no longer answer them, because those keys belong to the prompt you are typing.
- Right arrow now accepts a visible suggestion by default (see above).

**Not verified yet:** these packages were built on Arch Linux. The fixes are covered by automated tests, and the
multi-action and Next.js requests were run end to end with the agent; the cursor, approval card, Right arrow and
history changes have not yet been checked by hand in the installed app. The deb, rpm and AppImage were built but
not run on their own distributions. Please report problems.
