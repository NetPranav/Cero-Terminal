/**
 * StandardToolSpecs.ts — Built-in Standard Tool Specifications
 * 
 * Extracted from SystemPrompt.ts to reduce core prompt builder module footprint.
 */

import { ToolSpec } from './SystemPrompt';

export const STANDARD_TOOL_SPECS: ToolSpec[] = [
  {
    id: 'filesystem.search',
    name: 'Search Files & Folders',
    description: 'Find files or folders by name, pattern, or path across the system or workspace.',
    parameters: [
      { name: 'pattern', type: 'string', required: true, description: 'File/folder name or glob pattern to search for' },
      { name: 'dir', type: 'string', required: false, description: 'Starting directory (default ~ for user system)' },
      { name: 'type', type: 'string', required: false, description: '"directory" to find folders, or "file"' }
    ]
  },
  {
    id: 'filesystem.list',
    name: 'List Directory',
    description: 'List contents of a directory.',
    parameters: [
      { name: 'path', type: 'string', required: false, description: 'Directory path (defaults to current dir)' }
    ]
  },
  {
    id: 'filesystem.read',
    name: 'Read File',
    description: 'Read content of a text file.',
    parameters: [
      { name: 'path', type: 'string', required: true, description: 'Path to file' }
    ]
  },
  {
    id: 'filesystem.navigate',
    name: 'Navigate Directory',
    description: 'Change current working directory (cd).',
    parameters: [
      { name: 'path', type: 'string', required: true, description: 'Target directory path' }
    ]
  },
  {
    id: 'network.wifi.scan',
    name: 'Scan Wi-Fi Networks',
    description: 'List all available and previously connected Wi-Fi networks.',
    parameters: []
  },
  {
    id: 'network.wifi.on',
    name: 'Turn On Wi-Fi',
    description: 'Enable the Wi-Fi interface.',
    parameters: []
  },
  {
    id: 'network.wifi.off',
    name: 'Turn Off Wi-Fi',
    description: 'Disable the Wi-Fi interface.',
    parameters: []
  },
  {
    id: 'network.wifi.connect',
    name: 'Connect Wi-Fi',
    description: 'Connect to a Wi-Fi network.',
    parameters: [
      { name: 'ssid', type: 'string', required: true, description: 'Wi-Fi network name' },
      { name: 'password', type: 'string', required: false, description: 'Network password' }
    ]
  },
  {
    id: 'network.bluetooth.list',
    name: 'List Bluetooth Devices',
    description: 'Scan and list available or paired Bluetooth devices.',
    parameters: []
  },
  {
    id: 'network.bluetooth.on',
    name: 'Turn On Bluetooth',
    description: 'Enable Bluetooth adapter.',
    parameters: []
  },
  {
    id: 'network.bluetooth.off',
    name: 'Turn Off Bluetooth',
    description: 'Disable Bluetooth adapter.',
    parameters: []
  },
  {
    id: 'network.bluetooth.connect',
    name: 'Connect Bluetooth Device',
    description: 'Connect to a Bluetooth device.',
    parameters: [
      { name: 'device', type: 'string', required: true, description: 'Device name or MAC address' }
    ]
  },
  {
    id: 'network.ports',
    name: 'List Open Ports or Find Free Ports',
    description: 'Inspect active listening ports, check if a specific port is in use, or discover available free ports for web development and servers.',
    parameters: [
      { name: 'port', type: 'number', required: false, description: 'Specific port to check' },
      { name: 'findFree', type: 'boolean', required: false, description: 'True to discover available free ports for web development' }
    ]
  },
  {
    id: 'network.ping',
    name: 'Ping Host',
    description: 'Check network connectivity to a host or IP.',
    parameters: [
      { name: 'host', type: 'string', required: true, description: 'Hostname or IP address' }
    ]
  },
  {
    id: 'system.processes',
    name: 'List Processes',
    description: 'List running processes sorted by CPU or RAM usage.',
    parameters: [
      { name: 'sort', type: 'string', required: false, description: '"cpu" or "ram"' }
    ]
  },
  {
    id: 'system.storage',
    name: 'Check Storage',
    description: 'Check available and used disk space.',
    parameters: []
  },
  {
    id: 'system.battery',
    name: 'Check Battery',
    description: 'Check battery percentage and charging state.',
    parameters: []
  },
  {
    id: 'system.info',
    name: 'System Info',
    description: 'Get OS, architecture, and hardware information.',
    parameters: []
  },
  {
    id: 'application.open',
    name: 'Open Application',
    description: 'Launch or open a desktop application.',
    parameters: [
      { name: 'app', type: 'string', required: true, description: 'Application name (e.g. "Visual Studio Code", "Chrome", "Safari")' }
    ]
  },
  {
    id: 'browser.search',
    name: 'Web Search',
    description: 'Search the web using default browser.',
    parameters: [
      { name: 'query', type: 'string', required: true, description: 'Search keywords' },
      { name: 'engine', type: 'string', required: false, description: 'Search engine (default: "google")' }
    ]
  },
  {
    id: 'browser.navigate',
    name: 'Open URL',
    description: 'Open a URL in default browser.',
    parameters: [
      { name: 'url', type: 'string', required: true, description: 'Website URL' }
    ]
  },
  {
    id: 'git.status',
    name: 'Git Status',
    description: 'Show working tree status.',
    parameters: []
  },
  {
    id: 'git.log',
    name: 'Git Log',
    description: 'Show recent commits.',
    parameters: []
  },
  {
    id: 'shell.execute',
    name: 'Execute Shell Command',
    description: 'Run arbitrary shell command with explanation.',
    parameters: [
      { name: 'command', type: 'string', required: true, description: 'Shell command string' },
      { name: 'explanation', type: 'string', required: false, description: 'Plain English explanation of what this command does' }
    ]
  }
];
