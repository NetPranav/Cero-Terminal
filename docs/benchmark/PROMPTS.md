# Benchmark prompt specification

The 450 prompts (9 domains x 50) used by `npm run benchmark` and `scripts/run_cli_prompts.ts`.
Extracted unchanged from the v6 roadmap (`docs/archive/ROADMAP_v6_legacy.md`, section 6).

Caveat: before September 2026 the offline fast-path table contained one hardcoded regex per
prompt in this file, many returning canned text, so historical "450/450" results measured
that table rather than the model. See the earlier audit in git history (`git show 4c5fff9:docs/ROADMAP.md`, issue I-43).

## 6. Master Domain Benchmark: Detailed Prompts, Verification & Fix Harness

This suite contains **450 domain-classified prompts** (50 prompts across each of the 9 core functional domains). It serves as the automated regression and quality test harness for Sentinel on Linux.

### Domain 1: System Diagnostics & Hardware Monitoring (50 Prompts)

| # | Prompt | Target Tool / Command | Expected Output Structure | Verification Criteria |
|---|---|---|---|---|
| 1.1 | `>system info` | `system.info / uname -srm` | OS Name, Kernel, Arch, CPU Model, Cores, Uptime | Contains Linux, valid kernel version, CPU cores count; no macOS/Darwin |
| 1.2 | `>check memory usage` | `system.ram / free -h` | Formatted RAM usage (used, total, available, swap) | RAM values in MB/GB; available RAM displayed cleanly |
| 1.3 | `>check storage` | `system.storage / df -h -P` | Storage Mounts list with total, free, and % used | Real Linux mounts (/); no APFS references |
| 1.4 | `>check available disk space` | `system.storage / df -h .` | Free space on current mount point | Shows current directory mount space |
| 1.5 | `>check battery status` | `system.battery / sysfs BAT` | Battery percentage & charging state (or AC Power) | Valid percentage integer (0–100%) or AC Desktop message |
| 1.6 | `>what is my battery level` | `system.battery / sysfs BAT` | Single battery percentage card | Formatted battery card with icon |
| 1.7 | `>system uptime` | `system.uptime / uptime -p` | Formatted uptime duration | Starts with 'up ' (e.g. up 3 hours, 12 minutes) |
| 1.8 | `>cpu info` | `system.cpu / lscpu` | Processor model, architecture, cores, load averages | Valid Linux processor name (Intel/AMD/ARM) |
| 1.9 | `>check cpu load` | `lscpu / cat /proc/loadavg` | 1, 5, and 15-minute load averages | Three floating point numbers |
| 1.10 | `>check swap usage` | `free -h / swapon --show` | Swap total, used, and free | Displays swap size or swap disabled status |
| 1.11 | `>hardware specs` | `system.info` | Aggregated hardware summary card | OS, CPU, RAM, and storage overview |
| 1.12 | `>check disk usage of current folder` | `du -sh .` | Human-readable size of current directory | Number followed by K/M/G (e.g. 245M .) |
| 1.13 | `>check disk space on root partition` | `df -h /` | Root partition total, used, and available space | Mount point is / |
| 1.14 | `>check system architecture` | `uname -m` | System architecture (e.g. x86_64) | Single string x86_64, aarch64, etc. |
| 1.15 | `>display linux kernel version` | `uname -r` | Exact Linux kernel version string | Kernel version matching uname -r |
| 1.16 | `>check cpu temperature` | `sensors 2>/dev/null \|\| cat /sys/class/thermal/thermal_zone*/temp` | CPU core and package temperature in Celsius | Valid numeric temperature (°C) |
| 1.17 | `>check fan speeds` | `sensors 2>/dev/null \| grep -i fan` | Active fan speeds in RPM | RPM readings or fanless passive report |
| 1.18 | `>check ram speed and type` | `sudo dmidecode --type memory 2>/dev/null \|\| cat /proc/meminfo` | Memory speed (MHz), clock rate, and type (DDR4/DDR5) | Memory hardware profile details |
| 1.19 | `>list physical block devices` | `lsblk -e 7,11` | Block devices, partition trees, mountpoints | Excludes loop and ramdisks cleanly |
| 1.20 | `>check ssd smart health` | `sudo smartctl -H /dev/nvme0n1 2>/dev/null \|\| echo 'Health: OK'` | SMART self-test health status | Passed or Good (100%) health status |
| 1.21 | `>check mounted filesystems` | `mount \| grep -E '^/dev'` | Mounted physical filesystem list | Mount options and filesystem types |
| 1.22 | `>check inode usage on disk` | `df -i /` | Used and free inode count on root mount | Valid inode percentage and count |
| 1.23 | `>check battery health and wear level` | `cat /sys/class/power_supply/BAT*/energy_full 2>/dev/null` | Full capacity vs design capacity calculation | Battery wear percentage indicator |
| 1.24 | `>check battery charging rate` | `cat /sys/class/power_supply/BAT*/power_now 2>/dev/null` | Current draw or wattage consumption | Power in watts or micro-amperes |
| 1.25 | `>check power adapter status` | `cat /sys/class/power_supply/ADP*/online 2>/dev/null` | AC adapter plugged in or unplugged boolean | 1 for AC plugged in, 0 for battery |
| 1.26 | `>check motherboard and bios info` | `cat /sys/class/dmi/id/board_name 2>/dev/null` | Motherboard model and manufacturer | DMI board vendor and product name |
| 1.27 | `>check bios version and release date` | `cat /sys/class/dmi/id/bios_version 2>/dev/null` | BIOS release version and build date | Exact BIOS firmware revision |
| 1.28 | `>list all pci hardware devices` | `lspci` | PCI bus controller, bridges, host adapters | Vendor and device model descriptions |
| 1.29 | `>list all connected usb devices` | `lsusb` | USB devices, bus and device IDs | Manufacturer and product USB IDs |
| 1.30 | `>check dedicated gpu info` | `lspci \| grep -iE 'vga\|3d\|display'` | Primary graphics card description | NVIDIA, AMD, or Intel GPU line |
| 1.31 | `>check gpu memory vram usage` | `nvidia-smi 2>/dev/null \|\| lspci -v -s $(lspci \| grep -i vga \| cut -d' ' -f1)` | VRAM size and utilization | VRAM capacity in MB/GB |
| 1.32 | `>check cpu frequency per core` | `grep 'cpu MHz' /proc/cpuinfo` | Clock speeds per CPU thread | Frequency values in MHz |
| 1.33 | `>check cpu governor mode` | `cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null` | Active governor (powersave, performance) | Single valid governor string |
| 1.34 | `>check cpu vulnerabilities and mitigations` | `cat /sys/devices/system/cpu/vulnerabilities/*` | Spectre, Meltdown, Retbleed status | Mitigated or Not affected status |
| 1.35 | `>check system boot timestamp` | `who -b` | Date and time system was booted | System boot date timestamp |
| 1.36 | `>check last system reboots` | `last reboot \| head -5` | Recent reboot history log | Reboot timestamps and runlevel |
| 1.37 | `>check system timezone and local time` | `timedatectl` | Timezone, local time, universal time, RTC | Valid IANA timezone (e.g. Asia/Kolkata) |
| 1.38 | `>check ntp time sync status` | `timedatectl \| grep -i ntp` | NTP service active and clock synchronized | Synchronized: yes/no |
| 1.39 | `>check thermal throttling status` | `dmesg \| grep -i throttle 2>/dev/null \|\| echo 'No throttling'` | CPU thermal throttling log entries | Thermal throttle alert or clean |
| 1.40 | `>check interrupts distribution` | `cat /proc/interrupts \| head -15` | Hardware interrupts across CPU cores | IRQ numbers and handler names |
| 1.41 | `>check memory page size` | `getconf PAGESIZE` | System memory page size in bytes | Standard 4096 bytes |
| 1.42 | `>check hugepages configuration` | `grep -i huge /proc/meminfo` | HugePages total, free, and size | Hugepage allocation values |
| 1.43 | `>check dirty memory buffer size` | `grep -i dirty /proc/meminfo` | Pending unwritten disk writeback memory | Dirty buffer size in KB |
| 1.44 | `>check kernel command line parameters` | `cat /proc/cmdline` | Bootloader kernel parameters | Kernel boot arguments (root, quiet, etc.) |
| 1.45 | `>check loaded kernel modules count` | `lsmod \| wc -l` | Number of loaded kernel drivers/modules | Positive integer count |
| 1.46 | `>check specific loaded module ext4` | `lsmod \| grep -w ext4` | ext4 module dependency and size | Module name, size, used by count |
| 1.47 | `>check pci express link speed` | `sudo lspci -vv 2>/dev/null \| grep -i 'LnkSta:' \| head -3` | PCIe generation and lane width (x4, x16) | Link speed (e.g. 8GT/s, 16GT/s) |
| 1.48 | `>check edid monitor display info` | `cat /sys/class/drm/*/edid 2>/dev/null \| head -1` | Connected monitor physical display parameters | DRM connector output exists |
| 1.49 | `>check wireless regulatory domain` | `iw reg get 2>/dev/null \|\| echo 'Global'` | Wireless country code regulation | Country code ISO string |
| 1.50 | `>check total system uptime in seconds` | `cat /proc/uptime` | Seconds since boot and idle seconds | Two floating point numbers |

---

### Domain 2: Process Management & Resource Optimization (50 Prompts)

| # | Prompt | Target Tool / Command | Expected Output Structure | Verification Criteria |
|---|---|---|---|---|
| 2.1 | `>which process is using the most cpu` | `system.processes (singular)` | Single process card: Name, PID, CPU%, RAM% | Exactly 1 process displayed; includes CPU% and PID |
| 2.2 | `>which process is using the most memory` | `system.processes (singular)` | Single process card: Name, PID, RAM%, CPU% | Exactly 1 process displayed; sorted by RAM% |
| 2.3 | `>top cpu process` | `system.processes (singular)` | Top process card | Singular highlight card |
| 2.4 | `>top ram process` | `system.processes (singular)` | Top RAM process card | Singular highlight card |
| 2.5 | `>list running processes` | `system.processes (batch)` | List of top 10–15 processes | Clean table/list with PIDs, names, CPU%, and RAM% |
| 2.6 | `>show top 5 processes by cpu` | `ps -eo pid,pcpu,comm --sort=-pcpu \| head -6` | Top 5 CPU processes | Exactly 5 process rows |
| 2.7 | `>show top 5 processes by memory` | `ps -eo pid,pmem,comm --sort=-pmem \| head -6` | Top 5 memory processes | Exactly 5 process rows |
| 2.8 | `>is spotify running` | `pgrep -i -l spotify / ps` | Process name & PID if active, or 'Not running' | Accurate boolean detection of process presence |
| 2.9 | `>is node running` | `pgrep -i -l node` | Active Node.js PIDs or clean negative message | Accurate identification of node threads |
| 2.10 | `>kill process named test-app` | `system.kill_process / pkill` | Termination confirmation with process name | Successfully attempts pkill -9 -i -f test-app |
| 2.11 | `>kill process with pid 99999` | `system.kill_process / kill` | Failure report (no process found) or terminated | Handles non-existent PID gracefully without crash |
| 2.12 | `>kill process on port 3000` | `system.kill_process (port)` | Terminates PID occupying port 3000 | Resolves port to PID and sends SIGKILL |
| 2.13 | `>show process tree` | `pstree / ps axjf` | Hierarchical process tree output | Formatted process tree hierarchy |
| 2.14 | `>count total running processes` | `ps -e \| wc -l` | Integer count of running processes | Valid number |
| 2.15 | `>find pid of hyprland` | `pidof Hyprland \|\| pgrep -x Hyprland` | PID of active window manager | Valid integer PID |
| 2.16 | `>list zombie processes` | `ps -eo pid,stat,comm \| grep -w 'Z'` | Defunct or zombie processes list | Processes with status Z or clean message |
| 2.17 | `>check threads count of process 1` | `cat /proc/1/status \| grep Threads` | Number of threads belonging to init/systemd | Integer thread count |
| 2.18 | `>find processes consuming more than 5% cpu` | `ps -eo pid,pcpu,comm --sort=-pcpu \| awk '$2 > 5.0'` | Processes matching CPU threshold | All returned processes have pcpu > 5.0 |
| 2.19 | `>find processes using more than 500MB ram` | `ps -eo pid,rss,comm --sort=-rss \| awk '$2 > 512000'` | Processes exceeding memory limit | High RSS memory consumers |
| 2.20 | `>show all processes owned by root` | `ps -u root -o pid,comm \| head -10` | Processes running under root UID | User filtered process list |
| 2.21 | `>show all processes owned by current user` | `ps -u $USER -o pid,comm \| head -10` | Processes running under active user | User filtered process list |
| 2.22 | `>check nice priority of process 1` | `ps -o pid,nice,comm -p 1` | Scheduling priority / nice value | Nice value integer (-20 to 19) |
| 2.23 | `>renice process 1234 to priority 10` | `renice 10 -p 1234 2>/dev/null` | Priority change confirmation or error | Security verified priority adjustment |
| 2.24 | `>find process with highest IO activity` | `iotop -b -n 1 \| head -5 2>/dev/null \|\| ps -eo pid,comm` | Top disk I/O reading and writing process | PID and disk write rate |
| 2.25 | `>show memory usage of current shell` | `ps -o pid,rss,vsz,comm -p $$` | Resident and virtual memory of active shell | Memory footprint in KB |
| 2.26 | `>list suspended processes` | `ps -eo pid,stat,comm \| grep -w 'T'` | Stopped or traced process list | Processes in stopped state |
| 2.27 | `>find processes in uninterruptible sleep` | `ps -eo pid,stat,comm \| grep -w 'D'` | Processes waiting on disk or hardware I/O | Processes in D state |
| 2.28 | `>kill all instances of chrome` | `pkill -9 -i chrome` | Termination summary for browser instances | Matches all chrome process names |
| 2.29 | `>kill all python scripts` | `pkill -9 -f 'python'` | Terminates python interpreters | Matches python command lines |
| 2.30 | `>find pid of listening process on port 8080` | `lsof -ti :8080 2>/dev/null \|\| ss -tulpn \| grep 8080` | PID occupying port 8080 | Accurate PID extraction |
| 2.31 | `>check open file descriptors count for pid 1` | `ls -1 /proc/1/fd \| wc -l` | Integer count of open files | Positive integer number |
| 2.32 | `>check environment variables of pid 1` | `strings /proc/1/environ \| head -5` | Init environment variables | Key=value environment pairs |
| 2.33 | `>check commandline invocation of pid 1` | `cat /proc/1/cmdline \| tr '\0' ' '` | Full binary command line arguments | Executable path and parameters |
| 2.34 | `>check process start time of init` | `ps -p 1 -o lstart=` | Exact boot start time of PID 1 | Date timestamp string |
| 2.35 | `>check cpu time consumed by init` | `ps -p 1 -o cputime=` | Accumulated CPU computation time | Time in mm:ss or hh:mm:ss format |
| 2.36 | `>check oom score of active processes` | `cat /proc/$$/oom_score` | Out-of-memory killer badness score | Integer OOM score (0–1000) |
| 2.37 | `>adjust oom score of process` | `echo 500 \| sudo tee /proc/1234/oom_score_adj 2>/dev/null` | OOM adjustment confirmation | Security consent required |
| 2.38 | `>monitor process cpu for 3 seconds` | `top -b -n 3 -d 1 -p $$` | Three snapshots of shell resource usage | Three sequential top updates |
| 2.39 | `>find parent process id of current shell` | `ps -o ppid= -p $$` | PPID of active terminal tab | Integer PPID number |
| 2.40 | `>list all child processes of current shell` | `pgrep -P $$` | Child PIDs spawned by active session | List of integer PIDs |
| 2.41 | `>check cgroup of current shell` | `cat /proc/$$/cgroup` | Systemd slice and cgroup path | Cgroup hierarchy path |
| 2.42 | `>check security limits of current process` | `cat /proc/$$/limits \| grep 'Max open files'` | Soft and hard file descriptor limits | Limits integers (e.g. 1024 1048576) |
| 2.43 | `>find memory mapped files for pid 1` | `cat /proc/1/maps \| head -5` | Virtual address space memory map | Hex addresses, permissions, mapped paths |
| 2.44 | `>find shared libraries used by bash` | `ldd /bin/bash` | Dynamically linked shared object libraries | Paths to libc.so, libdl.so, etc. |
| 2.45 | `>check process capabilities of pid 1` | `getpcaps 1 2>/dev/null \|\| cat /proc/1/status \| grep Cap` | Linux capabilities (CapInh, CapPrm, CapEff) | Capability bitmasks |
| 2.46 | `>kill process gently with sigterm` | `kill -15 1234 2>/dev/null` | SIGTERM graceful termination sent | Signal 15 dispatched |
| 2.47 | `>kill process immediately with sigkill` | `kill -9 1234 2>/dev/null` | SIGKILL immediate termination sent | Signal 9 dispatched |
| 2.48 | `>send sigstop pause signal to process` | `kill -STOP 1234 2>/dev/null` | SIGSTOP pause dispatched | Signal 19 dispatched |
| 2.49 | `>send sigcont resume signal to process` | `kill -CONT 1234 2>/dev/null` | SIGCONT resume dispatched | Signal 18 dispatched |
| 2.50 | `>show top 3 processes consuming disk space in /tmp` | `lsof +D /tmp \| awk '{print $1, $2}' \| sort -u \| head -4` | Processes holding open handles in /tmp | Process names and PIDs |

---

### Domain 3: Network Diagnostics, Ports & Connections (50 Prompts)

| # | Prompt | Target Tool / Command | Expected Output Structure | Verification Criteria |
|---|---|---|---|---|
| 3.1 | `>tell me all running ports` | `network.ports / ss -tulpn` | List of active listening ports & processes | Lists port numbers with TCP/UDP protocol |
| 3.2 | `>check open ports` | `network.ports` | Clean listening ports overview | Clean port numbers without terminal garbling |
| 3.3 | `>check if port 8080 is in use` | `network.ports({ port: 8080 })` | Boolean status of port 8080 + owner process | Identifies if port is free or occupied |
| 3.4 | `>is port 3000 open` | `network.ports({ port: 3000 })` | Port 3000 status | Specific status report for port 3000 |
| 3.5 | `>find a free port` | `network.ports({ findFree: true })` | Discovered available port number | Returns valid unallocated port (e.g. 3001, 8081) |
| 3.6 | `>find 3 available ports` | `network.ports` | List of 3 free port numbers | Returns 3 distinct available ports |
| 3.7 | `>check my ip address` | `ip -br addr / hostname -I` | Local interface IPs and WAN public IP | Valid IPv4 format (192.168.x.x or similar) |
| 3.8 | `>what is my local ip` | `ip -br addr show` | Local network IP addresses per adapter | Identifies wlan0, eth0, or enp* |
| 3.9 | `>what is my public ip` | `curl -s https://api.ipify.org` | WAN external public IP address | Valid public IP format |
| 3.10 | `>ping google.com` | `network.ping / ping -c 3` | Ping latency stats (avg, min, max ms) | 3 packets transmitted, avg RTT calculated |
| 3.11 | `>test internet connection` | `ping -c 2 1.1.1.1` | Connectivity confirmation | Success status indicator |
| 3.12 | `>scan wifi networks` | `network.wifi.scan / nmcli dev wifi` | List of SSIDs, signal strengths, security | Formatted network list with signal bars |
| 3.13 | `>turn on wifi` | `network.wifi.on / nmcli r wifi on` | Wi-Fi adapter enabled confirmation | Wi-Fi radio set to enabled |
| 3.14 | `>turn off wifi` | `network.wifi.off / nmcli r wifi off` | Wi-Fi adapter disabled confirmation | Wi-Fi radio set to disabled |
| 3.15 | `>list bluetooth devices` | `network.bluetooth.list` | Paired and available Bluetooth devices | Device names and MAC addresses |
| 3.16 | `>turn on bluetooth` | `network.bluetooth.on / bluetoothctl power on` | Bluetooth powered on confirmation | Controller powered: yes |
| 3.17 | `>turn off bluetooth` | `network.bluetooth.off / bluetoothctl power off` | Bluetooth powered off confirmation | Controller powered: no |
| 3.18 | `>check active network interfaces` | `ip link show` | Network interface list (lo, wlan0, eth0) | Interface flags (UP, LOWER_UP) |
| 3.19 | `>check mac address of wifi card` | `ip link show wlan0 \| grep link/ether` | Hardware MAC address | Standard 6-byte hex MAC address |
| 3.20 | `>check default network gateway` | `ip route show default` | Default gateway IP and routing device | default via <ip> dev <dev> |
| 3.21 | `>check dns nameservers` | `cat /etc/resolv.conf \| grep nameserver` | Configured DNS resolver IPs | Valid IP addresses |
| 3.22 | `>resolve hostname github.com` | `getent hosts github.com \|\| dig +short github.com` | Resolved IP addresses for hostname | Valid IPv4/IPv6 addresses |
| 3.23 | `>check reverse dns of 8.8.8.8` | `dig -x 8.8.8.8 +short \|\| host 8.8.8.8` | PTR record domain name | dns.google |
| 3.24 | `>check active tcp connections` | `ss -t -a \| head -10` | Established and listening TCP sockets | Local and peer socket addresses |
| 3.25 | `>check active udp sockets` | `ss -u -a \| head -10` | UDP socket endpoints | Bound UDP ports |
| 3.26 | `>check network socket statistics summary` | `ss -s` | Total sockets, TCP established, closed, timewait | Summary numerical table |
| 3.27 | `>trace network route to 1.1.1.1` | `tracepath -n 1.1.1.1 2>/dev/null \|\| traceroute -n 1.1.1.1` | Network hops and latency per hop | Hop sequence with IP addresses |
| 3.28 | `>check network packet statistics per interface` | `ip -s link show` | RX/TX bytes, packets, errors, dropped | Packet transmission counters |
| 3.29 | `>check arp cache table` | `ip neigh show` | Neighbor IP to MAC address mappings | Neigh state (REACHABLE, STALE) |
| 3.30 | `>clear arp cache entry for gateway` | `sudo ip neigh flush all` | Flushed ARP cache confirmation | Requires security consent |
| 3.31 | `>check if port 22 ssh is open on localhost` | `nc -z -v -w 1 127.0.0.1 22 2>/dev/null \|\| ss -tulpn \| grep :22` | SSH port status on local loopback | Open or Connection refused |
| 3.32 | `>check if port 5432 postgres is in use` | `ss -tulpn \| grep 5432` | PostgreSQL database port binding | Reports process owner if bound |
| 3.33 | `>check if port 27017 mongodb is in use` | `ss -tulpn \| grep 27017` | MongoDB port binding | Reports process owner if bound |
| 3.34 | `>check if port 6379 redis is in use` | `ss -tulpn \| grep 6379` | Redis server port binding | Reports process owner if bound |
| 3.35 | `>check network bandwidth utilization` | `cat /proc/net/dev` | Bytes received and sent across interfaces | Cumulative network throughput values |
| 3.36 | `>renew dhcp lease on default interface` | `sudo dhclient -r && sudo dhclient 2>/dev/null` | DHCP lease renewal confirmation | Security consent required |
| 3.37 | `>show saved wifi connections` | `nmcli connection show` | Known SSIDs and connection UUIDs | Connection names and types |
| 3.38 | `>check wifi signal strength of current connection` | `nmcli -f IN-USE,SSID,SIGNAL,BARS dev wifi \| grep '^\*'` | Active SSID and signal percentage | Signal rating (e.g. 85%) |
| 3.39 | `>disconnect from current wifi network` | `nmcli dev disconnect wlan0` | Disconnection confirmation | Device wlan0 disconnected |
| 3.40 | `>show bluetooth adapter power and pairing mode` | `bluetoothctl show` | Bluetooth controller alias, state, discoverable | Powered and Pairable booleans |
| 3.41 | `>scan for new bluetooth devices for 5 seconds` | `bluetoothctl --timeout 5 scan on` | Discovered Bluetooth MACs and RSSI | Discovery sequence log |
| 3.42 | `>connect to bluetooth headphones` | `bluetoothctl connect <MAC>` | Connection established confirmation | Connection successful |
| 3.43 | `>disconnect bluetooth device` | `bluetoothctl disconnect <MAC>` | Disconnection confirmation | Device disconnected |
| 3.44 | `>check firewall iptables rules` | `sudo iptables -L -n -v 2>/dev/null \|\| echo 'Firewall: default'` | Input and forward filter rules | Chain INPUT, FORWARD, OUTPUT |
| 3.45 | `>check nftables firewall rules` | `sudo nft list ruleset 2>/dev/null \|\| echo 'nftables active'` | NFT ruleset table | Table inet filter |
| 3.46 | `>check open ports in ufw firewall` | `sudo ufw status 2>/dev/null \|\| echo 'UFW inactive'` | UFW active status and open port list | Status: active/inactive |
| 3.47 | `>test tcp connection latency to port 443` | `nc -z -v -w 2 google.com 443 2>/dev/null \|\| curl -I https://google.com` | TCP handshake latency | Connection successful to 443 |
| 3.48 | `>check ipv6 address on local interface` | `ip -6 addr show scope global` | Global IPv6 addresses | Valid 128-bit IPv6 address |
| 3.49 | `>disable ipv6 temporarily` | `sudo sysctl -w net.ipv6.conf.all.disable_ipv6=1` | IPv6 disabled confirmation | Security consent required |
| 3.50 | `>enable ipv6` | `sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0` | IPv6 enabled confirmation | Security consent required |

---

### Domain 4: Filesystem, Directory Navigation & File Search (50 Prompts)

| # | Prompt | Target Tool / Command | Expected Output Structure | Verification Criteria |
|---|---|---|---|---|
| 4.1 | `>find all python files in this directory` | `find . -name '*.py'` | List of .py file paths | Files end with .py; path is relative or absolute |
| 4.2 | `>find all typescript files` | `find . -name '*.ts' -not -path '*/node_modules/*'` | List of .ts files, excluding node_modules | No node_modules pollution in results |
| 4.3 | `>find files named package.json` | `find . -name 'package.json'` | Paths to package.json files | Exact match on filename |
| 4.4 | `>search for frontend in folders` | `find . -type d -iname '*frontend*'` | Matching directory paths | Results are directories only |
| 4.5 | `>list files in current directory` | `filesystem.list / ls -la` | Directory contents with permissions & sizes | Proper file permissions, sizes, and names |
| 4.6 | `>show hidden files` | `ls -ld .*` | Dotfiles in current directory | Only files starting with . |
| 4.7 | `>navigate to home` | `filesystem.navigate({ path: '~' })` | Directory changed to ~ | Current working directory updates to /home/<user> |
| 4.8 | `>go back one directory` | `cd ..` | Directory changed to .. | PWD moves up one level |
| 4.9 | `>find files larger than 100MB` | `find . -type f -size +100M` | Large files with sizes | Files exceeding 100 megabytes |
| 4.10 | `>search text 'OllamaProvider' in src` | `grep -rn 'OllamaProvider' src/` | Matching filenames and line numbers | Lines containing exact search query |
| 4.11 | `>count lines of code in src directory` | `find src -name '*.ts' \| xargs wc -l` | Total lines count | Valid numerical total |
| 4.12 | `>show top 5 largest files in this folder` | `du -ah . \| sort -rh \| head -5` | 5 largest files with human sizes | Sorted in descending size order |
| 4.13 | `>check if file README.md exists` | `test -f README.md && echo 'Exists'` | Existence confirmation | Boolean verification |
| 4.14 | `>create temporary test folder` | `mkdir -p ./tmp_test` | Folder creation confirmation | Folder created on disk |
| 4.15 | `>delete temporary test folder` | `rm -rf ./tmp_test` | Folder deletion confirmation | Folder removed cleanly |
| 4.16 | `>find all rust source files` | `find . -name '*.rs'` | List of .rs files | Paths ending in .rs |
| 4.17 | `>find all markdown files in workspace` | `find . -name '*.md'` | List of markdown documentation files | Paths ending in .md |
| 4.18 | `>find all json configuration files` | `find . -name '*.json' -not -path '*/node_modules/*'` | JSON config files | Paths ending in .json |
| 4.19 | `>find all shell scripts` | `find . -name '*.sh'` | Executable shell script files | Paths ending in .sh |
| 4.20 | `>find empty directories in project` | `find . -type d -empty -not -path '*/.git*'` | Empty folders list | Directories with zero children |
| 4.21 | `>find empty files in current directory` | `find . -type f -empty` | Empty 0-byte files | Files with size 0 |
| 4.22 | `>find files modified in last 24 hours` | `find . -type f -mtime -1 -not -path '*/.git*'` | Recently modified files | Files updated within 1 day |
| 4.23 | `>find files modified in last 60 minutes` | `find . -type f -mmin -60` | Files modified within 1 hour | High recency files list |
| 4.24 | `>find files created today` | `find . -type f -daystart -mtime 0` | Files created since midnight | Today's created files |
| 4.25 | `>find files older than 30 days` | `find . -type f -mtime +30` | Stale files older than 1 month | Historical files list |
| 4.26 | `>search case-insensitive text 'todo' in codebase` | `grep -rnI 'TODO' src/` | TODO comments and line numbers | Lines containing TODO token |
| 4.27 | `>search text 'FIXME' across project` | `grep -rnI 'FIXME' src/` | FIXME annotations list | Lines containing FIXME token |
| 4.28 | `>count total files in current directory tree` | `find . -type f \| wc -l` | Total file count integer | Positive integer count |
| 4.29 | `>count total folders in current directory tree` | `find . -type d \| wc -l` | Total folder count integer | Positive integer count |
| 4.30 | `>show disk usage of all subdirectories` | `du -h --max-depth=1 .` | Folder sizes breakdown | Sizes formatted in K/M/G |
| 4.31 | `>show top 3 largest folders in project` | `du -h --max-depth=1 . \| sort -rh \| head -4` | Top 3 directory space consumers | Sorted in descending order |
| 4.32 | `>check file permissions of package.json` | `stat -c '%a %n' package.json 2>/dev/null \|\| ls -l package.json` | Octal or rwx permissions | Permissions string (e.g. 644) |
| 4.33 | `>check last modification timestamp of tsconfig.json` | `stat -c '%y' tsconfig.json 2>/dev/null` | Exact modification date and time | ISO or standard timestamp |
| 4.34 | `>check file size of package-lock.json` | `du -h package-lock.json \| cut -f1` | Human readable file size | Size with unit (e.g. 1.2M) |
| 4.35 | `>find duplicate files by filename` | `find . -type f -exec basename {} \; \| sort \| uniq -d \| head -5` | Filenames appearing in multiple directories | Duplicate basename list |
| 4.36 | `>find broken symlinks` | `find . -xtype l` | Dangling symlinks pointing to non-existent targets | List of broken links or empty |
| 4.37 | `>find all symbolic links in directory` | `find . -type l` | Valid and invalid symlink paths | Paths of symlink files |
| 4.38 | `>create a symbolic link test_link to README.md` | `ln -s README.md test_link` | Symlink creation confirmation | Symlink created on disk |
| 4.39 | `>remove symbolic link test_link` | `rm test_link` | Symlink deletion confirmation | Link removed cleanly |
| 4.40 | `>show first 15 lines of package.json` | `head -15 package.json` | First 15 lines of text | Clean JSON header preview |
| 4.41 | `>show last 10 lines of Cargo.toml` | `tail -10 src-tauri/Cargo.toml` | Last 10 lines of file | Tail lines of Cargo file |
| 4.42 | `>display line count word count byte count of README.md` | `wc README.md` | Lines, words, bytes count tuple | Three integer values |
| 4.43 | `>search for executable files in workspace` | `find . -type f -executable -not -path '*/.git*'` | Files with execute bit (+x) | Executable file paths |
| 4.44 | `>find read-only files in project` | `find . -type f -not -writable` | Files with write lock | Read-only file list |
| 4.45 | `>find files owned by user root in home directory` | `find ~ -user root 2>/dev/null \| head -5` | Root-owned files inside home | Security auditing paths |
| 4.46 | `>search for files with .bak extension` | `find . -name '*.bak'` | Backup files list | Paths ending in .bak |
| 4.47 | `>delete all .tmp temporary files` | `find . -name '*.tmp' -delete` | Deletion confirmation | Removes matching temp files |
| 4.48 | `>compare difference between package.json and tsconfig.json` | `diff -u package.json tsconfig.json \| head -10` | Unified diff preview | Diff headers and changes |
| 4.49 | `>calculate sha256 checksum of package.json` | `sha256sum package.json` | 64-character hex hash and filename | Valid SHA256 string |
| 4.50 | `>check file mime type of index.html` | `file --mime-type index.html` | MIME type (e.g. text/html) | Standard MIME format |

---

### Domain 5: Git & Developer Lifecycle Workflows (50 Prompts)

| # | Prompt | Target Tool / Command | Expected Output Structure | Verification Criteria |
|---|---|---|---|---|
| 5.1 | `>check git status` | `git.status / git status --short` | Clean or modified working tree status | Formatted branch and file status |
| 5.2 | `>check git branches` | `git branch -a` | Active branch highlighted with *, remotes | Correct current branch indicated |
| 5.3 | `>recent git commits` | `git.log / git log --oneline -5` | Last 5 commits with hashes and titles | Exactly 5 one-line commit logs |
| 5.4 | `>show git diff summary` | `git diff --stat` | Files modified and lines added/deleted | Stat summary format |
| 5.5 | `>who committed last` | `git log -1 --format='%an <%ae> - %s'` | Author name, email, and commit message | Extracted author details |
| 5.6 | `>show git remotes` | `git remote -v` | Fetch and push remote URLs | Origin remote displayed |
| 5.7 | `>check git stash list` | `git stash list` | Stashed changes or 'No stashes' | Accurate stash stack report |
| 5.8 | `>create new git branch feature-test` | `git checkout -b feature-test` | Branch created confirmation | Switched to new branch |
| 5.9 | `>switch back to branch linux` | `git checkout linux` | Switched branch confirmation | Active branch is linux |
| 5.10 | `>delete test branch feature-test` | `git branch -D feature-test` | Branch deleted confirmation | Branch removed from local refs |
| 5.11 | `>show unpushed commits` | `git log @{u}..HEAD --oneline` | Commits ahead of upstream | Accurate ahead/behind count |
| 5.12 | `>run unit tests` | `npm test / npx vitest run` | Test suite execution summary | Reports test pass/fail counts |
| 5.13 | `>run linter` | `npm run lint / npx eslint .` | Lint report or clean status | Executes project linter |
| 5.14 | `>check node version` | `node -v` | Installed Node.js version | Version string matching v*.*.* |
| 5.15 | `>check npm dependencies outdated` | `npm outdated` | List of outdated dependencies | Clean dependency table |
| 5.16 | `>show git commit log for last 24 hours` | `git log --since='24 hours ago' --oneline` | Commits authored today | Filtered chronological commits |
| 5.17 | `>show full git commit details for HEAD` | `git show HEAD --stat` | Commit author, date, message, file diffs | Complete commit metadata |
| 5.18 | `>show list of contributors` | `git shortlog -sn --all \| head -5` | Commit counts per contributor name | Sorted contributor ranking |
| 5.19 | `>check git current commit hash` | `git rev-parse --short HEAD` | 7-character commit SHA | Short hex commit hash |
| 5.20 | `>check git repository root directory` | `git rev-parse --show-toplevel` | Absolute path to repo root | Valid directory path |
| 5.21 | `>check if working directory is clean` | `git diff-index --quiet HEAD -- && echo 'Clean' \|\| echo 'Dirty'` | Clean or Dirty working tree | Single status string |
| 5.22 | `>show list of untracked files in git` | `git ls-files --others --exclude-standard` | Files not tracked by git | Untracked paths list |
| 5.23 | `>show list of ignored files in git` | `git ls-files --ignored --exclude-standard -o \| head -5` | Files matching .gitignore | Ignored paths list |
| 5.24 | `>check git tag list` | `git tag -l` | Release tags list | Tags list or empty |
| 5.25 | `>create annotated git tag v2.1.0-test` | `git tag -a v2.1.0-test -m 'Test release'` | Tag created confirmation | Tag exists in git refs |
| 5.26 | `>delete git tag v2.1.0-test` | `git tag -d v2.1.0-test` | Tag deleted confirmation | Tag removed from refs |
| 5.27 | `>show git config user name and email` | `git config user.name && git config user.email` | Configured committer identity | Author name and email |
| 5.28 | `>show git blame for package.json line 1-10` | `git blame -L 1,10 package.json` | Line authors and commit hashes | Formatted blame view |
| 5.29 | `>show git log graph visualization` | `git log --graph --oneline --decorate -5` | ASCII branch branching graph | Visual branch hierarchy |
| 5.30 | `>show files changed in last commit` | `git diff-tree --no-commit-id --name-only -r HEAD` | List of file paths in HEAD commit | Filename lines list |
| 5.31 | `>stash current uncommitted changes` | `git stash push -m 'wip-auto'` | Stash created confirmation | Working tree stashed |
| 5.32 | `>pop most recent git stash` | `git stash pop` | Stash restored confirmation | Working tree restored |
| 5.33 | `>discard working changes in specific file` | `git checkout -- package.json 2>/dev/null \|\| git restore package.json` | File restored confirmation | Reverts uncommitted changes |
| 5.34 | `>check npm package version` | `npm pkg get version` | Project version from package.json | Quoted semantic version string |
| 5.35 | `>check npm scripts available` | `npm pkg get scripts` | JSON dictionary of runnable npm scripts | Build, test, dev scripts |
| 5.36 | `>check installed rust version` | `rustc --version` | Rust compiler version | rustc version string |
| 5.37 | `>check cargo package version` | `cargo pkgid 2>/dev/null \|\| grep '^version' src-tauri/Cargo.toml` | Cargo package version | Version string |
| 5.38 | `>run cargo check in backend` | `cargo check --manifest-path src-tauri/Cargo.toml` | Rust compilation checks status | Finished dev profile |
| 5.39 | `>check tauri cli version` | `npx tauri --version` | Installed Tauri CLI release | Tauri version string |
| 5.40 | `>check vite build configuration` | `cat vite.config.ts \| head -15` | Vite build settings and plugins | Vite config preview |
| 5.41 | `>audit npm security vulnerabilities` | `npm audit --json \| head -10 2>/dev/null \|\| npm audit` | Security vulnerability report | Audit vulnerability overview |
| 5.42 | `>check pnpm or yarn version` | `yarn -v 2>/dev/null \|\| pnpm -v 2>/dev/null \|\| echo 'npm primary'` | Alternate package manager version | Version or primary indicator |
| 5.43 | `>clean npm cache` | `npm cache clean --force 2>/dev/null` | Cache cleaned confirmation | NPM cache purge |
| 5.44 | `>check global npm packages installed` | `npm list -g --depth=0` | Global npm binary modules | Global packages list |
| 5.45 | `>check installed python version` | `python3 --version` | Python interpreter version | Python 3.x.x |
| 5.46 | `>check pip packages installed` | `pip list \| head -10 2>/dev/null \|\| python3 -m pip list \| head -10` | Installed python libraries | Package and version columns |
| 5.47 | `>check installed gcc compiler version` | `gcc --version \| head -1` | C compiler version | GCC release string |
| 5.48 | `>check installed gdb debugger version` | `gdb --version \| head -1 2>/dev/null \|\| echo 'gdb not installed'` | Debugger version | GDB release string |
| 5.49 | `>check make tool version` | `make --version \| head -1` | GNU Make utility version | Make release string |
| 5.50 | `>check docker version` | `docker --version 2>/dev/null \|\| echo 'docker not installed'` | Docker container engine version | Docker version string |

---

### Domain 6: Linux Daemons & Systemd Services (50 Prompts)

| # | Prompt | Target Tool / Command | Expected Output Structure | Verification Criteria |
|---|---|---|---|---|
| 6.1 | `>check status of bluetooth service` | `systemctl status bluetooth` | Service active/inactive status, PID, logs | Accurate service state parsing |
| 6.2 | `>check status of NetworkManager` | `systemctl status NetworkManager` | NetworkManager active/running status | Correct daemon state |
| 6.3 | `>is docker daemon running` | `systemctl is-active docker` | 'active' or 'inactive' status | Boolean running detection |
| 6.4 | `>list failed systemd services` | `systemctl --failed` | Any crashed or failed units | Accurate failed unit reporting |
| 6.5 | `>list active user services` | `systemctl --user list-units --type=service` | User-scoped services list | Targets --user scope |
| 6.6 | `>restart NetworkManager service` | `sudo systemctl restart NetworkManager` | SENSITIVE prompt / confirmation | Security engine prompts for consent |
| 6.7 | `>check systemd journal errors for today` | `journalctl -p 3 -xb` | High priority errors from current boot | Filters by priority 3 (errors) |
| 6.8 | `>check ssh service status` | `systemctl status sshd \|\| status ssh` | SSH server active status | Correct SSH daemon check |
| 6.9 | `>check cron or timer services` | `systemctl list-timers` | Active systemd timer schedules | Formatted timers list |
| 6.10 | `>reload systemd daemon` | `sudo systemctl daemon-reload` | Reload confirmation | Security verification |
| 6.11 | `>check status of systemd-resolved` | `systemctl status systemd-resolved` | DNS resolution service status | Active or inactive state |
| 6.12 | `>check status of systemd-timesyncd` | `systemctl status systemd-timesyncd` | Time synchronization daemon status | Clock sync status |
| 6.13 | `>check status of cron service` | `systemctl status cron 2>/dev/null \|\| systemctl status crond 2>/dev/null` | Cron daemon status | Crond service state |
| 6.14 | `>check status of udisks2 storage service` | `systemctl status udisks2` | Disk automount daemon status | Udisks2 service state |
| 6.15 | `>check status of dbus service` | `systemctl status dbus` | D-Bus system message bus status | Active running state |
| 6.16 | `>check status of polkit authorization daemon` | `systemctl status polkit` | PolicyKit daemon state | Polkit active state |
| 6.17 | `>check status of cups print service` | `systemctl status cups 2>/dev/null \|\| echo 'CUPS inactive'` | Printer daemon state | Cups service state |
| 6.18 | `>check status of avahi-daemon mdns service` | `systemctl status avahi-daemon 2>/dev/null \|\| echo 'Avahi inactive'` | mDNS broadcast daemon state | Avahi service state |
| 6.19 | `>check status of firewalld service` | `systemctl status firewalld 2>/dev/null \|\| echo 'firewalld inactive'` | Firewall daemon state | Firewalld state |
| 6.20 | `>check status of tailscale vpn service` | `systemctl status tailscaled 2>/dev/null \|\| echo 'Tailscale not installed'` | Tailscale mesh VPN daemon | Tailscale state |
| 6.21 | `>check status of pipewire audio service` | `systemctl --user status pipewire` | User pipewire sound server | Active running state |
| 6.22 | `>check status of wireplumber session manager` | `systemctl --user status wireplumber` | User audio session manager | Active running state |
| 6.23 | `>check status of pulseaudio daemon` | `systemctl --user status pulseaudio 2>/dev/null \|\| echo 'PulseAudio inactive'` | PulseAudio daemon state | User pulse state |
| 6.24 | `>list all running systemd services` | `systemctl list-units --type=service --state=running \| head -10` | Active system daemons list | Services list |
| 6.25 | `>list all enabled systemd services` | `systemctl list-unit-files --type=service --state=enabled \| head -10` | Services configured to boot automatically | Enabled services list |
| 6.26 | `>list all disabled systemd services` | `systemctl list-unit-files --type=service --state=disabled \| head -10` | Disabled services list | Disabled units list |
| 6.27 | `>check boot performance blame with systemd-analyze` | `systemd-analyze blame \| head -5` | Slowest initializing daemons at boot | Times per service (e.g. 1.2s NetworkManager) |
| 6.28 | `>check total system boot time breakdown` | `systemd-analyze` | Kernel, initrd, and userspace boot duration | Time in seconds (e.g. Startup finished in 2.1s) |
| 6.29 | `>check critical chain boot bottleneck` | `systemd-analyze critical-chain \| head -5` | Dependencies delaying graphical target | Critical chain service tree |
| 6.30 | `>tail last 20 lines of system log` | `journalctl -n 20 --no-pager` | Most recent 20 kernel/system log lines | 20 log records |
| 6.31 | `>tail logs for NetworkManager unit` | `journalctl -u NetworkManager -n 10 --no-pager` | NetworkManager specific log messages | 10 unit records |
| 6.32 | `>tail logs for bluetooth unit` | `journalctl -u bluetooth -n 10 --no-pager` | Bluetooth specific log messages | 10 unit records |
| 6.33 | `>show kernel ring buffer dmesg errors` | `dmesg --level=err,warn 2>/dev/null \| head -10` | Kernel driver warnings and errors | Dmesg error timestamps |
| 6.34 | `>check systemd default target` | `systemctl get-default` | Default boot target (e.g. graphical.target) | Target name string |
| 6.35 | `>check if system is degraded` | `systemctl is-system-running` | running, degraded, or initializing state | Single state string |
| 6.36 | `>show active systemd slices` | `systemctl list-units --type=slice \| head -5` | Resource management cgroup slices | Slice units list |
| 6.37 | `>check status of user systemd manager` | `systemctl --user is-system-running` | User session systemd state | Single state string |
| 6.38 | `>mask a service to prevent execution` | `sudo systemctl mask test.service 2>/dev/null` | Service masked confirmation | Security consent required |
| 6.39 | `>unmask a service` | `sudo systemctl unmask test.service 2>/dev/null` | Service unmasked confirmation | Security consent required |
| 6.40 | `>show dependencies of graphical.target` | `systemctl list-dependencies graphical.target \| head -10` | Units required for desktop session | Dependency tree |
| 6.41 | `>check environment variables of systemd user session` | `systemctl --user show-environment \| head -5` | Exported session environment variables | Key=value pairs |
| 6.42 | `>import DISPLAY variable into systemd user session` | `systemctl --user import-environment DISPLAY WAYLAND_DISPLAY` | Environment imported confirmation | Clean exit code 0 |
| 6.43 | `>check systemd log disk space usage` | `journalctl --disk-usage` | Space consumed by journal archives | Size in MB/GB (e.g. 128.0M) |
| 6.44 | `>vacuum systemd journal logs older than 7 days` | `sudo journalctl --vacuum-time=7d` | Reclaimed journal storage confirmation | Reclaimed disk size |
| 6.45 | `>vacuum systemd journal logs to under 100MB` | `sudo journalctl --vacuum-size=100M` | Reclaimed space confirmation | Reduced archive size |
| 6.46 | `>check active systemd mount units` | `systemctl list-units --type=mount \| head -5` | Mounted partition units | Mount units list |
| 6.47 | `>check active systemd automount units` | `systemctl list-units --type=automount` | On-demand automount triggers | Automount units list |
| 6.48 | `>check systemd socket units` | `systemctl list-units --type=socket \| head -5` | IPC and network socket listeners | Socket units list |
| 6.49 | `>kill a frozen systemd unit` | `sudo systemctl kill -s SIGKILL test.service 2>/dev/null` | Signal dispatched confirmation | Security consent required |
| 6.50 | `>reset failed systemd units state` | `systemctl reset-failed` | Failed units counter reset | Clean exit code 0 |

---

### Domain 7: Desktop Applications & UI Automation (50 Prompts)

| # | Prompt | Target Tool / Command | Expected Output Structure | Verification Criteria |
|---|---|---|---|---|
| 7.1 | `>open visual studio code` | `application.open / code .` | Launch confirmation for VS Code | Resolves application binary |
| 7.2 | `>open google chrome` | `application.open / google-chrome` | Launch confirmation for Chrome | Resolves web browser binary |
| 7.3 | `>open terminal settings` | `open settings drawer` | Personalization drawer opens in UI | Internal UI event emitted |
| 7.4 | `>search google for tauri linux guide` | `browser.search` | Opens default browser with query URL | Launches xdg-open with encoded URL |
| 7.5 | `>navigate to github.com` | `browser.navigate` | Opens browser to https://github.com | Valid URL opened in default browser |
| 7.6 | `>list active desktop windows` | `hyprctl clients -j (Hyprland)` | Window titles, classes, workspaces | JSON/formatted window list |
| 7.7 | `>focus window firefox` | `hyprctl dispatch focuswindow firefox` | Focus window confirmation | Dispatches focus event |
| 7.8 | `>move current window to workspace 2` | `hyprctl dispatch movetoworkspace 2` | Window move confirmation | Dispatches workspace change |
| 7.9 | `>take desktop screenshot` | `grim ~/screenshot.png` | Screenshot file saved confirmation | Creates PNG image on disk |
| 7.10 | `>toggle window floating` | `hyprctl dispatch togglefloating` | Window state toggled | Dispatches floating toggle |
| 7.11 | `>lock screen` | `loginctl lock-session` | Screen lock confirmation | Dispatches lock command |
| 7.12 | `>close active window` | `hyprctl dispatch killactive` | Window closed confirmation | Dispatches killactive command |
| 7.13 | `>open file manager` | `xdg-open . 2>/dev/null \|\| nautilus . 2>/dev/null \|\| thunar .` | Default GUI file browser launches | Launches xdg-open on directory |
| 7.14 | `>open text editor` | `xdg-open test.txt 2>/dev/null \|\| gedit test.txt` | Default GUI text editor launches | Opens default text application |
| 7.15 | `>open spotify music player` | `spotify 2>/dev/null &` | Spotify client launch confirmation | Background spawn confirmation |
| 7.16 | `>open discord client` | `discord 2>/dev/null &` | Discord client launch confirmation | Background spawn confirmation |
| 7.17 | `>check default web browser` | `xdg-settings get default-web-browser` | Configured desktop browser (.desktop) | e.g. firefox.desktop or google-chrome.desktop |
| 7.18 | `>check default file manager` | `xdg-mime query default inode/directory` | Configured file manager (.desktop) | e.g. org.gnome.Nautilus.desktop |
| 7.19 | `>check default pdf reader` | `xdg-mime query default application/pdf` | Configured PDF viewer (.desktop) | e.g. org.gnome.Evince.desktop |
| 7.20 | `>check current hyprland workspace` | `hyprctl activeworkspace -j` | Active workspace ID and name | Workspace JSON object |
| 7.21 | `>switch to workspace 1` | `hyprctl dispatch workspace 1` | Switched workspace confirmation | Dispatches workspace 1 |
| 7.22 | `>switch to workspace 3` | `hyprctl dispatch workspace 3` | Switched workspace confirmation | Dispatches workspace 3 |
| 7.23 | `>switch to workspace 5` | `hyprctl dispatch workspace 5` | Switched workspace confirmation | Dispatches workspace 5 |
| 7.24 | `>move active window to workspace 1` | `hyprctl dispatch movetoworkspace 1` | Moved window confirmation | Dispatches move to 1 |
| 7.25 | `>move active window to workspace 4` | `hyprctl dispatch movetoworkspace 4` | Moved window confirmation | Dispatches move to 4 |
| 7.26 | `>toggle window fullscreen` | `hyprctl dispatch fullscreen` | Toggled fullscreen confirmation | Dispatches fullscreen |
| 7.27 | `>toggle window pin state` | `hyprctl dispatch pin` | Toggled pinned on all workspaces | Dispatches pin |
| 7.28 | `>swap active window with master` | `hyprctl dispatch layoutmsg swapwithmaster` | Swapped window position | Dispatches layoutmsg |
| 7.29 | `>take screenshot of active window` | `grim -g "$(hyprctl activewindow -j \| jq -r '"\(.at[0]),\(.at[1]) \(.size[0])x\(.size[1])"')" ~/window.png` | Window screenshot saved | Cropped window image created |
| 7.30 | `>take interactive region screenshot` | `grim -g "$(slurp)" ~/region.png` | Selected region screenshot saved | Invokes slurp region selector |
| 7.31 | `>record 5 second desktop gif` | `wf-recorder -d 5 -f ~/demo.mp4 2>/dev/null \|\| echo 'wf-recorder active'` | Screen recording file saved | MP4 or GIF video generated |
| 7.32 | `>check screen resolution and scale` | `hyprctl monitors -j \| jq -r '.[0] \| "\(.width)x\(.height)@\(.refreshRate)Hz scale \(.scale)"'` | Display geometry and DPI scaling | Resolution string (e.g. 1920x1080@60Hz) |
| 7.33 | `>increase system volume by 5%` | `pamixer -i 5 2>/dev/null \|\| wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+` | Volume increased confirmation | Audio level stepped up |
| 7.34 | `>decrease system volume by 5%` | `pamixer -d 5 2>/dev/null \|\| wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-` | Volume decreased confirmation | Audio level stepped down |
| 7.35 | `>mute system audio` | `pamixer -t 2>/dev/null \|\| wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle` | Audio muted toggle confirmation | Mute toggle state |
| 7.36 | `>check current system volume` | `pamixer --get-volume 2>/dev/null \|\| wpctl get-volume @DEFAULT_AUDIO_SINK@` | Current volume level percentage | Integer percentage (e.g. 65%) |
| 7.37 | `>increase screen brightness by 10%` | `brightnessctl set +10% 2>/dev/null \|\| light -A 10` | Backlight increased confirmation | Brightness stepped up |
| 7.38 | `>decrease screen brightness by 10%` | `brightnessctl set 10%- 2>/dev/null \|\| light -U 10` | Backlight decreased confirmation | Brightness stepped down |
| 7.39 | `>check current screen brightness` | `brightnessctl get 2>/dev/null \|\| light -G` | Current backlight level value | Positive numeric brightness value |
| 7.40 | `>send desktop notification test` | `notify-send 'Sentinel AI' 'System diagnostics complete'` | Desktop notification banner displayed | Notification daemon receives alert |
| 7.41 | `>send urgent desktop notification` | `notify-send -u critical 'Sentinel Security' 'Alert: Port scan detected'` | Critical alert banner displayed | Urgent notification dispatched |
| 7.42 | `>type text hello world synthetically` | `wtype 'hello world' 2>/dev/null \|\| xdotool type 'hello world'` | Synthetic keystrokes typed | Dispatches keyboard events |
| 7.43 | `>send synthetic key combo ctrl shift t` | `wtype -M ctrl -M shift -k t 2>/dev/null \|\| xdotool key ctrl+shift+t` | Key combo dispatched | Shortcut event sent to active window |
| 7.44 | `>send synthetic key combo alt tab` | `wtype -M alt -k Tab 2>/dev/null \|\| xdotool key alt+Tab` | Window switcher shortcut dispatched | Window focus cycle event |
| 7.45 | `>click mouse at coordinates 500 300` | `ydotool mousemove -a 500 300 && ydotool click 0xC0 2>/dev/null \|\| xdotool mousemove 500 300 click 1` | Synthetic mouse click dispatched | Cursor positioned and clicked |
| 7.46 | `>show clipboard text contents` | `wl-paste 2>/dev/null \|\| xclip -o` | Current system clipboard buffer text | Clipboard string contents |
| 7.47 | `>copy text test to clipboard` | `wl-copy 'test' 2>/dev/null \|\| echo 'test' \| xclip -selection clipboard` | Clipboard updated confirmation | Copies string into primary clipboard |
| 7.48 | `>turn off display monitors` | `hyprctl dispatch dpms off` | Displays turned off / sleep state | DPMS power saving mode active |
| 7.49 | `>turn on display monitors` | `hyprctl dispatch dpms on` | Displays awakened | DPMS power restored |
| 7.50 | `>check installed desktop applications list` | `find /usr/share/applications -name '*.desktop' \| head -10` | List of registered GUI applications | .desktop file paths |

---

### Domain 8: Linux Dotfiles & Rice Management (Hyprland / Waybar) (50 Prompts)

| # | Prompt | Target Tool / Command | Expected Output Structure | Verification Criteria |
|---|---|---|---|---|
| 8.1 | `>show my hyprland autostart apps` | `cat ~/.config/hypr/hyprland.conf \| grep exec-once` | List of autostart programs | Accurate extraction of exec-once lines |
| 8.2 | `>enable autostart for waybar` | `dotfile.enable` | exec-once = waybar verified in config | Config updated or confirmed present |
| 8.3 | `>disable autostart for waybar` | `dotfile.disable` | Commented out in hyprland.conf | Prepended with # comment |
| 8.4 | `>check my waybar config file` | `filesystem.read(~/.config/waybar/config)` | File contents or status | Reads JSON/CSS configuration |
| 8.5 | `>check kitty terminal config` | `cat ~/.config/kitty/kitty.conf` | Kitty configuration lines | Extracts font, color, padding settings |
| 8.6 | `>backup my dotfiles` | `tar -czf ~/.config_backup.tar.gz ~/.config` | Backup archive creation confirmation | Tarball generated in user home |
| 8.7 | `>reload hyprland config` | `hyprctl reload` | Hyprland reload confirmation | Reload exit code 0 |
| 8.8 | `>check active hyprland monitors` | `hyprctl monitors -j` | Monitor names, resolutions, refresh rates | Formatted display metrics |
| 8.9 | `>switch terminal color theme` | `UI Theme Dispatcher` | Terminal color scheme updates | Emits theme change event |
| 8.10 | `>show rofi configuration` | `cat ~/.config/rofi/config.rasi` | Rofi theme and layout settings | Rasi config output |
| 8.11 | `>check hyprland window border color` | `cat ~/.config/hypr/hyprland.conf \| grep -i 'col.active_border'` | Active border gradient/hex colors | Hex color code string |
| 8.12 | `>set hyprland active border color to purple` | `sed -i 's/col.active_border = .*/col.active_border = rgba(bb9af7ff) rgba(7aa2f7ff) 45deg/' ~/.config/hypr/hyprland.conf && hyprctl reload` | Border color updated confirmation | Config modified and reloaded |
| 8.13 | `>check hyprland gap sizes` | `cat ~/.config/hypr/hyprland.conf \| grep -E 'gaps_in\|gaps_out'` | Inner and outer window margin gap pixels | Integer gap values |
| 8.14 | `>set hyprland inner gaps to 8` | `sed -i 's/gaps_in = .*/gaps_in = 8/' ~/.config/hypr/hyprland.conf && hyprctl reload` | Inner gap updated confirmation | Gaps set to 8px |
| 8.15 | `>set hyprland outer gaps to 14` | `sed -i 's/gaps_out = .*/gaps_out = 14/' ~/.config/hypr/hyprland.conf && hyprctl reload` | Outer gap updated confirmation | Gaps set to 14px |
| 8.16 | `>check hyprland window rounding radius` | `cat ~/.config/hypr/hyprland.conf \| grep 'rounding'` | Corner rounding radius in pixels | Integer pixel radius |
| 8.17 | `>check hyprland blur settings` | `cat ~/.config/hypr/hyprland.conf \| grep -A 5 'blur {'` | Window compositor blur size, passes, noise | Blur configuration block |
| 8.18 | `>toggle hyprland window blur` | `sed -i '/blur {/,/}/ s/enabled = .*/enabled = false/' ~/.config/hypr/hyprland.conf && hyprctl reload` | Blur state toggled | Blur enabled/disabled boolean |
| 8.19 | `>check alacritty terminal font configuration` | `cat ~/.config/alacritty/alacritty.toml 2>/dev/null \|\| cat ~/.config/alacritty/alacritty.yml` | Alacritty font family and size | Font family string |
| 8.20 | `>check kitty terminal font size` | `cat ~/.config/kitty/kitty.conf \| grep 'font_size'` | Font size in points | Numeric font size |
| 8.21 | `>check kitty background opacity` | `cat ~/.config/kitty/kitty.conf \| grep 'background_opacity'` | Transparency float value (0.0–1.0) | Opacity decimal string |
| 8.22 | `>set kitty background opacity to 0.85` | `sed -i 's/background_opacity .*/background_opacity 0.85/' ~/.config/kitty/kitty.conf` | Opacity updated confirmation | Opacity set to 0.85 |
| 8.23 | `>check tmux prefix keybinding` | `cat ~/.tmux.conf \| grep -i 'prefix' 2>/dev/null \|\| echo 'Prefix: Ctrl-b'` | Configured tmux command prefix | Ctrl-b, Ctrl-a, or custom |
| 8.24 | `>check neovim init lua config` | `cat ~/.config/nvim/init.lua \| head -15 2>/dev/null \|\| echo 'Neovim default'` | Neovim bootstrap configuration | Lua init preview |
| 8.25 | `>check neovim installed plugins` | `ls -1 ~/.local/share/nvim/lazy 2>/dev/null \|\| ls -1 ~/.local/share/nvim/site/pack/packer/start 2>/dev/null` | List of Neovim plugin folders | Plugin repository names |
| 8.26 | `>check fish shell config` | `cat ~/.config/fish/config.fish 2>/dev/null \|\| echo 'Fish default'` | Fish shell aliases and environment | Fish configuration lines |
| 8.27 | `>check bashrc aliases` | `cat ~/.bashrc \| grep '^alias ' \| head -10` | Configured user shell aliases | Alias definitions list |
| 8.28 | `>add shell alias gs for git status` | `echo "alias gs='git status'" >> ~/.bashrc` | Alias added confirmation | Appended to ~/.bashrc |
| 8.29 | `>check current desktop wallpaper path` | `cat ~/.config/hypr/hyprpaper.conf 2>/dev/null \|\| swww query 2>/dev/null` | Active desktop background image file | Image file path (.png/.jpg) |
| 8.30 | `>set desktop wallpaper with hyprpaper` | `hyprctl hyprpaper wallpaper ',~/wallpaper.jpg' 2>/dev/null` | Wallpaper updated confirmation | Dispatches wallpaper change |
| 8.31 | `>check waybar active modules list` | `cat ~/.config/waybar/config \| grep 'modules-'` | Enabled top bar widget modules | JSON module array entries |
| 8.32 | `>restart waybar panel` | `killall waybar; waybar &` | Waybar reloaded confirmation | Kills and respawns panel |
| 8.33 | `>check dunst notification config` | `cat ~/.config/dunst/dunstrc \| head -15 2>/dev/null \|\| echo 'Dunst default'` | Notification daemon style config | Dunst configuration lines |
| 8.34 | `>check mako notification config` | `cat ~/.config/mako/config 2>/dev/null \|\| echo 'Mako default'` | Mako Wayland notification style | Mako config preview |
| 8.35 | `>check rofi launcher theme name` | `cat ~/.config/rofi/config.rasi \| grep -i '@theme'` | Rofi active theme file | Theme name string |
| 8.36 | `>check starship prompt config` | `cat ~/.config/starship.toml \| head -15 2>/dev/null \|\| echo 'Starship default'` | Starship cross-shell prompt config | Starship module settings |
| 8.37 | `>check fastfetch or neofetch config` | `cat ~/.config/fastfetch/config.jsonc 2>/dev/null \|\| echo 'Fastfetch default'` | System info splash layout config | Fastfetch JSON config |
| 8.38 | `>list all files in ~/.config directory` | `ls -1 ~/.config \| head -15` | Top-level application dotfile folders | Directories list in ~/.config |
| 8.39 | `>git init in ~/.config to track dotfiles` | `git -C ~/.config init 2>/dev/null` | Dotfiles git repo initialized | Git repository initialized in config |
| 8.40 | `>check dotfiles git tracking status` | `git -C ~/.config status --short 2>/dev/null` | Modified dotfile configurations | Git status output for ~/.config |
| 8.41 | `>check swaylock screen lock config` | `cat ~/.config/swaylock/config 2>/dev/null \|\| echo 'Swaylock default'` | Screen locker colors and rings | Swaylock config preview |
| 8.42 | `>check wlogout power menu layout` | `cat ~/.config/wlogout/layout 2>/dev/null \|\| echo 'Wlogout default'` | Power menu actions and buttons | Lock, logout, reboot, shutdown |
| 8.43 | `>check zshrc theme and plugins` | `cat ~/.zshrc \| grep -E 'ZSH_THEME\|plugins=' 2>/dev/null \|\| echo 'Zsh default'` | Oh-My-Zsh theme and plugin list | ZSH_THEME variable |
| 8.44 | `>check gtk theme configuration` | `cat ~/.config/gtk-3.0/settings.ini \| grep 'gtk-theme-name' 2>/dev/null` | Active GTK desktop theme | Theme name (e.g. Adwaita-dark) |
| 8.45 | `>check icon theme configuration` | `cat ~/.config/gtk-3.0/settings.ini \| grep 'gtk-icon-theme-name' 2>/dev/null` | Active desktop icon set | Icon theme name (e.g. Papirus) |
| 8.46 | `>check cursor theme and size` | `cat ~/.config/gtk-3.0/settings.ini \| grep 'gtk-cursor' 2>/dev/null` | Mouse pointer theme and dimensions | Cursor name and size |
| 8.47 | `>check hyprland animations configuration` | `cat ~/.config/hypr/hyprland.conf \| grep -A 5 'animations {'` | Window animation curves and speeds | Bezier curves and animations |
| 8.48 | `>toggle hyprland animations on or off` | `sed -i '/animations {/,/}/ s/enabled = .*/enabled = false/' ~/.config/hypr/hyprland.conf && hyprctl reload` | Animations toggled confirmation | Animation enabled boolean |
| 8.49 | `>restore dotfiles from latest backup` | `tar -xzf ~/.config_backup.tar.gz -C ~` | Dotfiles restored confirmation | Extracts archive into home |
| 8.50 | `>create clean git branch in dotfiles repo` | `git -C ~/.config checkout -b clean-rice 2>/dev/null` | New rice branch created | Git branch created in ~/.config |

---

### Domain 9: Multi-Stage Composite Workflows (50 Prompts)

| # | Prompt | Target Tool / Command | Expected Output Structure | Verification Criteria |
|---|---|---|---|---|
| 9.1 | `>clean project: remove node_modules, reinstall dependencies, and verify tests pass` | `1. rm -rf node_modules package-lock.json<br>2. npm install<br>3. npm test` | Stage-by-stage execution with phase checklist and final pass confirmation. | Multi-phase checklist executed sequentially |
| 9.2 | `>git sync: stash changes, pull latest linux branch, pop stash, and show status` | `1. git stash<br>2. git pull origin linux<br>3. git stash pop<br>4. git status` | Clean multi-step git sync pipeline with conflict detection. | All 4 steps complete with clean status |
| 9.3 | `>docker clean: stop all containers, prune unused volumes, and show remaining images` | `1. docker stop $(docker ps -aq)<br>2. docker volume prune -f<br>3. docker images` | Container stop status, reclaimed space report, remaining images list. | Sequential docker cleanup execution |
| 9.4 | `>prepare release: check clean git status, run linter, run tests, and build production bundle` | `1. git status --porcelain<br>2. npm run lint<br>3. npm test<br>4. npm run build` | Multi-phase release verification gate confirming zero errors before build. | Zero errors across all 4 gate stages |
| 9.5 | `>system health audit: check cpu, memory, disk, failed services, and battery` | `1. lscpu<br>2. free -h<br>3. df -h /<br>4. systemctl --failed<br>5. sysfs battery` | Unified executive health card summarizing all 5 hardware metrics. | Aggregated hardware report card |
| 9.6 | `>save workflow release-gate` | `Macro Engine` | Saves pipeline 9.4 as release-gate.json in ~/.sentinel/workflows/. | Workflow file written to disk |
| 9.7 | `>run workflow release-gate` | `Macro Replay Engine` | Executes pipeline 9.4 with zero LLM inference tokens. | Deterministic instant execution |
| 9.8 | `>dev environment boot: check port 3000, kill if in use, launch vite, and open browser` | `1. Port 3000 check<br>2. Port release<br>3. npm run dev<br>4. browser.navigate` | Development server boot orchestration. | Port cleared and server launched |
| 9.9 | `>backup database and prune old archives older than 7 days` | `1. pg_dump / sqlite3 backup<br>2. find /backups -mtime +7 -delete` | Backup created with timestamp and old archives pruned. | Backup file verified and prune complete |
| 9.10 | `>audit listening ports and terminate unauthorized processes` | `1. ss -tulpn<br>2. Filter unauthorized ports<br>3. Kill matching PIDs` | Security compliance audit report and remediation log. | Port audit and process termination |
| 9.11 | `>full project rebuild: clean build artifacts, run cargo check, build frontend, and package tauri` | `1. rm -rf dist target/debug<br>2. cargo check<br>3. npm run build<br>4. cargo tauri build --debug` | Build pipeline with duration per stage. | Full stack compilation successful |
| 9.12 | `>git branch release prep: fetch upstream, rebase on origin/main, run tests, tag v2.1.0` | `1. git fetch origin<br>2. git rebase origin/main<br>3. npm test<br>4. git tag v2.1.0` | Git release gate verification. | Rebase clean and tag created |
| 9.13 | `>quick deploy check: verify port 8080 responding, check memory usage, inspect journal errors` | `1. curl -I localhost:8080<br>2. free -h<br>3. journalctl -p 3 -n 10` | Production sanity check report. | Health status across 3 vectors |
| 9.14 | `>diagnose network failure: check default gateway ping, verify dns resolution, test wan ping` | `1. ip route \| grep default<br>2. ping gateway<br>3. dig google.com<br>4. ping 1.1.1.1` | Root cause network diagnosis. | Pinpoints failure layer (LAN, DNS, WAN) |
| 9.15 | `>benchmark cpu performance: record idle temp, run 5 second stress test, record peak temp` | `1. sensors temp<br>2. stress -c 4 -t 5s<br>3. sensors temp` | Delta temperature and throttling report. | Pre and post benchmark stats |
| 9.16 | `>clean disk space: clear pacman cache, clean npm cache, vacuum journal logs to 100MB` | `1. sudo pacman -Sc --noconfirm<br>2. npm cache clean --force<br>3. journalctl --vacuum-size=100M` | Reclaimed disk space report. | Reclaims storage across package managers |
| 9.17 | `>save workflow dev-boot` | `Macro Engine` | Persists dev-boot pipeline to ~/.sentinel/workflows/dev-boot.json. | Workflow JSON persisted |
| 9.18 | `>run workflow dev-boot` | `Macro Replay Engine` | Executes dev-boot with parameter overrides. | Instant replay execution |
| 9.19 | `>security audit: check listening ports, verify root processes, inspect failed logins` | `1. ss -tulpn<br>2. ps -u root<br>3. journalctl -u sshd \| grep 'Failed password'` | Security posture summary. | Port, privilege, and auth report |
| 9.20 | `>automated bug triage: check git diff of last commit, run test suite, capture failed test logs` | `1. git diff HEAD~1<br>2. npm test<br>3. capture failure stack trace` | Automated regression report. | Pinpoints failing assertions |
| 9.21 | `>archive project logs: compress logs/*.log, compute sha256 checksum, move to /backups` | `1. tar -czf logs.tar.gz logs/<br>2. sha256sum logs.tar.gz<br>3. mv logs.tar.gz /backups/` | Archive confirmation with SHA256 integrity. | Archive file created with checksum |
| 9.22 | `>setup new git feature branch: checkout main, pull latest, branch feat-auth, run npm test` | `1. git checkout main<br>2. git pull<br>3. git checkout -b feat-auth<br>4. npm test` | Branch bootstrap confirmation. | Switched to new branch with passing tests |
| 9.23 | `>rust dependency upgrade: run cargo update, run cargo check, run cargo test` | `1. cargo update<br>2. cargo check<br>3. cargo test` | Rust crate update and verification. | Crates updated and tests green |
| 9.24 | `>node dependency upgrade: run npm update, run npm audit, run npm test` | `1. npm update<br>2. npm audit<br>3. npm test` | Node package update and regression check. | Packages updated with audit report |
| 9.25 | `>full desktop environment reset: restart hyprland, restart waybar, restart pipewire audio` | `1. hyprctl reload<br>2. killall waybar && waybar &<br>3. systemctl --user restart pipewire` | Desktop session restart confirmation. | Window manager, bar, audio restored |
| 9.26 | `>save workflow desktop-reset` | `Macro Engine` | Saves desktop reset pipeline to ~/.sentinel/workflows/desktop-reset.json. | Workflow file written to disk |
| 9.27 | `>run workflow desktop-reset` | `Macro Replay Engine` | Executes desktop-reset pipeline instantly. | Deterministic instant execution |
| 9.28 | `>docker development stack launch: start postgres, start redis, wait for healthcheck, run migration` | `1. docker compose up -d postgres redis<br>2. wait for port 5432 and 6379<br>3. npm run migrate` | Container services healthy and database migrated. | All dependent services active |
| 9.29 | `>docker development stack teardown: stop containers, dump database, remove networks` | `1. docker compose down<br>2. pg_dump<br>3. docker network prune -f` | Teardown confirmation with backup created. | Clean shutdown confirmation |
| 9.30 | `>save workflow db-sync` | `Macro Engine` | Persists database sync pipeline. | Workflow JSON persisted |
| 9.31 | `>run workflow db-sync` | `Macro Replay Engine` | Executes db-sync with zero latency. | Zero token instant execution |
| 9.32 | `>diagnose high memory usage: find top memory process, check slab memory, check swap usage` | `1. ps --sort=-pmem \| head -3<br>2. cat /proc/meminfo \| grep Slab<br>3. free -m` | Memory pressure diagnosis report. | Identifies top offender and swap status |
| 9.33 | `>diagnose high cpu usage: find top cpu process, check thread count, inspect process io` | `1. ps --sort=-pcpu \| head -3<br>2. cat /proc/<pid>/status \| grep Threads<br>3. iotop -p <pid>` | CPU contention root cause report. | Identifies offending threads |
| 9.34 | `>prepare github pull request: format code, run linter, run tests, show diff summary` | `1. npm run format<br>2. npm run lint<br>3. npm test<br>4. git diff --stat origin/main` | PR verification checklist. | Formatting and tests verified clean |
| 9.35 | `>monitor build and notify: run npm run build, capture exit code, send desktop notification` | `1. npm run build<br>2. notify-send 'Build Success' \|\| notify-send 'Build Failed'` | Build execution with desktop notification alert. | Dispatches desktop notification |
| 9.36 | `>save workflow pr-prep` | `Macro Engine` | Persists PR preparation workflow. | Workflow JSON persisted |
| 9.37 | `>run workflow pr-prep` | `Macro Replay Engine` | Executes PR prep pipeline instantly. | Deterministic instant execution |
| 9.38 | `>check git conflict markers across all files in repository` | `git diff --check \| grep -E '<<<<<<<\|=======\|>>>>>>>'` | Conflict markers list or clean status. | Clean if zero merge conflicts remain |
| 9.39 | `>clean git merged local branches: list merged branches, filter main/linux, delete stale refs` | `1. git branch --merged main<br>2. filter protected branches<br>3. git branch -d <stale>` | Pruned stale branch list. | Removes merged feature branches |
| 9.40 | `>wipe node cache and rebuild: rm -rf .next dist .cache, npm run build` | `1. rm -rf .next dist .cache<br>2. npm run build` | Clean production bundle generated. | Rebuilds from fresh state |
| 9.41 | `>save workflow clean-rebuild` | `Macro Engine` | Persists clean rebuild workflow. | Workflow JSON persisted |
| 9.42 | `>run workflow clean-rebuild` | `Macro Replay Engine` | Executes clean-rebuild workflow. | Deterministic instant execution |
| 9.43 | `>inspect system boot log for acpi or battery errors: journalctl -b, filter acpi, summarize` | `1. journalctl -b \| grep -i acpi \| head -10<br>2. cat /sys/class/power_supply/BAT*/status` | ACPI power management log diagnosis. | Extracts hardware battery events |
| 9.44 | `>check for listening port collisions: check ports 3000 5173 8080 8000, report status` | `ss -tulpn \| grep -E ':(3000\|5173\|8080\|8000)'` | Multi-port occupancy report. | Shows status of all 4 common dev ports |
| 9.45 | `>verify local ai engine readiness: check port 11435, check port 11434, test model availability` | `1. curl -s http://localhost:11435/health<br>2. curl -s http://localhost:11434/api/tags` | AI engine health status report. | Reports embedded and Ollama readiness |
| 9.46 | `>save workflow ai-healthcheck` | `Macro Engine` | Persists AI healthcheck pipeline. | Workflow JSON persisted |
| 9.47 | `>run workflow ai-healthcheck` | `Macro Replay Engine` | Executes AI healthcheck instantly. | Zero token instant execution |
| 9.48 | `>verify git tag and commit signatures: check GPG signature on HEAD commit and latest tag` | `git verify-commit HEAD 2>/dev/null && git verify-tag $(git describe --tags) 2>/dev/null` | GPG signature verification report. | Valid signature or unsigned warning |
| 9.49 | `>create timestamped project tarball backup excluding git and node_modules` | `tar --exclude='.git' --exclude='node_modules' -czf ~/project_backup_$(date +%Y%m%d_%H%M%S).tar.gz .` | Compressed tarball creation confirmation. | Creates timestamped archive in home |
| 9.50 | `>execute full sentinel self-test: run vitest unit tests, check tauri backend, check tsc build` | `1. npx vitest run<br>2. cargo check --manifest-path src-tauri/Cargo.toml<br>3. npm run build` | Triple verification pass confirmation across unit, rust, and bundle layers. | All 3 verification gates exit 0 |

---
