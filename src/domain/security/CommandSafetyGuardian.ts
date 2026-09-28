/**
 * CommandSafetyGuardian.ts — 8-Category Linux System Destruction Guardian & Consequence Explainer
 * 
 * Intercepts dangerous, catastrophic commands across 8 threat vectors:
 * 1. Root & Core Filesystem Destruction (rm -rf /, rm -rf /etc, rm -rf $HOME)
 * 2. Raw Block Device & MBR/GPT Overwrites (dd of=/dev/sd*, > /dev/sda)
 * 3. Filesystem Formatting & Wiping (mkfs.*, wipefs, blkdiscard)
 * 4. Permission & Ownership Lockout (chmod 000 /, chmod 777 /, chown nobody /)
 * 5. DoS, Fork Bombs & Hardware Panics (:(){ :|:& };:, sysrq-trigger)
 * 6. UEFI / Firmware Ruin (efivars destruction, /boot/efi wipe)
 * 7. Critical Package & C Library Sabotage (glibc removal, ld-linux deletion)
 * 8. Host Isolation & Obfuscated Pipes (iptables drop all, base64 pipes to shell)
 * 
 * When a catastrophic command is identified:
 * - Strictly blocks execution.
 * - Emits capability refusal: "Sentinel does not have the capability to execute this command."
 * - Generates a detailed, technical impact analysis explaining what would happen if executed.
 * - Provides non-destructive alternatives where applicable.
 */

export type ThreatCategory = 
  | 'ROOT_DESTRUCTION'
  | 'RAW_DISK_OVERWRITE'
  | 'PARTITION_FORMATTING'
  | 'PERMISSION_LOCKOUT'
  | 'DOS_FORK_BOMB'
  | 'UEFI_FIRMWARE_CORRUPTION'
  | 'CRITICAL_LIBRARY_SABOTAGE'
  | 'HOST_ISOLATION_OBFUSCATION';

export interface CommandSafetyEvaluation {
  isBlocked: boolean;
  category?: ThreatCategory;
  capabilityRefusal: string;
  consequenceExplanation: string;
  targetedSubsystem?: string;
  safeAlternative?: string;
  ruleId?: string;
}

export class CommandSafetyGuardian {
  private static instance: CommandSafetyGuardian;

  public static getInstance(): CommandSafetyGuardian {
    if (!CommandSafetyGuardian.instance) {
      CommandSafetyGuardian.instance = new CommandSafetyGuardian();
    }
    return CommandSafetyGuardian.instance;
  }

  /**
   * Evaluates any command string before it reaches the PTY or tool executor.
   */
  public evaluate(commandLine: string): CommandSafetyEvaluation {
    const raw = commandLine.trim();
    if (!raw) {
      return {
        isBlocked: false,
        capabilityRefusal: '',
        consequenceExplanation: ''
      };
    }

    // Strip leading sudo / doas for inspection
    const normalized = raw
      .replace(/^(sudo|doas)\s+(-[a-zA-Z0-9]+\s+)*(--\s+)?/i, '')
      .trim();

    // 1. UEFI / Firmware Ruin (checked before /boot root check)
    const uefiCheck = this.checkUefiFirmware(normalized, raw);
    if (uefiCheck.isBlocked) return uefiCheck;

    // 2. Root & Core Filesystem Destruction
    const rootCheck = this.checkRootDestruction(normalized, raw);
    if (rootCheck.isBlocked) return rootCheck;

    // 3. Raw Disk & Block Device Overwrite
    const diskCheck = this.checkRawDiskOverwrite(normalized, raw);
    if (diskCheck.isBlocked) return diskCheck;

    // 4. Filesystem Formatting & Wiping
    const formatCheck = this.checkFilesystemFormatting(normalized, raw);
    if (formatCheck.isBlocked) return formatCheck;

    // 5. Permission & Ownership Lockout
    const permCheck = this.checkPermissionLockout(normalized, raw);
    if (permCheck.isBlocked) return permCheck;

    // 6. DoS, Fork Bombs & Hardware Panics
    const dosCheck = this.checkDosAndPanics(normalized, raw);
    if (dosCheck.isBlocked) return dosCheck;

    // 7. Critical Package & C Library Sabotage
    const libCheck = this.checkCriticalLibrarySabotage(normalized, raw);
    if (libCheck.isBlocked) return libCheck;

    // 8. Host Isolation & Obfuscated Pipes
    const pipeCheck = this.checkHostIsolationAndObfuscation(normalized, raw);
    if (pipeCheck.isBlocked) return pipeCheck;

    return {
      isBlocked: false,
      capabilityRefusal: '',
      consequenceExplanation: ''
    };
  }

  private checkRootDestruction(cmd: string, raw: string): CommandSafetyEvaluation {
    // rm -rf / or rm -rf /* or with --no-preserve-root
    if (/\brm\s+.*-(r|f|rf|fr|rfi|fir).*(\s+|^)(\/|\/\*|\/\.\*)(\s+|$)/i.test(cmd) ||
        /\brm\s+.*--no-preserve-root.*(\/|\/\*)/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'ROOT_DESTRUCTION',
        targetedSubsystem: 'Root Filesystem (/)',
        ruleId: 'SEC-001-ROOT-WIPE',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'If executed, this command would recursively and permanently delete all files starting from the root directory (/), ' +
          'including the C standard library, shared drivers, running process binaries, and device nodes. ' +
          'The Linux kernel would immediately panic, all running applications would crash, and the operating system would be ' +
          'rendered completely and permanently unbootable, necessitating a full drive reformat and OS reinstallation.',
        safeAlternative: 'To safely clean disk space, remove cached packages with your package manager (e.g. pacman -Sc or apt clean), or inspect disk usage with: ncdu /'
      };
    }

    // Critical root subdirectories: /boot, /etc, /usr, /lib, /bin, /sbin
    const criticalDirsRegex = /\brm\s+.*-(r|f|rf|fr).*(\s+|^)(\/boot|\/etc|\/usr|\/lib|\/lib64|\/bin|\/sbin|\/var)(\/|\/\*|\s+|$)/i;
    if (criticalDirsRegex.test(cmd)) {
      const match = cmd.match(criticalDirsRegex);
      const targetDir = match ? match[3] : 'Critical system directory';
      return {
        isBlocked: true,
        category: 'ROOT_DESTRUCTION',
        targetedSubsystem: targetDir,
        ruleId: 'SEC-002-SYSDIR-DELETION',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          `Target directory '${targetDir}' contains core operating system infrastructure. ` +
          (targetDir === '/etc' ? 'Deleting /etc destroys all user authentication, network configurations, PAM modules, and systemd units, locking all users out instantly.' :
           targetDir === '/boot' ? 'Deleting /boot destroys the Linux kernel images, initramfs, and GRUB/systemd-boot configurations, rendering the machine incapable of booting.' :
           `Deleting ${targetDir} removes essential system binaries and shared libraries, preventing any software from launching.`),
        safeAlternative: 'Modify only targeted configuration files in user space or use standard administration utilities.'
      };
    }

    // Deleting home directory: rm -rf ~ or rm -rf $HOME or rm -rf /home/*
    if (/\brm\s+.*-(r|f|rf|fr).*(\s+|^)(~|\$HOME|\${HOME}|\/home\/\*|\/home\/[^\s\/]+\/\*)(\s+|$)/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'ROOT_DESTRUCTION',
        targetedSubsystem: 'User Home Directory (~)',
        ruleId: 'SEC-003-HOME-DELETION',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Executing this command would irreversibly delete your entire home directory, destroying all personal projects, ' +
          'git repositories, SSH keys, desktop configurations, documents, and credentials with zero possibility of undoing.',
        safeAlternative: 'Delete specific sub-folders explicitly (e.g. rm -rf ~/Downloads/temp_folder).'
      };
    }

    // find / -delete or find / -exec rm -rf
    if (/\bfind\s+\/\s+.*(-delete|-exec\s+rm\b)/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'ROOT_DESTRUCTION',
        targetedSubsystem: 'Recursive find deletion on /',
        ruleId: 'SEC-004-FIND-DELETE-ROOT',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Using find with -delete or -exec rm rooted at / performs an unconstrained recursive file sweep across all mounted partitions, ' +
          'destroying system files and unrecoverable user data.',
        safeAlternative: 'Specify a restricted subdirectory when running find -delete (e.g. find ./build -name "*.tmp" -delete).'
      };
    }

    return { isBlocked: false, capabilityRefusal: '', consequenceExplanation: '' };
  }

  private checkRawDiskOverwrite(cmd: string, raw: string): CommandSafetyEvaluation {
    // dd of=/dev/sdX or dd of=/dev/nvmeX or dd of=/dev/mapper
    if (/\bdd\b.*of=\/dev\/(sd[a-z]|nvme[0-9]|mapper\/|mmcblk|vd[a-z])/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'RAW_DISK_OVERWRITE',
        targetedSubsystem: 'Raw Block Device (/dev/*)',
        ruleId: 'SEC-010-RAW-DISK-DD',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Executing dd targeting a raw block device directly bypasses filesystem safeguards and overwrites raw disk sectors, ' +
          'obliterating partition tables (GPT/MBR), file allocation tables, and volume headers. Data recovery after raw sector zeroing is practically impossible.',
        safeAlternative: 'To write an ISO to USB safely, verify the exact device letter using lsblk first, or use a tool like ventoy or balenaEtcher.'
      };
    }

    // Redirection directly into block devices: > /dev/sda or cat /dev/zero > /dev/sda
    if (/(>|>>)\s*\/dev\/(sd[a-z]|nvme[0-9]|vd[a-z]|mapper)/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'RAW_DISK_OVERWRITE',
        targetedSubsystem: 'Direct Device Redirection',
        ruleId: 'SEC-011-DEVICE-REDIRECTION',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Redirecting standard output directly into a raw device node permanently destroys partition metadata and file tables on the physical disk.',
        safeAlternative: 'Write data into regular files inside an existing filesystem mount.'
      };
    }

    return { isBlocked: false, capabilityRefusal: '', consequenceExplanation: '' };
  }

  private checkFilesystemFormatting(cmd: string, raw: string): CommandSafetyEvaluation {
    // mkfs.* or wipefs -a or blkdiscard
    if (/\b(mkfs|mkfs\.ext4|mkfs\.btrfs|mkfs\.xfs|mkfs\.vfat|mkfs\.ntfs|mkswap)\s+.*\/dev\/(sd[a-z]|nvme[0-9]|vd[a-z]|mapper)/i.test(cmd) ||
        /\bwipefs\s+(-a|--all)\s+\/dev\/(sd[a-z]|nvme[0-9]|vd[a-z]|mapper)/i.test(cmd) ||
        /\bblkdiscard\s+.*\/dev\/(sd[a-z]|nvme[0-9]|vd[a-z]|mapper)/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'PARTITION_FORMATTING',
        targetedSubsystem: 'Filesystem Partition Table',
        ruleId: 'SEC-020-FORMAT-PARTITION',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Formatting or wiping an active block device destroys the filesystem superblock, allocation bitmaps, and all existing files on the volume. ' +
          'If the targeted volume contains root (/) or home (/home), the operating system will immediately crash upon unmount.',
        safeAlternative: 'Verify target drives with lsblk -f before initiating any formatting, and execute manually with explicit root confirmation.'
      };
    }

    return { isBlocked: false, capabilityRefusal: '', consequenceExplanation: '' };
  }

  private checkPermissionLockout(cmd: string, raw: string): CommandSafetyEvaluation {
    // chmod -R 000 / or chmod -R 777 /
    if (/\bchmod\s+.*-(R|r).*000\s+(\/|\/\*)(\s+|$)/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'PERMISSION_LOCKOUT',
        targetedSubsystem: 'Global POSIX File Permissions',
        ruleId: 'SEC-030-CHMOD-000',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Setting recursive 000 permissions across / revokes all read, write, and execute permissions from every user including root. ' +
          'No process will be able to load shared libraries or execute commands, instantly locking all users out of the computer permanently.',
        safeAlternative: 'Adjust permissions only on specific project files (e.g. chmod -R 755 ./src).'
      };
    }

    if (/\bchmod\s+.*-(R|r).*777\s+(\/|\/\*)(\s+|$)/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'PERMISSION_LOCKOUT',
        targetedSubsystem: 'Root Security Model & PAM Authentication',
        ruleId: 'SEC-031-CHMOD-777-ROOT',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Applying 777 permissions across / destroys the Linux security architecture. Critical daemons including OpenSSH, sudo, and PAM ' +
          'strictly refuse to run if system configuration files are world-writable, permanently breaking administrative access.',
        safeAlternative: 'Target only specific development workspace directories (e.g. chmod -R 777 ./dist).'
      };
    }

    // chown -R nobody / or chown -R $USER /
    if (/\bchown\s+.*-(R|r).*\b(nobody|root|daemon|[a-zA-Z0-9_-]+)\s+(\/|\/\*)(\s+|$)/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'PERMISSION_LOCKOUT',
        targetedSubsystem: 'System User & Group Ownership',
        ruleId: 'SEC-032-CHOWN-ROOT',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Recursively altering ownership of / corrupts setuid binaries (/usr/bin/sudo, /usr/bin/su, /usr/bin/passwd), ' +
          'preventing standard privilege escalation and system daemon execution.',
        safeAlternative: 'Change ownership of project directories in home space: chown -R $USER:$USER ~/my_project'
      };
    }

    return { isBlocked: false, capabilityRefusal: '', consequenceExplanation: '' };
  }

  private checkDosAndPanics(cmd: string, raw: string): CommandSafetyEvaluation {
    // Classic fork bomb: :(){ :|:& };: or similar
    if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/i.test(cmd) ||
        /\bwhile\s+true\s*;\s*do\s+(bash|sh|zsh|fork)\s*&\s*done/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'DOS_FORK_BOMB',
        targetedSubsystem: 'Linux Kernel Process Table (PID Exhaustion)',
        ruleId: 'SEC-040-FORK-BOMB',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'A fork bomb exponentially replicates processes until the Linux kernel PID table is completely saturated. ' +
          'The CPU will pin at 100%, memory will thrash, and the system will completely freeze, requiring a hard physical power cycle.',
        safeAlternative: 'To test concurrency, run a controlled benchmark with limited workers (e.g. stress-ng --cpu 4).'
      };
    }

    // Triggering instant kernel panic: echo c > /proc/sysrq-trigger
    if (/\becho\s+[a-zA-Z0-9]\s*>\s*\/proc\/sysrq-trigger/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'DOS_FORK_BOMB',
        targetedSubsystem: 'Kernel SysRq Diagnostic Interface',
        ruleId: 'SEC-041-SYSRQ-CRASH',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Writing diagnostic trigger characters directly to /proc/sysrq-trigger forces an immediate kernel crash (Null pointer dereference) ' +
          'or un-synchronized hard reboot, risking filesystem corruption and active data loss.',
        safeAlternative: 'For standard restarts, use graceful system shutdown commands: systemctl reboot'
      };
    }

    return { isBlocked: false, capabilityRefusal: '', consequenceExplanation: '' };
  }

  private checkUefiFirmware(cmd: string, raw: string): CommandSafetyEvaluation {
    // Deleting UEFI nvram variables or EFI boot files
    if (/\brm\s+.*-(r|f|rf|fr).*\/sys\/firmware\/efi\/efivars/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'UEFI_FIRMWARE_CORRUPTION',
        targetedSubsystem: 'Motherboard UEFI NVRAM Firmware',
        ruleId: 'SEC-050-EFIVARS-WIPE',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Modifying or deleting files in /sys/firmware/efi/efivars directly writes to the motherboard SPI flash memory. ' +
          'On several UEFI implementations, wiping these variables has caused permanent, non-recoverable motherboard bricking.',
        safeAlternative: 'Manage boot entries strictly through official tools like: efibootmgr'
      };
    }

    if (/\brm\s+.*-(r|f|rf|fr).*\/boot\/efi/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'UEFI_FIRMWARE_CORRUPTION',
        targetedSubsystem: 'EFI System Partition (ESP)',
        ruleId: 'SEC-051-BOOT-EFI-WIPE',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Deleting /boot/efi removes the GRUB/systemd-boot EFI binaries and NVRAM staging files, preventing the hardware BIOS/UEFI ' +
          'from finding any bootable operating system upon restart.',
        safeAlternative: 'Reinstall or update bootloaders via your distribution tools (e.g. grub-install or bootctl).'
      };
    }

    return { isBlocked: false, capabilityRefusal: '', consequenceExplanation: '' };
  }

  private checkCriticalLibrarySabotage(cmd: string, raw: string): CommandSafetyEvaluation {
    // Purging libc or dynamic linker
    if (/\b(pacman\s+-R.*glibc|apt-get\s+(purge|remove).*libc6|rpm\s+-e.*--nodeps.*glibc)\b/i.test(cmd) ||
        /\brm\s+.*-(r|f|rf|fr).*\/lib64\/ld-linux.*\.so/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'CRITICAL_LIBRARY_SABOTAGE',
        targetedSubsystem: 'GNU C Standard Library & Dynamic Linker (glibc)',
        ruleId: 'SEC-060-GLIBC-SABOTAGE',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'The GNU C library (glibc) and dynamic linker (ld-linux) are the core foundation of every dynamically linked program on Linux. ' +
          'Removing them instantly renders every shell command (including ls, bash, and sudo) unable to start.',
        safeAlternative: 'Manage system packages strictly through standard distribution package manager update flows.'
      };
    }

    return { isBlocked: false, capabilityRefusal: '', consequenceExplanation: '' };
  }

  private checkHostIsolationAndObfuscation(cmd: string, raw: string): CommandSafetyEvaluation {
    // iptables -F && iptables -P INPUT DROP
    if (/\biptables\s+-F\b.*\biptables\s+-P\s+(INPUT|OUTPUT)\s+DROP\b/i.test(cmd) ||
        /\bnft\s+flush\s+ruleset\b.*\bdrop\b/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'HOST_ISOLATION_OBFUSCATION',
        targetedSubsystem: 'Host Linux Firewall & Network Stack',
        ruleId: 'SEC-070-FIREWALL-DROP-ALL',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Flushing firewall rules while simultaneously dropping all incoming or outgoing packets immediately severs all active connections, ' +
          'including SSH remote administration and DNS resolution.',
        safeAlternative: 'Configure firewall rules with explicit allow policies for active connections and management ports.'
      };
    }

    // Loopback deletion
    if (/\bip\s+link\s+(delete|set\s+down)\s+lo\b/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'HOST_ISOLATION_OBFUSCATION',
        targetedSubsystem: 'Local Loopback Interface (lo)',
        ruleId: 'SEC-071-LOOPBACK-DELETE',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Disabling or deleting the loopback interface (lo / 127.0.0.1) breaks inter-process communication across the desktop, ' +
          'causing X11/Wayland display servers, D-Bus session buses, and local development servers to crash.',
        safeAlternative: 'Keep the loopback interface active at all times.'
      };
    }

    // Obfuscated remote pipe execution: curl ... | base64 -d | sh
    if (/\|\s*base64\s+(-d|--decode)\s*\|\s*(bash|sh|zsh)\b/i.test(cmd)) {
      return {
        isBlocked: true,
        category: 'HOST_ISOLATION_OBFUSCATION',
        targetedSubsystem: 'Shell Interpreter Execution Pipeline',
        ruleId: 'SEC-072-OBFUSCATED-PIPE',
        capabilityRefusal: `Sentinel does not have the capability to execute '${raw}'.`,
        consequenceExplanation: 
          'Piping obfuscated, base64-encoded payloads directly into an execution shell prevents security audits and indicates high malware risk.',
        safeAlternative: 'Decode the script to a file first, inspect its plaintext contents, and run explicitly.'
      };
    }

    return { isBlocked: false, capabilityRefusal: '', consequenceExplanation: '' };
  }

  /**
   * Formats a high-visibility ANSI-styled refusal banner for terminal output with zero emojis
   */
  public formatTerminalBanner(evalResult: CommandSafetyEvaluation, rawCmd: string): string {
    const width = 74;
    const divider = '─'.repeat(width);
    const title = ' [!] SENTINEL SECURITY GUARDIAN — ACTION PERMANENTLY REFUSED';
    const paddedTitle = `│${title.padEnd(width)}│`;
    return [
      `\r\n\x1b[1;31m┌${divider}┐\x1b[0m`,
      `\x1b[1;31m${paddedTitle}\x1b[0m`,
      `\x1b[1;31m└${divider}┘\x1b[0m`,
      `\x1b[1;37m✗ Capability Statement:\x1b[0m \x1b[1;31m${evalResult.capabilityRefusal}\x1b[0m`,
      `  • Attempted Command : \x1b[1;33m${rawCmd}\x1b[0m`,
      `  • Threat Category   : \x1b[1;35m${evalResult.category || 'CATASTROPHIC_DESTRUCTION'}\x1b[0m${evalResult.targetedSubsystem ? ` (Target: ${evalResult.targetedSubsystem})` : ''}`,
      ``,
      `\x1b[1;36m[i] Consequence & Impact Analysis:\x1b[0m`,
      `  ${evalResult.consequenceExplanation.split('. ').join('.\r\n  ')}`,
      ``,
      evalResult.safeAlternative ? `\x1b[1;32m[+] Safe Alternative:\x1b[0m\r\n  ${evalResult.safeAlternative}\r\n` : '',
      `\x1b[1;30m[#] Policy: Sentinel strictly refuses all commands that cause irreversible destruction of the host OS.\x1b[0m\r\n`
    ].filter(Boolean).join('\r\n');
  }
}
