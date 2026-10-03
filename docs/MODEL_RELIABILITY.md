# Cero — Model Reliability Benchmark & Tracking

Tracks the reliability, determinism, and tool-calling accuracy of Cero's built-in local models and provider backends.

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

## 2. Measured results

Everything in this table was measured, on one machine: Apple A18 Pro, 8 GB RAM, Qwen2.5-Coder-3B Q4_K_M in
`llama-server` (`-c 8192 -np 1 --cache-reuse 256`), 71 cases from `scripts/eval/cases.json`, 2 runs per case,
2026-10-02. Latency here is slow because the machine is small and was shared with other apps; it says
nothing about a desktop Linux machine.

| Mode | Runs | `pass@1` | flip rate | median latency | Notes |
|---|---|---|---|---|---|
| Raw model decision (`npm run eval:model`) | 142 | **83.1%** | **0.0%** | 11.3 s | Deterministic sampling works: the same prompt gave the same answer every time. |
| Whole agent path, commands recorded not run (`--agent`, first version, no policy layer) | 142 | 80.3% | 2.8% | 21.4 s | Code routes, then the model, then the action gate. |

Targets in the plan: `pass@1 >= 95%` and flip rate `<= 3%`. **The flip target is met; the `pass@1` target is not.**
What the misses are (raw mode): typo-heavy prompts ("opn firefoc" chose Chrome, "opne gitBrans"), a model answering
"how does binary search work?" with a shell `echo`, a folder opened with `cd`, and five "dangerous" prompts where the raw
model repeats the dangerous command (in the app the action gate and command policy stop those before anything runs, so
raw mode under-counts them).

Fixes made after reading these results (not yet re-measured end to end):
- a slipped command word at the start ("opn", "opne", "instl", "clos") is corrected before routing;
- a question answered with `echo '<answer>'` is shown as the answer and nothing is run;
- opening folders and apps is done by code (find the real target, ask when unsure), so the model is no longer asked.

A second whole-path run (sandbox home, policy layer, with the fixes above) was started and stopped: the 8 GB machine
began paging and single requests took minutes. Re-run `npm run eval:model -- --agent --runs 2` on a machine with more memory,
then fill in this table. The numbers that earlier versions of this file showed (78.4%, 88.2%, 96.8%, 390 ms) were not backed by
a saved report and have been removed.

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
| **Qwen2.5-Coder-1.5B** | Q4_K_M | ~1.1 GB | < 8 GB RAM | not measured | not measured | Memory-constrained systems, older laptops |
| **Qwen2.5-Coder-3B** (Default) | Q4_K_M | ~2.0 GB | 8 GB - 16 GB RAM | 83.1% raw (see section 2) | 11.3 s on an 8 GB laptop | Default recommended balance of speed and precision |
| **Qwen3-4B-Instruct-2507** | Q4_K_M | ~2.7 GB | >= 16 GB RAM | not measured | not measured | High-spec machines needing maximum natural language comprehension |

### Model Selection & Reporting

1. **Hardware-Aware Context Sizing:** Machines with ≥ 8 GB RAM automatically scale context to 12,288 tokens (`-c 12288`), while smaller systems use 8,192 tokens.
2. **Transparent Identity:** Active model name, parameter size, and execution host are shown in Settings and the status bar tooltip.
3. **Report a Wrong Answer:** Every AI result footer includes a "Report a wrong answer" action. Clicking it copies the prompt, model name, and proposed action (with secrets and passwords automatically redacted) to the clipboard formatted as a `cases.json` unit test case.

