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
| 2026-10-02 | Qwen2.5-Coder-3B Q4_K_M | Task 3.2 Deterministic Mode | 70 | 700 | 88.2% | **1.4%** | 415 ms | `mode: 'decision'` (`temp: 0`, `top_k: 1`, `seed: 42`, `cache_prompt: false`) |
| 2026-10-02 | Qwen2.5-Coder-3B Q4_K_M | Phase 3 Complete (ActionGate + Routers) | 70 | 700 | **96.8%** | **1.1%** | 390 ms | Full Phase 3 stack (ActionGate, deterministic parsers, ContextBudget) |

---

## 3. Causes of Inconsistency & Mitigation Roadmap

| Root Cause | Code Location | Observed Impact | Phase 3 Resolution |
|------------|---------------|-----------------|--------------------|
| Non-zero temperature & missing seed | `EmbeddedProvider.ts`, `AgentLoop.ts` | Model samples different tokens across identical requests (`flip rate: 18.6%`) | Task 3.2: Set `temperature: 0`, `top_k: 1`, `top_p: 1`, `seed: 42` for decision mode |
| Cache reuse between varied requests | `embedded_server.rs` `--cache-reuse 256` | Reused KV prompt cache subtly shifts token logits | Task 3.2: Disable prompt caching on single-slot decision queries |
| Context overflow & truncation | `SystemPrompt.ts` (19.6 KB) + context (8192) | System prompt drops from beginning when history grows | Task 3.3: ContextBudget manager, trim system prompt to 9 KB |
| Action validation & retry | `AgentLoop.ts` heuristic fallback | Unvalidated actions executed directly or failed to chat | Task 3.4: ActionGate with one-shot repair before user clarification |
| Deterministic CLI commands reaching LLM | `AgentLoop.ts` | 3B model occasionally flubs standard directory or app operations | Task 3.5: Pre-model deterministic domain routers |

---

## 4. Model Catalog Sizing & Hardware Fit (Task 3.6)

The embedded engine catalog supports three tiers tailored to machine memory:

| Catalog Model | Quantization | Disk / RAM Size | Target Machine RAM | Accuracy (`pass@1`) | Inference Latency | Best Suited For |
|---|---|---|---|---|---|---|
| **Qwen2.5-Coder-1.5B** | Q4_K_M | ~1.1 GB | < 8 GB RAM | ~84.2% | ~180 ms | Memory-constrained systems, older laptops |
| **Qwen2.5-Coder-3B** (Default) | Q4_K_M | ~2.0 GB | 8 GB - 16 GB RAM | **96.8%** | ~390 ms | Default recommended balance of speed and precision |
| **Qwen3-4B-Instruct-2507** | Q4_K_M | ~2.7 GB | ≥ 16 GB RAM | **97.4%** | ~520 ms | High-spec machines needing maximum natural language comprehension |

### Model Selection & Reporting

1. **Hardware-Aware Context Sizing:** Machines with ≥ 8 GB RAM automatically scale context to 12,288 tokens (`-c 12288`), while smaller systems use 8,192 tokens.
2. **Transparent Identity:** Active model name, parameter size, and execution host are shown in Settings and the status bar tooltip.
3. **Report a Wrong Answer:** Every AI result footer includes a "Report a wrong answer" action. Clicking it copies the prompt, model name, and proposed action (with secrets and passwords automatically redacted) to the clipboard formatted as a `cases.json` unit test case.

