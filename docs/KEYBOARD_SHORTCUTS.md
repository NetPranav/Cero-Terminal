# Cero — Master Keyboard Shortcuts Guide

Cero is engineered for rapid keyboard-first navigation and efficient control of multi-pane terminal workspaces. All capabilities, navigation panels, and modal overlays are accessible via keybindings.

---

## 1. Global Navigation & Developer Modals

| Action | Linux / Windows Shortcut | macOS Shortcut | Description |
| :--- | :--- | :--- | :--- |
| **Open Command Palette** | `Ctrl + Shift + P` | `Cmd + Shift + P` | Launches the interactive prompt and capability search palette. |
| **Cero Settings Center** | `Ctrl + ,` | `Cmd + ,` | Opens full-screen Settings Center (AI Models, Desktop Integrations, Terminal Experience, General & Setup). |
| **Fuzzy History Search** | `Ctrl + R` | `Ctrl + R` | Interactive fuzzy search across past command history with instant paste-to-terminal. |
| **Terminal Find / Search** | `Ctrl + F` | `Cmd + F` | Opens floating terminal search bar overlay with match counters. |
| **Toggle Zen / Visual Mode** | `Ctrl + Shift + Z` | `Cmd + Shift + Z` | Switches between distraction-free Zen mode and full Visual Mode with quick buttons. |
| **Keyboard Shortcuts & Help** | `F1` or `Ctrl + ?` | `F1` or `Cmd + ?` | Opens the interactive Keyboard Shortcuts & Help modal overlay. |
| **Inspect Ports / Switch Dirs** | `>` prompt in terminal | `>` prompt in terminal | Ask AI directly: `> show open ports` or `> cd to <project>`. |

---

## 2. Tab Management

| Action | Linux / Windows Shortcut | macOS Shortcut | Description |
| :--- | :--- | :--- | :--- |
| **New Tab** | `Ctrl + T` | `Cmd + T` | Creates a new terminal session tab in the active workspace. |
| **Close Active Tab** | `Ctrl + W` | `Cmd + W` | Closes active tab and safely terminates running child processes. |
| **Switch to Tab (1–9)** | `Ctrl + 1` … `Ctrl + 9` | `Cmd + 1` … `Cmd + 9` | Directly selects tab by numerical index. |
| **Next Tab** | `Ctrl + Tab` or `Ctrl + Shift + ]` | `Cmd + Shift + ]` | Moves focus to the next open workspace tab. |
| **Previous Tab** | `Ctrl + Shift + Tab` or `Ctrl + Shift + [` | `Cmd + Shift + [` | Moves focus to the previous open workspace tab. |
| **Rename Tab** | *Double-Click Tab Pill* | *Double-Click Tab Pill* | Activates inline text editor to assign persistent custom tab labels. |

---

## 3. Split Pane Controls

| Action | Linux / Windows Shortcut | macOS Shortcut | Description |
| :--- | :--- | :--- | :--- |
| **Split Pane Vertically** | `Ctrl + Shift + D` | `Cmd + D` | Divides active pane vertically into two side-by-side environments. |
| **Split Pane Horizontally** | `Ctrl + Shift + H` | `Cmd + Shift + D` | Divides active pane horizontally into upper and lower environments. |
| **Navigate Panes** | `Alt + Arrow Keys` | `Cmd + Option + Arrow Keys` | Moves focus between adjacent split panes. |
| **Resize Split Panes** | *Drag Divider* | *Drag Divider* | Drag the hairline split divider with 8px hitbox to adjust pane ratios. |

---

## 4. Terminal Search Bar Shortcuts (`Ctrl + F`)

When the search overlay is open:

| Action | Shortcut | Description |
| :--- | :--- | :--- |
| **Toggle Case Sensitivity** | `Alt + C` | Matches exact uppercase/lowercase character casing. |
| **Toggle Whole Word** | `Alt + W` | Matches only complete whole words surrounded by word boundaries. |
| **Toggle Regular Expressions** | `Alt + R` | Enables full regex pattern search syntax. |
| **Find Next Match** | `Enter` or `Down Arrow` | Navigates to next occurrence in scrollback buffer. |
| **Find Previous Match** | `Shift + Enter` or `Up Arrow` | Navigates to previous occurrence in scrollback buffer. |
| **Close Search Bar** | `Escape` | Closes search overlay and refocuses terminal PTY. |

---

## 5. Shell & AI Interaction Shortcuts

| Action | Shortcut | Description |
| :--- | :--- | :--- |
| **Summon AI Assistant** | `>` + *Instruction* | Prefix commands with `>` to trigger natural language execution. |
| **Accept Ghost Text Suggestion** | `Tab` (and `Right Arrow`, if turned on) | Autocompletes the grey suggestion at the end of the line. Arrow keys only move the cursor unless you turn on "accept with Right Arrow" in Settings. A suggestion is only accepted while it still matches exactly what is on the line: after a paste or an edit it is dropped. |
| **Accept Auto-Heal Remediation** | `Tab` | When an error occurs with an active remediation pill, press `Tab` to execute. |
| **Direct Auto-Heal Commands** | `>fix` or `>heal` | Manually triggers diagnostic auto-heal on recent terminal error output. |
| **Cancel Active AI / Shell Process** | `Ctrl + C` | Cancels the running AI request: model call, running commands and open approval dialogs stop, and the task shows as cancelled. Prompts waiting in the queue are kept and the queue is paused (resume with `/queue resume` or the queue panel). Press `Ctrl + C` again within 1.5 seconds to clear the paused queue. A draft you are typing is kept. With no AI task running, `Ctrl + C` goes to the shell as usual. |
| **Queue Panel** | `/queue`, or click the queue count in the status bar | Lists the running task and the waiting prompts in order, with remove, move, pause/resume and stop. `Escape` closes it while it has focus. |
| **Close Settings** | `Escape` | Closes the Settings screen. A dropdown or field that is open inside Settings handles its own `Escape` first. |
| **Clear Terminal Buffer** | `Ctrl + L` or `clear` | Wipes visual terminal screen while preserving session context. |
