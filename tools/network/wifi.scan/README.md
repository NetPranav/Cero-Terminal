# network.wifi.scan

## Purpose
Scans for all available WiFi networks and displays their SSID, signal strength, security type, and channel.

## Workflow
1. Runs `netsh wlan show networks mode=bssid` (roadmap 3.7; the labels are translated on
   non-English Windows, so the output is parsed by position, not by label text)

## Permissions
- `ShellExecution`

## Limitations
- Cannot connect to networks (use `network.wifi.connect` when available)
- Requires WiFi hardware to be enabled

## Examples
- "Show me all the wifi available"
- "List wifi networks"
- "Scan for wireless"

## Edge Cases
- If WiFi is disabled, the command may return an error or empty output
- Hidden networks may not appear in scan results
