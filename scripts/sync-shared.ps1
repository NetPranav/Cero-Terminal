<#
==============================================================================
 Cero — Cross-Platform Shared Core Synchronizer (PowerShell)

 Use this script on Windows PowerShell to pull ONLY the OS-agnostic shared core
 (Tools, AI Planning Engine, React UI, Workflows, Security Policy) without
 touching Windows-specific PTY, Rust crates, or OS capability drivers.

 Usage:
   powershell -ExecutionPolicy Bypass -File .\scripts\sync-shared.ps1 [source_branch]

 Default source_branch: origin/main
==============================================================================
#>

param(
  [string]$SourceBranch = "origin/main"
)

$ErrorActionPreference = "Stop"

try {
  $CurrentBranch = git rev-parse --abbrev-ref HEAD
} catch {
  Write-Error "Failed to detect current git branch. Ensure you are inside the Cero repository."
  exit 1
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "🔄 Cero — Shared Core Synchronizer" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "📌 Current Branch : $CurrentBranch" -ForegroundColor White
Write-Host "🌐 Source Branch  : $SourceBranch" -ForegroundColor White
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray

Write-Host "📥 Fetching latest commits from origin..." -ForegroundColor Yellow
git fetch origin main

Write-Host "📦 Pulling shared layers:" -ForegroundColor Yellow
Write-Host "   - tools/                 (All 101 tool schemas, tests, knowledge, examples)" -ForegroundColor DarkGray
Write-Host "   - src/ai/                (Agent loop, AdaptivePlanEngine, prompts, intent)" -ForegroundColor DarkGray
Write-Host "   - src/presentation/      (React UI, TerminalView, OutputFormatter, styling)" -ForegroundColor DarkGray
Write-Host "   - src/workflows/         (Execution engine, templates, state machines)" -ForegroundColor DarkGray
Write-Host "   - src/domain/security/   (PolicyEngine, ExecutionEngine permissions, audit)" -ForegroundColor DarkGray

git checkout $SourceBranch -- `
  tools/ `
  src/ai/ `
  src/presentation/ `
  src/workflows/ `
  src/domain/security/

Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray
Write-Host "✅ Successfully synced shared core from $SourceBranch into $CurrentBranch!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Review changes : git status" -ForegroundColor Cyan
Write-Host "  2. Run tests      : npm test" -ForegroundColor Cyan
Write-Host "  3. Commit updates : git commit -m 'chore(sync): update shared core from $SourceBranch'" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
