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

// Known common application aliases and their Windows executables
const APP_BINARIES: Record<string, string> = {
  'firefox': 'firefox',
  'chrome': 'chrome',
  'google chrome': 'chrome',
  'chromium': 'chromium',
  'brave': 'brave',
  'edge': 'msedge',
  'spotify': 'spotify',
  'discord': 'Discord',
  'slack': 'slack',
  'vlc': 'vlc',
  'terminal': 'wt',
  'calculator': 'calc',
  'code': 'code',
  'vscode': 'code',
  'vs code': 'code',
  'visual studio code': 'code',
  'cursor': 'cursor',
  'sublime text': 'subl',
  'sublime': 'subl',
  'postman': 'postman',
  'obs': 'obs64'
};

const LAUNCH_VERBS = '(launch|open|start|run)';

export function parseAppLaunch(goal: string, _os: string = 'windows'): AppLaunchRequest | null {
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

  const verb = match[1].toLowerCase();
  const rawName = match[2].trim().toLowerCase();
  if (!rawName || rawName.length > 50) return null;

  // Reserved internal words
  if (/^(?:settings|terminal|tab|pane|window|queue|flow|workflow)$/i.test(rawName)) {
    return null;
  }

  const executable = APP_BINARIES[rawName];
  // "run echo hello" and "run sleep 30" are commands, not apps: "run" only means an app for a known one
  if (verb === 'run' && !executable) return null;

  return {
    app: rawName,
    executable: executable || rawName,
    background: true
  };
}
