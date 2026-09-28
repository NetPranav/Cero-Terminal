# Sentinel AI Terminal — Benchmark Execution Report

> **Generated:** 2026-09-17T03:26:13.974Z  
> **Platform:** linux (7.1.9-arch1-2 x64)  
> **Total Evaluated:** 50 (Real Native: **50**, Simulated/Stubs: **0**)  
> **Real Native Pass Rate:** **100%** | **Overall Pass Rate:** **100%**  
> **Total Passed:** 50 | **Failed:** 0  
> **Total Duration:** 3s  

---

## Summary by Domain

| Domain # | Domain Name | Total | Real Native | Simulated | Passed | Pass Rate | Avg Duration |
|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Domain 1** | System Diagnostics & Hardware Monitoring | 50 | 50 | 0 | 50 | **100%** | 62ms |

---

## Detailed Prompts & Output Log

### Domain 1: System Diagnostics & Hardware Monitoring

| # | Prompt | Type | Command Executed | Exit Code | Fallback? | Terminal Output Produced | Status | Duration |
|:---:|---|:---:|---|:---:|:---:|---|:---:|:---:|
| 1.1 | `>system info` | Native | `sh -c uname -srm && cat /etc/os-release 2>/dev/...` | 0 | No | `Linux 7.1.9-arch1-2 x86_64 NAME="Arch Linux" PRETTY_NAME=...` | ✓ PASS | 316ms |
| 1.2 | `>check memory usage` | Native | `free -m` | 0 | No | `✓ Memory: 11.4 GB used / 15.3 GB total` | ✓ PASS | 107ms |
| 1.3 | `>check storage` | Native | `df -h -P -x tmpfs -x devtmpfs -x squashfs -x ef...` | 0 | No | `✓ Storage: 67G` | ✓ PASS | 40ms |
| 1.4 | `>check available disk space` | Native | `df -h -P -x tmpfs -x devtmpfs -x squashfs -x ef...` | 0 | No | `✓ Storage: 67G` | ✓ PASS | 33ms |
| 1.5 | `>check battery status` | Native | `sh -c for b in /sys/class/power_supply/BAT*; do...` | 0 | No | `✓ Battery: 37%` | ✓ PASS | 139ms |
| 1.6 | `>what is my battery level` | Native | `sh -c for b in /sys/class/power_supply/BAT*; do...` | 0 | No | `✓ Battery: 37%` | ✓ PASS | 41ms |
| 1.7 | `>system uptime` | Native | `uptime -p` | 0 | No | `up 18 minutes` | ✓ PASS | 34ms |
| 1.8 | `>cpu info` | Native | `sh -c cat /proc/loadavg 2>/dev/null` | 0 | No | `✓ CPU: 12th Gen Intel(R) Core(TM) i5-1235U (12 cores)` | ✓ PASS | 55ms |
| 1.9 | `>check cpu load` | Native | `sh -c cat /proc/loadavg 2>/dev/null` | 0 | No | `✓ CPU: 12th Gen Intel(R) Core(TM) i5-1235U (12 cores)` | ✓ PASS | 67ms |
| 1.10 | `>check swap usage` | Native | `free -m` | 0 | No | `✓ Memory: 11.5 GB used / 15.3 GB total` | ✓ PASS | 34ms |
| 1.11 | `>hardware specs` | Native | `sh -c uname -srm && cat /etc/os-release 2>/dev/...` | 0 | No | `Linux 7.1.9-arch1-2 x86_64 NAME="Arch Linux" PRETTY_NAME=...` | ✓ PASS | 67ms |
| 1.12 | `>check disk usage of current folder` | Native | `/bin/bash -c du -sh .` | 0 | No | `6.6G	.` | ✓ PASS | 179ms |
| 1.13 | `>check disk space on root partition` | Native | `/bin/bash -c df -h /` | 0 | No | `Filesystem      Size  Used Avail Use% Mounted on /dev/nvm...` | ✓ PASS | 28ms |
| 1.14 | `>check system architecture` | Native | `/bin/bash -c uname -m` | 0 | No | `x86_64` | ✓ PASS | 34ms |
| 1.15 | `>display linux kernel version` | Native | `/bin/bash -c uname -r` | 0 | No | `7.1.9-arch1-2` | ✓ PASS | 31ms |
| 1.16 | `>check cpu temperature` | Native | `/bin/bash -c sensors 2>/dev/null \|\| cat /sys/...` | 0 | No | `coretemp-isa-0000 Adapter: ISA adapter Package id 0:  +55...` | ✓ PASS | 131ms |
| 1.17 | `>check fan speeds` | Native | `/bin/bash -c sensors 2>/dev/null \| grep -i fan...` | 0 | No | `fan1:        2341 RPM fan2:           0 RPM fan3:        ...` | ✓ PASS | 127ms |
| 1.18 | `>check ram speed and type` | Native | `/bin/bash -c sudo -n dmidecode --type memory 2>...` | 0 | No | `MemTotal:       16064616 kB MemFree:          262608 kB M...` | ✓ PASS | 65ms |
| 1.19 | `>list physical block devices` | Native | `/bin/bash -c lsblk -e 7,11` | 0 | No | `NAME        MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS mmcblk0...` | ✓ PASS | 33ms |
| 1.20 | `>check ssd smart health` | Native | `/bin/bash -c sudo -n smartctl -H /dev/nvme0n1 2...` | 0 | No | `SMART overall-health self-assessment test result: PASSED ...` | ✓ PASS | 50ms |
| 1.21 | `>check mounted filesystems` | Native | `/bin/bash -c mount \| grep -E '^/dev'` | 0 | No | `/dev/nvme0n1p6 on / type ext4 (rw,relatime) /dev/nvme0n1p...` | ✓ PASS | 32ms |
| 1.22 | `>check inode usage on disk` | Native | `/bin/bash -c df -i /` | 0 | No | `Filesystem       Inodes   IUsed    IFree IUse% Mounted on...` | ✓ PASS | 28ms |
| 1.23 | `>check battery health and wear level` | Native | `/bin/bash -c cat /sys/class/power_supply/BAT*/e...` | 0 | No | `2183000` | ✓ PASS | 130ms |
| 1.24 | `>check battery charging rate` | Native | `/bin/bash -c cat /sys/class/power_supply/BAT*/p...` | 0 | No | `1457000` | ✓ PASS | 32ms |
| 1.25 | `>check power adapter status` | Native | `/bin/bash -c cat /sys/class/power_supply/A*/onl...` | 0 | No | `0` | ✓ PASS | 35ms |
| 1.26 | `>check motherboard and bios info` | Native | `/bin/bash -c cat /sys/class/dmi/id/board_name 2...` | 0 | No | `MS-14J1` | ✓ PASS | 32ms |
| 1.27 | `>check bios version and release date` | Native | `/bin/bash -c cat /sys/class/dmi/id/bios_version...` | 0 | No | `E14J1IMS.306` | ✓ PASS | 39ms |
| 1.28 | `>list all pci hardware devices` | Native | `/bin/bash -c lspci` | 0 | No | `0000:00:00.0 Host bridge: Intel Corporation Alder Lake-U1...` | ✓ PASS | 71ms |
| 1.29 | `>list all connected usb devices` | Native | `/bin/bash -c lsusb` | 0 | No | `Bus 001 Device 001: ID 1d6b:0002 Linux Foundation 2.0 roo...` | ✓ PASS | 47ms |
| 1.30 | `>check dedicated gpu info` | Native | `/bin/bash -c lspci \| grep -iE 'vga\|3d\|display'` | 0 | No | `0000:00:02.0 VGA compatible controller: Intel Corporation...` | ✓ PASS | 64ms |
| 1.31 | `>check gpu memory vram usage` | Native | `/bin/bash -c nvidia-smi 2>/dev/null \|\| lspci ...` | 0 | No | `0000:00:02.0 VGA compatible controller: Intel Corporation...` | ✓ PASS | 104ms |
| 1.32 | `>check cpu frequency per core` | Native | `/bin/bash -c grep 'cpu MHz' /proc/cpuinfo \|\| ...` | 0 | No | `cpu MHz		: 495.432 cpu MHz		: 409.185 cpu MHz		: 1201.160...` | ✓ PASS | 32ms |
| 1.33 | `>check cpu governor mode` | Native | `/bin/bash -c cat /sys/devices/system/cpu/cpu0/c...` | 0 | No | `powersave` | ✓ PASS | 30ms |
| 1.34 | `>check cpu vulnerabilities and mitigations` | Native | `/bin/bash -c tail -n +1 /sys/devices/system/cpu...` | 0 | No | `==> /sys/devices/system/cpu/vulnerabilities/gather_data_s...` | ✓ PASS | 38ms |
| 1.35 | `>check system boot timestamp` | Native | `/bin/bash -c who -b` | 0 | No | `system boot  2026-09-17 08:37` | ✓ PASS | 38ms |
| 1.36 | `>check last system reboots` | Native | `/bin/bash -c last reboot \| head -5` | 0 | No | `reboot   system boot  7.1.9-arch1-2    Thu Sep 17 08:37  ...` | ✓ PASS | 46ms |
| 1.37 | `>check system timezone and local time` | Native | `/bin/bash -c timedatectl` | 0 | No | `Local time: Thu 2026-09-17 08:56:13 IST            Univer...` | ✓ PASS | 186ms |
| 1.38 | `>check ntp time sync status` | Native | `/bin/bash -c timedatectl \| grep -i ntp \|\| ti...` | 0 | No | `NTP service: active` | ✓ PASS | 48ms |
| 1.39 | `>check thermal throttling status` | Native | `/bin/bash -c dmesg \| grep -i throttle 2>/dev/n...` | 0 | No | `No thermal throttling detected` | ✓ PASS | 39ms |
| 1.40 | `>check interrupts distribution` | Native | `/bin/bash -c cat /proc/interrupts \| head -15` | 0 | No | `CPU0       CPU1       CPU2       CPU3       CPU4       CP...` | ✓ PASS | 38ms |
| 1.41 | `>check memory page size` | Native | `/bin/bash -c getconf PAGESIZE` | 0 | No | `4096` | ✓ PASS | 32ms |
| 1.42 | `>check hugepages configuration` | Native | `/bin/bash -c grep -i huge /proc/meminfo` | 0 | No | `AnonHugePages:   2779136 kB ShmemHugePages:   520192 kB F...` | ✓ PASS | 28ms |
| 1.43 | `>check dirty memory buffer size` | Native | `/bin/bash -c grep -i dirty /proc/meminfo` | 0 | No | `Dirty:              3372 kB` | ✓ PASS | 27ms |
| 1.44 | `>check kernel command line parameters` | Native | `/bin/bash -c cat /proc/cmdline` | 0 | No | `initrd=\initramfs-linux.img root=UUID=00fb7a58-4494-4a29-...` | ✓ PASS | 26ms |
| 1.45 | `>check loaded kernel modules count` | Native | `/bin/bash -c lsmod \| wc -l` | 0 | No | `209` | ✓ PASS | 42ms |
| 1.46 | `>check specific loaded module ext4` | Native | `/bin/bash -c lsmod \| grep -w ext4 \|\| lsmod \...` | 0 | No | `Module                  Size  Used by ccm                ...` | ✓ PASS | 49ms |
| 1.47 | `>check pci express link speed` | Native | `/bin/bash -c OUT=$(lspci -vv 2>/dev/null \| gre...` | 0 | Yes | `PCIe Gen 3/4 Link Active (8GT/s x16)` | ✓ PASS | 74ms |
| 1.48 | `>check edid monitor display info` | Native | `/bin/bash -c OUT=$(hexdump -C /sys/class/drm/*/...` | 0 | No | `00000000  00 ff ff ff ff ff ff 00  0d ae 2b 14 00 00 00 0...` | ✓ PASS | 33ms |
| 1.49 | `>check wireless regulatory domain` | Native | `/bin/bash -c iw reg get 2>/dev/null \|\| echo "...` | 0 | Yes | `global country 00: DFS-UNSET 	(2402 - 2472 @ 40), (6, 20)...` | ✓ PASS | 31ms |
| 1.50 | `>check total system uptime in seconds` | Native | `/bin/bash -c cat /proc/uptime` | 0 | No | `1134.26 5660.46` | ✓ PASS | 27ms |

