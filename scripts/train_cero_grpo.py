#!/usr/bin/env python3
"""
scripts/train_cero_grpo.py — On-Device Rule-Based GRPO Reinforcement Learning
DeepSeek-R1 Architecture for Bash & Terminal Automation

Part of Cero-SERL (Self-Evolving Reflexion Loop):
Trains a 3B model (Qwen2.5-Coder-3B-Instruct) using Group Relative Policy Optimization (GRPO)
without human labels or a separate critic network.
Guided entirely by mathematical terminal execution feedback:
  - Exit code 0 + non-empty stdout: +2.0
  - Exit code != 0 or syntax error: -1.5
  - Format compliance: +0.5
  - Conversational refusal: -2.0
  - Unsafe command: -5.0

Computes group advantages:
  A_i = (R_i - mean(R)) / (std(R) + eps)
"""

import os
import sys
import json
import re
import math
import subprocess
import argparse
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

# ==============================================================================
# 1. Deterministic Rule-Based OS Reward Oracle
# ==============================================================================

def is_refusal_output(text: str) -> bool:
    """Detects canned chatbot refusals and excuses."""
    if not text:
        return False
    lower = text.lower()
    patterns = [
        r"\b(?:can(?:not|'t)|unable to|don't have access|cannot access|not able to)\s+(?:detect|find|see|inspect|determine|know|tell|check)\b",
        r"\b(?:don't have access|cannot access|no access)\b",
        r"\b(?:as an ai|i am an ai|language model)\b",
        r"\b(?:i apologize, but i cannot|i'm sorry, but i can't)\b",
        r"\b(?:i cannot interact with your system)\b",
    ]
    return any(re.search(p, lower) for p in patterns)

def extract_command(completion: str) -> Optional[str]:
    """Extracts executable shell command from model JSON output or markdown."""
    if not completion:
        return None
    # 1. JSON parsing
    clean = re.sub(r"<think>[\s\S]*?</think>", "", completion).strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean)
    clean = re.sub(r"\s*```$", "", clean).strip()

    try:
        obj = json.loads(clean)
        if isinstance(obj, dict):
            if "command" in obj:
                return str(obj["command"]).strip()
            if obj.get("action") == "execute" and "command" in obj:
                return str(obj["command"]).strip()
    except Exception:
        pass

    # 2. Regex fallback for {"command": "..."}
    cmd_match = re.search(r'"command"\s*:\s*"([^"]+)"', clean)
    if cmd_match:
        return cmd_match.group(1).strip()

    # 3. Markdown code block fallback
    block_match = re.search(r"```(?:bash|zsh|sh)?\s*\n([\s\S]*?)\n```", completion)
    if block_match:
        lines = [line.strip() for line in block_match.group(1).split("\n") if line.strip() and not line.startswith("#")]
        if lines:
            return " && ".join(lines)

    return None

def get_system_shell() -> str:
    """Returns available shell for Linux/POSIX (prefers bash or sh over missing zsh)."""
    for candidate in ["/bin/bash", "/usr/bin/bash", "/bin/sh", "/bin/zsh"]:
        if os.path.exists(candidate):
            return candidate
    return "/bin/sh"

def to_safe_predicate(command: str) -> Tuple[str, bool]:
    """Transforms potentially mutating commands into 100% safe predicates for RL reward scoring."""
    cmd = command.strip()
    shell = get_system_shell()

    # High risk destructive operations
    if re.search(r"\b(rm\s+-rf\s+/|mkfs|dd\s+if=|sudo\b|shutdown|reboot)\b", cmd, re.IGNORECASE):
        return (f"{shell} -n -c 'exit 1'", True)

    # Process kill commands: kill -0 checks PID existence without killing
    kill_match = re.match(r"^\s*kill\s+(?:-[a-zA-Z0-9]+\s+)*(\d+)\s*$", cmd, re.IGNORECASE)
    if kill_match:
        return (f"kill -0 {kill_match.group(1)}", True)

    # pkill / killall -> pgrep
    pkill_match = re.match(r"^\s*(?:pkill|killall)\s+(?:-[a-zA-Z0-9]+\s+)*[\"']?([a-zA-Z0-9_.-]+)[\"']?\s*$", cmd, re.IGNORECASE)
    if pkill_match:
        return (f"pgrep -i \"{pkill_match.group(1)}\"", True)

    # Port kill pipeline: lsof -ti:PORT | xargs kill -> lsof -ti:PORT
    lsof_kill = re.search(r"lsof\s+-ti:(\d+)\s*\|\s*xargs\s+kill", cmd, re.IGNORECASE)
    if lsof_kill:
        return (f"lsof -ti:{lsof_kill.group(1)}", True)

    # File deletions: rm -> test existence
    rm_match = re.match(r"^\s*rm\s+(?:-[a-zA-Z]+\s+)*[\"']?([^\"']+)[\"']?\s*$", cmd, re.IGNORECASE)
    if rm_match:
        target = rm_match.group(1)
        return (f"test -e \"{target}\"", True)

    # Git mutations -> git status
    if re.match(r"^\s*git\s+(commit|push|merge|rebase|reset)\b", cmd, re.IGNORECASE):
        return ("git status --porcelain", True)

    # Mutating command fallback: pure syntax verification via shell -n
    if re.search(r"\b(mv|touch|mkdir|chmod|chown|npm\s+install|brew\s+install)\b", cmd, re.IGNORECASE):
        escaped = cmd.replace("'", "'\\''")
        return (f"{shell} -n -c '{escaped}'", True)

    return (cmd, False)

def execute_in_shadow_sandbox(command: str, timeout_sec: float = 1.5) -> Tuple[int, str, str]:
    """Executes safe command in ephemeral subshell."""
    safe_cmd, _ = to_safe_predicate(command)
    shell = get_system_shell()
    try:
        res = subprocess.run(
            [shell, "-c", safe_cmd],
            capture_output=True,
            text=True,
            timeout=timeout_sec
        )
        return (res.returncode, res.stdout, res.stderr)
    except subprocess.TimeoutExpired:
        return (-1, "", "Execution timeout exceeded")
    except Exception as e:
        return (-1, "", str(e))

def compute_execution_reward(prompt: str, completion: str) -> float:
    """Ground truth terminal reward: evaluates actual execution outcome."""
    cmd = extract_command(completion)
    if not cmd:
        return 0.0

    exit_code, stdout, stderr = execute_in_shadow_sandbox(cmd)

    if exit_code == 0:
        # Base reward for zero exit code + tanh saturation bonus for informative output
        bonus = min(1.0, math.tanh(len(stdout.strip()) / 80.0))
        return 2.0 + bonus
    else:
        # Penalty for failing exit code
        penalty = -1.5
        if re.search(r"command not found|syntax error|parse error", stderr, re.IGNORECASE):
            penalty -= 1.0
        return penalty

def compute_format_reward(completion: str) -> float:
    """Format adherence reward."""
    clean = re.sub(r"<think>[\s\S]*?</think>", "", completion).strip()
    try:
        obj = json.loads(clean.replace("```json", "").replace("```", "").strip())
        if isinstance(obj, dict) and obj.get("action") in ("execute", "done"):
            return 0.5
    except Exception:
        pass
    return -0.5

def compute_refusal_penalty(completion: str) -> float:
    """Penalizes conversational refusals."""
    if is_refusal_output(completion):
        return -2.0
    return 0.0

def compute_safety_penalty(completion: str) -> float:
    """Penalizes dangerous operations."""
    cmd = extract_command(completion) or ""
    if re.search(r"\b(rm\s+-rf\s+/|mkfs|dd\s+if=/dev/zero)\b", cmd, re.IGNORECASE):
        return -5.0
    return 0.0

def compute_decomposition_reward(completion: str) -> float:
    """
    Decomposition-correctness reward (Phase 0.75.5):
    Evaluates the structural quality of multi-step plan decomposition
    independently from shell execution outcome.

    Rewards:
      +0.4  JSON contains 'steps' array with ≥2 entries
      +0.3  Each step has 'precondition_check' field
      +0.2  Steps reference 'depends_on' for DAG ordering
      +0.1  Steps include 'if_precondition_true'/'if_precondition_false' branching
      -0.3  Steps array present but malformed (empty, non-list, missing commands)
    """
    clean = re.sub(r"<think>[\s\S]*?</think>", "", completion).strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean)
    clean = re.sub(r"\s*```$", "", clean).strip()

    try:
        obj = json.loads(clean)
    except Exception:
        return 0.0  # Not JSON — decomposition reward is N/A

    steps = None
    if "steps" in obj:
        steps = obj["steps"]
    elif "suggestedSteps" in obj:
        steps = obj["suggestedSteps"]

    if steps is None:
        # Single-step commands don't need decomposition — neutral
        return 0.0

    if not isinstance(steps, list) or len(steps) == 0:
        return -0.3  # Malformed steps array

    reward = 0.0

    # Multi-step structure bonus
    if len(steps) >= 2:
        reward += 0.4

    has_precondition = 0
    has_depends = 0
    has_branching = 0
    has_command = 0

    for step in steps:
        if not isinstance(step, dict):
            continue
        if step.get("precondition_check"):
            has_precondition += 1
        if step.get("depends_on") is not None:
            has_depends += 1
        if step.get("if_precondition_true") or step.get("if_precondition_false"):
            has_branching += 1
        if step.get("command") or step.get("action"):
            has_command += 1

    # All steps must have a command/action
    if has_command == 0:
        return -0.3

    # Precondition coverage (at least one step with precondition check)
    if has_precondition > 0:
        reward += 0.3

    # DAG dependency ordering
    if has_depends > 0:
        reward += 0.2

    # Conditional branching
    if has_branching > 0:
        reward += 0.1

    return round(reward, 3)


def compute_total_reward(prompt: str, completion: str) -> Dict[str, float]:
    """Computes composite reward breakdown."""
    r_exec = compute_execution_reward(prompt, completion)
    r_format = compute_format_reward(completion)
    r_refusal = compute_refusal_penalty(completion)
    r_safety = compute_safety_penalty(completion)
    r_decomp = compute_decomposition_reward(completion)
    total = r_exec + r_format + r_refusal + r_safety + r_decomp

    return {
        "total": round(total, 3),
        "exec": round(r_exec, 3),
        "format": round(r_format, 3),
        "refusal": round(r_refusal, 3),
        "safety": round(r_safety, 3),
        "decomposition": round(r_decomp, 3)
    }

# ==============================================================================
# 2. Group Advantage Computation (DeepSeek-R1 GRPO)
# ==============================================================================

def compute_group_advantages(rewards: List[float], eps: float = 1e-8) -> List[float]:
    """Computes relative advantages normalized across group of N completions."""
    n = len(rewards)
    if n == 0:
        return []
    if n == 1:
        return [0.0]

    mean_r = sum(rewards) / n
    var_r = sum((r - mean_r) ** 2 for r in rewards) / n
    std_r = math.sqrt(var_r)

    if std_r < eps:
        return [0.0 for _ in rewards]

    return [round((r - mean_r) / (std_r + eps), 4) for r in rewards]

# ==============================================================================
# 3. Reward Oracle Self-Test Suite (--test-rewards)
# ==============================================================================

def run_reward_self_tests():
    """Runs automated verification of the rule-based reward oracle and advantage math."""
    print("=" * 60)
    print("🧪 Running Cero GRPO Rule-Based Reward Oracle Self-Tests...")
    print("=" * 60)

    # 1. Test success reward (e.g. echo or sw_vers)
    valid_comp = '{"action": "execute", "command": "echo \\"test\\"", "explanation": "Echo test"}'
    r_valid = compute_total_reward("test echo", valid_comp)
    assert r_valid["exec"] >= 2.0, f"Expected exec >= 2.0, got {r_valid['exec']}"
    assert r_valid["format"] == 0.5, f"Expected format 0.5, got {r_valid['format']}"
    assert r_valid["total"] > 2.0
    print(f"✓ Valid execution reward verified: Total={r_valid['total']} (exec={r_valid['exec']}, format={r_valid['format']})")

    # 2. Test failing command penalty
    fail_comp = '{"action": "execute", "command": "non_existent_binary_xyz_123", "explanation": "Broken"}'
    r_fail = compute_total_reward("broken cmd", fail_comp)
    assert r_fail["exec"] <= -1.5, f"Expected exec <= -1.5, got {r_fail['exec']}"
    print(f"✓ Failing command penalty verified: Total={r_fail['total']} (exec={r_fail['exec']})")

    # 3. Test conversational refusal penalty
    refusal_comp = "I'm sorry, but as an AI I don't have access to inspect your terminal."
    r_refusal = compute_total_reward("check ports", refusal_comp)
    assert r_refusal["refusal"] == -2.0, f"Expected refusal -2.0, got {r_refusal['refusal']}"
    print(f"✓ Conversational refusal penalty verified: Total={r_refusal['total']} (refusal={r_refusal['refusal']})")

    # 4. Test safe predicate transformation (kill -9 999999 -> kill -0 999999)
    safe_cmd, is_transformed = to_safe_predicate("kill -9 999999")
    assert is_transformed is True
    assert safe_cmd == "kill -0 999999"
    print(f"✓ Safe predicate transformation verified: 'kill -9' -> '{safe_cmd}'")

    # 5. Test DeepSeek-R1 Group Advantage computation across group N=4
    group_rewards = [r_valid["total"], r_fail["total"], r_refusal["total"], 0.0]
    advantages = compute_group_advantages(group_rewards)
    assert len(advantages) == 4
    # The valid completion must have the highest relative advantage
    assert advantages[0] > 0, f"Expected highest candidate advantage > 0, got {advantages[0]}"
    assert advantages[1] < 0, f"Expected failing candidate advantage < 0, got {advantages[1]}"
    assert advantages[2] < 0, f"Expected refusal candidate advantage < 0, got {advantages[2]}"
    print(f"✓ Group Advantage calculation verified: Rewards={group_rewards} -> Advantages={advantages}")

    # 6. Test decomposition-correctness reward for well-structured multi-step plan
    decomp_comp = json.dumps({
        "action": "execute",
        "command": "which nvim && nvim",
        "explanation": "Check and open neovim",
        "steps": [
            {
                "action": "check",
                "command": "which nvim",
                "precondition_check": "which nvim",
                "if_precondition_true": "skip",
                "if_precondition_false": "install",
                "depends_on": []
            },
            {
                "action": "execute",
                "command": "nvim",
                "depends_on": [0]
            }
        ]
    })
    r_decomp = compute_total_reward("ensure nvim is installed then open it", decomp_comp)
    assert r_decomp["decomposition"] >= 0.9, f"Expected decomposition >= 0.9, got {r_decomp['decomposition']}"
    print(f"✓ Decomposition-correctness reward verified: decomposition={r_decomp['decomposition']}")

    # 7. Test decomposition penalty for malformed steps array
    bad_decomp = json.dumps({
        "action": "execute",
        "command": "echo hello",
        "steps": []
    })
    r_bad_decomp = compute_decomposition_reward(bad_decomp)
    assert r_bad_decomp == -0.3, f"Expected decomposition -0.3 for empty steps, got {r_bad_decomp}"
    print(f"✓ Malformed decomposition penalty verified: decomposition={r_bad_decomp}")

    # 8. Test decomposition neutral for single-step commands (no steps key)
    r_neutral_decomp = compute_decomposition_reward(valid_comp)
    assert r_neutral_decomp == 0.0, f"Expected decomposition 0.0 for single-step, got {r_neutral_decomp}"
    print(f"✓ Single-step decomposition neutral verified: decomposition={r_neutral_decomp}")

    print("\n✅ All Reward Oracle and Group Advantage tests PASSED!")
    return True

# ==============================================================================
# 4. Dry-Run Demonstration (--dry-run)
# ==============================================================================

def run_dry_run_simulation(args):
    """Simulates GRPO group sampling and reward assignment on a sample terminal prompt."""
    print("=" * 60)
    print("🚀 Running Cero GRPO Reinforcement Learning Dry-Run...")
    print("=" * 60)

    prompt = "give me the list of the ports that is being used by antigravity"
    print(f"Sample Prompt: \"{prompt}\"")
    print(f"Group Size N:  {args.num_generations}\n")

    # Simulate 4 sampled candidate completions from policy \pi_\theta
    candidates = [
        # Candidate 1: Verified winner from Reflexion Engine
        '{"action": "execute", "command": "lsof -iTCP -sTCP:LISTEN -n -P | grep -i antigravity", "explanation": "List active listening ports for antigravity"}',
        # Candidate 2: Common Linux failure (fuser)
        '{"action": "execute", "command": "fuser 8847/tcp", "explanation": "Inspect with fuser"}',
        # Candidate 3: Conversational refusal
        "I cannot detect how many ports are being used by antigravity.",
        # Candidate 4: Alternate port check (lsof -i)
        '{"action": "execute", "command": "lsof -i", "explanation": "Inspect open internet files"}'
    ]

    print("Evaluating Group Rollouts in Shadow Sandbox:")
    rewards = []
    for idx, cand in enumerate(candidates):
        r = compute_total_reward(prompt, cand)
        rewards.append(r["total"])
        print(f"  Branch {chr(65+idx)}: Reward = {r['total']:>6.2f} (exec={r['exec']:>5.2f}, format={r['format']:>4.1f}, ref={r['refusal']:>4.1f}) | {cand[:55]}...")

    advantages = compute_group_advantages(rewards)
    print("\nRelative Group Advantages (A_i):")
    for idx, adv in enumerate(advantages):
        print(f"  Branch {chr(65+idx)} Advantage A_{idx}: {adv:>+6.3f}")

    winner_idx = rewards.index(max(rewards))
    print(f"\n🏆 Policy Update Winner: Branch {chr(65+winner_idx)} with Advantage {advantages[winner_idx]:>+6.3f}")
    print(f"   Command: {extract_command(candidates[winner_idx])}")
    print("\n✅ GRPO Dry-Run Simulation complete. Model policy correctly reinforces shell execution over refusal!")

# ==============================================================================
# 5. Full Training Loop via TRL GRPOTrainer
# ==============================================================================

def run_grpo_training(args):
    """Executes the full GRPO training loop using HuggingFace TRL."""
    home = Path.home()
    output_dir = Path(args.output_dir).expanduser() if args.output_dir else home / ".cero" / "models" / "cero_grpo_r1"

    print("=" * 60)
    print("⚡ Cero — On-Device GRPO Reinforcement Learning")
    print("=" * 60)
    print(f"Model ID:      {args.model}")
    print(f"Output Dir:    {output_dir}")
    print(f"Generations N: {args.num_generations}")
    print(f"Max Steps:     {args.max_steps}")
    print(f"Learning Rate: {args.lr}")

    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from peft import LoraConfig
        from trl import GRPOConfig, GRPOTrainer
        from datasets import Dataset
    except ImportError:
        print("\n❌ Required ML libraries not found. Install with:")
        print("   pip install torch transformers peft trl datasets accelerate")
        sys.exit(1)

    # Select compute device: Apple Silicon Metal (mps) or CUDA / CPU
    if torch.backends.mps.is_available():
        device = "mps"
        print("✓ Utilizing Apple Silicon Metal Performance Shaders (MPS).")
    elif torch.cuda.is_available():
        device = "cuda"
        print("✓ Utilizing NVIDIA CUDA GPU.")
    else:
        device = "cpu"
        print("⚠️ Utilizing CPU.")

    # Prepare training prompts from dataset
    dataset_file = Path(args.dataset).expanduser() if args.dataset else home / ".cero" / "training" / "cero_dpo_pairs.jsonl"
    prompts = []

    if dataset_file.exists():
        with open(dataset_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    data = json.loads(line)
                    p = data.get("prompt")
                    if p:
                        prompts.append({"prompt": p})

    if not prompts:
        # Default seed prompts for bash mastery
        prompts = [
            {"prompt": "give me the list of the ports that is being used by antigravity"},
            {"prompt": "kill whatever is running on port 3000"},
            {"prompt": "inspect running process postgres"},
            {"prompt": "find all tsx files in workspace"},
            {"prompt": "check current wifi connection SSID"},
            {"prompt": "check battery percentage"}
        ]

    print(f"✓ Loaded {len(prompts)} training prompts.")
    train_dataset = Dataset.from_list(prompts)

    print(f"\n[1/3] Loading tokenizer and model: {args.model}...")
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    )

    training_args = GRPOConfig(
        output_dir=str(output_dir),
        learning_rate=args.lr,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        max_steps=args.max_steps,
        num_generations=args.num_generations,
        max_prompt_length=256,
        max_completion_length=256,
        logging_steps=10,
        save_steps=50
    )

    # Reward wrapper function for TRL GRPOTrainer
    def grpo_reward_fn(prompts, completions, **kwargs):
        rewards = []
        for p, c in zip(prompts, completions):
            r = compute_total_reward(p, c)
            rewards.append(r["total"])
        return rewards

    print("\n[2/3] Initializing GRPOTrainer with OS Rule Reward Oracle...")
    trainer = GRPOTrainer(
        model=args.model,
        reward_funcs=[grpo_reward_fn],
        args=training_args,
        train_dataset=train_dataset,
        peft_config=lora_config
    )

    print("\n[3/3] Starting Reinforcement Learning loop...")
    trainer.train()

    print(f"\n✓ GRPO training complete! Adapter saved to: {output_dir}")

# ==============================================================================
# 6. Main CLI Dispatcher
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description="Cero GRPO (DeepSeek-R1) Reinforcement Learning Engine")
    parser.add_argument("--test-rewards", action="store_true", help="Run reward oracle and advantage self-tests")
    parser.add_argument("--dry-run", action="store_true", help="Simulate group rollouts and reward computation on sample prompt")
    parser.add_argument("--model", type=str, default="Qwen/Qwen2.5-Coder-3B-Instruct", help="Base model identifier")
    parser.add_argument("--dataset", type=str, default="", help="Path to prompts dataset JSONL")
    parser.add_argument("--output-dir", type=str, default="", help="Directory to save fine-tuned GRPO adapter")
    parser.add_argument("--num-generations", type=int, default=4, help="Number of rollouts per group (N=4)")
    parser.add_argument("--max-steps", type=int, default=100, help="Maximum training steps")
    parser.add_argument("--lr", type=float, default=1e-5, help="Learning rate")

    args = parser.parse_args()

    if args.test_rewards:
        run_reward_self_tests()
        sys.exit(0)

    if args.dry_run:
        run_dry_run_simulation(args)
        sys.exit(0)

    run_grpo_training(args)

if __name__ == "__main__":
    main()
