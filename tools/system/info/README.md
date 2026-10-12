# system.info

## Purpose
Displays detailed system information including hardware model, OS version, CPU, and memory.

## Workflow
- Windows: `Get-CimInstance Win32_OperatingSystem, Win32_Processor, Win32_ComputerSystem` with `ConvertTo-Json`
  (roadmap 3.7)

## Permissions
- `ShellExecution`

## Limitations
- Does not show real-time resource usage (use a process/monitor tool for that)
