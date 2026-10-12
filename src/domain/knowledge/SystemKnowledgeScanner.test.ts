import { describe, it, expect } from 'vitest';
import { SystemKnowledgeScanner, parseScanOutput, preferredPackageManager } from './SystemKnowledgeScanner';

// Shape of SCAN_SCRIPT output on an Arch + Hyprland laptop with ROS 2 installed
const ARCH_FIXTURE = `@@os
NAME="Arch Linux"
PRETTY_NAME="Arch Linux"
ID=arch
BUILD_ID=rolling
KERNEL=6.16.8-arch1-1
ARCH=x86_64
SESSION=wayland
DESKTOP=Hyprland
INIT=systemd
@@cpu
model name	: AMD Ryzen 7 7840HS w/ Radeon 780M Graphics
CORES=16
@@mem
MemTotal:       31990644 kB
MemAvailable:   20185040 kB
SwapTotal:       8388604 kB
@@gpu
VENDOR=0x1002
VENDOR=0x10de
NVIDIA=NVIDIA GeForce RTX 4060 Laptop GPU, 8188
VULKAN=1
@@apps
Visual Studio Code||/usr/share/code/code --unity-launch %F||Development;IDE;
Zen Browser||env MOZ_ENABLE_WAYLAND=1 zen-browser %u||Network;WebBrowser;
Kitty||kitty||System;TerminalEmulator;
@@dev
python3=Python 3.13.7
node=v22.19.0
rustc=rustc 1.90.0 (1159e78c4 2025-09-14)
gcc=gcc (GCC) 15.2.1 20250813
DOCKER_SOCKET=1
TOOL=git
TOOL=colcon
TOOL=nvim
@@pkg
pacman
paru
flatpak
@@ros
DISTRO=jazzy
ENV=jazzy
@@fs
/dev/nvme0n1p2 btrfs 488281250 250000000 238281250 52% /
/dev/nvme0n1p1 vfat 1048576 204800 843776 20% /boot
@@shells
/bin/bash
/usr/bin/zsh
/usr/bin/git-shell
DEFAULT=/usr/bin/zsh
DOT=/home/u/.zshrc
DOT=/home/u/.config/hypr/hyprland.conf
@@net
SSID=HomeNet
IP=192.168.1.42/24
LINK=lo
LINK=wlan0
LINK=tailscale0
@@services
NetworkManager.service
docker.service
@@ports
22
5432
@@browser
zen.desktop
@@end
`;

describe('SystemKnowledgeScanner', () => {
  it('parses the batched scan output into a profile', () => {
    const p = parseScanOutput(ARCH_FIXTURE, 1000);
    expect(p.os).toMatchObject({ name: 'Arch Linux', id: 'arch', kernel: '6.16.8-arch1-1', sessionType: 'wayland', desktopEnvironment: 'Hyprland', initSystem: 'systemd' });
    expect(p.hardware).toMatchObject({ cpuCores: 16, cpuArch: 'x86_64', ramTotalGb: 30.5, gpuName: 'NVIDIA GeForce RTX 4060 Laptop GPU', gpuVramGb: 8, hasVulkan: true, isGpuAvailable: true });
    expect(p.hardware.gpuVendors).toEqual(['amd', 'nvidia']);
    expect(p.apps.items.map(a => a.binary)).toEqual(['code', 'zen-browser', 'kitty']);
    expect(p.developer).toMatchObject({ python: '3.13.7', node: '22.19.0', rust: '1.90.0', gcc: '15.2.1', dockerRunning: true, preferredPackageManager: 'paru' });
    expect(p.developer.tools).toContain('colcon');
    expect(p.ros).toEqual({ distros: ['jazzy'], activeDistro: 'jazzy' });
    expect(p.filesystems[0]).toMatchObject({ mountPoint: '/', fsType: 'btrfs', hasSnapshots: true });
    expect(p.shells.available).toEqual(['/bin/bash', '/usr/bin/zsh']);
    expect(p.network).toMatchObject({ connectedSsid: 'HomeNet', localIp: '192.168.1.42', activeVpn: 'tailscale0' });
    expect(p.services.listeningPorts).toEqual([22, 5432]);
  });

  it('leaves unknown values out instead of inventing them', () => {
    const p = parseScanOutput('@@os\nID=debian\n@@end\n');
    expect(p.hardware.ramTotalGb).toBeUndefined();
    expect(p.hardware.cpuCores).toBeUndefined();
    expect(p.apps.items).toEqual([]);
    expect(p.filesystems).toEqual([]);
  });

  it('picks the distro package manager', () => {
    expect(preferredPackageManager('arch', undefined, ['pacman'])).toBe('pacman');
    expect(preferredPackageManager('endeavouros', 'arch', ['pacman', 'yay'])).toBe('yay');
    expect(preferredPackageManager('fedora', undefined, ['dnf', 'flatpak'])).toBe('dnf');
    expect(preferredPackageManager('linuxmint', 'ubuntu debian', ['apt-get'])).toBe('apt');
    expect(preferredPackageManager('opensuse-tumbleweed', 'suse opensuse', ['zypper'])).toBe('zypper');
  });

  it('summarises stable facts for the prompt and omits volatile ones', () => {
    const scanner = SystemKnowledgeScanner.getInstance();
    scanner.applyScanOutput(ARCH_FIXTURE, 'fp');
    const summary = scanner.getQuickSummary();
    expect(summary).toContain('SYSTEM KNOWLEDGE PROFILE:');
    expect(summary).toContain('Arch Linux');
    expect(summary).toContain('Package manager: paru');
    expect(summary).toContain('ROS 2: jazzy');
    expect(summary).toContain('Zen Browser (zen-browser)');
    expect(summary).toContain('Window control: hyprctl');
    // Free space and IP change between scans; the model should query them live
    expect(summary).not.toContain('192.168.1.42');
    expect(summary).not.toMatch(/GB free/);
  });

  it('finds applications by exact name or binary before partial matches', () => {
    const scanner = SystemKnowledgeScanner.getInstance();
    scanner.applyScanOutput(ARCH_FIXTURE, 'fp');
    expect(scanner.findApplication('code')?.name).toBe('Visual Studio Code');
    expect(scanner.findApplication('zen')?.binary).toBe('zen-browser');
    expect(scanner.findApplication('non_existent_super_rare_app_xyz_123')).toBeUndefined();
  });

  it('keeps the stored profile when the scan cannot run (outside the app)', async () => {
    const scanner = SystemKnowledgeScanner.getInstance();
    scanner.applyScanOutput(ARCH_FIXTURE, 'fp');
    const profile = await scanner.scan(true);
    expect(profile.os.name).toBe('Arch Linux');
  });

  it('reads cores, memory and OS name on macOS (no /proc)', () => {
    const p = parseScanOutput(`@@os
NAME="macOS"
PRETTY_NAME="macOS 26.6.2"
ID=macos
KERNEL=25.6.0
ARCH=arm64
@@cpu
model name	: Apple A18 Pro
CORES=6
@@mem
MemTotal: 8388608 kB
@@end
`);
    expect(p.os).toMatchObject({ name: 'macOS 26.6.2', id: 'macos', kernel: '25.6.0' });
    expect(p.hardware).toMatchObject({ cpuCores: 6, ramTotalGb: 8, cpuArch: 'arm64' });
  });
});

