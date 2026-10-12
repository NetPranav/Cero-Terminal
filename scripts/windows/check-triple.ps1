# The three checks every change must pass before it is committed (AGENTS.md):
# the Vitest suite, the frontend build (tsc + Vite) and the Rust check.
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\check-triple.ps1
#
# Stops at the first check that fails and exits with its code.

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

$checks = @(
    @{ Name = 'npm test'; Run = { npm test } },
    @{ Name = 'npm run build'; Run = { npm run build } },
    @{ Name = 'cargo check'; Run = { cargo check --manifest-path src-tauri/Cargo.toml } }
)

foreach ($check in $checks) {
    Write-Host "==> $($check.Name)"
    & $check.Run
    if ($LASTEXITCODE -ne 0) {
        Write-Host "check-triple: $($check.Name) failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

Write-Host 'check-triple: all three checks passed'
