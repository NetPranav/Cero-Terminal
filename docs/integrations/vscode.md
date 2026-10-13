# Visual Studio Code terminal integration

Not available on Windows yet (roadmap 3.8). Settings, Desktop Integrations shows "Not available on Windows yet" and
does not touch your VS Code settings.

## Planned
Cero will merge a `Cero Shell` profile into `terminal.integrated.profiles.windows` in
`%APPDATA%\Code\User\settings.json` without changing your other profiles. The profile will start PowerShell with the
Cero shell integration (`CERO_TERMINAL=1`, the OSC prompt markers), so the integrated terminal behaves like a Cero
tab. Until then you can add a profile of your own that starts `pwsh.exe` (or `powershell.exe`) with
`-NoLogo -NoExit`.
