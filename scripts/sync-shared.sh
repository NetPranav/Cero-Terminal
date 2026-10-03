#!/usr/bin/env bash
# ==============================================================================
# Cero — Cross-Platform Shared Core Synchronizer
#
# Use this script on Windows (Git Bash / WSL), Linux, or macOS to pull ONLY the
# OS-agnostic shared core (Tools, AI Planning Engine, React UI, Workflows,
# Security Policy) from the source branch without touching platform-specific
# Rust code, PTY drivers, or OS scripts.
#
# Usage:
#   ./scripts/sync-shared.sh [source_branch]
#
# Default source_branch: origin/main
# ==============================================================================

set -e

SOURCE_BRANCH="${1:-origin/main}"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "================================================================="
echo "🔄 Cero — Shared Core Synchronizer"
echo "================================================================="
echo "📌 Current Branch : $CURRENT_BRANCH"
echo "🌐 Source Branch  : $SOURCE_BRANCH"
echo "-----------------------------------------------------------------"

# Fetch latest updates from remote
echo "📥 Fetching latest commits from origin..."
git fetch origin main

# Checkout only the shared directories
echo "📦 Pulling shared layers:"
echo "   - tools/                 (All 101 tool schemas, tests, knowledge, examples)"
echo "   - src/ai/                (Agent loop, AdaptivePlanEngine, prompts, intent)"
echo "   - src/presentation/      (React UI, TerminalView, OutputFormatter, styling)"
echo "   - src/workflows/         (Execution engine, templates, state machines)"
echo "   - src/domain/security/   (PolicyEngine, ExecutionEngine permissions, audit)"

git checkout "$SOURCE_BRANCH" -- \
  tools/ \
  src/ai/ \
  src/presentation/ \
  src/workflows/ \
  src/domain/security/

echo "-----------------------------------------------------------------"
echo "✅ Successfully synced shared core from $SOURCE_BRANCH into $CURRENT_BRANCH!"
echo ""
echo "Next steps:"
echo "  1. Review changes : git status"
echo "  2. Run tests      : npm test"
echo "  3. Commit updates : git commit -m 'chore(sync): update shared core from $SOURCE_BRANCH'"
echo "================================================================="
