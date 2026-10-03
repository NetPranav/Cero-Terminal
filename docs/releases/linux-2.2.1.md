## Cero 2.2.1 for Linux

A fix release for 2.2.0. Install it over 2.2.0; your settings, workflows and keys carry over.

**Downloads**
- Arch, Manjaro, EndeavourOS: `cero-terminal-bin-2.2.1-1-x86_64.pkg.tar.zst`
- Ubuntu 22.04 or later, Debian 12, Mint, Pop!_OS: `Cero_2.2.1_amd64.deb`
- Fedora 38 or later, openSUSE: `Cero-2.2.1-1.x86_64.rpm`
- Any other x86_64 distribution: `Cero_2.2.1_amd64.AppImage`

Checksums: `SHA256SUMS.txt`.

**What is fixed**

| You saw | Now |
|---|---|
| Ctrl+C and the prompt queue could disagree about what was running | Ctrl+C and the queue always keep one consistent state; the queue panel is more compact, and its "not saved across restarts" note is a tooltip on the title. |
| An approval request could take over a prompt you were writing | An approval request never takes over a prompt being written. |
| Arrow keys and paste could commit or duplicate suggestion (ghost) text | Arrows and paste can no longer commit or duplicate suggestion text. |
| Esc handling in Settings was not reliably tested | Esc closes Settings through one tested handler that consumes the key. |
| The status bar and restart did not always follow the model in use | The status bar and restart restore follow the real active model. |
| "Open folder X" failed for some ways of naming a folder or app | More ways to name an existing folder or app are understood, checked against a real directory tree. |
| A saved workflow was not always found again by name, and some "save as workflow" phrasings were ignored | A saved workflow is found again by name, and more save phrasings are understood. |
| The built-in model and API models could be held to different standards | Both are held to the same decision call; grammar whitespace is bounded. |

Docs for Ctrl+C and queue behaviour, ghost-text accept, Esc in Settings, and saving workflows by sentence were updated.

**Not verified yet:** these packages were built on Arch Linux. Only the Arch package has been installed and run here; the deb, rpm and AppImage were built but not run on their own distributions. Please report problems.
