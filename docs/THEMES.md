# Cero — Visual Aesthetic & Theme Architecture

Cero is built around a philosophy of focused minimalism, low eye fatigue, and visual precision. Moving away from distracting neon gradients and oversaturated interface chrome, Cero implements a strictly matte monochrome and grayscale design system.

---

## 1. Design Philosophy: Focused Minimalism

- **Zero-Distraction Monochromaticity**: Navigational chrome, tab headers, modal dialogs, and status indicators operate strictly within a calibrated grayscale spectrum. Visual hierarchy is communicated through subtle contrast lightness and opacity tiers.
- **Matte & Zero-Glow Finish**: Eliminates glaring drop-shadows and saturated borders in favor of a crisp, dry matte charcoal finish with hairline sub-pixel boundaries.
- **Glassmorphic Dimensionality**: Combines translucent dark surfaces (`rgba(16, 18, 24, 0.92)`) with hardware-accelerated backdrop blurring (`backdrop-filter: blur(20px)`) to provide clean depth without compromising text contrast.
- **Ergonomic Long-Session Comfort**: Formulated to reduce eye strain during extended night and day engineering sessions.

---

## 2. Zen Mode vs. Visual Mode

Cero has two interface profiles. Switch between them in Settings (Terminal) or with "Toggle UI mode" in the command palette (a `Ctrl+Shift+Z` shortcut is planned: see [FUTURE_SCOPE.md](FUTURE_SCOPE.md)):

### A. Zen Mode (Default)
- Designed for maximum immersion and distraction-free terminal work.
- Hides the Workflows button from the footer status bar.
- Keeps the shell name, folder breadcrumbs, CPU and RAM, the clock and the AI status.

### B. Visual Mode
- Designed for rich mouse-and-keyboard multitasking.
- Adds a **Workflows** button to the status bar that opens the Workflow Manager (`Ctrl+Shift+W`).
- Projects and ports have no buttons: ask in the terminal (`>show listening ports`, `>switch to <folder>`).

---

## 3. Surfaces

Panels use translucent dark surfaces with a backdrop blur and hairline borders (`rgba(255, 255, 255, 0.08)` to `0.14`).
The blur and opacity are fixed in CSS; adjustable sliders are not built yet ([FUTURE_SCOPE.md](FUTURE_SCOPE.md)).

---

## 4. Typography & Numerical Precision

- **Interface Sans-Serif**: Employs system font stacks (`SF Pro Text`, `Segoe UI`, `Inter`, `system-ui`) with sub-pixel antialiasing for modal controls and navigational labels.
- **Terminal Monospace Stack**: Uses `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, and `Consolas` for code buffers, paths, and status telemetry.
- **Tabular Numerals**: Enforces `font-variant-numeric: tabular-nums` across timers, CPU/RAM usage meters, and prompt percentage progress counters to eliminate layout jitter during high-frequency updates.

---

## 5. Comprehensive Design System Reference

For the exhaustive specification of color tokens, surface elevations, type scales, border definitions, and component hierarchies, refer to:
- **[`ui.md`](ui.md)** — Master UI Design System & Aesthetic Architecture.
