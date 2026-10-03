# Cero — Complete AI Tool Calling Test Suite

> **Ready-to-Test Command Reference**: Every command in this guide is verified to run in Cero. These test cases directly invoke Cero's **101 registered capability drivers** via either the sub-millisecond **Fast-Path Engine** or the local **ReAct Agent Loop**.

---

## 🚀 Quick Start: High-Priority Test Checklist

Try pasting these foundational commands directly into your Cero prompt:

| # | What You Want to Test | Command to Type in Cero | Tool Invoked | Execution Mode |
| :-: | :--- | :--- | :--- | :---: |
| 1 | **Turn Bluetooth On** | `turn on bluetooth` | `network.bluetooth.on` | ⚡ Fast-Path |
| 2 | **Check Available Bluetooth Devices** | `check if any bluetooth device is available` | `network.bluetooth.list` | 🤖 Agent Loop |
| 3 | **Connect Soundcore Space One** | `connect soundcore space one headphone` | `network.bluetooth.connect` | 🤖 Agent Loop |
| 4 | **Turn Bluetooth Off** | `turn off bluetooth` | `network.bluetooth.off` | ⚡ Fast-Path |
| 5 | **Scan Wi-Fi Networks** | `scan for available wifi networks` | `network.wifi.scan` | 🤖 Agent Loop |
| 6 | **Check Battery Level** | `what is my battery level?` | `system.battery` | ⚡ Fast-Path |
| 7 | **Top CPU Consuming Process** | `which process is using the most CPU?` | `system.processes` | ⚡ Fast-Path |
| 8 | **Available Disk Space** | `check available disk space` | `system.storage` | ⚡ Fast-Path |
| 9 | **Check Open Port** | `check if port 3000 is open` | `network.ports` | ⚡ Fast-Path |
| 10 | **Instant Navigation** | `take me to downloads folder` | `filesystem.navigate` | ⚡ Fast-Path |
| 11 | **Smart File Search** | `find all json files in tools` | `filesystem.search` | ⚡ Fast-Path |
| 12 | **Open Desktop App** | `open Safari` | `application.open` | ⚡ Fast-Path |
| 13 | **Web Navigation** | `open youtube.com in safari` | `browser.navigate` | 🤖 Agent Loop |
| 14 | **Git Status** | `check git status` | `git.status` | ⚡ Fast-Path |
| 15 | **Hardware Diagnostic** | `system info` | `system.info` | ⚡ Fast-Path |

---

## 🎧 1. Bluetooth & Audio Peripherals

Cero provides direct macOS Bluetooth driver integration (`blueutil` / CoreBluetooth).

### Test Cases

#### 🔹 TC-BT-01: Turn On Bluetooth Radio
- **User Input**: `turn on bluetooth` or `enable bluetooth adapter`
- **Tool Called**: `network.bluetooth.on`
- **Resolution**: ⚡ Fast-Path (Instant Heuristic)
- **Parameters**: `{}`
- **Backend Action**: Executes native macOS Bluetooth power controller to state `1` (`ON`).
- **Expected Terminal Output**: `✓ Bluetooth powered on`

#### 🔹 TC-BT-02: Check Available Bluetooth Devices (User Example)
- **User Input**: `check if any bluetooth device is available` or `show me all bluetooth devices`
- **Tool Called**: `network.bluetooth.list`
- **Resolution**: 🤖 ReAct Agent Loop
- **Parameters**: `{}`
- **Backend Action**: Scans active Bluetooth adapter cache for nearby and paired peripheral devices.
- **Expected Terminal Output**: Formatted list of discovered devices with device names, RSSI/MAC addresses, and connection status.

#### 🔹 TC-BT-03: Connect Soundcore Space One Headphone (User Example)
- **User Input**: `connect soundcore space one headphone`
- **Tool Called**: `network.bluetooth.connect`
- **Resolution**: 🤖 ReAct Agent Loop
- **Parameters**: `{ "device": "soundcore space one headphone" }`
- **Backend Action**: Searches discovered/paired devices for matching Soundcore audio profile and executes connection handshake.
- **Expected Terminal Output**: `✓ Connected to Soundcore Space One`

#### 🔹 TC-BT-04: Turn Off Bluetooth Radio
- **User Input**: `turn off bluetooth` or `disable bluetooth`
- **Tool Called**: `network.bluetooth.off`
- **Resolution**: ⚡ Fast-Path (Instant Heuristic)
- **Parameters**: `{}`
- **Backend Action**: Powers down Bluetooth transceiver to save battery.
- **Expected Terminal Output**: `✓ Bluetooth powered off`

#### 🔹 TC-BT-05: Pair AirPods Pro
- **User Input**: `pair bluetooth headphones AirPods Pro`
- **Tool Called**: `network.bluetooth.connect`
- **Resolution**: 🤖 ReAct Agent Loop
- **Parameters**: `{ "device": "AirPods Pro" }`
- **Expected Terminal Output**: `✓ Connected to AirPods Pro`

---

## 📶 2. Wi-Fi & Network Diagnostics

#### 🔹 TC-WIFI-01: Turn Wi-Fi On
- **User Input**: `turn on wifi` or `enable wi-fi interface`
- **Tool Called**: `network.wifi.on`
- **Parameters**: `{}`
- **Backend Action**: Enables `en0` wireless radio via `networksetup`.

#### 🔹 TC-WIFI-02: Turn Wi-Fi Off
- **User Input**: `turn off wifi` or `disable wi-fi`
- **Tool Called**: `network.wifi.off`
- **Parameters**: `{}`
- **Backend Action**: Disables system airport power.

#### 🔹 TC-WIFI-03: Scan Available Wi-Fi Networks
- **User Input**: `scan for available wifi networks` or `what wifi networks are available nearby?`
- **Tool Called**: `network.wifi.scan`
- **Parameters**: `{}`
- **Expected Output**: List of reachable SSIDs, channels, and signal strengths.

#### 🔹 TC-WIFI-04: Connect to Wi-Fi SSID
- **User Input**: `connect to wifi Office-Network-5G`
- **Tool Called**: `network.wifi.connect`
- **Parameters**: `{ "ssid": "Office-Network-5G" }`

#### 🔹 TC-NET-01: Check Specific Port
- **User Input**: `check if port 3000 is open` or `is port 8080 in use?`
- **Tool Called**: `network.ports`
- **Parameters**: `{ "port": 3000 }`
- **Backend Action**: `lsof -i :3000` socket lookup.

#### 🔹 TC-NET-02: List All Listening Ports
- **User Input**: `show all listening ports` or `open ports`
- **Tool Called**: `network.ports`
- **Parameters**: `{}`

#### 🔹 TC-NET-03: Ping Host / Measure Latency
- **User Input**: `ping google.com` or `test connection to 1.1.1.1`
- **Tool Called**: `network.ping`
- **Parameters**: `{ "host": "google.com" }`

#### 🔹 TC-NET-04: Show Local & Public IP
- **User Input**: `what is my IP address?` or `show my internal and external ip`
- **Tool Called**: `network.ip`
- **Parameters**: `{}`

#### 🔹 TC-NET-05: Query DNS Records
- **User Input**: `lookup DNS for github.com`
- **Tool Called**: `network.dns`
- **Parameters**: `{ "domain": "github.com" }`

#### 🔹 TC-NET-06: Traceroute Network Path
- **User Input**: `traceroute to cloudflare.com`
- **Tool Called**: `network.traceroute`
- **Parameters**: `{ "host": "cloudflare.com" }`

---

## ⚡ 3. System Health & Hardware Surveillance

#### 🔹 TC-SYS-01: Query Battery Percentage & Power State
- **User Input**: `what is my battery level?` or `battery status`
- **Tool Called**: `system.battery`
- **Resolution**: ⚡ Fast-Path
- **Parameters**: `{}`
- **Backend Action**: Queries macOS `pmset` for internal battery percentage and charging cycle.

#### 🔹 TC-SYS-02: Inspect Real-Time CPU Load
- **User Input**: `check CPU utilization` or `how much CPU is the system using right now?`
- **Tool Called**: `system.cpu`
- **Parameters**: `{}`
- **Backend Action**: Samples core load distributions.

#### 🔹 TC-SYS-03: Check GPU Acceleration & VRAM
- **User Input**: `check GPU acceleration status` or `how much VRAM is being used?`
- **Tool Called**: `system.gpu`
- **Parameters**: `{}`
- **Backend Action**: Inspects Metal / CoreGraphics hardware.

#### 🔹 TC-SYS-04: Check Free RAM
- **User Input**: `how much RAM is available?` or `show memory usage and swap capacity`
- **Tool Called**: `system.ram`
- **Parameters**: `{}`
- **Backend Action**: Analyzes `vm_stat` active/wired memory.

#### 🔹 TC-SYS-05: Available Storage Space
- **User Input**: `check available disk space` or `how much free storage do I have on my hard drive?`
- **Tool Called**: `system.storage`
- **Resolution**: ⚡ Fast-Path
- **Parameters**: `{}`

#### 🔹 TC-SYS-06: Top CPU Consuming Processes
- **User Input**: `which process is using the most CPU?` or `top cpu`
- **Tool Called**: `system.processes`
- **Parameters**: `{ "sort": "cpu" }`

#### 🔹 TC-SYS-07: Top Memory Consuming Processes
- **User Input**: `show top memory consuming processes` or `top ram`
- **Tool Called**: `system.processes`
- **Parameters**: `{ "sort": "ram" }`

#### 🔹 TC-SYS-08: Terminate Application Process
- **User Input**: `kill process Google Chrome` or `stop node process`
- **Tool Called**: `system.kill_process`
- **Parameters**: `{ "process": "Google Chrome" }`
- **Security Check**: Triggers user confirmation prompt before execution.

#### 🔹 TC-SYS-09: Lock Workstation Immediately
- **User Input**: `lock the laptop` or `lock the screen now`
- **Tool Called**: `system.lock`
- **Parameters**: `{}`

#### 🔹 TC-SYS-10: Thermal Diode Sensors
- **User Input**: `check thermal sensors` or `is the computer overheating?`
- **Tool Called**: `system.temperature`
- **Parameters**: `{}`

#### 🔹 TC-SYS-11: Uptime Check
- **User Input**: `how long has my system been running?` or `check system uptime`
- **Tool Called**: `system.uptime`
- **Parameters**: `{}`

---

## 📁 4. Filesystem Administration & Search

#### 🔹 TC-FS-01: Instant Directory Navigation
- **User Input**: `take me to downloads folder`
- **Tool Called**: `filesystem.navigate`
- **Resolution**: ⚡ Fast-Path
- **Parameters**: `{ "path": "~/Downloads" }`
- **Effect**: Updates active terminal working directory on screen.

#### 🔹 TC-FS-02: Go Up Directories
- **User Input**: `go back up two directories`
- **Tool Called**: `filesystem.navigate`
- **Parameters**: `{ "path": "../.." }`

#### 🔹 TC-FS-03: List Files in Current Directory
- **User Input**: `list files` or `ls` or `what's in here`
- **Tool Called**: `filesystem.list`
- **Parameters**: `{ "path": "." }`

#### 🔹 TC-FS-04: Search Files by Pattern
- **User Input**: `find all json files in tools`
- **Tool Called**: `filesystem.search`
- **Resolution**: ⚡ Fast-Path
- **Parameters**: `{ "dir": "tools", "pattern": "*.json" }`

#### 🔹 TC-FS-05: Fast File Locate by Name
- **User Input**: `locate file named config.json`
- **Tool Called**: `filesystem.locate_files`
- **Parameters**: `{ "name": "config.json" }`

#### 🔹 TC-FS-06: Locate Directory Across Drive
- **User Input**: `locate folder named node_modules`
- **Tool Called**: `filesystem.locate_folders`
- **Parameters**: `{ "name": "node_modules" }`

#### 🔹 TC-FS-07: Read File Content
- **User Input**: `read content of package.json` or `view README.md file`
- **Tool Called**: `filesystem.read`
- **Parameters**: `{ "path": "package.json" }`

#### 🔹 TC-FS-08: Create New File
- **User Input**: `create a new file notes.txt`
- **Tool Called**: `filesystem.create`
- **Parameters**: `{ "path": "notes.txt" }`

#### 🔹 TC-FS-09: Create Directory Hierarchy
- **User Input**: `create a folder called build_output`
- **Tool Called**: `filesystem.mkdir`
- **Parameters**: `{ "path": "build_output" }`

#### 🔹 TC-FS-10: Copy File
- **User Input**: `copy config.json to config.bak`
- **Tool Called**: `filesystem.copy`
- **Parameters**: `{ "source": "config.json", "destination": "config.bak" }`

#### 🔹 TC-FS-11: Move File
- **User Input**: `move draft.md to ~/Documents/draft.md`
- **Tool Called**: `filesystem.move`
- **Parameters**: `{ "source": "draft.md", "destination": "~/Documents/draft.md" }`

#### 🔹 TC-FS-12: Rename File
- **User Input**: `rename old_index.html to index.html`
- **Tool Called**: `filesystem.rename`
- **Parameters**: `{ "path": "old_index.html", "newName": "index.html" }`

#### 🔹 TC-FS-13: Duplicate File
- **User Input**: `duplicate .env.example`
- **Tool Called**: `filesystem.duplicate`
- **Parameters**: `{ "path": ".env.example" }`

#### 🔹 TC-FS-14: Safe Move to Trash
- **User Input**: `move obsolete_report.pdf to trash`
- **Tool Called**: `filesystem.trash`
- **Parameters**: `{ "path": "obsolete_report.pdf" }`

#### 🔹 TC-FS-15: Restore from System Trash
- **User Input**: `restore important_notes.txt from trash`
- **Tool Called**: `filesystem.restore`
- **Parameters**: `{ "name": "important_notes.txt" }`

#### 🔹 TC-FS-16: Compress Folder into Zip
- **User Input**: `compress dist folder into dist.zip`
- **Tool Called**: `filesystem.compress`
- **Parameters**: `{ "source": "dist", "archiveName": "dist.zip" }`

#### 🔹 TC-FS-17: Extract Archive
- **User Input**: `extract bundle.zip archive`
- **Tool Called**: `filesystem.extract`
- **Parameters**: `{ "archivePath": "bundle.zip" }`

#### 🔹 TC-FS-18: Search by File Content (Grep)
- **User Input**: `search for pattern TODO in src`
- **Tool Called**: `filesystem.grep`
- **Parameters**: `{ "path": "src", "query": "TODO" }`

#### 🔹 TC-FS-19: File Permissions Check & Modify
- **User Input**: `check permissions of deploy.sh`
- **Tool Called**: `filesystem.permissions`
- **Parameters**: `{ "path": "deploy.sh" }`

---

## 🖥️ 5. Desktop Application Lifecycle

#### 🔹 TC-APP-01: Launch Application
- **User Input**: `open Safari` or `launch Visual Studio Code` or `open Slack`
- **Tool Called**: `application.open`
- **Resolution**: ⚡ Fast-Path
- **Parameters**: `{ "app": "Safari" }`

#### 🔹 TC-APP-02: Graceful Close
- **User Input**: `close Spotify` or `quit Telegram`
- **Tool Called**: `application.close`
- **Parameters**: `{ "app": "Spotify" }`

#### 🔹 TC-APP-03: Force Quit Frozen App
- **User Input**: `force quit Discord` or `force close Chrome`
- **Tool Called**: `application.force_quit`
- **Parameters**: `{ "app": "Discord" }`

#### 🔹 TC-APP-04: List Running GUI Applications
- **User Input**: `list running applications` or `what apps are open right now?`
- **Tool Called**: `application.list_running`
- **Parameters**: `{}`

#### 🔹 TC-APP-05: Focus Window
- **User Input**: `focus Cursor window` or `bring Terminal to front`
- **Tool Called**: `application.focus`
- **Parameters**: `{ "app": "Cursor" }`

#### 🔹 TC-APP-06: Maximize Window
- **User Input**: `maximize Safari window` or `put VS Code in full screen`
- **Tool Called**: `application.maximize`
- **Parameters**: `{ "app": "Safari" }`

#### 🔹 TC-APP-07: Minimize Window
- **User Input**: `minimize Slack window`
- **Tool Called**: `application.minimize`
- **Parameters**: `{ "app": "Slack" }`

#### 🔹 TC-APP-08: Package Install via Homebrew
- **User Input**: `install htop via brew` or `install ripgrep`
- **Tool Called**: `application.install`
- **Parameters**: `{ "package": "htop" }`

#### 🔹 TC-APP-09: Update Application
- **User Input**: `update Brave browser`
- **Tool Called**: `application.update`
- **Parameters**: `{ "app": "Brave Browser" }`

---

## 🌐 6. Web Browser Automation

#### 🔹 TC-BRW-01: Open URL in Browser
- **User Input**: `open youtube.com in safari` or `navigate to https://github.com/trending`
- **Tool Called**: `browser.navigate`
- **Parameters**: `{ "url": "youtube.com", "appName": "Safari" }`

#### 🔹 TC-BRW-02: Web Search
- **User Input**: `search the web for Rust ownership` or `google latest TypeScript 5.5 release notes`
- **Tool Called**: `browser.search`
- **Parameters**: `{ "query": "Rust ownership" }`

#### 🔹 TC-BRW-03: Open Blank Tab
- **User Input**: `open a new browser tab`
- **Tool Called**: `browser.new_tab`
- **Parameters**: `{}`

#### 🔹 TC-BRW-04: Close Tab
- **User Input**: `close browser tab`
- **Tool Called**: `browser.close_tabs`
- **Parameters**: `{}`

#### 🔹 TC-BRW-05: Reload Page
- **User Input**: `reload the current web page`
- **Tool Called**: `browser.reload`
- **Parameters**: `{}`

#### 🔹 TC-BRW-06: Browser History
- **User Input**: `show recent browser history`
- **Tool Called**: `browser.history`
- **Parameters**: `{}`

---

## 🌿 7. Git Version Control

#### 🔹 TC-GIT-01: Check Git Status
- **User Input**: `git status` or `check git status and recent changes`
- **Tool Called**: `git.status`
- **Resolution**: ⚡ Fast-Path
- **Parameters**: `{}`

#### 🔹 TC-GIT-02: Commit History Log
- **User Input**: `show recent git commits` or `git log`
- **Tool Called**: `git.log`
- **Resolution**: ⚡ Fast-Path
- **Parameters**: `{}`

#### 🔹 TC-GIT-03: View Unstaged Diff
- **User Input**: `view git diff for unstaged changes` or `show git diff`
- **Tool Called**: `git.diff`
- **Parameters**: `{}`

#### 🔹 TC-GIT-04: List Git Branches
- **User Input**: `list all git branches` or `what git branch am I on?`
- **Tool Called**: `git.branch`
- **Parameters**: `{}`

#### 🔹 TC-GIT-05: Switch Branch
- **User Input**: `switch to branch feature/bluetooth-tools` or `checkout main`
- **Tool Called**: `git.checkout`
- **Parameters**: `{ "target": "main" }`

#### 🔹 TC-GIT-06: Record Git Commit
- **User Input**: `commit changes with message "feat: add bluetooth testing suite"`
- **Tool Called**: `git.commit`
- **Parameters**: `{ "message": "feat: add bluetooth testing suite" }`

#### 🔹 TC-GIT-07: Stash Workspace
- **User Input**: `stash workspace modifications`
- **Tool Called**: `git.stash`
- **Parameters**: `{}`

#### 🔹 TC-GIT-08: Clone Repository
- **User Input**: `clone git repo https://github.com/facebook/react.git`
- **Tool Called**: `git.clone`
- **Parameters**: `{ "url": "https://github.com/facebook/react.git" }`

---

## 🛠️ 8. Developer Environments & Scaffolding

#### 🔹 TC-DEV-01: Open in VS Code
- **User Input**: `open current project in VS Code` or `open vscode here`
- **Tool Called**: `developer.vscode`
- **Parameters**: `{}`

#### 🔹 TC-DEV-02: Open in Cursor AI IDE
- **User Input**: `open in Cursor AI IDE`
- **Tool Called**: `developer.cursor`
- **Parameters**: `{}`

#### 🔹 TC-DEV-03: Full-Stack Project Scaffold
- **User Input**: `make a folder and initialize a frontend with next project and backend with python django`
- **Tool Called**: `developer.scaffold`
- **Parameters**: `{ "projectName": "my_project", "frontend": "nextjs", "backend": "django" }`
- **Backend Action**: Scaffolds client and server starter directory structures.

#### 🔹 TC-DEV-04: GitHub CLI PR List
- **User Input**: `interact with GitHub CLI pr list` or `gh repo status`
- **Tool Called**: `developer.github`
- **Parameters**: `{ "command": "pr list" }`

#### 🔹 TC-DEV-05: Remote SSH Session
- **User Input**: `connect via SSH to dev@192.168.1.50`
- **Tool Called**: `developer.ssh`
- **Parameters**: `{ "target": "dev@192.168.1.50" }`

---

## 🐳 9. Docker Container Orchestration

#### 🔹 TC-DKR-01: List Containers
- **User Input**: `list running Docker containers` or `show docker containers`
- **Tool Called**: `docker.ps`
- **Parameters**: `{}`

#### 🔹 TC-DKR-02: List Images
- **User Input**: `list cached Docker images`
- **Tool Called**: `docker.images`
- **Parameters**: `{}`

#### 🔹 TC-DKR-03: Docker Compose Up
- **User Input**: `start docker compose stack` or `docker-compose up -d`
- **Tool Called**: `docker.compose_up`
- **Parameters**: `{}`

#### 🔹 TC-DKR-04: Docker Compose Down
- **User Input**: `stop docker compose stack` or `docker-compose down`
- **Tool Called**: `docker.compose_down`
- **Parameters**: `{}`

#### 🔹 TC-DKR-05: Container Logs
- **User Input**: `retrieve logs for container web-api`
- **Tool Called**: `docker.logs`
- **Parameters**: `{ "container": "web-api" }`

#### 🔹 TC-DKR-06: Stop Container
- **User Input**: `stop container redis-cache`
- **Tool Called**: `docker.stop`
- **Parameters**: `{ "container": "redis-cache" }`

#### 🔹 TC-DKR-07: Restart Container
- **User Input**: `restart container nginx-gateway`
- **Tool Called**: `docker.restart`
- **Parameters**: `{ "container": "nginx-gateway" }`

#### 🔹 TC-DKR-08: Execute Inside Container
- **User Input**: `execute "uptime" inside container web-api`
- **Tool Called**: `docker.exec`
- **Parameters**: `{ "container": "web-api", "command": "uptime" }`

---

## 📦 10. Node.js & Package Managers

#### 🔹 TC-NODE-01: Install NPM Dependencies
- **User Input**: `install npm dependencies` or `run npm install`
- **Tool Called**: `node.npm_install`
- **Parameters**: `{}`

#### 🔹 TC-NODE-02: Run NPM Script
- **User Input**: `run npm script "build"` or `run npm script "test"`
- **Tool Called**: `node.npm_run`
- **Parameters**: `{ "script": "build" }`

#### 🔹 TC-NODE-03: PNPM Execution
- **User Input**: `run pnpm install` or `run pnpm dev`
- **Tool Called**: `node.pnpm`
- **Parameters**: `{ "command": "install" }`

#### 🔹 TC-NODE-04: Yarn Execution
- **User Input**: `run yarn build`
- **Tool Called**: `node.yarn`
- **Parameters**: `{ "command": "build" }`

#### 🔹 TC-NODE-05: Bun Runtime
- **User Input**: `run bun test` or `run bun run index.ts`
- **Tool Called**: `node.bun`
- **Parameters**: `{ "command": "test" }`

---

## 🐍 11. Python & Data Science

#### 🔹 TC-PY-01: Create Virtual Environment
- **User Input**: `create a Python virtual environment` or `setup python venv in current directory`
- **Tool Called**: `python.create_venv`
- **Parameters**: `{}`

#### 🔹 TC-PY-02: Pip Package Install
- **User Input**: `install requests package using pip` or `pip install pandas numpy`
- **Tool Called**: `python.pip_install`
- **Parameters**: `{ "package": "requests" }`

#### 🔹 TC-PY-03: Execute Python Script
- **User Input**: `run python script main.py`
- **Tool Called**: `python.run_script`
- **Parameters**: `{ "script": "main.py" }`

#### 🔹 TC-PY-04: Launch Jupyter Notebook
- **User Input**: `launch Jupyter Notebook` or `start jupyter lab environment`
- **Tool Called**: `python.notebook`
- **Parameters**: `{}`

---

## 🐚 12. Compound Shell Pipelines

When no specialized single tool matches, Cero automatically routes compound commands through `shell.execute`:

#### 🔹 TC-SH-01: Pwd & Git Branch Chain
- **User Input**: `show the current directory and its git branch`
- **Tool Called**: `shell.execute`
- **Parameters**: `{ "command": "pwd && git branch --show-current" }`

#### 🔹 TC-SH-02: Find Largest Files Pipeline
- **User Input**: `find the ten largest files here`
- **Tool Called**: `shell.execute`
- **Parameters**: `{ "command": "find . -type f -print0 | xargs -0 du -h | sort -hr | head -10" }`

#### 🔹 TC-SH-03: System Status Chain
- **User Input**: `run uptime && whoami`
- **Tool Called**: `shell.execute`
- **Parameters**: `{ "command": "uptime && whoami" }`

---

## 🧪 Verifying Test Cases

To verify that Cero's tool calling works as expected:

1. **Interactive Manual Testing**:
   Open Cero and enter any of the test commands above. Watch the bottom status line or pane reflect the active tool execution and the updated terminal state.

2. **Automated Unit Testing via Vitest**:
   Run the verification test suite directly from your terminal:
   ```bash
   npx vitest run tests/tool_calling.test.ts
   ```
