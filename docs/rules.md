# Cero Development & Assistant Rules

This document establishes behavioral constraints, operational rules, and quality standards for development and AI assistant interactions within Cero.

---

## Rule 1: Meaningful Git Commits on Implementation Completion

> [!IMPORTANT]
> **MANDATORY**: Whenever the implementation of a feature, refactor, bug fix, or UI enhancement is completed and verified, perform a clean, meaningful git commit.

### Guidelines:
1. **Timing**: Trigger a commit immediately after verification passes (`npm test` and `npm run build` succeed). Do not leave verified work uncommitted across tasks.
2. **Commit Format**: Follow Conventional Commits:
   - `feat(<scope>): <concise description>` for new features or capabilities.
   - `fix(<scope>): <concise description>` for bug fixes or corrective behavior.
   - `docs(<scope>): <concise description>` for documentation updates.
   - `refactor(<scope>): <concise description>` for architectural or structural improvements without behavior change.
   - `style(<scope>): <concise description>` for UI styling and aesthetic polish.
3. **Commit Messages**:
   - Provide a clear subject line (50-72 chars).
   - Provide bullet points detailing non-obvious design choices, components touched, and verification results.
4. **Scope Hygiene**: Ensure only relevant modified and newly added files for the completed implementation are staged. Do not bundle unrelated scratch files or temporary logs.

---

## Rule 2: Strict No-Emoji Policy in User Interface

> [!CAUTION]
> **ZERO EMOJIS**: Emojis are strictly prohibited across all end-user UI components, dialogs, status indicators, and terminal displays.

### Guidelines:
1. Never use emojis (e.g. ⚠️, 🚀, 💡, 🛡️, ❌, etc.) in user-facing UI text, warnings, error banners, tooltips, buttons, modal titles, or status lines.
2. Use premium monochrome vector icons (such as `lucide-react` icons like `Terminal`, `ShieldAlert`, `Folder`, `Code2`, `Check`, `ExternalLink`, etc.) styled in neutral white, gray, or slate.
3. In terminal output and PTY displays, use standard typographic CLI symbols (e.g. `❯`, `•`, `✓`, `[!]`, `[x]`).

---

## Rule 3: Matte Grayscale Aesthetic & Design Standards

- Maintain a disciplined, curated dark slate/grayscale palette:
  - Deep black/slate backgrounds (`#090b10`, `#0c0d12`, `#111318`).
  - High-contrast text (`#ffffff` for titles, `rgba(255, 255, 255, 0.65)` for body).
  - Subtle borders (`1px solid rgba(255, 255, 255, 0.08)` to `0.15`).
  - Active focus/selection accents using white outlines (`1.5px solid #ffffff`, subtle box-shadows).
- Avoid generic high-saturation primary colors (plain bright red, blue, green). Reserve subtle colors strictly for standard terminal ANSI syntax highlighting or critical safety badges.

---

## Rule 4: Dedicated Full Screens for Major Workflows

- Modal dialogs must not be used for primary setup, onboarding, or deep configuration workflows.
- Primary workflows (such as Initial Onboarding, Settings, and System Diagnostics) must render as **dedicated, full-frame screens** covering the viewport (`position: fixed, inset: 0`), preventing chrome leakage or underlying terminal bleed-through.

---

## Rule 5: Non-Destructive Desktop Integrations

- All desktop and system integrations must default to user-space (zero root/sudo required):
  - CLI binary: `~/.local/bin/cero`.
  - File manager hooks: `~/.local/share/nautilus/scripts/` (and equivalent user-space hook paths for Nemo, Dolphin, Thunar).
  - IDE profiles: Safely merge into `~/.config/Code/User/settings.json` without overwriting existing default profiles.
- Always provide transparent explanations of what is installed, where it resides, and how it executes.

---

## Rule 6: Verification & Test Integrity Before Completion

- Every task must be verified with:
  1. `npm test` (all test suites must pass 100%).
  2. `npm run build` (zero TypeScript errors, zero build failures).
  3. Visual or functional verification for UI-facing changes.
- Documentation in `docs/` and `walkthrough.md` must be kept updated with current system state and progress.
