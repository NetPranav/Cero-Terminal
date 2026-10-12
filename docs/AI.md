# How Cero's AI works

## 1. Providers
| Provider | Where it runs | Notes |
|---|---|---|
| Built-in | `llama-server` started by Cero (`src-tauri/src/embedded_server.rs`) on port 8847 | Default. Status bar `AI: local`. |
| Ollama | Your Ollama server | Chosen in Settings. `AI: Ollama`. |
| API | OpenAI (`gpt-4o-mini`, `gpt-4o`, `o3-mini`), Anthropic (`claude-3-5-haiku`, `claude-3-5-sonnet`), Groq (`llama-3.3-70b-versatile`, `qwen-2.5-coder-32b`), DeepSeek (`deepseek-chat`, `deepseek-reasoner`), OpenRouter (`openrouter/auto`), or a custom OpenAI-compatible endpoint | Needs a key; "Test Connection" checks it. `AI: API`. |

The chosen provider and model are remembered across restarts. If it is not reachable, Cero retries and shows the reason;
it never silently switches to the built-in model. After two failed checks the built-in model offers to retry that one
request on your API model (it asks first). Keys are stored in the macOS Keychain, Windows Credential Manager, or a
private `0600` file on Linux.

## 2. The built-in engine
- The engine (llama.cpp build `b11227`, pinned with SHA-256 digests) and the model are downloaded on first use, not
  shipped inside the app. Downloads resume and are discarded if the hash does not match.
- Models (`EmbeddedEngineManager.ts`): Qwen 2.5 Coder 0.5B (about 470 MB), 1.5B, **3B (default)**, and Qwen3 4B Instruct 2507.
- Settings recommends a tier from your RAM, cores and GPU (`ModelRecommendationEngine.ts`: Budget under 6 GB,
  Balanced 6 to 12 GB, Performance, Workstation).
- Acceleration: Vulkan or CUDA on Linux and Windows, Metal on Apple Silicon. If the GPU cannot be used, the engine runs
  on the CPU; Settings shows `Running (GPU)` or `Running (CPU)`.
- Output is constrained by a GBNF grammar (`GbnfGrammarManager.ts`); if the server rejects the grammar, Cero retries
  with plain JSON.
- A `llama-server` left on port 8847 by a crash is cleaned up at the next start.

## 3. Decisions are deterministic
Temperature 0, one choice, fixed seed, no prompt cache, prompt fitted to the context, every action checked before it
runs. One shared place sets sampling for every provider and one tolerant parser reads every model's answer. Numbers:
[MODEL_RELIABILITY.md](MODEL_RELIABILITY.md).

## 4. From request to action
1. Code handles what it can without a model: folder and app opening, workflow save and run, port and process requests,
   common system questions (`AgentLoop.ts`, `ChainPlanner.ts`, `OpenRequest`, `SaveIntent.ts`).
2. Otherwise the model picks a tool from the registry in `tools/` (103 tools, each with schema, examples and tests).
3. Commands go through the safety guardian and `ShellAstParser`, then the approval card if they change anything.
4. Output is read back; a failure is classified (`FailureClassifier.ts`) and a fix is suggested.
5. A progress estimate (`PromptProgressManager.ts`) is shown in the status bar.

## 5. System knowledge
`SystemKnowledgeScanner.ts` reads installed apps, developer tools, hardware, mounts, network, services and the desktop
session at startup into `~/.cero/knowledge/system_profile.json`; `SystemPrompt.ts` gives the model a short summary.

## 6. Memory and learning
- Taught patterns (`/learn`) in `~/.cero/learned_patterns.json`: [LEARNING.md](LEARNING.md).
- `EpisodicMemoryEngine.ts` keeps past trajectories under `~/.cero/memory/` to speed up repeated requests.
- `/learning on` keeps a local record of failed requests for later study (off by default).
- Training scripts under `scripts/` (LoRA, GRPO, dataset export) are for developers; the app does not train on your machine.

## 7. Folder navigation
`DirectoryNavigationEngine.ts` indexes your project folders, matches exact and partial names, offers "Did you mean"
for typos, and asks before creating a folder.

Ideas not built yet: [FUTURE_SCOPE.md](FUTURE_SCOPE.md).
