#!/bin/bash
# Headless stress test: the real AgentLoop against the local llama-server, in a sandbox.
#   npm run stress                      50 requests (tests.ts)
#   TESTS=tests2.ts npm run stress      20 holdout requests
#   ONLY=csv-sum,fix-buggy npm run stress
# Results: scripts/stress/.runs/results.jsonl, one JSON line per request.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
if ! curl -sf -m 3 http://127.0.0.1:8847/health >/dev/null; then
  echo "The local engine is not running on port 8847. Start it with, for example:"
  echo "  ~/.sentinel/bin/llama-server -m ~/.sentinel/models/qwen2.5-coder-3b-instruct-q4_k_m.gguf --port 8847 -ngl 99 -c 8192 -np 1 --cache-reuse 256"
  exit 2
fi
"$DIR/setup.sh"
RUNS="$DIR/.runs"
cd "$ROOT"
# The agent sees a sandbox HOME: nothing it runs can touch your real home folder
HOME="$RUNS/home" ZDOTDIR="$RUNS/home" SENTINEL_CMD_TIMEOUT_MS=120000 \
  TESTS="${TESTS:-tests.ts}" OUT="${OUT:-results.jsonl}" ./node_modules/.bin/tsx "$DIR/harness.mts"
