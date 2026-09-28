# Contributing to Sentinel Terminal

We welcome open-source contributions, bug reports, performance enhancements, UI designs, and new operating system capability drivers! Whether you are implementing a brand new OS interaction pattern or optimizing our native Rust pseudo-terminal bridge, this document outlines our contributor workflow.

---

## 🏛️ Engineering Philosophy & Product Standards

When contributing code to Sentinel, always maintain our foundational product commitments:
1. **Offline-First Privacy**: Every AI integration or capability model must function offline using localized inference resources (such as Ollama). Do not commit third-party external API cloud subscriptions or tracking frameworks.
2. **Native Performance Standards**: Terminal interaction layer code must remain non-blocking and hardware-accelerated. Always offload intensive sub-processes to our native Tauri Rust backend or asynchronous capability workers.
3. **Deterministic & Secure Execution**: Any driver performing mutating operating system actions (such as process killing or file deletion) must implement risk classification metrics and verify validation schemas via Zod.

---

## 🌿 The Contribution Workflow

### 1. Fork & Branching Strategy
1. Fork the official repository on GitHub.
2. Clone your local copy to your development workspace:
   ```bash
   git clone https://github.com/YourUsername/Sentinal-Terminal.git
   cd Sentinal-Terminal
   ```
3. Create a dedicated feature branch using descriptive conventions:
   ```bash
   # Feature implementations
   git checkout -b feat/add-media-capability-driver
   
   # Bug resolutions
   git checkout -b fix/pty-backspace-line-discipline
   ```

### 2. Development Setup & Building
- Review **[Development Environment Setup](file:///developer/DEVELOPMENT_SETUP.md)** for compiling dependencies (`node`, `rust`, `tauri`, and local Ollama installation).
- Check out our **[Build Instructions](file:///developer/BUILD.md)** for instructions on generating local development binaries and production standalone macOS `.app` bundles.

### 3. Verification & Automated Testing
Before submitting a Pull Request, verify that your changes pass our comprehensive test battery:
```bash
npx vitest run
```
Confirm all 69+ tests (covering Capability Registry synchronization, Zod schema validation, Intent Engine Entity parsing, and Zero-Trust Security scoring) run clean. See our **[Testing Guide](file:///developer/TESTING.md)** for writing custom tests.

---

## 🚀 Submitting Your Pull Request

1. Push your branch directly to your GitHub fork:
   ```bash
   git push -u origin feat/add-media-capability-driver
   ```
2. Open a Pull Request against our `main` branch. Provide a concise summary of the functionality achieved, list any modified capability schemas under `tools/`, and include visual proof (screenshots or animated GIFs) if your PR modifies UI elements or themes.

---

## 📖 Explore Contributor Documentation
- **[System Architecture Reference](file:///developer/ARCHITECTURE.md)**
- **[Tool Registry & Knowledge Base Pattern](file:///developer/TOOL_REGISTRY.md)**
- **[Capability SDK Driver Development](file:///developer/CAPABILITY_SDK.md)**
- **[Local Intent AI Engine Details](file:///developer/INTENT_AI.md)**
- **[Coding Standards & Style Guide](file:///developer/CODING_STANDARDS.md)**
