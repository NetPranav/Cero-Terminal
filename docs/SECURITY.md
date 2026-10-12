# Cero — Security & Safeguards Guide

Allowing an autonomous AI agent to interact with your operating system needs clear boundaries. Cero checks every command it runs, asks before anything that changes your system, and refuses a fixed set of catastrophic commands.

---

## 1. Categorical Policy Engine & Command Safety Guardian (`CommandSafetyGuardian.ts`)

Cero evaluates all proposed operations—both interactive terminal keystrokes and autonomous AI tool executions—against a categorical safety policy and a deep AST security engine:

| Policy Tier | Behavior | Example Operations |
| :--- | :--- | :--- |
| **`SAFE`** | Executes immediately without interruption | Reading system diagnostics, listing files, checking network connections, inspecting ports |
| **`CONFIRMATION_REQUIRED`** | Pauses execution and requires explicit interactive user confirmation | Modifying configuration files, creating directories, terminating user applications, running build scripts |
| **`ADMIN_REQUIRED`** | Strictly requires user confirmation and root/sudo password authentication | Installing systemd daemons, modifying `/etc/`, altering network interfaces, kernel driver actions |
| **`PERMANENTLY_REFUSED`** | Hard-blocked at the keyboard and agent loop; Cero asserts lack of capability | Root deletion, block device zeroing, partition wipes, permission lockouts, fork bombs, UEFI wipes, glibc sabotage |

### The 8 Catastrophic Threat Vectors

1. **Root Filesystem & Core Hierarchy Destruction**:
   - Matches: `rm -rf /`, `rm -rf /*`, `rm -rf --no-preserve-root /`, `rm -rf /boot`, `/etc`, `/usr`, `/lib`, `/bin`, `rm -rf ~`, `rm -rf $HOME`, `find / -delete`.
2. **Raw Disk & Block Device Overwriting**:
   - Matches: `dd if=/dev/zero of=/dev/sd*`, `dd if=/dev/urandom of=/dev/nvme*`, direct device redirection `> /dev/sda`, `cat /dev/zero > /dev/nvme0n1`.
3. **Filesystem Formatting & Storage Wiping**:
   - Matches: `mkfs.ext4 /dev/sd*`, `mkfs.btrfs -f /dev/nvme*`, `wipefs -a /dev/sd*`, `blkdiscard /dev/nvme*`.
4. **Permission & Ownership Lockouts**:
   - Matches: `chmod -R 000 /`, `chmod -R 777 /`, `chown -R nobody /`, `chmod -x /bin/chmod`, `chmod -x /lib/ld-linux*`.
5. **Denial-of-Service, Fork Bombs & Kernel Panics**:
   - Matches: `:(){ :|:& };:`, `while true; do bash & done`, `echo c > /proc/sysrq-trigger`, `echo b > /proc/sysrq-trigger`.
6. **UEFI NVRAM & Firmware Ruin**:
   - Matches: `rm -rf /sys/firmware/efi/efivars/*`, `rm -rf /boot/efi/*`, `efibootmgr -B`.
7. **Critical Package & C Standard Library Sabotage**:
   - Matches: `pacman -Rdd glibc`, `apt-get purge libc6`, `rpm -e --nodeps glibc`, `rm -f /lib64/ld-linux*.so*`.
8. **Host Network Isolation & Obfuscated Pipelines**:
   - Matches: `iptables -F && iptables -P INPUT DROP`, `ip link delete lo`, `curl ... | base64 -d | bash`, `echo <base64> | base64 -d | sh`.

### Capability Refusal & Impact Analysis Architecture

When a blocked command is detected:
1. **Explicit Capability Limitation**: The terminal responds that Cero does not have the capability to execute the command:
   ```text
   ✗ Capability Statement: Cero does not have the capability to execute '[command]'.
   ```
2. **Consequence & Impact Analysis**: Cero explains the exact technical destruction that would occur if the command were executed (e.g. recursive inode deletion, loss of the C standard library, kernel panic, or irrecoverable UEFI NVRAM bricking).
3. **Safe Alternative**: Cero suggests safe, non-destructive commands (e.g. `pacman -Sc`, `apt clean`, `ncdu /`).
4. **Dual-Layer Interception**:
   - **Terminal View Interception (`TerminalView.tsx`)**: Intercepts the Enter keypress before the command is written to the PTY. The pending buffer is cleared, and an ANSI refusal banner is output directly to the terminal without invoking the shell.
   - **AI Agent Tool Interception (`ToolExecutor.ts`)**: Evaluates all commands proposed by the LLM or planner before execution. Destructive commands are blocked, returning the refusal and technical consequence back to the agent loop.
5. **Strict No-Emoji Banner Styling**:
   ```text
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ [!] CERO SECURITY GUARDIAN — ACTION PERMANENTLY REFUSED              │
   └──────────────────────────────────────────────────────────────────────────┘
   ✗ Capability Statement: Cero does not have the capability to execute 'rm -rf /'.
     • Attempted Command : rm -rf /
     • Threat Category   : ROOT_DESTRUCTION (Target: Root Filesystem (/))

   [i] Consequence & Impact Analysis:
     If executed, this command would recursively and permanently delete all files starting from the root directory (/), including the C standard library, shared drivers, running process binaries, and device nodes.
     The Linux kernel would immediately panic, all running applications would crash, and the operating system would be rendered completely and permanently unbootable, necessitating a full drive reformat and OS reinstallation.

   [+] Safe Alternative:
     To safely clean disk space, remove cached packages with your package manager (e.g. pacman -Sc or apt clean), or inspect disk usage with: ncdu /

   [#] Policy: Cero strictly refuses all commands that cause irreversible destruction of the host OS.
   ```

---

## 2. Asynchronous Non-Blocking Consent Queue (`ConsentQueue.ts`)

- **Tab-Scoped Approvals**: When a tool action requires authorization, the request is dispatched to an asynchronous consent queue tagged with the initiating session/tab ID.
- **Non-Blocking UI**: Background terminal processes continue operating while the approval card waits for a decision.
- **One card for every approval** (`ApprovalDock.tsx`): a small card in the bottom-right corner that never takes the keyboard, so a prompt you are typing is never interrupted. It lists the commands and paths involved. Answer with a click on **Run** or **Deny**; Enter and Esc do not answer it.
- **Flow files**: opening a `.flow` shows one card listing every command; nothing runs until you click Run (see [FLOW_FILES.md](FLOW_FILES.md)).

---

## 3. AST Shell Validation (`ShellAstParser.ts`)

- **Pre-Execution Syntax Analysis**: Model-generated shell commands are parsed by a dedicated Abstract Syntax Tree (AST) engine prior to execution.
- **Subshell & Obfuscation Detection**: Automatically flags hidden command chaining, subshell injection (`` `...` ``, `$(...)`), and pipe-to-interpreter patterns (`curl ... | bash`).

---

## 4. Prompt Injection Defense & Data Protection

- **Untrusted output**: file contents and command output are only data for the model. Any command the model then proposes still goes through the safety guardian and, if it changes anything, your approval.
- **Automated Secret Redaction (`SecretRedactor.ts`)**: Scans all command arguments, environment outputs, and execution logs for API keys, AWS credentials, private SSH keys, and password patterns, replacing them with `[REDACTED]` before writing to disk.
- **Where data goes**: with the built-in model or Ollama, reasoning stays on your machine. With an API provider, your request and the output needed to answer it are sent to that provider. API keys live in the OS keychain (a private `0600` file on Linux).

---

## 5. Session Undo Log & Destructive Rollback (`UndoLog.ts`)

- **Transactional Action Tracking**: Reversible actions (file edits, branch creation, package installations) are recorded in an in-memory session undo log (it is gone when Cero closes).
- **Action Inspection**: Ask `>what did you just do` at any time to receive a transparent summary of recently performed modifications.
- **One-Command Rollback**: Ask `>undo last step` to trigger deterministic compensation actions (restoring pre-modification `.bak` file snapshots, reverting git stashes, or untrashing deleted files).

---

## 6. Audit Trails & Benchmark Isolation

- **Production Audit Logging**: Capability invocations are appended to `~/.cero/audit.jsonl` (`AuditLogger.ts`), which also provides a hash-chain integrity check.
- **Benchmark Isolation**: Test harnesses and automated benchmarks write exclusively to isolated logs (`~/.cero/audit.benchmark.jsonl`), ensuring production development records remain unpolluted.
- **Binary & Model Integrity**: Downloads of the `llama-server` build and the GGUF models are verified against pinned SHA-256 checksums; a mismatch is discarded.
