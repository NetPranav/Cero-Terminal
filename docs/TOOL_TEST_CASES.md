# Sentinel Terminal — AI Tool Calling Comprehensive Test Suite

This document defines the complete **AI Tool Calling Test Suite** for Sentinel Terminal. It provides test cases for all **101 autonomous capabilities** currently supported across **11 operational domains**.

Every capability includes real-world natural language prompts, expected JSON tool-call invocations, expected parameter schemas, and verification criteria.

> [!NOTE]
> **User Demonstration Examples Highlighted Below:**
> - **Turn Bluetooth On/Off**: `network.bluetooth.on` & `network.bluetooth.off`
> - **Connect Soundcore Space One Headphone**: `network.bluetooth.connect` (`{"device": "soundcore space one headphone"}`)
> - **Check Available Bluetooth Devices**: `network.bluetooth.list`
>
> All **101 capabilities** are fully covered below, with machine-readable automated test cases stored in [`tests/tool_test_cases.json`](file:///Users/dev/Project%20Folder/AI%20Terminal/tests/tool_test_cases.json).

---

## 📊 Capability Coverage Summary

| Domain | Capabilities | Test Cases | Example Scenarios |
| :--- | :---: | :---: | :--- |
| 📡 **Network & Connectivity** | **14** | **30** | `network.bluetooth.connect`, `network.bluetooth.list`, `network.bluetooth.off` |
| ⚡ **System Health & Hardware Surveillance** | **11** | **24** | `system.battery`, `system.cpu`, `system.gpu` |
| 📁 **Filesystem Administration & Search** | **21** | **45** | `filesystem.compress`, `filesystem.copy`, `filesystem.create` |
| 🖥️ **Desktop Application Lifecycle** | **10** | **21** | `application.close`, `application.focus`, `application.force_quit` |
| 🌐 **Web Browser Automation** | **8** | **16** | `browser.bookmarks`, `browser.close_tabs`, `browser.downloads` |
| 🌿 **Git Version Control** | **11** | **22** | `git.branch`, `git.checkout`, `git.clone` |
| 🛠️ **Developer Environments & Tooling** | **8** | **16** | `developer.android_studio`, `developer.cursor`, `developer.github` |
| 🐳 **Docker Container Orchestration** | **8** | **16** | `docker.compose_down`, `docker.compose_up`, `docker.exec` |
| 📦 **Node.js & JavaScript Ecosystem** | **5** | **10** | `node.bun`, `node.npm_install`, `node.npm_run` |
| 🐍 **Python Runtime & Virtual Environments** | **4** | **8** | `python.create_venv`, `python.notebook`, `python.pip_install` |
| 🐚 **Shell & Compound Pipeline Execution** | **1** | **3** | `shell.execute` |
| **TOTAL** | **101 Tools** | **211 Test Cases** | **100% Operational Capability Coverage** |

---

## 🧠 Tool Calling Execution Model

When a user submits a prompt in Sentinel Terminal:
1. **Fast-Path Engine**: Evaluates high-frequency deterministic regex shortcuts (e.g., instant navigation `cd`, `turn on bluetooth`, `system info`) for sub-millisecond execution.
2. **ReAct Agent Loop (`AgentLoop.ts`)**: When complex or natural language objectives are supplied, the local LLM evaluates the system prompt containing registered tool definitions.
3. **Structured JSON Output**: The LLM emits a single tool execution action:
   ```json
   {
     "action": "tool",
     "tool": "<tool.id>",
     "params": { ... }
   }
   ```
4. **Execution Engine & Security Gate**: Invokes concrete TypeScript drivers in `CapabilityRegistrySDK`, verifies policy permissions, and returns structured data or command output back to the agent.
5. **Multi-Step Workflows**: If a task requires multiple steps (e.g., turn on Bluetooth $\rightarrow$ scan $\rightarrow$ connect), the loop feeds each result back to the model until `{"action": "done"}` is returned.

---

## 📡 Network & Connectivity (14 Tools · 30 Test Cases)

### `network.bluetooth.connect` — Connect to Bluetooth Device

> Establishes wireless link to paired Bluetooth headphones, speakers, or peripheral device.

- **Required Parameters**: `device` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-BT-CONN-01` | **Connect Soundcore Space One headphone (User Specific Example)** | `connect soundcore space one headphone` | `{"action":"tool","tool":"network.bluetooth.connect","params":{"device":"soundcore space one headphone"}}` | Establishes wireless Bluetooth link to Soundcore Space One headphones. |
| `TC-NET-BT-CONN-02` | **Pair AirPods Pro headphones** | `pair bluetooth headphones AirPods Pro` | `{"action":"tool","tool":"network.bluetooth.connect","params":{"device":"AirPods Pro"}}` | Connects to paired Apple AirPods Pro peripheral. |
| `TC-NET-BT-CONN-03` | **Connect device by MAC address** | `connect to bluetooth device 00:1A:7D:DA:71:13` | `{"action":"tool","tool":"network.bluetooth.connect","params":{"device":"00:1A:7D:DA:71:13"}}` | Direct hardware connection via Bluetooth MAC address. |

### `network.bluetooth.list` — List Bluetooth Devices

> Scans and lists all discoverable Bluetooth devices, including paired and connected devices.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-BT-LIST-01` | **Check if any bluetooth device is available (User Specific Example)** | `check if any bluetooth device is available` | `{"action":"tool","tool":"network.bluetooth.list","params":{}}` | Scans and lists all discoverable Bluetooth devices and accessories. |
| `TC-NET-BT-LIST-02` | **Show all paired and reachable devices** | `show me all bluetooth devices` | `{"action":"tool","tool":"network.bluetooth.list","params":{}}` | Queries Bluetooth subsystem for currently connected and nearby devices. |

### `network.bluetooth.off` — Turn Bluetooth Off

> Disables system Bluetooth hardware radio transmitter to conserve power.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-BT-OFF-01` | **Direct command to turn off Bluetooth radio** | `turn off bluetooth` | `{"action":"tool","tool":"network.bluetooth.off","params":{}}` | Disables system Bluetooth radio to conserve battery. |
| `TC-NET-BT-OFF-02` | **Deactivate Bluetooth adapter** | `disable bluetooth` | `{"action":"tool","tool":"network.bluetooth.off","params":{}}` | Shuts down active Bluetooth transmitter. |

### `network.bluetooth.on` — Turn Bluetooth On

> Enables system Bluetooth hardware radio transmitter.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-BT-ON-01` | **Direct command to turn on Bluetooth radio** | `turn on bluetooth` | `{"action":"tool","tool":"network.bluetooth.on","params":{}}` | Enables system Bluetooth radio adapter. |
| `TC-NET-BT-ON-02` | **Conversational command to enable Bluetooth** | `please enable bluetooth adapter` | `{"action":"tool","tool":"network.bluetooth.on","params":{}}` | Powers up wireless Bluetooth transmitter. |

### `network.dns` — Query DNS Domain Records

> Performs DNS resolution lookup for A, CNAME, MX, and TXT records (dig/nslookup).

- **Required Parameters**: `domain` (string)
- **Optional Parameters**: `recordType` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-DNS-01` | **Query DNS domain records** | `lookup DNS for github.com` | `{"action":"tool","tool":"network.dns","params":{"domain":"github.com"}}` | Performs DNS resolution lookup for A, CNAME, and MX records. |
| `TC-NET-DNS-02` | **Resolve host domain names** | `query dns records for openai.com` | `{"action":"tool","tool":"network.dns","params":{"domain":"openai.com"}}` | Queries nameservers for OpenAI domain record resolution. |

### `network.interfaces` — Inspect Network Interfaces

> Queries system physical and virtual network adapters, status, and MAC addresses.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-IFACE-01` | **Inspect physical and virtual network interfaces** | `show all network interfaces` | `{"action":"tool","tool":"network.interfaces","params":{}}` | Displays status, MAC address, and IP configuration of en0, lo0, etc. |
| `TC-NET-IFACE-02` | **List network adapters** | `list physical and virtual network adapters` | `{"action":"tool","tool":"network.interfaces","params":{}}` | Queries OS network adapter tables. |

### `network.ip` — Resolve System IP Addresses

> Retrieves active local LAN IP addresses and public facing WAN internet IP.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-IP-01` | **Query system IP addresses** | `what is my IP address?` | `{"action":"tool","tool":"network.ip","params":{}}` | Retrieves active local LAN IPv4/IPv6 and public facing WAN addresses. |
| `TC-NET-IP-02` | **Show network IP bindings** | `show my internal and external ip` | `{"action":"tool","tool":"network.ip","params":{}}` | Displays internal adapter IPs alongside public gateway IP. |

### `network.ping` — Ping Network Host

> Sends ICMP echo packets to test network reachability and packet latency (ping).

- **Required Parameters**: `host` (string)
- **Optional Parameters**: `count` (number)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-PING-01` | **Ping domain hostname** | `ping google.com` | `{"action":"tool","tool":"network.ping","params":{"host":"google.com"}}` | Sends ICMP echo packets to test host reachability and latency. |
| `TC-NET-PING-02` | **Ping public DNS IP** | `test connection to 1.1.1.1` | `{"action":"tool","tool":"network.ping","params":{"host":"1.1.1.1"}}` | Tests network round-trip time to Cloudflare primary DNS. |

### `network.ports` — Inspect Open Network Ports

> Lists open listening TCP/UDP network ports and binding process IDs (lsof/netstat).

- **Required Parameters**: _None_
- **Optional Parameters**: `port` (number)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-PORT-01` | **Check specific development port** | `check if port 3000 is open` | `{"action":"tool","tool":"network.ports","params":{"port":3000}}` | Inspects if port 3000 has an active listening process. |
| `TC-NET-PORT-02` | **List all open listening ports** | `show all listening ports` | `{"action":"tool","tool":"network.ports","params":{}}` | Lists all open TCP/UDP sockets and binding process IDs. |
| `TC-NET-PORT-03` | **Check alternative web port** | `is port 8080 in use?` | `{"action":"tool","tool":"network.ports","params":{"port":8080}}` | Queries socket table for port 8080 occupancy. |

### `network.traceroute` — Traceroute Network Path

> Traces packet routing gateway hops across Internet to target destination host.

- **Required Parameters**: `host` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-TRACE-01` | **Traceroute to cloud endpoint** | `traceroute to cloudflare.com` | `{"action":"tool","tool":"network.traceroute","params":{"host":"cloudflare.com"}}` | Traces packet routing gateway hops across Internet to target host. |
| `TC-NET-TRACE-02` | **Trace path to public DNS resolver** | `trace route to 8.8.8.8` | `{"action":"tool","tool":"network.traceroute","params":{"host":"8.8.8.8"}}` | Performs hop-by-hop latency inspection to Google DNS. |

### `network.wifi.connect` — Connect to Wi-Fi Network

> Connects system wireless interface directly to specified Wi-Fi network SSID.

- **Required Parameters**: `ssid` (string)
- **Optional Parameters**: `password` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-WIFI-CONN-01` | **Connect to Wi-Fi SSID with 5G suffix** | `connect to wifi Office-Network-5G` | `{"action":"tool","tool":"network.wifi.connect","params":{"ssid":"Office-Network-5G"}}` | Associates system wireless interface with designated SSID. |
| `TC-NET-WIFI-CONN-02` | **Join guest Wi-Fi network** | `join wifi Starlink_Guest` | `{"action":"tool","tool":"network.wifi.connect","params":{"ssid":"Starlink_Guest"}}` | Connects client adapter to specified guest network. |

### `network.wifi.off` — Turn Wi-Fi Off

> Disables system Wi-Fi wireless networking radio interface to conserve power and disconnect from wireless networks.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-WIFI-OFF-01` | **Turn Wi-Fi off** | `turn off wifi` | `{"action":"tool","tool":"network.wifi.off","params":{}}` | Disables system Wi-Fi wireless networking interface. |
| `TC-NET-WIFI-OFF-02` | **Deactivate wireless adapter** | `disable wi-fi` | `{"action":"tool","tool":"network.wifi.off","params":{}}` | Disconnects and disables active wireless interfaces. |

### `network.wifi.on` — Turn Wi-Fi On

> Enables system Wi-Fi wireless networking radio interface.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-WIFI-ON-01` | **Turn Wi-Fi on** | `turn on wifi` | `{"action":"tool","tool":"network.wifi.on","params":{}}` | Enables system Wi-Fi wireless networking radio. |
| `TC-NET-WIFI-ON-02` | **Enable wireless network adapter** | `enable wi-fi interface` | `{"action":"tool","tool":"network.wifi.on","params":{}}` | Powers up wireless network hardware. |

### `network.wifi.scan` — Scan Wi-Fi Networks

> Scans and lists nearby accessible wireless Wi-Fi SSID networks and signal strength.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NET-WIFI-SCAN-01` | **Scan for available Wi-Fi networks** | `scan for available wifi networks` | `{"action":"tool","tool":"network.wifi.scan","params":{}}` | Scans and lists nearby accessible Wi-Fi SSID networks and signal metrics. |
| `TC-NET-WIFI-SCAN-02` | **List reachable Wi-Fi SSIDs** | `what wifi networks are available nearby?` | `{"action":"tool","tool":"network.wifi.scan","params":{}}` | Polls wireless broadcast channels for active base stations. |


## ⚡ System Health & Hardware Surveillance (11 Tools · 24 Test Cases)

### `system.battery` — Check Battery Level & Power Status

> Queries internal laptop battery charging percentage, time remaining, and power source.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-BAT-01` | **Query laptop battery status** | `what is my battery level?` | `{"action":"tool","tool":"system.battery","params":{}}` | Queries internal battery percentage, charging state, and time remaining. |
| `TC-SYS-BAT-02` | **Check power adapter connection** | `check battery status and power source` | `{"action":"tool","tool":"system.battery","params":{}}` | Verifies AC power source and cycle health. |

### `system.cpu` — Inspect CPU Utilization

> Monitors real-time processor core load percentages and frequency metrics.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-CPU-01` | **Inspect real-time CPU load** | `check CPU utilization` | `{"action":"tool","tool":"system.cpu","params":{}}` | Monitors real-time processor core load percentages and frequencies. |
| `TC-SYS-CPU-02` | **Check processor health** | `how much CPU is the system using right now?` | `{"action":"tool","tool":"system.cpu","params":{}}` | Measures total user/system processor consumption. |

### `system.gpu` — Inspect GPU Acceleration Status

> Queries active graphics hardware model, video VRAM usage, and rendering utilization.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-GPU-01` | **Inspect GPU acceleration status** | `check GPU acceleration status` | `{"action":"tool","tool":"system.gpu","params":{}}` | Queries active graphics hardware model, VRAM utilization, and clock. |
| `TC-SYS-GPU-02` | **Check graphics memory usage** | `how much VRAM is being used?` | `{"action":"tool","tool":"system.gpu","params":{}}` | Inspects Metal / OpenGL / GPU memory metrics. |

### `system.info` — Get System Diagnostic Info

> Retrieves OS platform, kernel version, machine architecture, computer specs and uptime metrics.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-INFO-01` | **Get system diagnostic information** | `system info` | `{"action":"tool","tool":"system.info","params":{}}` | Retrieves OS platform, kernel version, machine architecture, and hostname. |
| `TC-SYS-INFO-02` | **Hardware specifications overview** | `what are my hardware specs and macOS version?` | `{"action":"tool","tool":"system.info","params":{}}` | Outputs complete system architecture report. |

### `system.kill_process` — Kill System Process

> Terminates an active system process or background task by process name or PID.

- **Required Parameters**: `process` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-KILL-01` | **Terminate process by application name** | `kill process Google Chrome` | `{"action":"tool","tool":"system.kill_process","params":{"process":"Google Chrome"}}` | Terminates active Chrome browser processes. |
| `TC-SYS-KILL-02` | **Terminate process by PID** | `kill process 8942` | `{"action":"tool","tool":"system.kill_process","params":{"process":"8942"}}` | Terminates target process by process ID. |
| `TC-SYS-KILL-03` | **Stop background runtime daemon** | `stop node process` | `{"action":"tool","tool":"system.kill_process","params":{"process":"node"}}` | Terminates active Node.js processes. |

### `system.lock` — Lock System

> Locks the operating system screen immediately.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-LOCK-01` | **Lock system workstation** | `lock the laptop` | `{"action":"tool","tool":"system.lock","params":{}}` | Locks the operating system screen immediately. |
| `TC-SYS-LOCK-02` | **Instant display lock** | `lock the screen now` | `{"action":"tool","tool":"system.lock","params":{}}` | Secures user session and turns off display. |

### `system.processes` — Monitor Active OS Processes

> Lists top CPU or memory consuming processes, daemons, and background services.

- **Required Parameters**: _None_
- **Optional Parameters**: `sort` (string), `count` (number)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-PROC-01` | **Sort processes by CPU consumption** | `which process is using the most CPU?` | `{"action":"tool","tool":"system.processes","params":{"sort":"cpu"}}` | Lists top CPU consuming processes and background tasks. |
| `TC-SYS-PROC-02` | **Sort processes by RAM consumption** | `show top memory consuming processes` | `{"action":"tool","tool":"system.processes","params":{"sort":"ram"}}` | Lists top memory consuming applications and daemons. |
| `TC-SYS-PROC-03` | **General process snapshot** | `show running processes` | `{"action":"tool","tool":"system.processes","params":{}}` | Retrieves active process table. |

### `system.ram` — Inspect RAM Memory Capacity

> Checks total physical system RAM capacity, actively allocated memory, and free cache.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-RAM-01` | **Inspect physical RAM capacity** | `how much RAM is available?` | `{"action":"tool","tool":"system.ram","params":{}}` | Checks total physical system RAM capacity and free memory buffers. |
| `TC-SYS-RAM-02` | **Check memory pressure and swap** | `show memory usage and swap capacity` | `{"action":"tool","tool":"system.ram","params":{}}` | Inspects active, inactive, wired RAM and paging activity. |

### `system.storage` — Inspect Storage Health & Volumes

> Lists mounted disk partitions, filesystem volume formats, and SSD health status.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-STOR-01` | **Check available disk space** | `check available disk space` | `{"action":"tool","tool":"system.storage","params":{}}` | Lists mounted disk partitions, filesystem formats, and free gigabytes. |
| `TC-SYS-STOR-02` | **Inspect root volume capacity** | `how much free storage do I have on my hard drive?` | `{"action":"tool","tool":"system.storage","params":{}}` | Evaluates system drive capacity and utilization. |

### `system.temperature` — Check Thermal Sensors

> Queries CPU core thermal diode and fan cooling subsystem temperature metrics.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-TEMP-01` | **Query CPU core thermal sensors** | `check thermal sensors` | `{"action":"tool","tool":"system.temperature","params":{}}` | Queries CPU core thermal diode and fan cooling subsystem temperatures. |
| `TC-SYS-TEMP-02` | **Check thermal throttling status** | `is the computer overheating?` | `{"action":"tool","tool":"system.temperature","params":{}}` | Checks hardware temperature status against safety thresholds. |

### `system.uptime` — Query System Uptime Duration

> Displays time elapsed since last operating system boot and average system loads.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SYS-UP-01` | **Query system uptime duration** | `how long has my system been running?` | `{"action":"tool","tool":"system.uptime","params":{}}` | Displays time elapsed since last boot and load averages. |
| `TC-SYS-UP-02` | **Check boot timestamp** | `check system uptime` | `{"action":"tool","tool":"system.uptime","params":{}}` | Returns machine uptime in days, hours, and minutes. |


## 📁 Filesystem Administration & Search (21 Tools · 45 Test Cases)

### `filesystem.compress` — Compress Files to Archive

> Compresses files or directories into a zip or tar archive.

- **Required Parameters**: `source` (string), `archiveName` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-COMP-01` | **Compress folder into zip archive** | `compress dist folder into dist.zip` | `{"action":"tool","tool":"filesystem.compress","params":{"source":"dist","archiveName":"dist.zip"}}` | Compresses folder into standard zip archive. |
| `TC-FS-COMP-02` | **Archive directory to tarball** | `archive src to backup.tar.gz` | `{"action":"tool","tool":"filesystem.compress","params":{"source":"src","archiveName":"backup.tar.gz"}}` | Creates gzip compressed tar archive. |

### `filesystem.copy` — Copy File or Directory

> Copies a source file or directory to a destination path using native filesystem APIs.

- **Required Parameters**: `source` (string), `destination` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-COPY-01` | **Copy file to backup destination** | `copy config.json to config.bak` | `{"action":"tool","tool":"filesystem.copy","params":{"source":"config.json","destination":"config.bak"}}` | Copies file preserving attributes. |
| `TC-FS-COPY-02` | **Copy asset to public directory** | `copy ./assets/icon.png to ./public/icon.png` | `{"action":"tool","tool":"filesystem.copy","params":{"source":"./assets/icon.png","destination":"./public/icon.png"}}` | Transfers static asset file. |

### `filesystem.create` — Create New File

> Creates a new empty file or initializes a file with content on disk.

- **Required Parameters**: `path` (string)
- **Optional Parameters**: `content` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-CREAT-01` | **Create a new text file** | `create a new file notes.txt` | `{"action":"tool","tool":"filesystem.create","params":{"path":"notes.txt"}}` | Initializes a new empty file on disk. |
| `TC-FS-CREAT-02` | **Create TypeScript file** | `create file src/types/CustomEvent.ts` | `{"action":"tool","tool":"filesystem.create","params":{"path":"src/types/CustomEvent.ts"}}` | Creates new source code file. |

### `filesystem.delete` — Permanently Delete File or Folder

> Permanently deletes a file or directory path from disk.

- **Required Parameters**: `path` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-DEL-01` | **Permanently delete temp file** | `permanently delete scratch/temp_cache.log` | `{"action":"tool","tool":"filesystem.delete","params":{"path":"scratch/temp_cache.log"}}` | Permanently deletes file from disk without sending to Trash. |
| `TC-FS-DEL-02` | **Delete temporary lock file** | `delete lock.tmp` | `{"action":"tool","tool":"filesystem.delete","params":{"path":"lock.tmp"}}` | Removes target file directly. |

### `filesystem.disk_usage` — Check Disk Capacity and Usage

> Queries available storage space and folder size usage statistics (df/du).

- **Required Parameters**: _None_
- **Optional Parameters**: `path` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-DU-01` | **Check disk usage of current workspace** | `check disk usage here` | `{"action":"tool","tool":"filesystem.disk_usage","params":{}}` | Calculates cumulative directory sizes and block allocations. |
| `TC-FS-DU-02` | **Check node_modules size** | `how much disk space is node_modules taking up?` | `{"action":"tool","tool":"filesystem.disk_usage","params":{}}` | Evaluates folder footprint. |

### `filesystem.duplicate` — Duplicate File or Directory

> Creates an immediate duplicated copy of a file or folder with timestamp or copy suffix.

- **Required Parameters**: `path` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-DUP-01` | **Duplicate environment config template** | `duplicate .env.example` | `{"action":"tool","tool":"filesystem.duplicate","params":{"path":".env.example"}}` | Creates duplicate copy of configuration template. |
| `TC-FS-DUP-02` | **Duplicate test spec file** | `duplicate test_spec.ts` | `{"action":"tool","tool":"filesystem.duplicate","params":{"path":"test_spec.ts"}}` | Generates immediate duplicate copy. |

### `filesystem.extract` — Extract Archive File

> Extracts contents from a zip, tar, or compressed archive file into target directory.

- **Required Parameters**: `archivePath` (string)
- **Optional Parameters**: `destination` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-EXT-01` | **Extract zip archive** | `extract bundle.zip archive` | `{"action":"tool","tool":"filesystem.extract","params":{"archivePath":"bundle.zip"}}` | Extracts archive contents into current directory. |
| `TC-FS-EXT-02` | **Unpack tar.gz archive** | `unzip vendor_libs.tar.gz` | `{"action":"tool","tool":"filesystem.extract","params":{"archivePath":"vendor_libs.tar.gz"}}` | Unpacks compressed archive. |

### `filesystem.grep` — Search by File Content

> Searches inside text files for matching regex patterns or literal strings.

- **Required Parameters**: `path` (string), `query` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-GREP-01` | **Search for text pattern in source directory** | `search for pattern TODO in src` | `{"action":"tool","tool":"filesystem.grep","params":{"path":"src","query":"TODO"}}` | Searches inside text files for matching regex or literal string. |
| `TC-FS-GREP-02` | **Grep for configuration constant** | `grep for API_KEY in config` | `{"action":"tool","tool":"filesystem.grep","params":{"path":"config","query":"API_KEY"}}` | Finds occurrences of API_KEY in config files. |

### `filesystem.list` — List Directory Contents

> Lists files and folders in target directory path.

- **Required Parameters**: `path` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-LIST-01` | **List files in current directory** | `list files` | `{"action":"tool","tool":"filesystem.list","params":{"path":"."}}` | Lists files and folders in active working directory. |
| `TC-FS-LIST-02` | **List files in home Documents** | `show files in ~/Documents` | `{"action":"tool","tool":"filesystem.list","params":{"path":"~/Documents"}}` | Inspects user Documents folder directory listing. |
| `TC-FS-LIST-03` | **List project subfolder** | `ls src/domain` | `{"action":"tool","tool":"filesystem.list","params":{"path":"src/domain"}}` | Lists contents of relative path. |

### `filesystem.locate_files` — Locate Specific Files

> Fast file location lookup across the OS filesystem by filename.

- **Required Parameters**: `name` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-LOCF-01` | **Locate file by exact filename** | `locate file named config.json` | `{"action":"tool","tool":"filesystem.locate_files","params":{"name":"config.json"}}` | Fast OS index lookup for file name across filesystem. |
| `TC-FS-LOCF-02` | **Locate package manifest file** | `locate package.json` | `{"action":"tool","tool":"filesystem.locate_files","params":{"name":"package.json"}}` | Finds instances of package.json on disk. |

### `filesystem.locate_folders` — Locate Specific Folders

> Finds directory paths across the operating system filesystem.

- **Required Parameters**: `name` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-LOCD-01` | **Locate directory by folder name** | `locate folder named node_modules` | `{"action":"tool","tool":"filesystem.locate_folders","params":{"name":"node_modules"}}` | Finds directory paths matching target folder name. |
| `TC-FS-LOCD-02` | **Locate project folder** | `locate directory AI Terminal` | `{"action":"tool","tool":"filesystem.locate_folders","params":{"name":"AI Terminal"}}` | Finds location of AI Terminal folder. |

### `filesystem.mkdir` — Create New Directory

> Creates a new folder or directory hierarchy on disk.

- **Required Parameters**: `path` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-MKDIR-01` | **Create directory in current workspace** | `create a folder called build_output` | `{"action":"tool","tool":"filesystem.mkdir","params":{"path":"build_output"}}` | Creates new folder hierarchy on disk. |
| `TC-FS-MKDIR-02` | **Create nested components directory** | `mkdir src/components/modals` | `{"action":"tool","tool":"filesystem.mkdir","params":{"path":"src/components/modals"}}` | Recursively creates nested directory structure. |

### `filesystem.move` — Move File or Directory

> Moves a file or directory from source path to destination path.

- **Required Parameters**: `source` (string), `destination` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-MOVE-01` | **Move file to documents folder** | `move draft.md to ~/Documents/draft.md` | `{"action":"tool","tool":"filesystem.move","params":{"source":"draft.md","destination":"~/Documents/draft.md"}}` | Relocates file from source to target path. |
| `TC-FS-MOVE-02` | **Move build artifact to Desktop** | `move ./dist/bundle.js to ~/Desktop/bundle.js` | `{"action":"tool","tool":"filesystem.move","params":{"source":"./dist/bundle.js","destination":"~/Desktop/bundle.js"}}` | Moves compiled artifact. |

### `filesystem.navigate` — Change Current Working Directory

> Navigates terminal or active session to a target directory path (cd).

- **Required Parameters**: `path` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-NAV-01` | **Navigate to user downloads directory** | `take me to downloads folder` | `{"action":"tool","tool":"filesystem.navigate","params":{"path":"~/Downloads"}}` | Changes active working directory to ~/Downloads. |
| `TC-FS-NAV-02` | **Navigate upwards two directories** | `go back up two directories` | `{"action":"tool","tool":"filesystem.navigate","params":{"path":"../.."}}` | Traverses parent directories in the shell. |
| `TC-FS-NAV-03` | **Navigate to project workspace root** | `navigate to ~/Project Folder/AI Terminal` | `{"action":"tool","tool":"filesystem.navigate","params":{"path":"~/Project Folder/AI Terminal"}}` | Sets working directory to specific absolute path. |

### `filesystem.permissions` — Inspect or Modify File Permissions

> Queries or updates Unix filesystem POSIX read/write/execute permissions (chmod/chown).

- **Required Parameters**: `path` (string)
- **Optional Parameters**: `mode` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-PERM-01` | **Inspect file permissions** | `check permissions of deploy.sh` | `{"action":"tool","tool":"filesystem.permissions","params":{"path":"deploy.sh"}}` | Queries POSIX read/write/execute file permissions. |
| `TC-FS-PERM-02` | **Make script executable** | `make script run_test.sh executable` | `{"action":"tool","tool":"filesystem.permissions","params":{"path":"run_test.sh"}}` | Applies executable mode bits to script file. |

### `filesystem.read` — Read File Content

> Reads text content from a specified file path using safe native APIs.

- **Required Parameters**: `path` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-READ-01` | **Read JSON configuration file** | `read content of package.json` | `{"action":"tool","tool":"filesystem.read","params":{"path":"package.json"}}` | Safely reads text content from specified file path. |
| `TC-FS-READ-02` | **Inspect markdown documentation** | `view README.md file` | `{"action":"tool","tool":"filesystem.read","params":{"path":"README.md"}}` | Displays contents of project README. |

### `filesystem.recent_files` — Query Recently Modified Files

> Retrieves a list of files recently created, modified, or accessed across the system.

- **Required Parameters**: _None_
- **Optional Parameters**: `count` (number)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-REC-01` | **Query recently modified files** | `show recently modified files` | `{"action":"tool","tool":"filesystem.recent_files","params":{}}` | Retrieves files created or modified recently. |
| `TC-FS-REC-02` | **Check files modified today** | `search for logs modified today` | `{"action":"tool","tool":"filesystem.recent_files","params":{}}` | Inspects mtime timestamps across workspace. |

### `filesystem.rename` — Rename File or Directory

> Renames an existing file or directory path.

- **Required Parameters**: `path` (string), `newName` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-REN-01` | **Rename file in same folder** | `rename old_index.html to index.html` | `{"action":"tool","tool":"filesystem.rename","params":{"path":"old_index.html","newName":"index.html"}}` | Renames existing file. |
| `TC-FS-REN-02` | **Rename directory** | `rename directory temp_cache to archive_cache` | `{"action":"tool","tool":"filesystem.rename","params":{"path":"temp_cache","newName":"archive_cache"}}` | Renames target directory. |

### `filesystem.restore` — Restore File from Trash

> Restores a recently deleted file from system Trash back to its original path.

- **Required Parameters**: `name` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-REST-01` | **Restore deleted file from system Trash** | `restore important_notes.txt from trash` | `{"action":"tool","tool":"filesystem.restore","params":{"name":"important_notes.txt"}}` | Restores file from Trash back to its original directory location. |
| `TC-FS-REST-02` | **Undelete document** | `undelete presentation.key` | `{"action":"tool","tool":"filesystem.restore","params":{"name":"presentation.key"}}` | Recovers deleted presentation from Trash. |

### `filesystem.search` — Search Filesystem by Name

> Searches directory recursively for files or folders matching a filename pattern.

- **Required Parameters**: `dir` (string), `pattern` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-SRCH-01` | **Search files matching glob in subfolder** | `find all json files in tools` | `{"action":"tool","tool":"filesystem.search","params":{"dir":"tools","pattern":"*.json"}}` | Searches recursively under tools directory for .json files. |
| `TC-FS-SRCH-02` | **Search files matching extension in source** | `search for *.ts files under src` | `{"action":"tool","tool":"filesystem.search","params":{"dir":"src","pattern":"*.ts"}}` | Finds all TypeScript source files recursively. |
| `TC-FS-SRCH-03` | **Search images in current directory** | `tell me all the png files here` | `{"action":"tool","tool":"filesystem.search","params":{"dir":".","pattern":"*.png"}}` | Lists PNG assets in current directory. |

### `filesystem.trash` — Move to System Trash

> Safely moves a file or directory to the macOS/OS system Trash or Recycle Bin.

- **Required Parameters**: `path` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FS-TRASH-01` | **Move file safely to system Trash** | `move obsolete_report.pdf to trash` | `{"action":"tool","tool":"filesystem.trash","params":{"path":"obsolete_report.pdf"}}` | Safely moves target file into macOS system Trash. |
| `TC-FS-TRASH-02` | **Trash unused folder** | `trash unused_dir` | `{"action":"tool","tool":"filesystem.trash","params":{"path":"unused_dir"}}` | Recycles folder into system trash. |


## 🖥️ Desktop Application Lifecycle (10 Tools · 21 Test Cases)

### `application.close` — Close Desktop Application

> Gracefully requests an running application process or window to quit.

- **Required Parameters**: `app` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-APP-CLOSE-01` | **Gracefully close application** | `close Spotify` | `{"action":"tool","tool":"application.close","params":{"app":"Spotify"}}` | Requests clean termination of Spotify. |
| `TC-APP-CLOSE-02` | **Quit desktop client** | `quit Telegram` | `{"action":"tool","tool":"application.close","params":{"app":"Telegram"}}` | Quits Telegram application. |

### `application.focus` — Focus Application Window

> Brings a desktop application window to the foreground screen focus.

- **Required Parameters**: `app` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-APP-FOC-01` | **Focus application window to foreground** | `focus Cursor window` | `{"action":"tool","tool":"application.focus","params":{"app":"Cursor"}}` | Brings Cursor IDE to the active foreground screen. |
| `TC-APP-FOC-02` | **Bring Terminal to front** | `bring Terminal to front` | `{"action":"tool","tool":"application.focus","params":{"app":"Terminal"}}` | Activates Terminal window focus. |

### `application.force_quit` — Force Quit Application

> Instantly terminates an unresponsive desktop application or frozen process (pkill -9).

- **Required Parameters**: `app` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-APP-FQ-01` | **Force quit unresponsive application** | `force quit Discord` | `{"action":"tool","tool":"application.force_quit","params":{"app":"Discord"}}` | Instantly terminates unresponsive Discord process. |
| `TC-APP-FQ-02` | **Force close frozen browser** | `force close Chrome` | `{"action":"tool","tool":"application.force_quit","params":{"app":"Chrome"}}` | Sends SIGKILL equivalent to frozen application. |

### `application.install` — Install Desktop Package or App

> Installs software application via native OS package managers (Homebrew, apt, winget).

- **Required Parameters**: `package` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-APP-INST-01` | **Install CLI tool via package manager** | `install htop via brew` | `{"action":"tool","tool":"application.install","params":{"package":"htop"}}` | Installs package via system package manager (Homebrew). |
| `TC-APP-INST-02` | **Install utility package** | `install ripgrep` | `{"action":"tool","tool":"application.install","params":{"package":"ripgrep"}}` | Installs command-line package. |

### `application.list_running` — List Running Applications

> Lists all actively running desktop graphical applications and their PIDs.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-APP-LIST-01` | **List all running GUI applications** | `list running applications` | `{"action":"tool","tool":"application.list_running","params":{}}` | Lists all actively running desktop GUI apps. |
| `TC-APP-LIST-02` | **Check what apps are active** | `what apps are open right now?` | `{"action":"tool","tool":"application.list_running","params":{}}` | Inspects macOS WindowServer / LaunchServices running apps. |

### `application.maximize` — Maximize Application Window

> Maximizes or switches application window into full-screen workspace mode.

- **Required Parameters**: `app` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-APP-MAX-01` | **Maximize application window** | `maximize Safari window` | `{"action":"tool","tool":"application.maximize","params":{"app":"Safari"}}` | Maximizes or full-screens application window. |
| `TC-APP-MAX-02` | **Full screen code editor** | `put VS Code in full screen` | `{"action":"tool","tool":"application.maximize","params":{"app":"VS Code"}}` | Expands window to fill desktop workspace. |

### `application.minimize` — Minimize Application Window

> Minimizes application window down to system dock or taskbar.

- **Required Parameters**: `app` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-APP-MIN-01` | **Minimize application window to dock** | `minimize Slack window` | `{"action":"tool","tool":"application.minimize","params":{"app":"Slack"}}` | Minimizes window to OS taskbar or dock. |
| `TC-APP-MIN-02` | **Minimize audio player** | `minimize Spotify` | `{"action":"tool","tool":"application.minimize","params":{"app":"Spotify"}}` | Hides Spotify window from viewport. |

### `application.open` — Open Desktop Application

> Opens a system desktop application using native launchers (Launch Services) with optional URL, file, or target arguments.

- **Required Parameters**: `app` (string)
- **Optional Parameters**: `url` (string), `file` (string), `args` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-APP-OPEN-01` | **Open desktop web browser** | `open Safari` | `{"action":"tool","tool":"application.open","params":{"app":"Safari"}}` | Launches native Safari browser application. |
| `TC-APP-OPEN-02` | **Launch code editor** | `launch Visual Studio Code` | `{"action":"tool","tool":"application.open","params":{"app":"Visual Studio Code"}}` | Launches VS Code editor. |
| `TC-APP-OPEN-03` | **Open communication app** | `open Slack` | `{"action":"tool","tool":"application.open","params":{"app":"Slack"}}` | Opens Slack application. |

### `application.uninstall` — Uninstall Desktop Application

> Uninstalls or removes software package via system package manager or App cleaner.

- **Required Parameters**: `package` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-APP-UNINST-01` | **Uninstall application package** | `uninstall package wget` | `{"action":"tool","tool":"application.uninstall","params":{"package":"wget"}}` | Removes installed software package. |
| `TC-APP-UNINST-02` | **Remove CLI tool** | `remove package tree` | `{"action":"tool","tool":"application.uninstall","params":{"package":"tree"}}` | Uninstalls utility package from OS. |

### `application.update` — Update Application

> Checks for updates and upgrades an application using the system package manager (e.g., Homebrew). Cannot update system apps like Safari or Finder.

- **Required Parameters**: `app` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-APP-UPD-01` | **Update desktop application** | `update Brave browser` | `{"action":"tool","tool":"application.update","params":{"app":"Brave Browser"}}` | Checks and updates application to latest version. |
| `TC-APP-UPD-02` | **Update developer tool** | `check updates for Docker Desktop` | `{"action":"tool","tool":"application.update","params":{"app":"Docker Desktop"}}` | Triggers update check and upgrade workflow. |


## 🌐 Web Browser Automation (8 Tools · 16 Test Cases)

### `browser.bookmarks` — Inspect Browser Bookmarks

> Queries and displays user saved bookmark links and favorite websites.

- **Required Parameters**: _None_
- **Optional Parameters**: `filter` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-BRW-BM-01` | **List browser bookmarks** | `list my browser bookmarks` | `{"action":"tool","tool":"browser.bookmarks","params":{}}` | Displays user saved bookmark links and favorites. |
| `TC-BRW-BM-02` | **Inspect saved links** | `show saved bookmarks` | `{"action":"tool","tool":"browser.bookmarks","params":{}}` | Retrieves bookmark hierarchy. |

### `browser.close_tabs` — Close Browser Tabs

> Closes active browser tab or all open background tabs.

- **Required Parameters**: _None_
- **Optional Parameters**: `target` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-BRW-CLTAB-01` | **Close active browser tab** | `close browser tab` | `{"action":"tool","tool":"browser.close_tabs","params":{}}` | Closes active browser tab. |
| `TC-BRW-CLTAB-02` | **Close open browser tabs** | `close open tabs in browser` | `{"action":"tool","tool":"browser.close_tabs","params":{}}` | Closes target tab sessions. |

### `browser.downloads` — Check Browser Downloads

> Lists recent files downloaded via the system web browser.

- **Required Parameters**: _None_
- **Optional Parameters**: `limit` (number)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-BRW-DL-01` | **Check recent browser downloads** | `check recent browser downloads` | `{"action":"tool","tool":"browser.downloads","params":{}}` | Lists files recently downloaded via web browser. |
| `TC-BRW-DL-02` | **Show downloaded files** | `show files downloaded from browser` | `{"action":"tool","tool":"browser.downloads","params":{}}` | Queries download history log. |

### `browser.history` — Query Browser History

> Searches recent web browsing navigation history entries.

- **Required Parameters**: _None_
- **Optional Parameters**: `query` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-BRW-HIST-01` | **Query recent browser history** | `show recent browser history` | `{"action":"tool","tool":"browser.history","params":{}}` | Searches recent web browsing history entries. |
| `TC-BRW-HIST-02` | **Check today visited sites** | `what websites did I visit today?` | `{"action":"tool","tool":"browser.history","params":{}}` | Queries browsing history database. |

### `browser.navigate` — Navigate Browser to URL

> Launches default system web browser and navigates directly to web URL.

- **Required Parameters**: `url` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-BRW-NAV-01` | **Navigate browser to web URL** | `open youtube.com in safari` | `{"action":"tool","tool":"browser.navigate","params":{"url":"youtube.com"}}` | Launches default browser and navigates to target URL. |
| `TC-BRW-NAV-02` | **Navigate to GitHub trending page** | `navigate to https://github.com/trending` | `{"action":"tool","tool":"browser.navigate","params":{"url":"https://github.com/trending"}}` | Opens trending repositories page in browser. |

### `browser.new_tab` — Open New Browser Tab

> Opens a blank or target URL new tab inside the currently running web browser.

- **Required Parameters**: _None_
- **Optional Parameters**: `url` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-BRW-TAB-01` | **Open a new empty browser tab** | `open a new browser tab` | `{"action":"tool","tool":"browser.new_tab","params":{}}` | Creates new tab in active browser. |
| `TC-BRW-TAB-02` | **Open new tab shorthand** | `new tab in chrome` | `{"action":"tool","tool":"browser.new_tab","params":{}}` | Spawns blank tab in browser window. |

### `browser.reload` — Reload Active Browser Tab

> Reloads or refreshes the current active web page inside the default browser.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-BRW-REL-01` | **Reload current webpage** | `reload the current web page` | `{"action":"tool","tool":"browser.reload","params":{}}` | Refreshes the active web page in the browser. |
| `TC-BRW-REL-02` | **Refresh active tab** | `refresh browser tab` | `{"action":"tool","tool":"browser.reload","params":{}}` | Re-fetches page contents. |

### `browser.search` — Search the Web in Browser

> Launches search query directly in default system browser on Google, YouTube, or GitHub.

- **Required Parameters**: `query` (string)
- **Optional Parameters**: `engine` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-BRW-SRCH-01` | **Search technical topic on the web** | `search the web for Rust ownership` | `{"action":"tool","tool":"browser.search","params":{"query":"Rust ownership"}}` | Launches web search query in system browser. |
| `TC-BRW-SRCH-02` | **Search documentation online** | `google latest TypeScript 5.5 release notes` | `{"action":"tool","tool":"browser.search","params":{"query":"latest TypeScript 5.5 release notes"}}` | Performs web search for release documentation. |


## 🌿 Git Version Control (11 Tools · 22 Test Cases)

### `git.branch` — Manage Git Branches

> Lists existing branches, creates new branch, or deletes branch.

- **Required Parameters**: _None_
- **Optional Parameters**: `operation` (string), `name` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-BR-01` | **List repository git branches** | `list all git branches` | `{"action":"tool","tool":"git.branch","params":{}}` | Lists local and tracked remote branches. |
| `TC-GIT-BR-02` | **Show active branch name** | `what git branch am I on?` | `{"action":"tool","tool":"git.branch","params":{}}` | Identifies current HEAD branch. |

### `git.checkout` — Checkout Git Branch or Commit

> Switches working tree to a target git branch, commit hash, or tag.

- **Required Parameters**: `target` (string)
- **Optional Parameters**: `create` (boolean)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-CO-01` | **Switch to feature branch** | `switch to branch feature/bluetooth-tools` | `{"action":"tool","tool":"git.checkout","params":{"target":"feature/bluetooth-tools"}}` | Switches repository working tree to designated branch. |
| `TC-GIT-CO-02` | **Checkout main branch** | `checkout main` | `{"action":"tool","tool":"git.checkout","params":{"target":"main"}}` | Switches HEAD to main branch. |

### `git.clone` — Clone Git Repository

> Closes remote Git repository URL into local workspace directory.

- **Required Parameters**: `url` (string)
- **Optional Parameters**: `directory` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-CLONE-01` | **Clone remote git repository** | `clone git repo https://github.com/facebook/react.git` | `{"action":"tool","tool":"git.clone","params":{"url":"https://github.com/facebook/react.git"}}` | Clones remote repository into local directory. |
| `TC-GIT-CLONE-02` | **Clone repository via SSH URL** | `clone repo git@github.com:torvalds/linux.git` | `{"action":"tool","tool":"git.clone","params":{"url":"git@github.com:torvalds/linux.git"}}` | Clones repository via secure shell address. |

### `git.commit` — Record Git Commit

> Stages modified workspace files and records a version commit with message.

- **Required Parameters**: `message` (string)
- **Optional Parameters**: `all` (boolean)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-CI-01` | **Record git commit with message** | `commit changes with message "feat: add bluetooth testing suite"` | `{"action":"tool","tool":"git.commit","params":{"message":"feat: add bluetooth testing suite"}}` | Stages modified files and records commit with message. |
| `TC-GIT-CI-02` | **Git commit with bug fix summary** | `commit changes with message "fix: handle empty parameter schema"` | `{"action":"tool","tool":"git.commit","params":{"message":"fix: handle empty parameter schema"}}` | Creates version commit. |

### `git.diff` — View Git Workspace Diff

> Displays file modification differences between workspace, index, or branches.

- **Required Parameters**: _None_
- **Optional Parameters**: `target` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-DIFF-01` | **View unstaged working tree diff** | `view git diff for unstaged changes` | `{"action":"tool","tool":"git.diff","params":{}}` | Displays line modifications across working tree. |
| `TC-GIT-DIFF-02` | **Show workspace modifications** | `show git diff` | `{"action":"tool","tool":"git.diff","params":{}}` | Compares active edits against git index. |

### `git.log` — Inspect Git Commit History

> Displays recent commit log history and authorship metadata.

- **Required Parameters**: _None_
- **Optional Parameters**: `maxCount` (number)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-LOG-01` | **Inspect recent git commit history** | `show recent git commits` | `{"action":"tool","tool":"git.log","params":{}}` | Displays recent commit log entries, hashes, and authorship. |
| `TC-GIT-LOG-02` | **Show commit log** | `git log` | `{"action":"tool","tool":"git.log","params":{}}` | Inspects repository commit graph. |

### `git.merge` — Merge Git Branch

> Merges changes from specified source branch into current active branch.

- **Required Parameters**: `branch` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-MRG-01` | **Merge source branch into current** | `merge branch develop into current branch` | `{"action":"tool","tool":"git.merge","params":{"branch":"develop"}}` | Merges commit history from develop into active branch. |
| `TC-GIT-MRG-02` | **Merge staging branch** | `git merge staging` | `{"action":"tool","tool":"git.merge","params":{"branch":"staging"}}` | Executes git merge with staging. |

### `git.pull` — Pull Remote Git Changes

> Fetches and merges latest upstream commit changes from remote repository.

- **Required Parameters**: _None_
- **Optional Parameters**: `remote` (string), `branch` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-PULL-01` | **Pull remote changes from upstream** | `pull remote git changes` | `{"action":"tool","tool":"git.pull","params":{}}` | Fetches and merges remote commits into active branch. |
| `TC-GIT-PULL-02` | **Git pull from origin** | `git pull origin main` | `{"action":"tool","tool":"git.pull","params":{}}` | Synchronizes local branch with remote repository. |

### `git.push` — Push Git Commits

> Pushes local branch commits to remote repository origin server.

- **Required Parameters**: _None_
- **Optional Parameters**: `remote` (string), `branch` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-PUSH-01` | **Push commits to origin** | `push git commits to origin` | `{"action":"tool","tool":"git.push","params":{}}` | Pushes local commits upstream to remote origin. |
| `TC-GIT-PUSH-02` | **Git push current branch** | `git push` | `{"action":"tool","tool":"git.push","params":{}}` | Publishes local commits. |

### `git.stash` — Stash Workspace Modifications

> Stashes uncommitted modified files or applies recently stored stash.

- **Required Parameters**: _None_
- **Optional Parameters**: `operation` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-STASH-01` | **Stash uncommitted changes** | `stash workspace modifications` | `{"action":"tool","tool":"git.stash","params":{}}` | Temporarily stashes dirty working tree changes. |
| `TC-GIT-STASH-02` | **Git stash working directory** | `git stash save "wip before merge"` | `{"action":"tool","tool":"git.stash","params":{}}` | Safeguards pending changes into stash stack. |

### `git.status` — Check Git Status

> Inspects git repository branch, tracked changes, modified files, and staging status.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-GIT-STAT-01` | **Check git working tree status** | `git status` | `{"action":"tool","tool":"git.status","params":{}}` | Inspects active branch, staged changes, and modified files. |
| `TC-GIT-STAT-02` | **Check modified files and branch** | `check git status and recent changes` | `{"action":"tool","tool":"git.status","params":{}}` | Returns working directory cleanliness report. |


## 🛠️ Developer Environments & Tooling (8 Tools · 16 Test Cases)

### `developer.android_studio` — Open in Android Studio

> Launches Google Android Studio IDE environment on target Android workspace.

- **Required Parameters**: _None_
- **Optional Parameters**: `path` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DEV-AS-01` | **Open project in Android Studio** | `open in Android Studio` | `{"action":"tool","tool":"developer.android_studio","params":{}}` | Launches Google Android Studio IDE environment. |
| `TC-DEV-AS-02` | **Launch Android developer tools** | `start android studio` | `{"action":"tool","tool":"developer.android_studio","params":{}}` | Initializes Android Studio IDE. |

### `developer.cursor` — Open in Cursor AI IDE

> Launches Cursor AI Code Editor (`cursor`) on target repository workspace.

- **Required Parameters**: _None_
- **Optional Parameters**: `path` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DEV-CURS-01` | **Open workspace in Cursor AI IDE** | `open in Cursor AI IDE` | `{"action":"tool","tool":"developer.cursor","params":{}}` | Launches Cursor AI Code Editor targeting current workspace. |
| `TC-DEV-CURS-02` | **Launch cursor editor** | `open cursor` | `{"action":"tool","tool":"developer.cursor","params":{}}` | Opens Cursor application window. |

### `developer.github` — Interact with GitHub CLI

> Executes GitHub repository workflows via official `gh` CLI or opens repository in web.

- **Required Parameters**: `command` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DEV-GH-01` | **List pull requests via GitHub CLI** | `interact with GitHub CLI pr list` | `{"action":"tool","tool":"developer.github","params":{"command":"pr list"}}` | Executes GitHub repository workflows via official gh CLI. |
| `TC-DEV-GH-02` | **View repository status via gh** | `gh repo status` | `{"action":"tool","tool":"developer.github","params":{"command":"repo status"}}` | Executes gh repo status check. |

### `developer.scaffold` — Scaffold Project Architecture

> Initializes a full-stack project architecture with the specified frontend and backend frameworks.

- **Required Parameters**: `projectName` (string), `frontend` (string), `backend` (string)
- **Optional Parameters**: `path` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DEV-SCAF-01` | **Scaffold full-stack project with Next.js and Django** | `make a folder and initialize a frontend with next project and backend with python django` | `{"action":"tool","tool":"developer.scaffold","params":{"projectName":"my_project","frontend":"nextjs","backend":"django"}}` | Scaffolds full-stack application architecture with Next.js and Django. |
| `TC-DEV-SCAF-02` | **Scaffold React and Express project** | `scaffold a project named dashboard with react and express` | `{"action":"tool","tool":"developer.scaffold","params":{"projectName":"dashboard","frontend":"react","backend":"express"}}` | Generates client and server boilerplate. |

### `developer.ssh` — Connect via SSH Remote Session

> Establishes secure shell (SSH) remote terminal connection to destination server host.

- **Required Parameters**: `target` (string)
- **Optional Parameters**: `port` (number)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DEV-SSH-01` | **Connect to remote host via SSH** | `connect via SSH to dev@192.168.1.50` | `{"action":"tool","tool":"developer.ssh","params":{"target":"dev@192.168.1.50"}}` | Establishes secure shell remote terminal session. |
| `TC-DEV-SSH-02` | **SSH to server with username** | `ssh ubuntu@staging.internal.net` | `{"action":"tool","tool":"developer.ssh","params":{"target":"ubuntu@staging.internal.net"}}` | Connects to remote server over SSH. |

### `developer.terminal` — Launch Standalone Terminal

> Spawns a new native GUI Terminal emulator window (Terminal.app, iTerm2, Alacritty) at path.

- **Required Parameters**: _None_
- **Optional Parameters**: `path` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DEV-TERM-01` | **Launch standalone native terminal window** | `launch standalone terminal` | `{"action":"tool","tool":"developer.terminal","params":{}}` | Spawns new native GUI Terminal emulator window. |
| `TC-DEV-TERM-02` | **Open separate terminal window** | `open native terminal app` | `{"action":"tool","tool":"developer.terminal","params":{}}` | Launches macOS Terminal.app. |

### `developer.vscode` — Open in Visual Studio Code

> Launches VS Code IDE editor (`code`) opening specified project folder or file path.

- **Required Parameters**: _None_
- **Optional Parameters**: `path` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DEV-VSC-01` | **Open project in Visual Studio Code** | `open current project in VS Code` | `{"action":"tool","tool":"developer.vscode","params":{}}` | Launches VS Code IDE editor on workspace directory. |
| `TC-DEV-VSC-02` | **Launch code editor here** | `open vscode here` | `{"action":"tool","tool":"developer.vscode","params":{}}` | Opens VS Code targeting current directory. |

### `developer.xcode` — Open in Apple Xcode IDE

> Opens Xcode workspace, project bundle, or Apple developer development suite (`xed`).

- **Required Parameters**: _None_
- **Optional Parameters**: `path` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DEV-XC-01` | **Open project in Apple Xcode IDE** | `open in Apple Xcode IDE` | `{"action":"tool","tool":"developer.xcode","params":{}}` | Opens Xcode workspace or project bundle. |
| `TC-DEV-XC-02` | **Launch Xcode for iOS app** | `launch xcode` | `{"action":"tool","tool":"developer.xcode","params":{}}` | Spawns Apple Xcode developer environment. |


## 🐳 Docker Container Orchestration (8 Tools · 16 Test Cases)

### `docker.compose_down` — Stop Docker Compose Stack

> Stops and removes containers, networks, and volumes created by Docker Compose.

- **Required Parameters**: _None_
- **Optional Parameters**: `volumes` (boolean), `file` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DKR-CDWN-01` | **Stop Docker Compose stack** | `stop docker compose stack` | `{"action":"tool","tool":"docker.compose_down","params":{}}` | Stops and removes containers, networks, and volumes. |
| `TC-DKR-CDWN-02` | **Tear down docker compose environment** | `docker-compose down` | `{"action":"tool","tool":"docker.compose_down","params":{}}` | Gracefully cleans up compose network and containers. |

### `docker.compose_up` — Start Docker Compose Stack

> Starts multi-container application services defined in docker-compose.yml.

- **Required Parameters**: _None_
- **Optional Parameters**: `detach` (boolean), `file` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DKR-CUP-01` | **Start Docker Compose services** | `start docker compose stack` | `{"action":"tool","tool":"docker.compose_up","params":{}}` | Starts multi-container application services defined in docker-compose.yml. |
| `TC-DKR-CUP-02` | **Docker compose up in background** | `docker-compose up -d` | `{"action":"tool","tool":"docker.compose_up","params":{}}` | Spawns compose stack daemon containers. |

### `docker.exec` — Execute Command inside Container

> Executes an interactive shell command or instruction inside a running Docker container.

- **Required Parameters**: `container` (string), `command` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DKR-EXEC-01` | **Execute command inside container** | `execute "uptime" inside container web-api` | `{"action":"tool","tool":"docker.exec","params":{"container":"web-api","command":"uptime"}}` | Executes command inside isolated container filesystem. |
| `TC-DKR-EXEC-02` | **Run database migration inside container** | `docker exec backend-service npm run migrate` | `{"action":"tool","tool":"docker.exec","params":{"container":"backend-service","command":"npm run migrate"}}` | Executes process inside active container. |

### `docker.images` — List Cached Docker Images

> Lists local cached Docker container images, tags, and sizes.

- **Required Parameters**: _None_
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DKR-IMG-01` | **List cached Docker images** | `list cached Docker images` | `{"action":"tool","tool":"docker.images","params":{}}` | Lists local cached Docker container images, tags, and sizes. |
| `TC-DKR-IMG-02` | **Show docker image repository** | `show docker images on machine` | `{"action":"tool","tool":"docker.images","params":{}}` | Inspects image registry cache. |

### `docker.logs` — Retrieve Container Logs

> Retrieves stdout/stderr runtime logs from a specified Docker container.

- **Required Parameters**: `container` (string)
- **Optional Parameters**: `tail` (number)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DKR-LOG-01` | **Retrieve logs for web API container** | `retrieve logs for container web-api` | `{"action":"tool","tool":"docker.logs","params":{"container":"web-api"}}` | Retrieves stdout/stderr runtime logs from container. |
| `TC-DKR-LOG-02` | **Inspect database container logs** | `show docker logs for postgres-db` | `{"action":"tool","tool":"docker.logs","params":{"container":"postgres-db"}}` | Streams recent logs from PostgreSQL container. |

### `docker.ps` — List Running Docker Containers

> Lists running and stopped Docker container instances and container statuses.

- **Required Parameters**: _None_
- **Optional Parameters**: `all` (boolean)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DKR-PS-01` | **List running Docker containers** | `list running Docker containers` | `{"action":"tool","tool":"docker.ps","params":{}}` | Lists running and stopped Docker container instances. |
| `TC-DKR-PS-02` | **Check active container status** | `show docker containers` | `{"action":"tool","tool":"docker.ps","params":{}}` | Queries docker daemon for active container IDs. |

### `docker.restart` — Restart Docker Container

> Restarts a running or stopped Docker container service.

- **Required Parameters**: `container` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DKR-REST-01` | **Restart Docker container** | `restart container nginx-gateway` | `{"action":"tool","tool":"docker.restart","params":{"container":"nginx-gateway"}}` | Restarts running or stopped Docker container. |
| `TC-DKR-REST-02` | **Reboot backend service container** | `docker restart auth-service` | `{"action":"tool","tool":"docker.restart","params":{"container":"auth-service"}}` | Cycles container lifecycle. |

### `docker.stop` — Stop Running Container

> Gracefully stops an actively running Docker container instance.

- **Required Parameters**: `container` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-DKR-STOP-01` | **Stop running container** | `stop container redis-cache` | `{"action":"tool","tool":"docker.stop","params":{"container":"redis-cache"}}` | Gracefully stops an actively running Docker container. |
| `TC-DKR-STOP-02` | **Halt background worker container** | `docker stop worker-node-1` | `{"action":"tool","tool":"docker.stop","params":{"container":"worker-node-1"}}` | Sends SIGTERM to stop target container. |


## 📦 Node.js & JavaScript Ecosystem (5 Tools · 10 Test Cases)

### `node.bun` — Execute via Bun Runtime

> Runs script, test runner, or rapid package installation using modern Bun runtime.

- **Required Parameters**: `command` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NODE-BUN-01` | **Run unit test suite with Bun** | `run bun test` | `{"action":"tool","tool":"node.bun","params":{"command":"test"}}` | Executes fast native tests via Bun runtime. |
| `TC-NODE-BUN-02` | **Execute script with Bun runtime** | `run bun run index.ts` | `{"action":"tool","tool":"node.bun","params":{"command":"run index.ts"}}` | Executes TypeScript directly using Bun. |

### `node.npm_install` — Install NPM Dependencies

> Installs project node_modules dependencies or specific NPM package.

- **Required Parameters**: _None_
- **Optional Parameters**: `package` (string), `global` (boolean)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NODE-NPMI-01` | **Install project NPM dependencies** | `install npm dependencies` | `{"action":"tool","tool":"node.npm_install","params":{}}` | Installs package dependencies into node_modules. |
| `TC-NODE-NPMI-02` | **Run npm install shorthand** | `run npm install` | `{"action":"tool","tool":"node.npm_install","params":{}}` | Triggers npm package installation. |

### `node.npm_run` — Execute NPM Script

> Runs script command defined in package.json (e.g. build, test, dev, lint).

- **Required Parameters**: `script` (string)
- **Optional Parameters**: `args` (array)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NODE-NPMR-01` | **Execute npm build script** | `run npm script "build"` | `{"action":"tool","tool":"node.npm_run","params":{"script":"build"}}` | Runs build script defined in package.json. |
| `TC-NODE-NPMR-02` | **Execute npm test suite** | `run npm script "test"` | `{"action":"tool","tool":"node.npm_run","params":{"script":"test"}}` | Runs unit tests via npm test runner. |

### `node.pnpm` — Run PNPM Operation

> Executes fast disk-efficient package management command via pnpm CLI.

- **Required Parameters**: `command` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NODE-PNPM-01` | **Run pnpm install** | `run pnpm install` | `{"action":"tool","tool":"node.pnpm","params":{"command":"install"}}` | Executes package installation via fast pnpm store. |
| `TC-NODE-PNPM-02` | **Execute pnpm dev script** | `run pnpm dev` | `{"action":"tool","tool":"node.pnpm","params":{"command":"dev"}}` | Starts local dev server via pnpm. |

### `node.yarn` — Manage Packages with Yarn

> Executes package operations or script running via Yarn package manager.

- **Required Parameters**: `command` (string)
- **Optional Parameters**: _None_

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-NODE-YARN-01` | **Run yarn build** | `run yarn build` | `{"action":"tool","tool":"node.yarn","params":{"command":"build"}}` | Executes package compilation with Yarn. |
| `TC-NODE-YARN-02` | **Install packages via yarn** | `yarn install dependencies` | `{"action":"tool","tool":"node.yarn","params":{"command":"install"}}` | Installs packages from yarn.lock. |


## 🐍 Python Runtime & Virtual Environments (4 Tools · 8 Test Cases)

### `python.create_venv` — Create Python Virtual Environment

> Creates an isolated Python environment (python3 -m venv) in target directory.

- **Required Parameters**: _None_
- **Optional Parameters**: `directory` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-PY-VENV-01` | **Create Python virtual environment** | `create a Python virtual environment` | `{"action":"tool","tool":"python.create_venv","params":{}}` | Creates isolated virtual environment (python3 -m venv) in workspace. |
| `TC-PY-VENV-02` | **Initialize venv environment** | `setup python venv in current directory` | `{"action":"tool","tool":"python.create_venv","params":{}}` | Initializes virtualenv sandbox. |

### `python.notebook` — Launch Jupyter Notebook

> Starts Jupyter Notebook or Lab interactive data science server in current folder.

- **Required Parameters**: _None_
- **Optional Parameters**: `lab` (boolean)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-PY-NB-01` | **Launch Jupyter Notebook server** | `launch Jupyter Notebook` | `{"action":"tool","tool":"python.notebook","params":{}}` | Starts Jupyter Notebook interactive data science server. |
| `TC-PY-NB-02` | **Start Jupyter Lab** | `start jupyter lab environment` | `{"action":"tool","tool":"python.notebook","params":{}}` | Launches browser-based Jupyter Lab session. |

### `python.pip_install` — Install Python Pip Package

> Installs Python software libraries and dependencies via pip package installer.

- **Required Parameters**: `package` (string)
- **Optional Parameters**: `upgrade` (boolean)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-PY-PIP-01` | **Install Python package via pip** | `install requests package using pip` | `{"action":"tool","tool":"python.pip_install","params":{"package":"requests"}}` | Installs Python library dependency via pip. |
| `TC-PY-PIP-02` | **Install data science libraries** | `pip install pandas numpy` | `{"action":"tool","tool":"python.pip_install","params":{"package":"pandas numpy"}}` | Installs multiple Python wheels. |

### `python.run_script` — Execute Python Script

> Runs Python `.py` script file or code command using Python 3 interpreter.

- **Required Parameters**: `script` (string)
- **Optional Parameters**: `args` (array)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-PY-RUN-01` | **Execute Python script** | `run python script main.py` | `{"action":"tool","tool":"python.run_script","params":{"script":"main.py"}}` | Executes Python 3 script file. |
| `TC-PY-RUN-02` | **Run machine learning training script** | `run python script scripts/train_model.py` | `{"action":"tool","tool":"python.run_script","params":{"script":"scripts/train_model.py"}}` | Executes target python module. |


## 🐚 Shell & Compound Pipeline Execution (1 Tools · 3 Test Cases)

### `shell.execute` — Execute Terminal Shell Command

> Executes a complete macOS zsh command line, including installed CLI tools, pipes, redirects, and shell built-ins.

- **Required Parameters**: `command` (string)
- **Optional Parameters**: `cwd` (string)

| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `TC-SH-EXEC-01` | **Compound shell pipeline command** | `show the current directory and its git branch` | `{"action":"tool","tool":"shell.execute","params":{"command":"pwd && git branch --show-current"}}` | Executes compound shell command pipeline. |
| `TC-SH-EXEC-02` | **Complex pipeline with find, sort, and head** | `find the ten largest files here` | `{"action":"tool","tool":"shell.execute","params":{"command":"find . -type f -print0 | xargs -0 du -h | sort -hr | head -10"}}` | Runs disk analysis pipeline via native shell. |
| `TC-SH-EXEC-03` | **System diagnostic compound command** | `run uptime && whoami` | `{"action":"tool","tool":"shell.execute","params":{"command":"uptime && whoami"}}` | Executes chained command in zsh. |

---

## 🔄 Multi-Step Autonomous Workflows

Sentinel Terminal's agent loop automatically decomposes complex multi-step objectives into sequences of tool calls:

### 🎧 Complete Bluetooth Connection Flow
1. **User Objective**: *"Connect my Soundcore Space One headphones"*
2. **Step 1 (Radio Activation)**: 
   ```json
   { "action": "tool", "tool": "network.bluetooth.on", "params": {} }
   ```
3. **Step 2 (Device Discovery)**:
   ```json
   { "action": "tool", "tool": "network.bluetooth.list", "params": {} }
   ```
4. **Step 3 (Peripheral Link)**:
   ```json
   { "action": "tool", "tool": "network.bluetooth.connect", "params": { "device": "Soundcore Space One" } }
   ```
5. **Step 4 (Agent Completion)**:
   ```json
   { "action": "done", "summary": "Successfully activated Bluetooth, discovered Soundcore Space One, and established wireless audio connection." }
   ```

### 🚀 Full-Stack Scaffolding & Git Init Flow
1. **User Objective**: *"Make a folder and initialize a frontend with next project and backend with python django"*
2. **Step 1 (Scaffold Project)**:
   ```json
   { "action": "tool", "tool": "developer.scaffold", "params": { "projectName": "my_project", "frontend": "nextjs", "backend": "django" } }
   ```
3. **Step 2 (Navigate to Directory)**:
   ```json
   { "action": "tool", "tool": "filesystem.navigate", "params": { "path": "./my_project" } }
   ```
4. **Step 3 (Inspect Git Status)**:
   ```json
   { "action": "tool", "tool": "git.status", "params": {} }
   ```

---

## 🧪 How to Execute & Verify These Test Cases

### 1. Interactive Terminal Verification
Type any test prompt verbatim directly into the Sentinel Terminal prompt:
```bash
# Example:
connect soundcore space one headphone
check if any bluetooth device is available
turn off bluetooth
```

### 2. Automated Programmatic Testing via Vitest
All test definitions in [`tests/tool_test_cases.json`](file:///Users/dev/Project%20Folder/AI%20Terminal/tests/tool_test_cases.json) can be validated with Vitest against `AgentLoop`:
```bash
npx vitest run src/ai/agent/AgentLoop.test.ts
```
