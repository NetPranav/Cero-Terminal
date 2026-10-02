/**
 * AppLaunchParser.ts — Pure deterministic parser for application launch requests
 *
 * Maps phrases like "open firefox", "launch spotify", "start google chrome"
 * directly to application launch requests without invoking an LLM.
 */

export interface AppLaunchRequest {
  app: string;
  executable?: string;
  background: boolean;
}

// Known common application aliases and their executable binaries
const APP_BINARIES: Record<string, { macos: string; linux: string; windows: string }> = {
  'firefox': { macos: 'Firefox', linux: 'firefox', windows: 'firefox' },
  'chrome': { macos: 'Google Chrome', linux: 'google-chrome-stable || google-chrome || chromium', windows: 'chrome' },
  'google chrome': { macos: 'Google Chrome', linux: 'google-chrome-stable || google-chrome || chromium', windows: 'chrome' },
  'chromium': { macos: 'Chromium', linux: 'chromium', windows: 'chromium' },
  'brave': { macos: 'Brave Browser', linux: 'brave-browser', windows: 'brave' },
  'edge': { macos: 'Microsoft Edge', linux: 'microsoft-edge-stable', windows: 'msedge' },
  'safari': { macos: 'Safari', linux: '', windows: '' },
  'spotify': { macos: 'Spotify', linux: 'spotify', windows: 'spotify' },
  'discord': { macos: 'Discord', linux: 'discord', windows: 'Discord' },
  'slack': { macos: 'Slack', linux: 'slack', windows: 'slack' },
  'vlc': { macos: 'VLC', linux: 'vlc', windows: 'vlc' },
  'terminal': { macos: 'Terminal', linux: 'x-terminal-emulator || gnome-terminal || kitty || alacritty', windows: 'wt || powershell' },
  'calculator': { macos: 'Calculator', linux: 'gnome-calculator || kcalc || galculator', windows: 'calc' },
  'code': { macos: 'Visual Studio Code', linux: 'code || codium', windows: 'code' },
  'vscode': { macos: 'Visual Studio Code', linux: 'code || codium', windows: 'code' },
  'vs code': { macos: 'Visual Studio Code', linux: 'code || codium', windows: 'code' },
  'visual studio code': { macos: 'Visual Studio Code', linux: 'code || codium', windows: 'code' },
  'cursor': { macos: 'Cursor', linux: 'cursor', windows: 'cursor' },
  'sublime text': { macos: 'Sublime Text', linux: 'subl', windows: 'subl' },
  'sublime': { macos: 'Sublime Text', linux: 'subl', windows: 'subl' },
  'postman': { macos: 'Postman', linux: 'postman', windows: 'postman' },
  'obs': { macos: 'OBS', linux: 'obs', windows: 'obs64' }
};

const LAUNCH_VERBS = '(?:launch|open|start|run)';

export function parseAppLaunch(goal: string, os: string = 'linux'): AppLaunchRequest | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const cleaned = text.replace(/^(?:please\s+|can\s+you\s+|could\s+you\s+|hey\s+|kindly\s+|just\s+)+/i, '');

  // Exclude folder/file/url opens (those are handled by folder/file/browser parsers)
  if (/\b(?:folder|directory|file|project|repo|repository|url|link|http:\/\/|https:\/\/|www\.)\b/i.test(cleaned)) {
    return null;
  }

  // Exclude quit / close requests
  if (/\b(?:quit|close|stop|terminate|kill)\b/i.test(cleaned)) {
    return null;
  }

  // Exclude things that are not desktop applications: servers, terminal panes, services, ros pipelines, builds
  if (/\b(?:server|dev\s+server|web\s+server|local\s+server|ros2?|talker|listener|node|service|daemon|process|tab|pane|split|terminal|shell|session|workflow|queue|build|test)\b/i.test(cleaned)) {
    return null;
  }

  // Pattern: "launch <app>", "open <app>", "start <app>", "open the <app> app"
  const match = cleaned.match(
    new RegExp(`^${LAUNCH_VERBS}\\s+(?:the\\s+|my\\s+|an?\\s+)?["'\`]?([a-zA-Z0-9_\\-\\s]+?)["'\`]?(?:\\s+(?:app|application|program))?$`, 'i')
  );

  if (!match) return null;

  const rawName = match[1].trim().toLowerCase();
  if (!rawName || rawName.length > 50) return null;

  // Reserved internal words
  if (/^(?:settings|terminal|tab|pane|window|queue|flow|workflow)$/i.test(rawName)) {
    return null;
  }

  const binaryInfo = APP_BINARIES[rawName];
  const targetOs = os.toLowerCase().includes('darwin') || os.toLowerCase().includes('mac')
    ? 'macos'
    : os.toLowerCase().includes('win')
      ? 'windows'
      : 'linux';

  const executable = binaryInfo ? binaryInfo[targetOs] : rawName;

  return {
    app: rawName,
    executable: executable || rawName,
    background: true
  };
}
