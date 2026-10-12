#!/usr/bin/env python3
"""
convert_peft_to_gguf.py — Converts Hugging Face PEFT LoRA safetensors to GGUF format
Compatible with llama.cpp and Cero's embedded llama-server / llama-cli.
"""

import sys
import json
import re
from pathlib import Path
import numpy as np
from safetensors import safe_open
import gguf

def convert_hf_lora_to_gguf(lora_dir: str, output_gguf_path: str):
    lora_path = Path(lora_dir)
    config_file = lora_path / "adapter_config.json"
    weights_file = lora_path / "adapter_model.safetensors"

    if not config_file.exists():
        raise FileNotFoundError(f"Missing {config_file}")
    if not weights_file.exists():
        raise FileNotFoundError(f"Missing {weights_file}")

    with open(config_file, "r", encoding="utf-8") as f:
        config = json.load(f)

    alpha = float(config.get("lora_alpha", 32.0))
    r = int(config.get("r", 16))
    base_model = config.get("base_model_name_or_path", "qwen2")

    print(f"Loading LoRA weights from: {weights_file}")
    print(f"LoRA Alpha: {alpha}, Rank: {r}, Base: {base_model}")

    writer = gguf.GGUFWriter(output_gguf_path, "qwen2")
    writer.add_type(gguf.GGUFType.MODEL)
    writer.add_architecture()
    writer.add_string("general.type", "adapter")
    writer.add_string("adapter.type", "lora")
    writer.add_float32("adapter.lora.alpha", alpha)

    # Qwen2 mapping pattern
    pattern = re.compile(
        r"base_model\.model\.model\.layers\.(\d+)\.(self_attn|mlp)\.([a-z_]+)\.lora_([AB])\.weight"
    )

    module_map = {
        ("self_attn", "q_proj"): "attn_q",
        ("self_attn", "k_proj"): "attn_k",
        ("self_attn", "v_proj"): "attn_v",
        ("self_attn", "o_proj"): "attn_output",
        ("mlp", "gate_proj"): "ffn_gate",
        ("mlp", "up_proj"): "ffn_up",
        ("mlp", "down_proj"): "ffn_down",
    }

    tensors_added = 0
    with safe_open(weights_file, framework="numpy") as sf:
        for hf_key in sf.keys():
            m = pattern.match(hf_key)
            if not m:
                print(f"Skipping unmapped key: {hf_key}")
                continue

            layer_idx, block_type, proj_name, lora_part = m.groups()
            mapped_proj = module_map.get((block_type, proj_name))
            if not mapped_proj:
                print(f"Skipping unknown module: {block_type}.{proj_name}")
                continue

            gguf_part = "lora_a" if lora_part == "A" else "lora_b"
            gguf_name = f"blk.{layer_idx}.{mapped_proj}.weight.{gguf_part}"

            tensor_data = sf.get_tensor(hf_key)
            # Ensure float32 or float16
            if tensor_data.dtype != np.float32 and tensor_data.dtype != np.float16:
                tensor_data = tensor_data.astype(np.float32)

            writer.add_tensor(gguf_name, tensor_data)
            tensors_added += 1

    print(f"Writing {tensors_added} tensors to {output_gguf_path}...")
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()
    print(f"✓ Successfully generated GGUF LoRA adapter: {output_gguf_path}")

if __name__ == "__main__":
    src_dir = sys.argv[1] if len(sys.argv) > 1 else "cero_lora_colab"
    out_file = sys.argv[2] if len(sys.argv) > 2 else "cero_lora_colab.gguf"
    convert_hf_lora_to_gguf(src_dir, out_file)
