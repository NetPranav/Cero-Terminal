# 🤝 Contributing to Cero

We are thrilled that you are interested in contributing to **Cero**! Whether you are solving bugs, optimizing AI entity extraction, extending our native capabilities SDK, or designing UI animations, this document provides everything you need to know to participate productively in our ecosystem.

---

## 🧭 Document Navigation
- [Code of Conduct](#code-of-conduct)
- [Development Architecture & Mental Model](#development-architecture--mental-model)
- [Setting Up Your Local Environment](#setting-up-your-local-environment)
- [How to Add a New AI Operating Tool / Capability](#how-to-add-a-new-ai-operating-tool--capability)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Submitting a Pull Request](#submitting-a-pull-request)

---

## 📜 Code of Conduct

1. **Be Respectful & Empathetic**: Treat all team members and open-source contributors with respect.
2. **Constructive Discussions**: Focus on technical merits, reproducible benchmarks, and clean architectural design.
3. **Zero-Tolerance for Harassment**: Any form of bullying or harassment will lead to instant dismissal from the project repositories.

---

## 🏛️ Development Architecture & Mental Model

Cero operates on a strict **4-Tier Unified Agent Ecosystem**:

```
[ Frontend: React 19 / Vite / xterm.js ] ─── (Tauri IPC) ─── [ Backend: Tauri v2 / Rust PTY ]
               ▲                                                               ▲
               │ (Direct TS / ESM import)                                     │ (Rust Subprocesses)
               ▼                                                               ▼
[ AI Intent Runtime: Qwen 2.5 + CoreML ] ───────────────► [ Capability SDK & Execution Drivers ]
```

1. **Presentation Layer (`src/presentation` & `src/ui`)**:
   - Renders interactive hardware-accelerated terminals via **xterm.js WebGL**.
   - Manages split vertical and horizontal workspaces. Each pane manages its own active directory state and terminal history.
   - The status bar dynamically reflects the current working directory hierarchy and displays a real-time system clock.

2. **AI Intent & Planning Runtime (`src/ai/intent/` & `src/domain/planner/`)**:
   - **`IntentEngine.ts`**: The orchestration brain. Translates natural language utterances into structured task execution graphs.
   - **`EntityExtractor.ts`**: Regex & heuristic-powered parser that converts conversational language into typed parameter dictionaries (`applications`, `URLs`, `ip_addresses`, `ports`, `paths`). It automatically cleans up words like *"entirely"*, *"all processes of"*, and normalizes domain schemas (*"youtube.com"* ➔ `"https://youtube.com"`).
   - **`ModelManager.ts`**: Manages local Ollama model bindings, prioritizing lightweight high-accuracy local checkpoints (`qwen2.5:1.5b`, `llama3.1:8b`).

3. **Capability SDK & Tool Registry (`src/sdk/` & `src/tools/`)**:
   - Contains **97+ indexed capabilities** configured via schemas in `tools/<domain>/<action>/tool.json`.
   - Each tool corresponds directly to an execution driver in `src/sdk/capabilities/drivers/` (e.g., `ApplicationCapability.ts`, `SystemSDKCapability.ts`, `FilesystemCapability.ts`).
   - Drivers emit detailed commands, handle dry-run simulations, and construct automated rollback payloads for failure recovery.

4. **Security Engine (`src/domain/security/`)**:
   - Monitors every capability execution in real-time.
   - Computes dynamic **Risk Scores** (0-100). Any high-risk operation (e.g., recursive filesystem deletions, root-level daemon restarts) must undergo permission checks or user interactive sign-off.
   - Emits structured immutable JSONL audit trails to `.system_generated/logs/`.

---

## ⚙️ Setting Up Your Local Environment

### 1. Prerequisites
- **Node.js**: v18+ (v20+ LTS recommended)
- **Rust**: Latest stable build (via [rustup](https://rustup.rs))
- **Ollama**: For local offline AI processing ([Download Ollama](https://ollama.ai))

### 2. Initial Setup
```bash
# Clone the fork / repository
git clone https://github.com/NetPranav/Sentinal-Terminal.git
cd Sentinal-Terminal

# Install node dependencies
npm install

# Pull the required local model checkpoint for intent parsing
ollama pull qwen2.5:1.5b

# Start the application in Live Development Mode (with Hot Module Reloading)
npm run tauri dev
```

---

## 🧩 How to Add a New AI Operating Tool / Capability

One of the most impactful ways to contribute is extending Cero's OS functionality. Let's walk through creating a brand new custom capability:

### Step 1: Define the Tool Schema
Navigate to `tools/` and choose an appropriate domain directory (e.g., `system/`, `network/`, `application/`, `media/`). Create a directory and add a `tool.json`:

```json
{
  "id": "media.audio.volume_set",
  "name": "Set System Audio Volume",
  "desc": "Adjusts the master volume output of the system audio hardware.",
  "category": "Media",
  "risk": "LOW",
  "params": [
    { "name": "level", "type": "number", "desc": "Target volume percentage (0 to 100)", "required": true }
  ],
  "aliases": ["change volume to", "set audio level", "make volume"],
  "sampleInput": "set volume to 80 percent"
}
```

### Step 2: Bind or Extend a Concrete E2E Driver
Open `src/sdk/capabilities/drivers/` and locate or create an appropriate driver subclassing `BaseCapabilityDriver`:
```typescript
import { BaseCapabilityDriver, CapabilityExecutionResult, Platform } from '../CapabilitySDK';
import { invoke } from '@tauri-apps/api/core';

export class MediaCapability extends BaseCapabilityDriver<any, any> {
  readonly capabilityId = 'media.audio.volume_set';
  readonly name = 'System Audio Volume Driver';
  readonly supportedPlatforms: Platform[] = ['macos', 'windows', 'linux'];

  protected async executeImpl(input: any): Promise<CapabilityExecutionResult<any>> {
    const level = Math.max(0, Math.min(100, input.level ?? 50));
    // Utilize native Tauri execution hooks
    const output = await invoke('execute_command', { 
      command: 'osascript', 
      args: ['-e', `set volume output volume ${level}`] 
    });
    return {
      success: true,
      data: { volumeSet: level },
      commandExecuted: `osascript -e 'set volume output volume ${level}'`
    };
  }
}
```

### Step 3: Register in Central Registry
Open `src/sdk/CapabilityRegistrySDK.ts` and ensure your new capability instance is added to the driver mapping so the Intent Engine can automatically discover and resolve it at runtime.

---

## 🧪 Testing & Quality Assurance

Before pushing your commit or raising a PR, make sure your code passes our strict automated verification pipeline.

### Running Automated Tests
```bash
# Execute the Vitest runner
npx vitest run
```

Our testing pipeline currently validates **69 core assertions**:
1. **Tool Schema Validation**: Asserts all 97+ tool and workflow JSON files adhere strictly to Zod specification.
2. **Intent Planning & Entity Parsing**: Verifies complex natural language queries (*"open youtube.com in safari"*, *"kill antigravity"*, *"show active bluetooth devices"*) generate exact tool schedules and parameters.
3. **Security Guardrails**: Checks that high-risk filesystem actions trigger authorization blockers and generate audit logs.
4. **TypeScript Compatibility & Production Build**:
```bash
npm run build
```

---

## 📨 Submitting a Pull Request

When submitting your PR, follow this concise checklist:
1. **Clear PR Title**: Use conventional commits format (e.g., `feat: add audio volume set capability`, `fix: terminal split screen directory tracking`).
2. **Passing CI**: Confirm that `npx vitest run` and `npm run build` succeed locally with zero TypeScript or compilation errors.
3. **Include Screenshots / Media (If UI or UX changed)**: If you modified visual themes, added animations, or built new conversational capabilities, attach short GIF demonstrations directly in the Pull Request description!

Thank you again for building the future of command-line AI workflows with us! 🚀
