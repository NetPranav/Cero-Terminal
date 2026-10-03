#!/usr/bin/env python3
"""
Cero — Autonomous LoRA Fine-Tuning Pipeline (Tier 3)

Trains a lightweight LoRA adapter on your personal terminal interactions,
human demonstrations, and self-healed shell workflows.

Dataset source: ~/.cero/training/cero_shell_dataset.jsonl
Target model: Qwen/Qwen2.5-Coder-3B-Instruct
Output adapter: ~/.cero/models/cero_custom_lora
"""

import os
import sys
import json
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="Cero LoRA Fine-Tuning Script")
    parser.add_argument("--epochs", type=int, default=3, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=2, help="Per device batch size")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate")
    parser.add_argument("--max-seq-length", type=int, default=1024, help="Max sequence length")
    args = parser.parse_args()

    home = Path.home()
    dataset_path = home / ".cero" / "training" / "cero_shell_dataset.jsonl"
    output_dir = home / ".cero" / "models" / "cero_custom_lora"

    print("=" * 60)
    print("⚡ Cero — Continuous On-Device LoRA Fine-Tuner")
    print("=" * 60)
    print(f"Dataset path: {dataset_path}")
    print(f"Output path:  {output_dir}")

    if not dataset_path.exists() or dataset_path.stat().st_size == 0:
        print("\n⚠️ No training samples found yet in ~/.cero/training/cero_shell_dataset.jsonl")
        print("To generate training samples:")
        print("  1. Use Cero for daily tasks (every verified command is logged).")
        print("  2. Demonstrate commands when AI asks (/learn or typing working commands).")
        print("  3. Run this script once you have accumulated 20+ demonstrated interactions.")
        sys.exit(0)

    # Count dataset samples
    with open(dataset_path, "r", encoding="utf-8") as f:
        samples = [json.loads(line) for line in f if line.strip()]

    print(f"✓ Found {len(samples)} interaction samples in dataset.")

    try:
        from datasets import Dataset
        from transformers import AutoTokenizer, AutoModelForCausalLM, TrainingArguments
        from peft import LoraConfig, get_peft_model, TaskType
        from trl import SFTTrainer
    except ImportError:
        print("\n❌ Required ML libraries not found. Install them with:")
        print("   pip install torch transformers peft trl datasets accelerate")
        sys.exit(1)

    base_model_id = "Qwen/Qwen2.5-Coder-3B-Instruct"
    print(f"\n[1/4] Loading tokenizer and base model: {base_model_id}...")

    tokenizer = AutoTokenizer.from_pretrained(base_model_id, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        base_model_id,
        device_map="auto",
        torch_dtype="auto",
        trust_remote_code=True
    )

    print("[2/4] Initializing LoRA configuration (r=16, alpha=32)...")
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    print("[3/4] Preparing chat dataset...")
    formatted_texts = []
    for s in samples:
        messages = s.get("messages", [])
        if messages:
            text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
            formatted_texts.append({"text": text})

    train_dataset = Dataset.from_list(formatted_texts)

    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        learning_rate=args.lr,
        logging_steps=5,
        save_strategy="no",
        fp16=True,
        report_to="none"
    )

    print(f"[4/4] Starting LoRA fine-tuning for {args.epochs} epochs...")
    trainer = SFTTrainer(
        model=model,
        train_dataset=train_dataset,
        dataset_text_field="text",
        max_seq_length=args.max_seq_length,
        tokenizer=tokenizer,
        args=training_args
    )

    trainer.train()

    print(f"\n✓ Saving custom LoRA adapter to {output_dir}...")
    output_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    print("\n🎉 LoRA Fine-Tuning Complete!")
    print(f"Your model adapter is saved at: {output_dir}")
    print("\nTo launch llama-server with your personal LoRA adapter:")
    print(f"  llama-server -m ~/.cero/models/qwen2.5-coder-3b-instruct-q4_k_m.gguf --lora {output_dir}")

if __name__ == "__main__":
    main()
