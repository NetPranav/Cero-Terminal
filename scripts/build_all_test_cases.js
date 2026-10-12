import fs from 'fs';
import path from 'path';

const tools = JSON.parse(fs.readFileSync('/tmp/tool_full_spec.json', 'utf8'));

// High-fidelity handcrafted test case definitions for every tool
const customCases = {
  // === NETWORK ===
  'network.bluetooth.on': [
    {
      id: 'TC-NET-BT-ON-01',
      scenario: 'Direct command to turn on Bluetooth radio',
      prompt: 'turn on bluetooth',
      expectedTool: 'network.bluetooth.on',
      params: {},
      description: 'Enables system Bluetooth radio adapter.'
    },
    {
      id: 'TC-NET-BT-ON-02',
      scenario: 'Conversational command to enable Bluetooth',
      prompt: 'please enable bluetooth adapter',
      expectedTool: 'network.bluetooth.on',
      params: {},
      description: 'Powers up wireless Bluetooth transmitter.'
    }
  ],
  'network.bluetooth.off': [
    {
      id: 'TC-NET-BT-OFF-01',
      scenario: 'Direct command to turn off Bluetooth radio',
      prompt: 'turn off bluetooth',
      expectedTool: 'network.bluetooth.off',
      params: {},
      description: 'Disables system Bluetooth radio to conserve battery.'
    },
    {
      id: 'TC-NET-BT-OFF-02',
      scenario: 'Deactivate Bluetooth adapter',
      prompt: 'disable bluetooth',
      expectedTool: 'network.bluetooth.off',
      params: {},
      description: 'Shuts down active Bluetooth transmitter.'
    }
  ],
  'network.bluetooth.connect': [
    {
      id: 'TC-NET-BT-CONN-01',
      scenario: 'Connect Soundcore Space One headphone (User Specific Example)',
      prompt: 'connect soundcore space one headphone',
      expectedTool: 'network.bluetooth.connect',
      params: { device: 'soundcore space one headphone' },
      description: 'Establishes wireless Bluetooth link to Soundcore Space One headphones.'
    },
    {
      id: 'TC-NET-BT-CONN-02',
      scenario: 'Pair AirPods Pro headphones',
      prompt: 'pair bluetooth headphones AirPods Pro',
      expectedTool: 'network.bluetooth.connect',
      params: { device: 'AirPods Pro' },
      description: 'Connects to paired Apple AirPods Pro peripheral.'
    },
    {
      id: 'TC-NET-BT-CONN-03',
      scenario: 'Connect device by MAC address',
      prompt: 'connect to bluetooth device 00:1A:7D:DA:71:13',
      expectedTool: 'network.bluetooth.connect',
      params: { device: '00:1A:7D:DA:71:13' },
      description: 'Direct hardware connection via Bluetooth MAC address.'
    }
  ],
  'network.bluetooth.list': [
    {
      id: 'TC-NET-BT-LIST-01',
      scenario: 'Check if any bluetooth device is available (User Specific Example)',
      prompt: 'check if any bluetooth device is available',
      expectedTool: 'network.bluetooth.list',
      params: {},
      description: 'Scans and lists all discoverable Bluetooth devices and accessories.'
    },
    {
      id: 'TC-NET-BT-LIST-02',
      scenario: 'Show all paired and reachable devices',
      prompt: 'show me all bluetooth devices',
      expectedTool: 'network.bluetooth.list',
      params: {},
      description: 'Queries Bluetooth subsystem for currently connected and nearby devices.'
    }
  ],
  'network.wifi.on': [
    {
      id: 'TC-NET-WIFI-ON-01',
      scenario: 'Turn Wi-Fi on',
      prompt: 'turn on wifi',
      expectedTool: 'network.wifi.on',
      params: {},
      description: 'Enables system Wi-Fi wireless networking radio.'
    },
    {
      id: 'TC-NET-WIFI-ON-02',
      scenario: 'Enable wireless network adapter',
      prompt: 'enable wi-fi interface',
      expectedTool: 'network.wifi.on',
      params: {},
      description: 'Powers up wireless network hardware.'
    }
  ],
  'network.wifi.off': [
    {
      id: 'TC-NET-WIFI-OFF-01',
      scenario: 'Turn Wi-Fi off',
      prompt: 'turn off wifi',
      expectedTool: 'network.wifi.off',
      params: {},
      description: 'Disables system Wi-Fi wireless networking interface.'
    },
    {
      id: 'TC-NET-WIFI-OFF-02',
      scenario: 'Deactivate wireless adapter',
      prompt: 'disable wi-fi',
      expectedTool: 'network.wifi.off',
      params: {},
      description: 'Disconnects and disables active wireless interfaces.'
    }
  ],
  'network.wifi.scan': [
    {
      id: 'TC-NET-WIFI-SCAN-01',
      scenario: 'Scan for available Wi-Fi networks',
      prompt: 'scan for available wifi networks',
      expectedTool: 'network.wifi.scan',
      params: {},
      description: 'Scans and lists nearby accessible Wi-Fi SSID networks and signal metrics.'
    },
    {
      id: 'TC-NET-WIFI-SCAN-02',
      scenario: 'List reachable Wi-Fi SSIDs',
      prompt: 'what wifi networks are available nearby?',
      expectedTool: 'network.wifi.scan',
      params: {},
      description: 'Polls wireless broadcast channels for active base stations.'
    }
  ],
  'network.wifi.connect': [
    {
      id: 'TC-NET-WIFI-CONN-01',
      scenario: 'Connect to Wi-Fi SSID with 5G suffix',
      prompt: 'connect to wifi Office-Network-5G',
      expectedTool: 'network.wifi.connect',
      params: { ssid: 'Office-Network-5G' },
      description: 'Associates system wireless interface with designated SSID.'
    },
    {
      id: 'TC-NET-WIFI-CONN-02',
      scenario: 'Join guest Wi-Fi network',
      prompt: 'join wifi Starlink_Guest',
      expectedTool: 'network.wifi.connect',
      params: { ssid: 'Starlink_Guest' },
      description: 'Connects client adapter to specified guest network.'
    }
  ],
  'network.ping': [
    {
      id: 'TC-NET-PING-01',
      scenario: 'Ping domain hostname',
      prompt: 'ping google.com',
      expectedTool: 'network.ping',
      params: { host: 'google.com' },
      description: 'Sends ICMP echo packets to test host reachability and latency.'
    },
    {
      id: 'TC-NET-PING-02',
      scenario: 'Ping public DNS IP',
      prompt: 'test connection to 1.1.1.1',
      expectedTool: 'network.ping',
      params: { host: '1.1.1.1' },
      description: 'Tests network round-trip time to Cloudflare primary DNS.'
    }
  ],
  'network.ports': [
    {
      id: 'TC-NET-PORT-01',
      scenario: 'Check specific development port',
      prompt: 'check if port 3000 is open',
      expectedTool: 'network.ports',
      params: { port: 3000 },
      description: 'Inspects if port 3000 has an active listening process.'
    },
    {
      id: 'TC-NET-PORT-02',
      scenario: 'List all open listening ports',
      prompt: 'show all listening ports',
      expectedTool: 'network.ports',
      params: {},
      description: 'Lists all open TCP/UDP sockets and binding process IDs.'
    },
    {
      id: 'TC-NET-PORT-03',
      scenario: 'Check alternative web port',
      prompt: 'is port 8080 in use?',
      expectedTool: 'network.ports',
      params: { port: 8080 },
      description: 'Queries socket table for port 8080 occupancy.'
    }
  ],
  'network.ip': [
    {
      id: 'TC-NET-IP-01',
      scenario: 'Query system IP addresses',
      prompt: 'what is my IP address?',
      expectedTool: 'network.ip',
      params: {},
      description: 'Retrieves active local LAN IPv4/IPv6 and public facing WAN addresses.'
    },
    {
      id: 'TC-NET-IP-02',
      scenario: 'Show network IP bindings',
      prompt: 'show my internal and external ip',
      expectedTool: 'network.ip',
      params: {},
      description: 'Displays internal adapter IPs alongside public gateway IP.'
    }
  ],
  'network.interfaces': [
    {
      id: 'TC-NET-IFACE-01',
      scenario: 'Inspect physical and virtual network interfaces',
      prompt: 'show all network interfaces',
      expectedTool: 'network.interfaces',
      params: {},
      description: 'Displays status, MAC address, and IP configuration of en0, lo0, etc.'
    },
    {
      id: 'TC-NET-IFACE-02',
      scenario: 'List network adapters',
      prompt: 'list physical and virtual network adapters',
      expectedTool: 'network.interfaces',
      params: {},
      description: 'Queries OS network adapter tables.'
    }
  ],
  'network.dns': [
    {
      id: 'TC-NET-DNS-01',
      scenario: 'Query DNS domain records',
      prompt: 'lookup DNS for github.com',
      expectedTool: 'network.dns',
      params: { domain: 'github.com' },
      description: 'Performs DNS resolution lookup for A, CNAME, and MX records.'
    },
    {
      id: 'TC-NET-DNS-02',
      scenario: 'Resolve host domain names',
      prompt: 'query dns records for openai.com',
      expectedTool: 'network.dns',
      params: { domain: 'openai.com' },
      description: 'Queries nameservers for OpenAI domain record resolution.'
    }
  ],
  'network.traceroute': [
    {
      id: 'TC-NET-TRACE-01',
      scenario: 'Traceroute to cloud endpoint',
      prompt: 'traceroute to cloudflare.com',
      expectedTool: 'network.traceroute',
      params: { host: 'cloudflare.com' },
      description: 'Traces packet routing gateway hops across Internet to target host.'
    },
    {
      id: 'TC-NET-TRACE-02',
      scenario: 'Trace path to public DNS resolver',
      prompt: 'trace route to 8.8.8.8',
      expectedTool: 'network.traceroute',
      params: { host: '8.8.8.8' },
      description: 'Performs hop-by-hop latency inspection to Google DNS.'
    }
  ],

  // === SYSTEM ===
  'system.battery': [
    {
      id: 'TC-SYS-BAT-01',
      scenario: 'Query laptop battery status',
      prompt: 'what is my battery level?',
      expectedTool: 'system.battery',
      params: {},
      description: 'Queries internal battery percentage, charging state, and time remaining.'
    },
    {
      id: 'TC-SYS-BAT-02',
      scenario: 'Check power adapter connection',
      prompt: 'check battery status and power source',
      expectedTool: 'system.battery',
      params: {},
      description: 'Verifies AC power source and cycle health.'
    }
  ],
  'system.cpu': [
    {
      id: 'TC-SYS-CPU-01',
      scenario: 'Inspect real-time CPU load',
      prompt: 'check CPU utilization',
      expectedTool: 'system.cpu',
      params: {},
      description: 'Monitors real-time processor core load percentages and frequencies.'
    },
    {
      id: 'TC-SYS-CPU-02',
      scenario: 'Check processor health',
      prompt: 'how much CPU is the system using right now?',
      expectedTool: 'system.cpu',
      params: {},
      description: 'Measures total user/system processor consumption.'
    }
  ],
  'system.gpu': [
    {
      id: 'TC-SYS-GPU-01',
      scenario: 'Inspect GPU acceleration status',
      prompt: 'check GPU acceleration status',
      expectedTool: 'system.gpu',
      params: {},
      description: 'Queries active graphics hardware model, VRAM utilization, and clock.'
    },
    {
      id: 'TC-SYS-GPU-02',
      scenario: 'Check graphics memory usage',
      prompt: 'how much VRAM is being used?',
      expectedTool: 'system.gpu',
      params: {},
      description: 'Inspects Metal / OpenGL / GPU memory metrics.'
    }
  ],
  'system.ram': [
    {
      id: 'TC-SYS-RAM-01',
      scenario: 'Inspect physical RAM capacity',
      prompt: 'how much RAM is available?',
      expectedTool: 'system.ram',
      params: {},
      description: 'Checks total physical system RAM capacity and free memory buffers.'
    },
    {
      id: 'TC-SYS-RAM-02',
      scenario: 'Check memory pressure and swap',
      prompt: 'show memory usage and swap capacity',
      expectedTool: 'system.ram',
      params: {},
      description: 'Inspects active, inactive, wired RAM and paging activity.'
    }
  ],
  'system.storage': [
    {
      id: 'TC-SYS-STOR-01',
      scenario: 'Check available disk space',
      prompt: 'check available disk space',
      expectedTool: 'system.storage',
      params: {},
      description: 'Lists mounted disk partitions, filesystem formats, and free gigabytes.'
    },
    {
      id: 'TC-SYS-STOR-02',
      scenario: 'Inspect root volume capacity',
      prompt: 'how much free storage do I have on my hard drive?',
      expectedTool: 'system.storage',
      params: {},
      description: 'Evaluates system drive capacity and utilization.'
    }
  ],
  'system.processes': [
    {
      id: 'TC-SYS-PROC-01',
      scenario: 'Sort processes by CPU consumption',
      prompt: 'which process is using the most CPU?',
      expectedTool: 'system.processes',
      params: { sort: 'cpu' },
      description: 'Lists top CPU consuming processes and background tasks.'
    },
    {
      id: 'TC-SYS-PROC-02',
      scenario: 'Sort processes by RAM consumption',
      prompt: 'show top memory consuming processes',
      expectedTool: 'system.processes',
      params: { sort: 'ram' },
      description: 'Lists top memory consuming applications and daemons.'
    },
    {
      id: 'TC-SYS-PROC-03',
      scenario: 'General process snapshot',
      prompt: 'show running processes',
      expectedTool: 'system.processes',
      params: {},
      description: 'Retrieves active process table.'
    }
  ],
  'system.kill_process': [
    {
      id: 'TC-SYS-KILL-01',
      scenario: 'Terminate process by application name',
      prompt: 'kill process Google Chrome',
      expectedTool: 'system.kill_process',
      params: { process: 'Google Chrome' },
      description: 'Terminates active Chrome browser processes.'
    },
    {
      id: 'TC-SYS-KILL-02',
      scenario: 'Terminate process by PID',
      prompt: 'kill process 8942',
      expectedTool: 'system.kill_process',
      params: { process: '8942' },
      description: 'Terminates target process by process ID.'
    },
    {
      id: 'TC-SYS-KILL-03',
      scenario: 'Stop background runtime daemon',
      prompt: 'stop node process',
      expectedTool: 'system.kill_process',
      params: { process: 'node' },
      description: 'Terminates active Node.js processes.'
    }
  ],
  'system.info': [
    {
      id: 'TC-SYS-INFO-01',
      scenario: 'Get system diagnostic information',
      prompt: 'system info',
      expectedTool: 'system.info',
      params: {},
      description: 'Retrieves OS platform, kernel version, machine architecture, and hostname.'
    },
    {
      id: 'TC-SYS-INFO-02',
      scenario: 'Hardware specifications overview',
      prompt: 'what are my hardware specs and macOS version?',
      expectedTool: 'system.info',
      params: {},
      description: 'Outputs complete system architecture report.'
    }
  ],
  'system.lock': [
    {
      id: 'TC-SYS-LOCK-01',
      scenario: 'Lock system workstation',
      prompt: 'lock the laptop',
      expectedTool: 'system.lock',
      params: {},
      description: 'Locks the operating system screen immediately.'
    },
    {
      id: 'TC-SYS-LOCK-02',
      scenario: 'Instant display lock',
      prompt: 'lock the screen now',
      expectedTool: 'system.lock',
      params: {},
      description: 'Secures user session and turns off display.'
    }
  ],
  'system.temperature': [
    {
      id: 'TC-SYS-TEMP-01',
      scenario: 'Query CPU core thermal sensors',
      prompt: 'check thermal sensors',
      expectedTool: 'system.temperature',
      params: {},
      description: 'Queries CPU core thermal diode and fan cooling subsystem temperatures.'
    },
    {
      id: 'TC-SYS-TEMP-02',
      scenario: 'Check thermal throttling status',
      prompt: 'is the computer overheating?',
      expectedTool: 'system.temperature',
      params: {},
      description: 'Checks hardware temperature status against safety thresholds.'
    }
  ],
  'system.uptime': [
    {
      id: 'TC-SYS-UP-01',
      scenario: 'Query system uptime duration',
      prompt: 'how long has my system been running?',
      expectedTool: 'system.uptime',
      params: {},
      description: 'Displays time elapsed since last boot and load averages.'
    },
    {
      id: 'TC-SYS-UP-02',
      scenario: 'Check boot timestamp',
      prompt: 'check system uptime',
      expectedTool: 'system.uptime',
      params: {},
      description: 'Returns machine uptime in days, hours, and minutes.'
    }
  ],

  // === FILESYSTEM ===
  'filesystem.list': [
    {
      id: 'TC-FS-LIST-01',
      scenario: 'List files in current directory',
      prompt: 'list files',
      expectedTool: 'filesystem.list',
      params: { path: '.' },
      description: 'Lists files and folders in active working directory.'
    },
    {
      id: 'TC-FS-LIST-02',
      scenario: 'List files in home Documents',
      prompt: 'show files in ~/Documents',
      expectedTool: 'filesystem.list',
      params: { path: '~/Documents' },
      description: 'Inspects user Documents folder directory listing.'
    },
    {
      id: 'TC-FS-LIST-03',
      scenario: 'List project subfolder',
      prompt: 'ls src/domain',
      expectedTool: 'filesystem.list',
      params: { path: 'src/domain' },
      description: 'Lists contents of relative path.'
    }
  ],
  'filesystem.navigate': [
    {
      id: 'TC-FS-NAV-01',
      scenario: 'Navigate to user downloads directory',
      prompt: 'take me to downloads folder',
      expectedTool: 'filesystem.navigate',
      params: { path: '~/Downloads' },
      description: 'Changes active working directory to ~/Downloads.'
    },
    {
      id: 'TC-FS-NAV-02',
      scenario: 'Navigate upwards two directories',
      prompt: 'go back up two directories',
      expectedTool: 'filesystem.navigate',
      params: { path: '../..' },
      description: 'Traverses parent directories in the shell.'
    },
    {
      id: 'TC-FS-NAV-03',
      scenario: 'Navigate to project workspace root',
      prompt: 'navigate to ~/Project Folder/AI Terminal',
      expectedTool: 'filesystem.navigate',
      params: { path: '~/Project Folder/AI Terminal' },
      description: 'Sets working directory to specific absolute path.'
    }
  ],
  'filesystem.search': [
    {
      id: 'TC-FS-SRCH-01',
      scenario: 'Search files matching glob in subfolder',
      prompt: 'find all json files in tools',
      expectedTool: 'filesystem.search',
      params: { dir: 'tools', pattern: '*.json' },
      description: 'Searches recursively under tools directory for .json files.'
    },
    {
      id: 'TC-FS-SRCH-02',
      scenario: 'Search files matching extension in source',
      prompt: 'search for *.ts files under src',
      expectedTool: 'filesystem.search',
      params: { dir: 'src', pattern: '*.ts' },
      description: 'Finds all TypeScript source files recursively.'
    },
    {
      id: 'TC-FS-SRCH-03',
      scenario: 'Search images in current directory',
      prompt: 'tell me all the png files here',
      expectedTool: 'filesystem.search',
      params: { dir: '.', pattern: '*.png' },
      description: 'Lists PNG assets in current directory.'
    }
  ],
  'filesystem.locate_files': [
    {
      id: 'TC-FS-LOCF-01',
      scenario: 'Locate file by exact filename',
      prompt: 'locate file named config.json',
      expectedTool: 'filesystem.locate_files',
      params: { name: 'config.json' },
      description: 'Fast OS index lookup for file name across filesystem.'
    },
    {
      id: 'TC-FS-LOCF-02',
      scenario: 'Locate package manifest file',
      prompt: 'locate package.json',
      expectedTool: 'filesystem.locate_files',
      params: { name: 'package.json' },
      description: 'Finds instances of package.json on disk.'
    }
  ],
  'filesystem.locate_folders': [
    {
      id: 'TC-FS-LOCD-01',
      scenario: 'Locate directory by folder name',
      prompt: 'locate folder named node_modules',
      expectedTool: 'filesystem.locate_folders',
      params: { name: 'node_modules' },
      description: 'Finds directory paths matching target folder name.'
    },
    {
      id: 'TC-FS-LOCD-02',
      scenario: 'Locate project folder',
      prompt: 'locate directory AI Terminal',
      expectedTool: 'filesystem.locate_folders',
      params: { name: 'AI Terminal' },
      description: 'Finds location of AI Terminal folder.'
    }
  ],
  'filesystem.read': [
    {
      id: 'TC-FS-READ-01',
      scenario: 'Read JSON configuration file',
      prompt: 'read content of package.json',
      expectedTool: 'filesystem.read',
      params: { path: 'package.json' },
      description: 'Safely reads text content from specified file path.'
    },
    {
      id: 'TC-FS-READ-02',
      scenario: 'Inspect markdown documentation',
      prompt: 'view README.md file',
      expectedTool: 'filesystem.read',
      params: { path: 'README.md' },
      description: 'Displays contents of project README.'
    }
  ],
  'filesystem.create': [
    {
      id: 'TC-FS-CREAT-01',
      scenario: 'Create a new text file',
      prompt: 'create a new file notes.txt',
      expectedTool: 'filesystem.create',
      params: { path: 'notes.txt' },
      description: 'Initializes a new empty file on disk.'
    },
    {
      id: 'TC-FS-CREAT-02',
      scenario: 'Create TypeScript file',
      prompt: 'create file src/types/CustomEvent.ts',
      expectedTool: 'filesystem.create',
      params: { path: 'src/types/CustomEvent.ts' },
      description: 'Creates new source code file.'
    }
  ],
  'filesystem.mkdir': [
    {
      id: 'TC-FS-MKDIR-01',
      scenario: 'Create directory in current workspace',
      prompt: 'create a folder called build_output',
      expectedTool: 'filesystem.mkdir',
      params: { path: 'build_output' },
      description: 'Creates new folder hierarchy on disk.'
    },
    {
      id: 'TC-FS-MKDIR-02',
      scenario: 'Create nested components directory',
      prompt: 'mkdir src/components/modals',
      expectedTool: 'filesystem.mkdir',
      params: { path: 'src/components/modals' },
      description: 'Recursively creates nested directory structure.'
    }
  ],
  'filesystem.copy': [
    {
      id: 'TC-FS-COPY-01',
      scenario: 'Copy file to backup destination',
      prompt: 'copy config.json to config.bak',
      expectedTool: 'filesystem.copy',
      params: { source: 'config.json', destination: 'config.bak' },
      description: 'Copies file preserving attributes.'
    },
    {
      id: 'TC-FS-COPY-02',
      scenario: 'Copy asset to public directory',
      prompt: 'copy ./assets/icon.png to ./public/icon.png',
      expectedTool: 'filesystem.copy',
      params: { source: './assets/icon.png', destination: './public/icon.png' },
      description: 'Transfers static asset file.'
    }
  ],
  'filesystem.move': [
    {
      id: 'TC-FS-MOVE-01',
      scenario: 'Move file to documents folder',
      prompt: 'move draft.md to ~/Documents/draft.md',
      expectedTool: 'filesystem.move',
      params: { source: 'draft.md', destination: '~/Documents/draft.md' },
      description: 'Relocates file from source to target path.'
    },
    {
      id: 'TC-FS-MOVE-02',
      scenario: 'Move build artifact to Desktop',
      prompt: 'move ./dist/bundle.js to ~/Desktop/bundle.js',
      expectedTool: 'filesystem.move',
      params: { source: './dist/bundle.js', destination: '~/Desktop/bundle.js' },
      description: 'Moves compiled artifact.'
    }
  ],
  'filesystem.rename': [
    {
      id: 'TC-FS-REN-01',
      scenario: 'Rename file in same folder',
      prompt: 'rename old_index.html to index.html',
      expectedTool: 'filesystem.rename',
      params: { path: 'old_index.html', newName: 'index.html' },
      description: 'Renames existing file.'
    },
    {
      id: 'TC-FS-REN-02',
      scenario: 'Rename directory',
      prompt: 'rename directory temp_cache to archive_cache',
      expectedTool: 'filesystem.rename',
      params: { path: 'temp_cache', newName: 'archive_cache' },
      description: 'Renames target directory.'
    }
  ],
  'filesystem.duplicate': [
    {
      id: 'TC-FS-DUP-01',
      scenario: 'Duplicate environment config template',
      prompt: 'duplicate .env.example',
      expectedTool: 'filesystem.duplicate',
      params: { path: '.env.example' },
      description: 'Creates duplicate copy of configuration template.'
    },
    {
      id: 'TC-FS-DUP-02',
      scenario: 'Duplicate test spec file',
      prompt: 'duplicate test_spec.ts',
      expectedTool: 'filesystem.duplicate',
      params: { path: 'test_spec.ts' },
      description: 'Generates immediate duplicate copy.'
    }
  ],
  'filesystem.delete': [
    {
      id: 'TC-FS-DEL-01',
      scenario: 'Permanently delete temp file',
      prompt: 'permanently delete scratch/temp_cache.log',
      expectedTool: 'filesystem.delete',
      params: { path: 'scratch/temp_cache.log' },
      description: 'Permanently deletes file from disk without sending to Trash.'
    },
    {
      id: 'TC-FS-DEL-02',
      scenario: 'Delete temporary lock file',
      prompt: 'delete lock.tmp',
      expectedTool: 'filesystem.delete',
      params: { path: 'lock.tmp' },
      description: 'Removes target file directly.'
    }
  ],
  'filesystem.trash': [
    {
      id: 'TC-FS-TRASH-01',
      scenario: 'Move file safely to system Trash',
      prompt: 'move obsolete_report.pdf to trash',
      expectedTool: 'filesystem.trash',
      params: { path: 'obsolete_report.pdf' },
      description: 'Safely moves target file into macOS system Trash.'
    },
    {
      id: 'TC-FS-TRASH-02',
      scenario: 'Trash unused folder',
      prompt: 'trash unused_dir',
      expectedTool: 'filesystem.trash',
      params: { path: 'unused_dir' },
      description: 'Recycles folder into system trash.'
    }
  ],
  'filesystem.restore': [
    {
      id: 'TC-FS-REST-01',
      scenario: 'Restore deleted file from system Trash',
      prompt: 'restore important_notes.txt from trash',
      expectedTool: 'filesystem.restore',
      params: { name: 'important_notes.txt' },
      description: 'Restores file from Trash back to its original directory location.'
    },
    {
      id: 'TC-FS-REST-02',
      scenario: 'Undelete document',
      prompt: 'undelete presentation.key',
      expectedTool: 'filesystem.restore',
      params: { name: 'presentation.key' },
      description: 'Recovers deleted presentation from Trash.'
    }
  ],
  'filesystem.compress': [
    {
      id: 'TC-FS-COMP-01',
      scenario: 'Compress folder into zip archive',
      prompt: 'compress dist folder into dist.zip',
      expectedTool: 'filesystem.compress',
      params: { source: 'dist', archiveName: 'dist.zip' },
      description: 'Compresses folder into standard zip archive.'
    },
    {
      id: 'TC-FS-COMP-02',
      scenario: 'Archive directory to tarball',
      prompt: 'archive src to backup.tar.gz',
      expectedTool: 'filesystem.compress',
      params: { source: 'src', archiveName: 'backup.tar.gz' },
      description: 'Creates gzip compressed tar archive.'
    }
  ],
  'filesystem.extract': [
    {
      id: 'TC-FS-EXT-01',
      scenario: 'Extract zip archive',
      prompt: 'extract bundle.zip archive',
      expectedTool: 'filesystem.extract',
      params: { archivePath: 'bundle.zip' },
      description: 'Extracts archive contents into current directory.'
    },
    {
      id: 'TC-FS-EXT-02',
      scenario: 'Unpack tar.gz archive',
      prompt: 'unzip vendor_libs.tar.gz',
      expectedTool: 'filesystem.extract',
      params: { archivePath: 'vendor_libs.tar.gz' },
      description: 'Unpacks compressed archive.'
    }
  ],
  'filesystem.grep': [
    {
      id: 'TC-FS-GREP-01',
      scenario: 'Search for text pattern in source directory',
      prompt: 'search for pattern TODO in src',
      expectedTool: 'filesystem.grep',
      params: { path: 'src', query: 'TODO' },
      description: 'Searches inside text files for matching regex or literal string.'
    },
    {
      id: 'TC-FS-GREP-02',
      scenario: 'Grep for configuration constant',
      prompt: 'grep for API_KEY in config',
      expectedTool: 'filesystem.grep',
      params: { path: 'config', query: 'API_KEY' },
      description: 'Finds occurrences of API_KEY in config files.'
    }
  ],
  'filesystem.permissions': [
    {
      id: 'TC-FS-PERM-01',
      scenario: 'Inspect file permissions',
      prompt: 'check permissions of deploy.sh',
      expectedTool: 'filesystem.permissions',
      params: { path: 'deploy.sh' },
      description: 'Queries POSIX read/write/execute file permissions.'
    },
    {
      id: 'TC-FS-PERM-02',
      scenario: 'Make script executable',
      prompt: 'make script run_test.sh executable',
      expectedTool: 'filesystem.permissions',
      params: { path: 'run_test.sh' },
      description: 'Applies executable mode bits to script file.'
    }
  ],
  'filesystem.disk_usage': [
    {
      id: 'TC-FS-DU-01',
      scenario: 'Check disk usage of current workspace',
      prompt: 'check disk usage here',
      expectedTool: 'filesystem.disk_usage',
      params: {},
      description: 'Calculates cumulative directory sizes and block allocations.'
    },
    {
      id: 'TC-FS-DU-02',
      scenario: 'Check node_modules size',
      prompt: 'how much disk space is node_modules taking up?',
      expectedTool: 'filesystem.disk_usage',
      params: {},
      description: 'Evaluates folder footprint.'
    }
  ],
  'filesystem.recent_files': [
    {
      id: 'TC-FS-REC-01',
      scenario: 'Query recently modified files',
      prompt: 'show recently modified files',
      expectedTool: 'filesystem.recent_files',
      params: {},
      description: 'Retrieves files created or modified recently.'
    },
    {
      id: 'TC-FS-REC-02',
      scenario: 'Check files modified today',
      prompt: 'search for logs modified today',
      expectedTool: 'filesystem.recent_files',
      params: {},
      description: 'Inspects mtime timestamps across workspace.'
    }
  ],

  // === APPLICATION ===
  'application.open': [
    {
      id: 'TC-APP-OPEN-01',
      scenario: 'Open desktop web browser',
      prompt: 'open Safari',
      expectedTool: 'application.open',
      params: { app: 'Safari' },
      description: 'Launches native Safari browser application.'
    },
    {
      id: 'TC-APP-OPEN-02',
      scenario: 'Launch code editor',
      prompt: 'launch Visual Studio Code',
      expectedTool: 'application.open',
      params: { app: 'Visual Studio Code' },
      description: 'Launches VS Code editor.'
    },
    {
      id: 'TC-APP-OPEN-03',
      scenario: 'Open communication app',
      prompt: 'open Slack',
      expectedTool: 'application.open',
      params: { app: 'Slack' },
      description: 'Opens Slack application.'
    }
  ],
  'application.close': [
    {
      id: 'TC-APP-CLOSE-01',
      scenario: 'Gracefully close application',
      prompt: 'close Spotify',
      expectedTool: 'application.close',
      params: { app: 'Spotify' },
      description: 'Requests clean termination of Spotify.'
    },
    {
      id: 'TC-APP-CLOSE-02',
      scenario: 'Quit desktop client',
      prompt: 'quit Telegram',
      expectedTool: 'application.close',
      params: { app: 'Telegram' },
      description: 'Quits Telegram application.'
    }
  ],
  'application.force_quit': [
    {
      id: 'TC-APP-FQ-01',
      scenario: 'Force quit unresponsive application',
      prompt: 'force quit Discord',
      expectedTool: 'application.force_quit',
      params: { app: 'Discord' },
      description: 'Instantly terminates unresponsive Discord process.'
    },
    {
      id: 'TC-APP-FQ-02',
      scenario: 'Force close frozen browser',
      prompt: 'force close Chrome',
      expectedTool: 'application.force_quit',
      params: { app: 'Chrome' },
      description: 'Sends SIGKILL equivalent to frozen application.'
    }
  ],
  'application.list_running': [
    {
      id: 'TC-APP-LIST-01',
      scenario: 'List all running GUI applications',
      prompt: 'list running applications',
      expectedTool: 'application.list_running',
      params: {},
      description: 'Lists all actively running desktop GUI apps.'
    },
    {
      id: 'TC-APP-LIST-02',
      scenario: 'Check what apps are active',
      prompt: 'what apps are open right now?',
      expectedTool: 'application.list_running',
      params: {},
      description: 'Inspects macOS WindowServer / LaunchServices running apps.'
    }
  ],
  'application.focus': [
    {
      id: 'TC-APP-FOC-01',
      scenario: 'Focus application window to foreground',
      prompt: 'focus Cursor window',
      expectedTool: 'application.focus',
      params: { app: 'Cursor' },
      description: 'Brings Cursor IDE to the active foreground screen.'
    },
    {
      id: 'TC-APP-FOC-02',
      scenario: 'Bring Terminal to front',
      prompt: 'bring Terminal to front',
      expectedTool: 'application.focus',
      params: { app: 'Terminal' },
      description: 'Activates Terminal window focus.'
    }
  ],
  'application.maximize': [
    {
      id: 'TC-APP-MAX-01',
      scenario: 'Maximize application window',
      prompt: 'maximize Safari window',
      expectedTool: 'application.maximize',
      params: { app: 'Safari' },
      description: 'Maximizes or full-screens application window.'
    },
    {
      id: 'TC-APP-MAX-02',
      scenario: 'Full screen code editor',
      prompt: 'put VS Code in full screen',
      expectedTool: 'application.maximize',
      params: { app: 'VS Code' },
      description: 'Expands window to fill desktop workspace.'
    }
  ],
  'application.minimize': [
    {
      id: 'TC-APP-MIN-01',
      scenario: 'Minimize application window to dock',
      prompt: 'minimize Slack window',
      expectedTool: 'application.minimize',
      params: { app: 'Slack' },
      description: 'Minimizes window to OS taskbar or dock.'
    },
    {
      id: 'TC-APP-MIN-02',
      scenario: 'Minimize audio player',
      prompt: 'minimize Spotify',
      expectedTool: 'application.minimize',
      params: { app: 'Spotify' },
      description: 'Hides Spotify window from viewport.'
    }
  ],
  'application.install': [
    {
      id: 'TC-APP-INST-01',
      scenario: 'Install CLI tool via package manager',
      prompt: 'install htop via brew',
      expectedTool: 'application.install',
      params: { package: 'htop' },
      description: 'Installs package via system package manager (Homebrew).'
    },
    {
      id: 'TC-APP-INST-02',
      scenario: 'Install utility package',
      prompt: 'install ripgrep',
      expectedTool: 'application.install',
      params: { package: 'ripgrep' },
      description: 'Installs command-line package.'
    }
  ],
  'application.uninstall': [
    {
      id: 'TC-APP-UNINST-01',
      scenario: 'Uninstall application package',
      prompt: 'uninstall package wget',
      expectedTool: 'application.uninstall',
      params: { package: 'wget' },
      description: 'Removes installed software package.'
    },
    {
      id: 'TC-APP-UNINST-02',
      scenario: 'Remove CLI tool',
      prompt: 'remove package tree',
      expectedTool: 'application.uninstall',
      params: { package: 'tree' },
      description: 'Uninstalls utility package from OS.'
    }
  ],
  'application.update': [
    {
      id: 'TC-APP-UPD-01',
      scenario: 'Update desktop application',
      prompt: 'update Brave browser',
      expectedTool: 'application.update',
      params: { app: 'Brave Browser' },
      description: 'Checks and updates application to latest version.'
    },
    {
      id: 'TC-APP-UPD-02',
      scenario: 'Update developer tool',
      prompt: 'check updates for Docker Desktop',
      expectedTool: 'application.update',
      params: { app: 'Docker Desktop' },
      description: 'Triggers update check and upgrade workflow.'
    }
  ],

  // === BROWSER ===
  'browser.navigate': [
    {
      id: 'TC-BRW-NAV-01',
      scenario: 'Navigate browser to web URL',
      prompt: 'open youtube.com in safari',
      expectedTool: 'browser.navigate',
      params: { url: 'youtube.com' },
      description: 'Launches default browser and navigates to target URL.'
    },
    {
      id: 'TC-BRW-NAV-02',
      scenario: 'Navigate to GitHub trending page',
      prompt: 'navigate to https://github.com/trending',
      expectedTool: 'browser.navigate',
      params: { url: 'https://github.com/trending' },
      description: 'Opens trending repositories page in browser.'
    }
  ],
  'browser.search': [
    {
      id: 'TC-BRW-SRCH-01',
      scenario: 'Search technical topic on the web',
      prompt: 'search the web for Rust ownership',
      expectedTool: 'browser.search',
      params: { query: 'Rust ownership' },
      description: 'Launches web search query in system browser.'
    },
    {
      id: 'TC-BRW-SRCH-02',
      scenario: 'Search documentation online',
      prompt: 'google latest TypeScript 5.5 release notes',
      expectedTool: 'browser.search',
      params: { query: 'latest TypeScript 5.5 release notes' },
      description: 'Performs web search for release documentation.'
    }
  ],
  'browser.new_tab': [
    {
      id: 'TC-BRW-TAB-01',
      scenario: 'Open a new empty browser tab',
      prompt: 'open a new browser tab',
      expectedTool: 'browser.new_tab',
      params: {},
      description: 'Creates new tab in active browser.'
    },
    {
      id: 'TC-BRW-TAB-02',
      scenario: 'Open new tab shorthand',
      prompt: 'new tab in chrome',
      expectedTool: 'browser.new_tab',
      params: {},
      description: 'Spawns blank tab in browser window.'
    }
  ],
  'browser.close_tabs': [
    {
      id: 'TC-BRW-CLTAB-01',
      scenario: 'Close active browser tab',
      prompt: 'close browser tab',
      expectedTool: 'browser.close_tabs',
      params: {},
      description: 'Closes active browser tab.'
    },
    {
      id: 'TC-BRW-CLTAB-02',
      scenario: 'Close open browser tabs',
      prompt: 'close open tabs in browser',
      expectedTool: 'browser.close_tabs',
      params: {},
      description: 'Closes target tab sessions.'
    }
  ],
  'browser.reload': [
    {
      id: 'TC-BRW-REL-01',
      scenario: 'Reload current webpage',
      prompt: 'reload the current web page',
      expectedTool: 'browser.reload',
      params: {},
      description: 'Refreshes the active web page in the browser.'
    },
    {
      id: 'TC-BRW-REL-02',
      scenario: 'Refresh active tab',
      prompt: 'refresh browser tab',
      expectedTool: 'browser.reload',
      params: {},
      description: 'Re-fetches page contents.'
    }
  ],
  'browser.history': [
    {
      id: 'TC-BRW-HIST-01',
      scenario: 'Query recent browser history',
      prompt: 'show recent browser history',
      expectedTool: 'browser.history',
      params: {},
      description: 'Searches recent web browsing history entries.'
    },
    {
      id: 'TC-BRW-HIST-02',
      scenario: 'Check today visited sites',
      prompt: 'what websites did I visit today?',
      expectedTool: 'browser.history',
      params: {},
      description: 'Queries browsing history database.'
    }
  ],
  'browser.bookmarks': [
    {
      id: 'TC-BRW-BM-01',
      scenario: 'List browser bookmarks',
      prompt: 'list my browser bookmarks',
      expectedTool: 'browser.bookmarks',
      params: {},
      description: 'Displays user saved bookmark links and favorites.'
    },
    {
      id: 'TC-BRW-BM-02',
      scenario: 'Inspect saved links',
      prompt: 'show saved bookmarks',
      expectedTool: 'browser.bookmarks',
      params: {},
      description: 'Retrieves bookmark hierarchy.'
    }
  ],
  'browser.downloads': [
    {
      id: 'TC-BRW-DL-01',
      scenario: 'Check recent browser downloads',
      prompt: 'check recent browser downloads',
      expectedTool: 'browser.downloads',
      params: {},
      description: 'Lists files recently downloaded via web browser.'
    },
    {
      id: 'TC-BRW-DL-02',
      scenario: 'Show downloaded files',
      prompt: 'show files downloaded from browser',
      expectedTool: 'browser.downloads',
      params: {},
      description: 'Queries download history log.'
    }
  ],

  // === GIT ===
  'git.status': [
    {
      id: 'TC-GIT-STAT-01',
      scenario: 'Check git working tree status',
      prompt: 'git status',
      expectedTool: 'git.status',
      params: {},
      description: 'Inspects active branch, staged changes, and modified files.'
    },
    {
      id: 'TC-GIT-STAT-02',
      scenario: 'Check modified files and branch',
      prompt: 'check git status and recent changes',
      expectedTool: 'git.status',
      params: {},
      description: 'Returns working directory cleanliness report.'
    }
  ],
  'git.log': [
    {
      id: 'TC-GIT-LOG-01',
      scenario: 'Inspect recent git commit history',
      prompt: 'show recent git commits',
      expectedTool: 'git.log',
      params: {},
      description: 'Displays recent commit log entries, hashes, and authorship.'
    },
    {
      id: 'TC-GIT-LOG-02',
      scenario: 'Show commit log',
      prompt: 'git log',
      expectedTool: 'git.log',
      params: {},
      description: 'Inspects repository commit graph.'
    }
  ],
  'git.diff': [
    {
      id: 'TC-GIT-DIFF-01',
      scenario: 'View unstaged working tree diff',
      prompt: 'view git diff for unstaged changes',
      expectedTool: 'git.diff',
      params: {},
      description: 'Displays line modifications across working tree.'
    },
    {
      id: 'TC-GIT-DIFF-02',
      scenario: 'Show workspace modifications',
      prompt: 'show git diff',
      expectedTool: 'git.diff',
      params: {},
      description: 'Compares active edits against git index.'
    }
  ],
  'git.branch': [
    {
      id: 'TC-GIT-BR-01',
      scenario: 'List repository git branches',
      prompt: 'list all git branches',
      expectedTool: 'git.branch',
      params: {},
      description: 'Lists local and tracked remote branches.'
    },
    {
      id: 'TC-GIT-BR-02',
      scenario: 'Show active branch name',
      prompt: 'what git branch am I on?',
      expectedTool: 'git.branch',
      params: {},
      description: 'Identifies current HEAD branch.'
    }
  ],
  'git.checkout': [
    {
      id: 'TC-GIT-CO-01',
      scenario: 'Switch to feature branch',
      prompt: 'switch to branch feature/bluetooth-tools',
      expectedTool: 'git.checkout',
      params: { target: 'feature/bluetooth-tools' },
      description: 'Switches repository working tree to designated branch.'
    },
    {
      id: 'TC-GIT-CO-02',
      scenario: 'Checkout main branch',
      prompt: 'checkout main',
      expectedTool: 'git.checkout',
      params: { target: 'main' },
      description: 'Switches HEAD to main branch.'
    }
  ],
  'git.commit': [
    {
      id: 'TC-GIT-CI-01',
      scenario: 'Record git commit with message',
      prompt: 'commit changes with message "feat: add bluetooth testing suite"',
      expectedTool: 'git.commit',
      params: { message: 'feat: add bluetooth testing suite' },
      description: 'Stages modified files and records commit with message.'
    },
    {
      id: 'TC-GIT-CI-02',
      scenario: 'Git commit with bug fix summary',
      prompt: 'commit changes with message "fix: handle empty parameter schema"',
      expectedTool: 'git.commit',
      params: { message: 'fix: handle empty parameter schema' },
      description: 'Creates version commit.'
    }
  ],
  'git.pull': [
    {
      id: 'TC-GIT-PULL-01',
      scenario: 'Pull remote changes from upstream',
      prompt: 'pull remote git changes',
      expectedTool: 'git.pull',
      params: {},
      description: 'Fetches and merges remote commits into active branch.'
    },
    {
      id: 'TC-GIT-PULL-02',
      scenario: 'Git pull from origin',
      prompt: 'git pull origin main',
      expectedTool: 'git.pull',
      params: {},
      description: 'Synchronizes local branch with remote repository.'
    }
  ],
  'git.push': [
    {
      id: 'TC-GIT-PUSH-01',
      scenario: 'Push commits to origin',
      prompt: 'push git commits to origin',
      expectedTool: 'git.push',
      params: {},
      description: 'Pushes local commits upstream to remote origin.'
    },
    {
      id: 'TC-GIT-PUSH-02',
      scenario: 'Git push current branch',
      prompt: 'git push',
      expectedTool: 'git.push',
      params: {},
      description: 'Publishes local commits.'
    }
  ],
  'git.stash': [
    {
      id: 'TC-GIT-STASH-01',
      scenario: 'Stash uncommitted changes',
      prompt: 'stash workspace modifications',
      expectedTool: 'git.stash',
      params: {},
      description: 'Temporarily stashes dirty working tree changes.'
    },
    {
      id: 'TC-GIT-STASH-02',
      scenario: 'Git stash working directory',
      prompt: 'git stash save "wip before merge"',
      expectedTool: 'git.stash',
      params: {},
      description: 'Safeguards pending changes into stash stack.'
    }
  ],
  'git.merge': [
    {
      id: 'TC-GIT-MRG-01',
      scenario: 'Merge source branch into current',
      prompt: 'merge branch develop into current branch',
      expectedTool: 'git.merge',
      params: { branch: 'develop' },
      description: 'Merges commit history from develop into active branch.'
    },
    {
      id: 'TC-GIT-MRG-02',
      scenario: 'Merge staging branch',
      prompt: 'git merge staging',
      expectedTool: 'git.merge',
      params: { branch: 'staging' },
      description: 'Executes git merge with staging.'
    }
  ],
  'git.clone': [
    {
      id: 'TC-GIT-CLONE-01',
      scenario: 'Clone remote git repository',
      prompt: 'clone git repo https://github.com/facebook/react.git',
      expectedTool: 'git.clone',
      params: { url: 'https://github.com/facebook/react.git' },
      description: 'Clones remote repository into local directory.'
    },
    {
      id: 'TC-GIT-CLONE-02',
      scenario: 'Clone repository via SSH URL',
      prompt: 'clone repo git@github.com:torvalds/linux.git',
      expectedTool: 'git.clone',
      params: { url: 'git@github.com:torvalds/linux.git' },
      description: 'Clones repository via secure shell address.'
    }
  ],

  // === DEVELOPER ===
  'developer.vscode': [
    {
      id: 'TC-DEV-VSC-01',
      scenario: 'Open project in Visual Studio Code',
      prompt: 'open current project in VS Code',
      expectedTool: 'developer.vscode',
      params: {},
      description: 'Launches VS Code IDE editor on workspace directory.'
    },
    {
      id: 'TC-DEV-VSC-02',
      scenario: 'Launch code editor here',
      prompt: 'open vscode here',
      expectedTool: 'developer.vscode',
      params: {},
      description: 'Opens VS Code targeting current directory.'
    }
  ],
  'developer.cursor': [
    {
      id: 'TC-DEV-CURS-01',
      scenario: 'Open workspace in Cursor AI IDE',
      prompt: 'open in Cursor AI IDE',
      expectedTool: 'developer.cursor',
      params: {},
      description: 'Launches Cursor AI Code Editor targeting current workspace.'
    },
    {
      id: 'TC-DEV-CURS-02',
      scenario: 'Launch cursor editor',
      prompt: 'open cursor',
      expectedTool: 'developer.cursor',
      params: {},
      description: 'Opens Cursor application window.'
    }
  ],
  'developer.xcode': [
    {
      id: 'TC-DEV-XC-01',
      scenario: 'Open project in Apple Xcode IDE',
      prompt: 'open in Apple Xcode IDE',
      expectedTool: 'developer.xcode',
      params: {},
      description: 'Opens Xcode workspace or project bundle.'
    },
    {
      id: 'TC-DEV-XC-02',
      scenario: 'Launch Xcode for iOS app',
      prompt: 'launch xcode',
      expectedTool: 'developer.xcode',
      params: {},
      description: 'Spawns Apple Xcode developer environment.'
    }
  ],
  'developer.android_studio': [
    {
      id: 'TC-DEV-AS-01',
      scenario: 'Open project in Android Studio',
      prompt: 'open in Android Studio',
      expectedTool: 'developer.android_studio',
      params: {},
      description: 'Launches Google Android Studio IDE environment.'
    },
    {
      id: 'TC-DEV-AS-02',
      scenario: 'Launch Android developer tools',
      prompt: 'start android studio',
      expectedTool: 'developer.android_studio',
      params: {},
      description: 'Initializes Android Studio IDE.'
    }
  ],
  'developer.terminal': [
    {
      id: 'TC-DEV-TERM-01',
      scenario: 'Launch standalone native terminal window',
      prompt: 'launch standalone terminal',
      expectedTool: 'developer.terminal',
      params: {},
      description: 'Spawns new native GUI Terminal emulator window.'
    },
    {
      id: 'TC-DEV-TERM-02',
      scenario: 'Open separate terminal window',
      prompt: 'open native terminal app',
      expectedTool: 'developer.terminal',
      params: {},
      description: 'Launches macOS Terminal.app.'
    }
  ],
  'developer.github': [
    {
      id: 'TC-DEV-GH-01',
      scenario: 'List pull requests via GitHub CLI',
      prompt: 'interact with GitHub CLI pr list',
      expectedTool: 'developer.github',
      params: { command: 'pr list' },
      description: 'Executes GitHub repository workflows via official gh CLI.'
    },
    {
      id: 'TC-DEV-GH-02',
      scenario: 'View repository status via gh',
      prompt: 'gh repo status',
      expectedTool: 'developer.github',
      params: { command: 'repo status' },
      description: 'Executes gh repo status check.'
    }
  ],
  'developer.ssh': [
    {
      id: 'TC-DEV-SSH-01',
      scenario: 'Connect to remote host via SSH',
      prompt: 'connect via SSH to dev@192.168.1.50',
      expectedTool: 'developer.ssh',
      params: { target: 'dev@192.168.1.50' },
      description: 'Establishes secure shell remote terminal session.'
    },
    {
      id: 'TC-DEV-SSH-02',
      scenario: 'SSH to server with username',
      prompt: 'ssh ubuntu@staging.internal.net',
      expectedTool: 'developer.ssh',
      params: { target: 'ubuntu@staging.internal.net' },
      description: 'Connects to remote server over SSH.'
    }
  ],
  'developer.scaffold': [
    {
      id: 'TC-DEV-SCAF-01',
      scenario: 'Scaffold full-stack project with Next.js and Django',
      prompt: 'make a folder and initialize a frontend with next project and backend with python django',
      expectedTool: 'developer.scaffold',
      params: { projectName: 'my_project', frontend: 'nextjs', backend: 'django' },
      description: 'Scaffolds full-stack application architecture with Next.js and Django.'
    },
    {
      id: 'TC-DEV-SCAF-02',
      scenario: 'Scaffold React and Express project',
      prompt: 'scaffold a project named dashboard with react and express',
      expectedTool: 'developer.scaffold',
      params: { projectName: 'dashboard', frontend: 'react', backend: 'express' },
      description: 'Generates client and server boilerplate.'
    }
  ],

  // === DOCKER ===
  'docker.ps': [
    {
      id: 'TC-DKR-PS-01',
      scenario: 'List running Docker containers',
      prompt: 'list running Docker containers',
      expectedTool: 'docker.ps',
      params: {},
      description: 'Lists running and stopped Docker container instances.'
    },
    {
      id: 'TC-DKR-PS-02',
      scenario: 'Check active container status',
      prompt: 'show docker containers',
      expectedTool: 'docker.ps',
      params: {},
      description: 'Queries docker daemon for active container IDs.'
    }
  ],
  'docker.images': [
    {
      id: 'TC-DKR-IMG-01',
      scenario: 'List cached Docker images',
      prompt: 'list cached Docker images',
      expectedTool: 'docker.images',
      params: {},
      description: 'Lists local cached Docker container images, tags, and sizes.'
    },
    {
      id: 'TC-DKR-IMG-02',
      scenario: 'Show docker image repository',
      prompt: 'show docker images on machine',
      expectedTool: 'docker.images',
      params: {},
      description: 'Inspects image registry cache.'
    }
  ],
  'docker.compose_up': [
    {
      id: 'TC-DKR-CUP-01',
      scenario: 'Start Docker Compose services',
      prompt: 'start docker compose stack',
      expectedTool: 'docker.compose_up',
      params: {},
      description: 'Starts multi-container application services defined in docker-compose.yml.'
    },
    {
      id: 'TC-DKR-CUP-02',
      scenario: 'Docker compose up in background',
      prompt: 'docker-compose up -d',
      expectedTool: 'docker.compose_up',
      params: {},
      description: 'Spawns compose stack daemon containers.'
    }
  ],
  'docker.compose_down': [
    {
      id: 'TC-DKR-CDWN-01',
      scenario: 'Stop Docker Compose stack',
      prompt: 'stop docker compose stack',
      expectedTool: 'docker.compose_down',
      params: {},
      description: 'Stops and removes containers, networks, and volumes.'
    },
    {
      id: 'TC-DKR-CDWN-02',
      scenario: 'Tear down docker compose environment',
      prompt: 'docker-compose down',
      expectedTool: 'docker.compose_down',
      params: {},
      description: 'Gracefully cleans up compose network and containers.'
    }
  ],
  'docker.logs': [
    {
      id: 'TC-DKR-LOG-01',
      scenario: 'Retrieve logs for web API container',
      prompt: 'retrieve logs for container web-api',
      expectedTool: 'docker.logs',
      params: { container: 'web-api' },
      description: 'Retrieves stdout/stderr runtime logs from container.'
    },
    {
      id: 'TC-DKR-LOG-02',
      scenario: 'Inspect database container logs',
      prompt: 'show docker logs for postgres-db',
      expectedTool: 'docker.logs',
      params: { container: 'postgres-db' },
      description: 'Streams recent logs from PostgreSQL container.'
    }
  ],
  'docker.stop': [
    {
      id: 'TC-DKR-STOP-01',
      scenario: 'Stop running container',
      prompt: 'stop container redis-cache',
      expectedTool: 'docker.stop',
      params: { container: 'redis-cache' },
      description: 'Gracefully stops an actively running Docker container.'
    },
    {
      id: 'TC-DKR-STOP-02',
      scenario: 'Halt background worker container',
      prompt: 'docker stop worker-node-1',
      expectedTool: 'docker.stop',
      params: { container: 'worker-node-1' },
      description: 'Sends SIGTERM to stop target container.'
    }
  ],
  'docker.restart': [
    {
      id: 'TC-DKR-REST-01',
      scenario: 'Restart Docker container',
      prompt: 'restart container nginx-gateway',
      expectedTool: 'docker.restart',
      params: { container: 'nginx-gateway' },
      description: 'Restarts running or stopped Docker container.'
    },
    {
      id: 'TC-DKR-REST-02',
      scenario: 'Reboot backend service container',
      prompt: 'docker restart auth-service',
      expectedTool: 'docker.restart',
      params: { container: 'auth-service' },
      description: 'Cycles container lifecycle.'
    }
  ],
  'docker.exec': [
    {
      id: 'TC-DKR-EXEC-01',
      scenario: 'Execute command inside container',
      prompt: 'execute "uptime" inside container web-api',
      expectedTool: 'docker.exec',
      params: { container: 'web-api', command: 'uptime' },
      description: 'Executes command inside isolated container filesystem.'
    },
    {
      id: 'TC-DKR-EXEC-02',
      scenario: 'Run database migration inside container',
      prompt: 'docker exec backend-service npm run migrate',
      expectedTool: 'docker.exec',
      params: { container: 'backend-service', command: 'npm run migrate' },
      description: 'Executes process inside active container.'
    }
  ],

  // === NODE ===
  'node.npm_install': [
    {
      id: 'TC-NODE-NPMI-01',
      scenario: 'Install project NPM dependencies',
      prompt: 'install npm dependencies',
      expectedTool: 'node.npm_install',
      params: {},
      description: 'Installs package dependencies into node_modules.'
    },
    {
      id: 'TC-NODE-NPMI-02',
      scenario: 'Run npm install shorthand',
      prompt: 'run npm install',
      expectedTool: 'node.npm_install',
      params: {},
      description: 'Triggers npm package installation.'
    }
  ],
  'node.npm_run': [
    {
      id: 'TC-NODE-NPMR-01',
      scenario: 'Execute npm build script',
      prompt: 'run npm script "build"',
      expectedTool: 'node.npm_run',
      params: { script: 'build' },
      description: 'Runs build script defined in package.json.'
    },
    {
      id: 'TC-NODE-NPMR-02',
      scenario: 'Execute npm test suite',
      prompt: 'run npm script "test"',
      expectedTool: 'node.npm_run',
      params: { script: 'test' },
      description: 'Runs unit tests via npm test runner.'
    }
  ],
  'node.pnpm': [
    {
      id: 'TC-NODE-PNPM-01',
      scenario: 'Run pnpm install',
      prompt: 'run pnpm install',
      expectedTool: 'node.pnpm',
      params: { command: 'install' },
      description: 'Executes package installation via fast pnpm store.'
    },
    {
      id: 'TC-NODE-PNPM-02',
      scenario: 'Execute pnpm dev script',
      prompt: 'run pnpm dev',
      expectedTool: 'node.pnpm',
      params: { command: 'dev' },
      description: 'Starts local dev server via pnpm.'
    }
  ],
  'node.yarn': [
    {
      id: 'TC-NODE-YARN-01',
      scenario: 'Run yarn build',
      prompt: 'run yarn build',
      expectedTool: 'node.yarn',
      params: { command: 'build' },
      description: 'Executes package compilation with Yarn.'
    },
    {
      id: 'TC-NODE-YARN-02',
      scenario: 'Install packages via yarn',
      prompt: 'yarn install dependencies',
      expectedTool: 'node.yarn',
      params: { command: 'install' },
      description: 'Installs packages from yarn.lock.'
    }
  ],
  'node.bun': [
    {
      id: 'TC-NODE-BUN-01',
      scenario: 'Run unit test suite with Bun',
      prompt: 'run bun test',
      expectedTool: 'node.bun',
      params: { command: 'test' },
      description: 'Executes fast native tests via Bun runtime.'
    },
    {
      id: 'TC-NODE-BUN-02',
      scenario: 'Execute script with Bun runtime',
      prompt: 'run bun run index.ts',
      expectedTool: 'node.bun',
      params: { command: 'run index.ts' },
      description: 'Executes TypeScript directly using Bun.'
    }
  ],

  // === PYTHON ===
  'python.create_venv': [
    {
      id: 'TC-PY-VENV-01',
      scenario: 'Create Python virtual environment',
      prompt: 'create a Python virtual environment',
      expectedTool: 'python.create_venv',
      params: {},
      description: 'Creates isolated virtual environment (python3 -m venv) in workspace.'
    },
    {
      id: 'TC-PY-VENV-02',
      scenario: 'Initialize venv environment',
      prompt: 'setup python venv in current directory',
      expectedTool: 'python.create_venv',
      params: {},
      description: 'Initializes virtualenv sandbox.'
    }
  ],
  'python.pip_install': [
    {
      id: 'TC-PY-PIP-01',
      scenario: 'Install Python package via pip',
      prompt: 'install requests package using pip',
      expectedTool: 'python.pip_install',
      params: { package: 'requests' },
      description: 'Installs Python library dependency via pip.'
    },
    {
      id: 'TC-PY-PIP-02',
      scenario: 'Install data science libraries',
      prompt: 'pip install pandas numpy',
      expectedTool: 'python.pip_install',
      params: { package: 'pandas numpy' },
      description: 'Installs multiple Python wheels.'
    }
  ],
  'python.run_script': [
    {
      id: 'TC-PY-RUN-01',
      scenario: 'Execute Python script',
      prompt: 'run python script main.py',
      expectedTool: 'python.run_script',
      params: { script: 'main.py' },
      description: 'Executes Python 3 script file.'
    },
    {
      id: 'TC-PY-RUN-02',
      scenario: 'Run machine learning training script',
      prompt: 'run python script scripts/train_model.py',
      expectedTool: 'python.run_script',
      params: { script: 'scripts/train_model.py' },
      description: 'Executes target python module.'
    }
  ],
  'python.notebook': [
    {
      id: 'TC-PY-NB-01',
      scenario: 'Launch Jupyter Notebook server',
      prompt: 'launch Jupyter Notebook',
      expectedTool: 'python.notebook',
      params: {},
      description: 'Starts Jupyter Notebook interactive data science server.'
    },
    {
      id: 'TC-PY-NB-02',
      scenario: 'Start Jupyter Lab',
      prompt: 'start jupyter lab environment',
      expectedTool: 'python.notebook',
      params: {},
      description: 'Launches browser-based Jupyter Lab session.'
    }
  ],

  // === SHELL ===
  'shell.execute': [
    {
      id: 'TC-SH-EXEC-01',
      scenario: 'Compound shell pipeline command',
      prompt: 'show the current directory and its git branch',
      expectedTool: 'shell.execute',
      params: { command: 'pwd && git branch --show-current' },
      description: 'Executes compound shell command pipeline.'
    },
    {
      id: 'TC-SH-EXEC-02',
      scenario: 'Complex pipeline with find, sort, and head',
      prompt: 'find the ten largest files here',
      expectedTool: 'shell.execute',
      params: { command: 'find . -type f -print0 | xargs -0 du -h | sort -hr | head -10' },
      description: 'Runs disk analysis pipeline via native shell.'
    },
    {
      id: 'TC-SH-EXEC-03',
      scenario: 'System diagnostic compound command',
      prompt: 'run uptime && whoami',
      expectedTool: 'shell.execute',
      params: { command: 'uptime && whoami' },
      description: 'Executes chained command in zsh.'
    }
  ]
};

// Verify all 101 tools are represented in customCases
const missing = [];
for (const t of tools) {
  if (!customCases[t.id]) {
    missing.push(t.id);
  }
}
if (missing.length > 0) {
  console.error('Tools missing test cases:', missing);
  process.exit(1);
}

// Generate the Master JSON Dataset
const allTestCases = [];
for (const t of tools) {
  const cases = customCases[t.id] || [];
  for (const c of cases) {
    allTestCases.push({
      ...c,
      domain: t.domain,
      displayName: t.displayName,
      toolDescription: t.description,
      requiredParameters: t.requiredParams,
      optionalParameters: t.optionalParams
    });
  }
}

if (!fs.existsSync('tests')) fs.mkdirSync('tests', { recursive: true });
fs.writeFileSync('tests/tool_test_cases.json', JSON.stringify({
  version: '1.0.0',
  description: 'Cero AI Tool Calling Evaluation and Verification Suite',
  totalToolsCovered: tools.length,
  totalTestCases: allTestCases.length,
  domains: [...new Set(tools.map(t => t.domain))],
  testCases: allTestCases
}, null, 2));

console.log(`Generated tests/tool_test_cases.json with ${allTestCases.length} test cases across ${tools.length} tools.`);

// Now build the comprehensive Markdown documentation file: TOOL_TEST_CASES.md
const domainOrder = [
  'network',
  'system',
  'filesystem',
  'application',
  'browser',
  'git',
  'developer',
  'docker',
  'node',
  'python',
  'shell'
];

const domainTitles = {
  network: 'Network & Connectivity',
  system: 'System Health & Hardware Surveillance',
  filesystem: 'Filesystem Administration & Search',
  application: 'Desktop Application Lifecycle',
  browser: 'Web Browser Automation',
  git: 'Git Version Control',
  developer: 'Developer Environments & Tooling',
  docker: 'Docker Container Orchestration',
  node: 'Node.js & JavaScript Ecosystem',
  python: 'Python Runtime & Virtual Environments',
  shell: 'Shell & Compound Pipeline Execution'
};

const domainIcons = {
  network: '📡',
  system: '⚡',
  filesystem: '📁',
  application: '🖥️',
  browser: '🌐',
  git: '🌿',
  developer: '🛠️',
  docker: '🐳',
  node: '📦',
  python: '🐍',
  shell: '🐚'
};

let md = `# Cero — AI Tool Calling Comprehensive Test Suite

This document defines the complete **AI Tool Calling Test Suite** for Cero. It provides test cases for all **${tools.length} autonomous capabilities** currently supported across **${domainOrder.length} operational domains**.

Every capability includes real-world natural language prompts, expected JSON tool-call invocations, expected parameter schemas, and verification criteria.

> [!NOTE]
> **User Demonstration Examples Highlighted Below:**
> - **Turn Bluetooth On/Off**: \`network.bluetooth.on\` & \`network.bluetooth.off\`
> - **Connect Soundcore Space One Headphone**: \`network.bluetooth.connect\` (\`{"device": "soundcore space one headphone"}\`)
> - **Check Available Bluetooth Devices**: \`network.bluetooth.list\`
>
> All **${tools.length} capabilities** are fully covered below, with machine-readable automated test cases stored in [\`tests/tool_test_cases.json\`](file:///Users/dev/Project%20Folder/AI%20Terminal/tests/tool_test_cases.json).

---

## 📊 Capability Coverage Summary

| Domain | Capabilities | Test Cases | Example Scenarios |
| :--- | :---: | :---: | :--- |
`;

for (const d of domainOrder) {
  const domainTools = tools.filter(t => t.domain === d);
  const domainCases = allTestCases.filter(c => c.domain === d);
  const icon = domainIcons[d] || '🔧';
  const title = domainTitles[d] || d;
  const sample = domainTools.slice(0, 3).map(t => `\`${t.id}\``).join(', ');
  md += `| ${icon} **${title}** | **${domainTools.length}** | **${domainCases.length}** | ${sample} |\n`;
}

md += `| **TOTAL** | **${tools.length} Tools** | **${allTestCases.length} Test Cases** | **100% Operational Capability Coverage** |

---

## 🧠 Tool Calling Execution Model

When a user submits a prompt in Cero:
1. **Fast-Path Engine**: Evaluates high-frequency deterministic regex shortcuts (e.g., instant navigation \`cd\`, \`turn on bluetooth\`, \`system info\`) for sub-millisecond execution.
2. **ReAct Agent Loop (\`AgentLoop.ts\`)**: When complex or natural language objectives are supplied, the local LLM evaluates the system prompt containing registered tool definitions.
3. **Structured JSON Output**: The LLM emits a single tool execution action:
   \`\`\`json
   {
     "action": "tool",
     "tool": "<tool.id>",
     "params": { ... }
   }
   \`\`\`
4. **Execution Engine & Security Gate**: Invokes concrete TypeScript drivers in \`CapabilityRegistrySDK\`, verifies policy permissions, and returns structured data or command output back to the agent.
5. **Multi-Step Workflows**: If a task requires multiple steps (e.g., turn on Bluetooth $\\rightarrow$ scan $\\rightarrow$ connect), the loop feeds each result back to the model until \`{"action": "done"}\` is returned.

---
`;

for (const d of domainOrder) {
  const icon = domainIcons[d] || '🔧';
  const title = domainTitles[d] || d;
  const domainTools = tools.filter(t => t.domain === d);
  const domainCases = allTestCases.filter(c => c.domain === d);

  md += `\n## ${icon} ${title} (${domainTools.length} Tools · ${domainCases.length} Test Cases)\n\n`;

  for (const t of domainTools) {
    const tCases = domainCases.filter(c => c.expectedTool === t.id);
    const reqList = (t.requiredParams && t.requiredParams.length > 0)
      ? t.requiredParams.map(p => `\`${p.name}\` (${p.type})`).join(', ')
      : '_None_';
    const optList = (t.optionalParams && t.optionalParams.length > 0)
      ? t.optionalParams.map(p => `\`${p.name}\` (${p.type})`).join(', ')
      : '_None_';

    md += `### \`${t.id}\` — ${t.displayName}\n\n`;
    md += `> ${t.description}\n\n`;
    md += `- **Required Parameters**: ${reqList}\n`;
    md += `- **Optional Parameters**: ${optList}\n\n`;

    md += `| Test ID | Scenario | User Prompt | Expected Tool Call Payload | Expected Result |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    for (const c of tCases) {
      const jsonPayload = JSON.stringify({ action: 'tool', tool: c.expectedTool, params: c.params });
      md += `| \`${c.id}\` | **${c.scenario}** | \`${c.prompt}\` | \`${jsonPayload}\` | ${c.description} |\n`;
    }
    md += `\n`;
  }
}

md += `---

## 🔄 Multi-Step Autonomous Workflows

Cero's agent loop automatically decomposes complex multi-step objectives into sequences of tool calls:

### 🎧 Complete Bluetooth Connection Flow
1. **User Objective**: *"Connect my Soundcore Space One headphones"*
2. **Step 1 (Radio Activation)**: 
   \`\`\`json
   { "action": "tool", "tool": "network.bluetooth.on", "params": {} }
   \`\`\`
3. **Step 2 (Device Discovery)**:
   \`\`\`json
   { "action": "tool", "tool": "network.bluetooth.list", "params": {} }
   \`\`\`
4. **Step 3 (Peripheral Link)**:
   \`\`\`json
   { "action": "tool", "tool": "network.bluetooth.connect", "params": { "device": "Soundcore Space One" } }
   \`\`\`
5. **Step 4 (Agent Completion)**:
   \`\`\`json
   { "action": "done", "summary": "Successfully activated Bluetooth, discovered Soundcore Space One, and established wireless audio connection." }
   \`\`\`

### 🚀 Full-Stack Scaffolding & Git Init Flow
1. **User Objective**: *"Make a folder and initialize a frontend with next project and backend with python django"*
2. **Step 1 (Scaffold Project)**:
   \`\`\`json
   { "action": "tool", "tool": "developer.scaffold", "params": { "projectName": "my_project", "frontend": "nextjs", "backend": "django" } }
   \`\`\`
3. **Step 2 (Navigate to Directory)**:
   \`\`\`json
   { "action": "tool", "tool": "filesystem.navigate", "params": { "path": "./my_project" } }
   \`\`\`
4. **Step 3 (Inspect Git Status)**:
   \`\`\`json
   { "action": "tool", "tool": "git.status", "params": {} }
   \`\`\`

---

## 🧪 How to Execute & Verify These Test Cases

### 1. Interactive Terminal Verification
Type any test prompt verbatim directly into the Cero prompt:
\`\`\`bash
# Example:
connect soundcore space one headphone
check if any bluetooth device is available
turn off bluetooth
\`\`\`

### 2. Automated Programmatic Testing via Vitest
All test definitions in [\`tests/tool_test_cases.json\`](file:///Users/dev/Project%20Folder/AI%20Terminal/tests/tool_test_cases.json) can be validated with Vitest against \`AgentLoop\`:
\`\`\`bash
npx vitest run src/ai/agent/AgentLoop.test.ts
\`\`\`
`;

fs.writeFileSync('TOOL_TEST_CASES.md', md);
console.log('Successfully wrote TOOL_TEST_CASES.md with length:', md.length);
