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

Cero provides two distinct operational interface profiles toggled instantly via **`Ctrl + Shift + Z`** (or **`Cmd + Shift + Z`**):

### A. Zen Mode (Default)
- Designed for maximum immersion and distraction-free terminal work.
- Hides auxiliary action buttons (`[Projects]`, `[Ports]`, `[Workflows]`) from the footer status bar.
- Retains only essential shell details, directory path breadcrumbs, live hardware telemetry, and the embedded AI status indicator.

### B. Visual Mode
- Designed for rich mouse-and-keyboard multitasking.
- Surfaces dedicated one-click launcher buttons in the status bar:
  - **`[Projects]`**: Opens the Workspace & Git Repository Switcher (`Ctrl+O`).
  - **`[Ports]`**: Opens the Listening Ports & Process Inspector drawer (`Ctrl+Alt+P`).
  - **`[Workflows]`**: Opens the Workflow & Macro Manager drawer.

---

## 3. Dynamic Glassmorphism & Opacity Controls

Cero provides granular control over window translucency and background blur:

- **Acrylic Transparency**: Adjust window opacity dynamically from deep frosted obsidian to solid pitch black.
- **Backdrop Blur Depth**: Configure blur radius (from `10px` to `30px`) to smoothly diffuse underlying desktop windows and wallpapers without impacting character sharpness.
- **Sub-Pixel Hairline Borders**: Modals, tabs, and split dividers utilize subtle hairline borders (`rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.14)`) providing crisp edge definition on Retina and 4K displays.

---

## 4. Typography & Numerical Precision

- **Interface Sans-Serif**: Employs system font stacks (`SF Pro Text`, `Segoe UI`, `Inter`, `system-ui`) with sub-pixel antialiasing for modal controls and navigational labels.
- **Terminal Monospace Stack**: Uses `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, and `Consolas` for code buffers, paths, and status telemetry.
- **Tabular Numerals**: Enforces `font-variant-numeric: tabular-nums` across timers, CPU/RAM usage meters, and prompt percentage progress counters to eliminate layout jitter during high-frequency updates.

---

## 5. Comprehensive Design System Reference

For the exhaustive specification of color tokens, surface elevations, type scales, border definitions, and component hierarchies, refer to:
- **[`docs/ui.md`](file:///docs/ui.md)** — Master UI Design System & Aesthetic Architecture.
