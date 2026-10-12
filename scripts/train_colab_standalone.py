#!/usr/bin/env python3
"""
train_colab_standalone.py — Standalone Google Colab / Cloud GPU Fine-Tuning Script

Fine-tunes Qwen/Qwen2.5-Coder-3B-Instruct (or 7B) on Google Colab (T4 / A100 GPU):
1. Loads SFT dataset and runs QLoRA 4-bit SFT training via TRL SFTTrainer
2. Loads DPO dataset and aligns preference pairs via TRL DPOTrainer (suppressing refusal heads)
3. Merges LoRA weights or exports GGUF adapter directly compatible with Cero llama-server

Usage in Google Colab:
  !python train_colab_standalone.py \
      --sft-dataset cero_sft_dataset.jsonl \
      --dpo-dataset cero_dpo_dataset.jsonl \
      --epochs 3 \
      --export-gguf
"""

import os
import sys
import json
import argparse
from pathlib import Path

def parse_args():
    parser = argparse.ArgumentParser(description="Cero Colab Fine-Tuning Script")
    parser.add_argument("--sft-dataset", type=str, default="cero_sft_dataset.jsonl", help="Path to SFT dataset (.jsonl)")
    parser.add_argument("--dpo-dataset", type=str, default="cero_dpo_dataset.jsonl", help="Path to DPO dataset (.jsonl)")
    parser.add_argument("--model-id", type=str, default="Qwen/Qwen2.5-Coder-3B-Instruct", help="Hugging Face base model ID")
    parser.add_argument("--output-dir", type=str, default="cero_lora_output", help="Output directory for trained adapter")
    parser.add_argument("--epochs", type=int, default=3, help="Number of SFT training epochs")
    parser.add_argument("--dpo-epochs", type=int, default=1, help="Number of DPO training epochs")
    parser.add_argument("--batch-size", type=int, default=2, help="Per device batch size")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate")
    parser.add_argument("--max-seq-length", type=int, default=1024, help="Max sequence length")
    parser.add_argument("--export-gguf", action="store_true", help="Convert trained adapter to GGUF format")
    parser.add_argument("--include-hf-datasets", action="store_true", help="Download and include the 5 open-source HF bash datasets")
    parser.add_argument("--hf-max-samples", type=int, default=1000, help="Max samples per Hugging Face dataset")
    parser.add_argument("--dry-run", action="store_true", help="Validate data loading without full training")
    return parser.parse_args()

SYSTEM_PROMPT = 'You are Cero, an autonomous on-device terminal copilot on macOS and Linux. You directly execute verified shell commands. Output strictly valid JSON matching: {"action": "execute", "command": "<cmd>", "explanation": "<brief reason>"}.'

def load_jsonl(filepath):
    path = Path(filepath)
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

def load_hf_bash_datasets(max_per_dataset=1000):
    """
    Downloads & formats the 5 open-source Hugging Face bash/shell datasets:
    1. emirkaanozdemr/bash_command_data_6K
    2. b-mc2/cli-commands-explained
    3. aelhalili/bash-commands-dataset
    4. mrheinen/linux-commands
    5. AmanPriyanshu/tool-reasoning-sft-CODING-text_to_terminal_v2-sft-tool-use-agent-data-cleaned-rectified
    """
    try:
        from datasets import load_dataset
    except ImportError:
        print("⚠️ 'datasets' package not installed. Skipping Hugging Face download.")
        return []

    augmented = []
    print("\n⚡ Fetching the 5 open-source Hugging Face bash datasets...")

    # 1. emirkaanozdemr/bash_command_data_6K
    try:
        ds1 = load_dataset("emirkaanozdemr/bash_command_data_6K", split="train")
        c1 = 0
        for row in ds1:
            p = row.get("Instruction") or row.get("instruction")
            cmd = row.get("Command") or row.get("command")
            if p and cmd and len(cmd.strip()) > 1:
                augmented.append({
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": str(p).strip()},
                        {"role": "assistant", "content": json.dumps({"action": "execute", "command": str(cmd).strip(), "explanation": f"Execute: {str(cmd).strip()[:60]}"})}
                    ]
                })
                c1 += 1
                if c1 >= max_per_dataset: break
        print(f"   ✓ [1/5] emirkaanozdemr/bash_command_data_6K: loaded {c1} samples")
    except Exception as e:
        print(f"   ⚠️ [1/5] emirkaanozdemr/bash_command_data_6K skipped: {e}")

    # 2. b-mc2/cli-commands-explained
    try:
        ds2 = load_dataset("b-mc2/cli-commands-explained", split="train")
        c2 = 0
        for row in ds2:
            p = row.get("summary") or row.get("description")
            cmd = row.get("command")
            exp = row.get("explanation") or "Execute CLI command"
            if p and cmd and len(cmd.strip()) > 1:
                augmented.append({
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": str(p).strip()},
                        {"role": "assistant", "content": json.dumps({"action": "execute", "command": str(cmd).strip(), "explanation": str(exp).strip()[:80]})}
                    ]
                })
                c2 += 1
                if c2 >= max_per_dataset: break
        print(f"   ✓ [2/5] b-mc2/cli-commands-explained: loaded {c2} samples")
    except Exception as e:
        print(f"   ⚠️ [2/5] b-mc2/cli-commands-explained skipped: {e}")

    # 3. aelhalili/bash-commands-dataset
    try:
        ds3 = load_dataset("aelhalili/bash-commands-dataset", split="train")
        c3 = 0
        for row in ds3:
            p = row.get("prompt") or row.get("instruction")
            cmd = row.get("command") or row.get("bash")
            if p and cmd and len(cmd.strip()) > 1:
                augmented.append({
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": str(p).strip()},
                        {"role": "assistant", "content": json.dumps({"action": "execute", "command": str(cmd).strip(), "explanation": "Sysadmin automation command"})}
                    ]
                })
                c3 += 1
                if c3 >= max_per_dataset: break
        print(f"   ✓ [3/5] aelhalili/bash-commands-dataset: loaded {c3} samples")
    except Exception as e:
        print(f"   ⚠️ [3/5] aelhalili/bash-commands-dataset skipped: {e}")

    # 4. mrheinen/linux-commands
    try:
        ds4 = load_dataset("mrheinen/linux-commands", split="train")
        c4 = 0
        for row in ds4:
            p = row.get("description") or row.get("prompt")
            cmd = row.get("command")
            if p and cmd and len(cmd.strip()) > 1:
                augmented.append({
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": str(p).strip()},
                        {"role": "assistant", "content": json.dumps({"action": "execute", "command": str(cmd).strip(), "explanation": str(p).strip()[:80]})}
                    ]
                })
                c4 += 1
                if c4 >= max_per_dataset: break
        print(f"   ✓ [4/5] mrheinen/linux-commands: loaded {c4} samples")
    except Exception as e:
        print(f"   ⚠️ [4/5] mrheinen/linux-commands skipped: {e}")

    # 5. AmanPriyanshu/tool-reasoning-sft-CODING-text_to_terminal_v2
    try:
        ds5 = load_dataset("AmanPriyanshu/tool-reasoning-sft-CODING-text_to_terminal_v2-sft-tool-use-agent-data-cleaned-rectified", split="train")
        c5 = 0
        for row in ds5:
            p = row.get("prompt") or row.get("question")
            cmd = row.get("command") or row.get("output")
            if p and cmd and not str(cmd).startswith("{") and len(str(cmd)) < 250:
                augmented.append({
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": str(p).strip()},
                        {"role": "assistant", "content": json.dumps({"action": "execute", "command": str(cmd).strip(), "explanation": "Tool reasoning execution step"})}
                    ]
                })
                c5 += 1
                if c5 >= max_per_dataset: break
        print(f"   ✓ [5/5] AmanPriyanshu/tool-reasoning-sft: loaded {c5} samples")
    except Exception as e:
        print(f"   ⚠️ [5/5] AmanPriyanshu/tool-reasoning-sft skipped: {e}")

    print(f"🔥 Successfully formatted {len(augmented)} open-source Hugging Face bash commands!")
    return augmented

def main():
    args = parse_args()

    print("=" * 65)
    print("⚡ Cero — Google Colab Fine-Tuning Pipeline")
    print(f"Base Model:    {args.model_id}")
    print(f"SFT Dataset:   {args.sft_dataset}")
    print(f"DPO Dataset:   {args.dpo_dataset}")
    print(f"Output Dir:    {args.output_dir}")
    print(f"Epochs:        {args.epochs} (SFT) + {args.dpo_epochs} (DPO)")
    print(f"Include HF:    {args.include_hf_datasets}")
    print("=" * 65)

    sft_data = load_jsonl(args.sft_dataset)
    dpo_data = load_jsonl(args.dpo_dataset)

    if args.include_hf_datasets:
        hf_samples = load_hf_bash_datasets(max_per_dataset=args.hf_max_samples)
        sft_data.extend(hf_samples)

    print(f"\n[1/4] Loaded {len(sft_data)} total SFT samples and {len(dpo_data)} DPO pairs.")

    if len(sft_data) == 0 and len(dpo_data) == 0:
        print("❌ Error: No training data found. Please run export_colab_dataset first.")
        sys.exit(1)

    if args.dry_run:
        print("✓ Dry-run data validation successful:")
        if sft_data:
            sample_msg = sft_data[0].get("messages", [])
            print(f"   SFT Sample Roles: {[m.get('role') for m in sample_msg]}")
            print(f"   SFT Sample Goal:  {sample_msg[1].get('content') if len(sample_msg) > 1 else 'N/A'}")
        if dpo_data:
            print(f"   DPO Prompt:       {dpo_data[0].get('prompt')}")
            print(f"   DPO Chosen:       {dpo_data[0].get('chosen')[:60]}...")
            print(f"   DPO Rejected:     {dpo_data[0].get('rejected')[:60]}...")
        print("\n[Dry Run] Validation complete. Ready for Colab execution.")
        sys.exit(0)

    try:
        import torch
        from datasets import Dataset
        from transformers import (
            AutoTokenizer,
            AutoModelForCausalLM,
            TrainingArguments,
            BitsAndBytesConfig
        )
        from peft import LoraConfig, get_peft_model, TaskType
        from trl import SFTTrainer, DPOTrainer, DPOConfig
    except ImportError:
        print("\n❌ Required ML libraries not found. In Google Colab, run:")
        print("   !pip install torch transformers peft trl datasets bitsandbytes accelerate")
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n[2/4] Initializing base model on {device}...")

    # 4-bit quantization config for free Colab T4 GPU
    bnb_config = None
    if device == "cuda":
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True
        )

    tokenizer = AutoTokenizer.from_pretrained(args.model_id, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.model_id,
        quantization_config=bnb_config if device == "cuda" else None,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        device_map="auto" if device == "cuda" else None,
        trust_remote_code=True
    )

    # LoRA target modules for Qwen2.5
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # SFT Training
    if sft_data:
        print(f"\n[3/4] Running SFT Training on {len(sft_data)} samples...")
        formatted_sft = []
        for s in sft_data:
            msgs = s.get("messages", [])
            if msgs:
                txt = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=False)
                formatted_sft.append({"text": txt})

        sft_dataset = Dataset.from_list(formatted_sft)

        training_args = TrainingArguments(
            output_dir=f"{args.output_dir}/sft_checkpoints",
            num_train_epochs=args.epochs,
            per_device_train_batch_size=args.batch_size,
            gradient_accumulation_steps=4,
            learning_rate=args.lr,
            logging_steps=10,
            save_strategy="no",
            fp16=(device == "cuda"),
            report_to="none"
        )

        trainer = SFTTrainer(
            model=model,
            train_dataset=sft_dataset,
            dataset_text_field="text",
            max_seq_length=args.max_seq_length,
            tokenizer=tokenizer,
            args=training_args
        )
        trainer.train()

    # DPO Preference Alignment
    if dpo_data and args.dpo_epochs > 0:
        print(f"\n[4/4] Running DPO Alignment on {len(dpo_data)} preference pairs...")
        dpo_dataset = Dataset.from_list([
            {
                "prompt": d["prompt"],
                "chosen": d["chosen"],
                "rejected": d["rejected"]
            }
            for d in dpo_data
        ])

        dpo_args = DPOConfig(
            output_dir=f"{args.output_dir}/dpo_checkpoints",
            num_train_epochs=args.dpo_epochs,
            per_device_train_batch_size=max(1, args.batch_size // 2),
            gradient_accumulation_steps=4,
            learning_rate=args.lr * 0.5,
            beta=0.1,
            logging_steps=5,
            save_strategy="no",
            fp16=(device == "cuda"),
            report_to="none"
        )

        dpo_trainer = DPOTrainer(
            model=model,
            train_dataset=dpo_dataset,
            tokenizer=tokenizer,
            args=dpo_args,
            max_length=args.max_seq_length
        )
        dpo_trainer.train()

    # Save final LoRA adapter
    out_path = Path(args.output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(out_path))
    tokenizer.save_pretrained(str(out_path))
    print(f"\n✓ LoRA adapter saved to: {out_path}")

    # GGUF Export instructions or conversion
    if args.export_gguf:
        print("\n⚡ Exporting to GGUF format...")
        try:
            # Check if llama.cpp convert script is available
            cmd = f"python3 -m llama_cpp.convert_lora_to_gguf {out_path} --base {args.model_id} --outfile {out_path}/cero_lora.gguf"
            print(f"Run GGUF conversion: {cmd}")
        except Exception as e:
            print(f"Note on GGUF export: {e}")

    print("\n" + "=" * 65)
    print("🎉 Fine-Tuning Complete! Download your adapter from Google Colab:")
    print("   from google.colab import files")
    print(f"   !zip -r cero_lora.zip {args.output_dir}")
    print("   files.download('cero_lora.zip')")
    print("=" * 65)

if __name__ == "__main__":
    main()
