# Local Intent AI Engine & Entity Extraction

The **Local Intent AI Engine** (`src/ai/`) translates natural language instructions into structured capability executions. Engineered for low latency and high accuracy, the engine harnesses local model deployments while applying syntactic normalization algorithms to filter out conversational fluff.

---

## 🤖 Supported Intelligence Profiles

Cero is engineered around high-efficiency localized models:
- **Recommended Model**: **Qwen 2.5:1.5b via Ollama** (`qwen2.5:1.5b`). This specialized profile achieves superior parameter extraction accuracy on developer command statements while consuming minimal system RAM and executing with sub-second inference speeds.
- **Hardware Acceleration Adaptation**: On macOS platforms, `ModelManager.ts` dynamically leverages unified memory architectures (Apple Silicon M1/M2/M3/M4) via Apple Metal compute accelerators and CoreML optimization interfaces.

---

## 🎯 Conversational Noise Filtering & Resilient JSON Extraction

Users naturally add conversational modifiers when communicating with AI assistants. `EntityExtractor.ts` applies layered syntactic normalization to uncover pure tool parameters, while `AgentLoop.ts` handles the volatile nature of 3B parameter model outputs.

### 1. Resilient JSON Parsing (Curly-Brace Counting Algorithm)
Standard regex extraction frequently fails on smaller models (like the 3B parameter model) that output conversational text intermingled with multi-step JSON tool calls. Cero replaces regex with a robust curly-brace counting algorithm that reads the LLM output character-by-character, perfectly isolating nested JSON configurations even if the model was abruptly interrupted or hallucinated surrounding text.

### 2. Strict Anti-Hallucination Rules
To prevent the model from guessing non-existent OS paths (e.g., hallucinating `/path/to/project`), `SystemPrompt.ts` enforces stringent logic:
- The AI must explicitly search for a file/folder before attempting to open it.
- Aliases are hardcoded into the fallback logic (e.g. mapping "antigrav" to "Antigravity IDE").
- The system prevents output paths like `YourUsername` or `Project Folder`.

### 3. Conversational Prefix Trimming
Our regex heuristics strip polite chatter and conversational framing without dropping intent:
```typescript
// Removes phrases like "hey there", "can you", "please", "i want you to", "take me to"
const strippedCmd = cleanCmd
  .replace(/^(?:(?:hey|hi|hello|please|can you|could you|would you|kindly|just|now|alright|there|then|so|friend|dude|mate|i want you to|i wnat you to|i want to|i need you to|help me to|we need to|you should|let's|lets)(?:\s+|,)*)+/i, '')
  .trim();
```

### 2. Multi-Target Parameter Parsing
The engine matches distinct target parameters across varying domain expressions:
- **Process Elimination Targets**: Automatically strips trailing linguistic wrappers (such as *"all processes of"*, *"active threads for"*, or *"stop running"*) to isolate clean binary designations (such as extracting `"chrome"` from `"kill all the active process of chrome"` or `"antigravity"` from `"entirely stop all process of antigravity"`).
- **Web Destination Normalization**: Recognizes domain name constructions (`youtube.com`, `github.com`) embedded alongside software app parameters (`safari`, `chrome`) to properly feed two-parameter tool capability schemas.
- **Folder Navigation Mapping**: Quickly resolves conversational descriptions (`"downloads folder"`, `"desktop directory"`, `"take me home"`) into concrete operating system expansion pathways (`~/Downloads`, `~/Desktop`, `~`).

---

## 📈 Telemetry Events & LoRA Fine-Tuning Pipelines

To continuously refine localized reasoning models without compromising privacy, Cero incorporates an offline telemetry and adaptation pipeline (`src/ai/telemetry/`):
- **Event Recording**: When low confidence matches occur or users apply command corrections following an AI action, `TelemetryRecorder` locally captures the utterance paired with the validated final tool execution.
- **JSONL Dataset Generation**: Exported historical execution pairings are preserved in standardized JSONL training files under `.system_generated/logs/`, providing developers with high-quality, reproducible datasets ready for custom LoRA model adaptation and lightweight fine-tuning!
