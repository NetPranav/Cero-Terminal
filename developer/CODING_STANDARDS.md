# Cero Engineering & Coding Standards

To preserve codebase maintainability across multi-tier languages and asynchronous IPC boundaries, all contributors to Cero must adhere to the following strict coding standards.

---

## 📘 TypeScript & React Presentation Rules

### 1. Strict Typing & Zero Any
- **TypeScript 5 Strictness**: Every interface, function signature, and IPC payload must be fully typed. Avoid the blanket use of `any` or loose type casting.
- **Tauri IPC Event Types**: Explicitly specify serialization interfaces when sending or listening across the Rust boundary:
  ```typescript
  // Prefer explicit payload typings:
  await listen<PtyOutputEvent>('pty-output', (event) => { ... });
  ```

### 2. Functional React & Hooks Discipline
- **Custom Hook Declarations**: Keep UI view presentation separate from complex domain processing logic. Utilize functional state setters (`setTabs(prev => ...)`) to prevent dependency cycle reruns inside `useEffect` blocks.
- **Cleanup on Unmount**: When instantiating `@xterm/xterm` terminals, EventBus listeners, or Tauri menu handlers, always ensure proper `.dispose()` and unsubscribe removals are returned within cleanup blocks!

---

## 🦀 Rust Backend Conventions (`src-tauri/`)

### 1. Zero Compiler Warnings Policy
- **Clean Compilations**: All Rust backend contributions must compile cleanly without triggering Cargo warnings for unused imports, dead variables, or unverified Result variants.
- **Explicit Error Propagation**: Map complex standard library and input IO failures cleanly into expressive serializable error string responses:
  ```rust
  .map_err(|e| e.to_string())?
  ```

### 2. Native System Responsiveness
- **Non-Blocking IO**: Never perform heavy file indexing or synchronous network evaluations on main application rendering threads. Spawn lightweight dedicated background worker threads (`std::thread::spawn` or Tokio asynchronous tasks) when communicating over pseudo-terminal file descriptors.

---

## 🌿 Git History & Commit Discipline

Adopt structured Conventional Commit syntax across all commits and PR merges:
- **`feat(scope): ...`**: New user capabilities, OS drivers, or UI themes.
- **`fix(scope): ...`**: Resolving regressions, keyboard handling glitches, or parsing bugs.
- **`docs(scope): ...`**: Reorganizing user product literature or maintainer manuals.
- **`test(scope): ...`**: Expanding unit verification assertions and schema validation suites.
- **`refactor(scope): ...`**: Code cleanup without altering existing behavioral functionality.
