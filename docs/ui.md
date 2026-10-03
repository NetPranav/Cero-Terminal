# Cero UI Design System & Aesthetic Architecture

Cero is built around a philosophy of focused minimalism, low cognitive load, and visual precision. Inspired by professional audio equipment, high-end camera interfaces, and modern developer environments, Cero employs a strictly matte monochrome and grayscale palette. By stripping away visual clutter, neon glows, and saturated colors, the interface prioritizes text legibility, spatial hierarchy, and long-session ergonomic comfort.

---

## 1. Design Philosophy

- **Zero-Distraction Monochromaticity**: All core chrome, navigational controls, modals, and status badges operate within a unified grayscale spectrum. Contrast is achieved through calibrated lightness levels and subtle opacity tiers rather than competing chromatic hues.
- **Matte & Zero-Glow Styling**: Avoids aggressive neon box-shadows, glossy plastic gradients, or oversaturated borders. Surfaces maintain a dry matte charcoal finish with crisp 1px hairline borders.
- **Glassmorphic Dimensionality**: Leverages hardware-accelerated background blur (`backdrop-filter: blur(20px)`) over deep obsidian canvases to create depth between overlapping windows, floating drawers, and terminal buffers.
- **Sub-Pixel Precision**: Hairline divider lines (`0.5px` to `1px`), strict typographic scales, and tabular numerical alignment ensure dense information layouts remain clean and structured.

---

## 2. Grayscale Color System & Design Tokens

Every UI component draws from a cohesive set of grayscale tokens:

### A. Surface & Background Tokens

| Token Name | Value | Purpose |
| :--- | :--- | :--- |
| `surface-canvas` | `#0A0A0C` | Root application window canvas under acrylic blur |
| `surface-app` | `rgba(16, 18, 22, 0.92)` | Main application frame with active frosted glass filtering |
| `surface-tabs` | `rgba(16, 18, 24, 0.90)` | Top window header and tab bar strip |
| `surface-status` | `rgba(18, 20, 24, 0.95)` | Bottom persistent telemetry and telemetry bar |
| `surface-card` | `rgba(255, 255, 255, 0.025)` | Inset cards, workflow steps, and setting modules |
| `surface-card-hover`| `rgba(255, 255, 255, 0.055)` | Hover state for interactive cards and list items |
| `surface-modal` | `rgba(18, 20, 25, 0.96)` | Command palette, workspace switcher, and modal backdrops |
| `surface-input` | `rgba(255, 255, 255, 0.04)` | Text input fields, search bars, and editable inputs |
| `surface-pill` | `rgba(255, 255, 255, 0.05)` | Status bar buttons, tags, and secondary action badges |

### B. Border & Hairline Tokens

| Token Name | Value | Purpose |
| :--- | :--- | :--- |
| `border-subtle` | `rgba(255, 255, 255, 0.06)` | Subtle dividing lines, table rows, and section headers |
| `border-card` | `rgba(255, 255, 255, 0.08)` | Outer boundaries of cards, panels, and drawer bodies |
| `border-interactive` | `rgba(255, 255, 255, 0.14)` | Resting border for action buttons, inputs, and tab pills |
| `border-focus` | `rgba(255, 255, 255, 0.30)` | Focused inputs, hovered buttons, and active tabs |
| `border-active` | `rgba(255, 255, 255, 0.50)` | Active split dividers and primary state selections |

### C. Typographic Contrast Hierarchy

| Level | Value | Color Representation | Intended Usage |
| :--- | :--- | :--- | :--- |
| **Primary** | `#FFFFFF` / `rgba(255, 255, 255, 0.95)` | Pure White | Active tab titles, modal headers, command inputs, prompt goal text |
| **Secondary** | `rgba(255, 255, 255, 0.70)` | Silver / Light Ash | Status telemetry labels, card descriptions, inactive tab titles |
| **Muted** | `rgba(255, 255, 255, 0.45)` | Mid Charcoal Gray | Shortcut keys, timestamps, placeholder text, secondary metadata |
| **Subtle** | `rgba(255, 255, 255, 0.25)` | Deep Muted Gray | Breadcrumb arrows, inactive separator bars, disabled options |

---

## 3. Typography & Font System

Cero utilizes a dual-font architecture:

1. **System Interface Sans-Serif**:
   - **Font Stack**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Inter, system-ui, sans-serif`
   - **Usage**: Window headers, tab labels, settings forms, modal search inputs, buttons, and drawer summaries.
   - **Characteristics**: Antialiased rendering (`-webkit-font-smoothing: antialiased`), geometric proportions, and optical kerning.

2. **Terminal Monospace Stack**:
   - **Font Stack**: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`
   - **Usage**: Active terminal buffers, status bar path breadcrumbs, command history, workflow CLI steps, and system telemetry metrics.
   - **Numerics**: Enforces `font-variant-numeric: tabular-nums` across timers, CPU/memory stats, and percentage indicators so widths remain stable without jitter during real-time updates.

### Type Scale

| Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- |
| `10px` | Medium (500) | `1.2` | Telemetry units, keyboard shortcut badges, micro progress counts |
| `11px` | Regular (400) / SemiBold (600) | `1.3` | Status bar, path breadcrumbs, port labels |
| `12px` | Regular (400) / Medium (500) | `1.4` | Tab pills, card metadata, list item descriptions |
| `13px` | Regular (400) | `1.4` | Command palette search input, form inputs, drawer step commands |
| `14px` | Regular (400) | `1.45` | Core xterm terminal buffer, modal body copy |
| `16px` | Medium (500) | `1.3` | Section headings, drawer titles, modal header titles |
| `18px` | SemiBold (600) | `1.25` | Main application view titles, architecture overview header |

---

## 4. Layout Architecture & Component Hierarchy

```
+-----------------------------------------------------------------------------+
|  [Tabs Bar]  Traffic-light Inset / Logo | Tab 1 (Active) | Tab 2 | [+]  [-]  |
+-----------------------------------------------------------------------------+
|                                                                             |
|  [Terminal Workspace]                                                       |
|  +-----------------------------------+-----------------------------------+  |
|  | Pane 1 (bash)                     | Pane 2 (split)                    |  |
|  | WebGL accelerated canvas          | WebGL accelerated canvas          |  |
|  | Ghost text inline suggestion      |                                   |  |
|  | > natural language prompt trigger |                                   |  |
|  +-----------------------------------+-----------------------------------+  |
|                                                                             |
|  [Floating Overlays: Command Palette | Workspace Switcher | Workflow Drawer]|
|                                                                             |
+-----------------------------------------------------------------------------+
|  [Status Bar]  ❯_ bash | ~/Projects/sentinal  | [45% Thinking...] [CPU] [RAM]|
+-----------------------------------------------------------------------------+
```

### A. Window Header & Tabs Bar (`.tabs-bar`)
- **Dimensions**: Fixed `36px` height.
- **Platform Insets**:
  - **macOS**: `padding: 0 10px 0 78px` to clear native traffic-light window controls while preserving `-webkit-app-region: drag` for window movement.
  - **Linux / Windows**: `padding: 0 10px 0 12px` for immediate left edge alignment.
- **Tab Pills (`.tab-pill`)**:
  - Resting state: Transparent background, `opacity: 0.55`, `color: #FFFFFF`.
  - Hover state: Background `rgba(255, 255, 255, 0.05)`, `opacity: 0.85`.
  - Active state: Background `rgba(255, 255, 255, 0.09)`, border `1px solid rgba(255, 255, 255, 0.14)` (border-bottom none), `opacity: 1.0`.
  - Features: Double-click to rename with inline text input, close button with subtle hover fade.

### B. Split Pane Workspace
- **Binary Tree Layout**: Recursive vertical and horizontal splitting supporting infinite nested panes.
- **Draggable Dividers**:
  - `1px` subtle boundary line (`rgba(255, 255, 255, 0.08)`).
  - `8px` invisible grab hitbox via `::before` pseudo-element for easy mouse targeting.
  - Active dragging indicator: Bright hairline divider (`rgba(255, 255, 255, 0.5)`) accompanied by an invisible full-window drag overlay to prevent canvas event capture.

### C. Terminal Search Bar Overlay (`TerminalSearchBar.tsx`)
- Positioned floating at the top-right of the active terminal pane with frosted glass backdrop.
- Search input with inline match count indicator (e.g. `3 of 12`).
- Monochrome toggle pills for **Case Sensitive (`Alt+C`)**, **Whole Word (`Alt+W`)**, and **Regex (`Alt+R`)**. Active state indicated by solid white border and elevated background.

### D. Persistent Status Bar (`StatusBar.tsx`)
- **Dimensions**: Fixed `30px` height at bottom of window.
- **Surface**: `rgba(18, 20, 24, 0.95)` with `backdrop-filter: blur(16px)` and top border `1px solid rgba(255, 255, 255, 0.06)`.
- **Left Cluster**:
  - Shell badge (`❯_ bash`) in high-contrast white.
  - Clickable breadcrumb path navigation with subtle right chevron separators. Clicking any folder segment issues an automatic directory change command.
- **Right Cluster**:
  - Quick launcher buttons (`[Projects]`, `[Ports]`, `[Workflows]`) in Visual Mode.
  - **Embedded AI Status**:
    - **Active Engine**: Muted monochrome status pill (`● AI: Ready` or `● AI (CPU)`) with glowing white status dot indicating native sidecar readiness. Clicking opens AI settings.
    - **Offline Engine**: Soft muted pill (`● AI: Off`) with `rgba(255, 255, 255, 0.25)` dot.
  - **Telemetry Indicators**:
    - CPU usage percentage with hardware icon.
    - RAM memory allocation (`MB` / `GB`).
    - Local time clock (24h format).
    - Text encoding (`UTF-8`).
    - Help shortcut launcher (`[F1 help]`).

---

## 5. Overlays, Modals & Drawers

### A. Command Palette (`CommandPalette.tsx`)
- Invocation: `Ctrl+Shift+P` / `Cmd+Shift+P`.
- Centered floating window (`560px` max width, `12vh` top offset).
- Deep charcoal background (`rgba(18, 20, 25, 0.96)`) with high-elevation shadow (`0 24px 64px rgba(0, 0, 0, 0.85)`).
- Full keyboard navigation with `ArrowUp`, `ArrowDown`, `Enter` selection, and `Escape` exit.
- Highlighted items use an elevated white surface (`rgba(255, 255, 255, 0.08)`) with crisp white primary text.

### B. Workspace Switcher (`WorkspaceSwitcherModal.tsx`)
- Invocation: `Ctrl+O`.
- Automatically indexes directories, Git repositories, Node.js packages, Rust crates, and ROS2 workspaces.
- Filterable search bar with monospace path tags and repository branch status badges.

### C. Fuzzy Command History Search (`HistorySearchModal.tsx`)
- Invocation: `Ctrl+R`.
- Intercepts shell raw byte handling to provide visual fuzzy searching across command histories.
- Up/Down navigation with instant paste-to-terminal execution.

### D. Workflow & Macro Manager Drawer (`WorkflowManagerDrawer.tsx`)
- Slides out from the right workspace edge.
- Dark graphite cards displaying recorded command steps, exit codes, and execution parameters.
- Replay console with step-by-step verification and stdout inspector.

### E. AI Architecture & Multi-Model Settings (`AiSettingsPage.tsx`)
- Centered layout (`840px` maximum width) adhering strictly to the grayscale design system.
- Dual-tab navigation:
  1. **Local Engine & Hardware Tiers**: Displays detected CPU cores, RAM, and GPU specs with an automatic hardware tier badge (`Budget`, `Balanced`, `Performance`, `Workstation`), recommended local models with `Optimal` tags, memory footprints, and one-click download buttons.
  2. **Cloud API Keys & External Providers**: Zero-local-footprint inference configuration supporting OpenAI, Anthropic, Groq, DeepSeek, OpenRouter, and Custom Endpoints, complete with masked API key inputs and interactive "Test Connection" verification probes.
- Flat monochrome action buttons (`background: rgba(255, 255, 255, 0.08)`, border `rgba(255, 255, 255, 0.14)`).

---

## 6. Micro-Interactions & Animation Specs

- **Timing Curves**:
  - Modal emergence: `cubic-bezier(0.16, 1, 0.3, 1)` over `200ms`.
  - Hover transitions: `ease` over `150ms`.
  - Progress bar width updates: `ease-out` over `120ms`.
- **Feedback States**:
  - Button hover: Lightness increases by `rgba(255, 255, 255, 0.04)` to `0.08`.
  - Button click/press: Subtle scale reduction (`transform: scale(0.98)`).
  - Status indicator pulse: Smooth opacity breathing between `0.4` and `1.0` during active token generation.

---

## 7. Ergonomics & Accessibility Standards

- **WCAG AAA Text Legibility**: Primary text meets a minimum contrast ratio of 12:1 against the charcoal canvas; secondary text exceeds 7:1.
- **Zen Mode vs. Visual Mode**:
  - **Zen Mode**: Hides all secondary buttons, port indicators, and auxiliary controls for maximum terminal buffer focus.
  - **Visual Mode**: Reveals graphical workspace management buttons, port inspection triggers, and workflow tools.
- **Keyboard-First Design**: 100% of modals, split management, search tools, and workflows can be accessed, navigated, and dismissed entirely via standard keyboard shortcuts without requiring mouse movement.

---

## 8. Strict No-Emoji Policy & Terminal Glyph Design System

Cero strictly enforces a **Zero-Emoji Policy** across the entire application interface, including React DOM components, modals, toasts, status telemetry, and CLI/terminal stdout/stderr banners:

### Core Rules
- **No Consumer Emojis**: Emojis such as `🛡️`, `📖`, `💡`, `⛔`, `⚠️`, `🚀`, `🔥`, `📁`, `📄`, or `✅` are completely forbidden.
- **Developer-Centric Glyph Architecture**: Replace consumer emojis with high-precision monospace glyphs, ANSI styling, and box-drawing characters:
  - **Critical / Security Block**: `[!]` with bold red ANSI (`\x1b[1;31m`) or `✕` in white/red.
  - **Information / Diagnostics**: `[i]` with cyan ANSI (`\x1b[1;36m`) or `::` token.
  - **Success / Safe Alternative**: `[+]` with green ANSI (`\x1b[1;32m`) or `✓` in crisp white.
  - **Policy / System Notice**: `[#]` with muted gray ANSI (`\x1b[1;30m`).
  - **Navigation / Pointers**: `->` or `›` or `•`.
  - **Filesystem Entries**: Clean text badges like `[DIR]` and `[FILE]` instead of folder/file icons.
  - **Hardware / Battery**: `[AC]` (charging) and `[BAT]` (discharging).
- **Terminal Refusal Banners**: Box-drawing characters (`┌`, `─`, `┐`, `│`, `└`, `┘`) must be used for framing with uniform padding and zero emoji jitter.

---

## 9. Onboarding Skeletons & Zen Mode Help Callout

### A. Terminal Experience Skeletons (`InstallerWizard.tsx`)
During the first-time setup onboarding flow, users choose between **Zen Mode** and **Visual Mode**. Rather than generic descriptions or colorful illustrations, Cero presents realistic, live wireframe skeletons:
- **Zen Mode Wireframe Skeleton**: Demonstrates the minimal workspace—showing a single terminal prompt, tab header noting hidden controls on rest, and a clean status line without auxiliary action buttons.
- **Visual Mode Wireframe Skeleton**: Demonstrates the multi-pane development workspace—showing split panes (`npm run dev` alongside `htop`), active action pills (`Find`, `Split`), and the highlighted `[Workflows]` button in the status bar.

### B. Post-Onboarding Zen Mode Keybind Guidance (`ZenModeHelpCallout.tsx`)
When a user selects Zen Mode, an unobtrusive floating callout appears after onboarding completion:
- Directly explains that all controls remain fully accessible via keyboard shortcuts.
- Prominently highlights the `[F1 help]` button in the bottom status bar with a high-contrast white border.
- Informs the user of the toggle shortcut: `Ctrl+Shift+Z` to seamlessly switch between Zen Mode and Visual Mode at any moment.
