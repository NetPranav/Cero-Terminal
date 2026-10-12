# network.bluetooth.list

## Purpose
Lists all Bluetooth devices visible to the system, including paired, connected, and nearby discoverable devices.

## Workflow
1. Runs `Get-PnpDevice -Class Bluetooth` in PowerShell
2. Returns the device names and their status

## Permissions
- `ShellExecution` — required to run the PowerShell command

## Limitations
- Cannot initiate pairing or connections (use `network.bluetooth.pair` when available)
- Discovery of nearby devices depends on the Bluetooth hardware state

## Examples
- "Show me all bluetooth devices"
- "What bluetooth devices are connected?"
- "Are my AirPods connected?"
- "Scan for bluetooth"

## Edge Cases
- Paired devices are listed even when they are out of range; their status shows whether they are present
- If no devices are paired, the output will show an empty device list
