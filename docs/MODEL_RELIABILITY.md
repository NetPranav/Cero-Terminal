# Sentinel Terminal — Model Reliability Benchmark & Tracking

Tracks the reliability, determinism, and tool-calling accuracy of Sentinel Terminal's built-in local models and provider backends.

---

## 1. Reliability Test Architecture (Task 3.1)

- **Test Runner:** [`scripts/eval/reliability.mts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/scripts/eval/reliability.mts) (`npm run eval:model`)
- **Evaluation Dataset:** [`scripts/eval/cases.json`](file:///Users/pranav/Project%20Folder/AI%20Terminal/scripts/eval/cases.json) (70 test cases)
- **Decision Engine Interface:** [`src/ai/agent/DecisionCall.ts`](file:///Users/pranav/Project%20Folder/AI%20Terminal/src/ai/agent/DecisionCall.ts)
  - Uses the exact runtime decision call path (`buildDecisionCall`) to ensure evaluation tests real production execution rather than synthetic prompts.
- **Repeat Count:** 10 evaluation iterations per case to accurately measure stability and flip rates.

### Core Metrics

1. **`pass@1`:** Percentage of single decision runs that correctly satisfy all expected criteria (valid JSON action, matching tool/action type, required inclusions, and zero forbidden operations).
2. **`flip rate`:** Percentage of test cases that yield two or more distinct answers across repeated iterations (measuring non-determinism).
3. **`median ms`:** Median inference latency in milliseconds.

---

## 2. Benchmark History & Baselines

| Date | Model | Provider / Mode | Cases | Runs | `pass@1` | `flip rate` | Median Latency | Notes |
|------|-------|-----------------|-------|------|----------|-------------|----------------|-------|
| 2026-10-02 | Qwen2.5-Coder-3B Q4_K_M | Built-in Llama.cpp (Default) | 70 | 700 | 78.4% | 18.6% | 480 ms | Pre-optimization baseline (`temperature: 0.05`, no seed) |
| Target | Qwen2.5-Coder-3B Q4_K_M | Phase 3 Optimized | 70 | 700 | **≥ 95.0%** | **≤ 3.0%** | < 450 ms | Phase 3 completion target |

---

## 3. Causes of Inconsistency & Mitigation Roadmap

| Root Cause | Code Location | Observed Impact | Phase 3 Resolution |
|------------|---------------|-----------------|--------------------|
| Non-zero temperature & missing seed | `EmbeddedProvider.ts`, `AgentLoop.ts` | Model samples different tokens across identical requests (`flip rate: 18.6%`) | Task 3.2: Set `temperature: 0`, `top_k: 1`, `top_p: 1`, `seed: 42` for decision mode |
| Cache reuse between varied requests | `embedded_server.rs` `--cache-reuse 256` | Reused KV prompt cache subtly shifts token logits | Task 3.2: Disable prompt caching on single-slot decision queries |
| Context overflow & truncation | `SystemPrompt.ts` (19.6 KB) + context (8192) | System prompt drops from beginning when history grows | Task 3.3: ContextBudget manager, trim system prompt to 9 KB |
| Action validation & retry | `AgentLoop.ts` heuristic fallback | Unvalidated actions executed directly or failed to chat | Task 3.4: ActionGate with one-shot repair before user clarification |
| Deterministic CLI commands reaching LLM | `AgentLoop.ts` | 3B model occasionally flubs standard directory or app operations | Task 3.5: Pre-model deterministic domain routers |
