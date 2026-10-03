/**
 * AppActions.ts — the app's own functions, by request.
 *
 * Most people never learn keyboard shortcuts, so "open settings", "show my command history",
 * "switch to zen mode", "search the terminal for ERROR" or "go to tab 2" work as plain requests.
 * Parsed without the model (the small local model would otherwise invent shell commands such as
 * `open -a "System Settings"`), then delivered to the window as a `cero:app-action` event
 * that App.tsx maps onto the same handlers the menus and shortcuts use.
 */

export type AppActionId =
  | 'settings' | 'settings_ai' | 'settings_integrations' | 'settings_terminal' | 'settings_general'
  | 'history' | 'find' | 'workflows' | 'shortcuts' | 'themes' | 'zen_mode' | 'visual_mode'
  | 'command_palette' | 'plugins' | 'model_manager' | 'onboarding'
  | 'close_tab' | 'close_pane' | 'focus_tab' | 'next_tab' | 'previous_tab' | 'rename_tab';

export interface AppAction {
  id: AppActionId;
  /** Text to search for (find) */
  query?: string;
  /** 1-based tab number (focus_tab) */
  tab?: number;
  /** New tab name (rename_tab) */
  name?: string;
  /** Pane the request came from (filled in by the caller) */
  paneId?: string;
}

/** What the user sees after the action ran */
export const APP_ACTION_DONE: Record<AppActionId, string> = {
  settings: 'Opened Settings.',
  settings_ai: 'Opened Settings: AI.',
  settings_integrations: 'Opened Settings: Integrations.',
  settings_terminal: 'Opened Settings: Terminal.',
  settings_general: 'Opened Settings: General.',
  history: 'Opened command history. Type to filter, Enter to run.',
  find: 'Opened search in this terminal.',
  workflows: 'Opened the Workflow Manager.',
  shortcuts: 'Opened the keyboard shortcuts.',
  themes: 'Opened themes and appearance.',
  zen_mode: 'Switched to Zen mode: controls appear on hover.',
  visual_mode: 'Switched to Visual mode: controls always shown.',
  command_palette: 'Opened the command palette.',
  plugins: 'Opened the plugin marketplace.',
  model_manager: 'Opened the built-in model manager.',
  onboarding: 'Opened the setup wizard.',
  close_tab: 'Closed the tab.',
  close_pane: 'Closed the pane.',
  focus_tab: 'Switched tab.',
  next_tab: 'Switched to the next tab.',
  previous_tab: 'Switched to the previous tab.',
  rename_tab: 'Renamed the tab.',
};

const OPEN = String.raw`(?:open|show|display|go\s+to|take\s+me\s+to|bring\s+up|launch|view)(?:\s+me)?`;
const WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 };
const unquote = (s: string) => s.trim().replace(/^["'`](.*)["'`]$/, '$1').trim();

export function parseAppAction(goal: string): AppAction | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const t = text.toLowerCase().replace(/^(?:please|can you|could you|pls)\s+/, '').replace(/\s+please$/, '');

  // Settings, by section
  let m = t.match(new RegExp(`^(?:${OPEN}\\s+)?(?:the\\s+)?(?:app\\s+|cero\\s+)?(?:(ai|model|llm|provider|integrations?|desktop\\s+integrations?|terminal|appearance|general)\\s+)?(?:settings|preferences|prefs)(?:\\s+page|\\s+screen)?(?:\\s+for\\s+(ai|the\\s+model|models?|integrations?|the\\s+terminal))?$`));
  if (m && (m[1] || m[2] || new RegExp(`^${OPEN}\\b`).test(t) || /^(?:settings|preferences)$/.test(t))) {
    const section = (m[1] || m[2] || '').replace(/^the\s+/, '');
    if (/^(?:ai|models?|llm|provider)$/.test(section)) return { id: 'settings_ai' };
    if (/integration/.test(section)) return { id: 'settings_integrations' };
    if (/terminal|appearance/.test(section)) return { id: 'settings_terminal' };
    if (/general/.test(section)) return { id: 'settings_general' };
    return { id: 'settings' };
  }
  if (/^(?:change|switch|pick|choose|select|set)\s+(?:the\s+|my\s+)?(?:ai\s+)?(?:model|llm|ai|provider|ai\s+provider)(?:\s+(?:you\s+use|used))?$/.test(t)) {
    return { id: 'settings_ai' };
  }

  // Command history
  if (new RegExp(`^(?:${OPEN}|search|browse)\\s+(?:me\\s+)?(?:my\\s+|the\\s+)?(?:command\\s+|shell\\s+|terminal\\s+)?history$`).test(t)
    || /^what\s+(?:commands\s+)?(?:did\s+i\s+run|have\s+i\s+run)(?:\s+(?:recently|before|earlier))?$/.test(t)) {
    return { id: 'history' };
  }

  // Search this terminal's output
  m = text.match(/^(?:search|find|look\s+for|highlight)\s+(?:in\s+)?(?:the\s+|this\s+)?(?:terminal|screen|output|scrollback|buffer)(?:\s+(?:output|text))?\s+for\s+(.+)$/i)
    || text.match(/^(?:find|search\s+for|look\s+for|highlight)\s+(.+?)\s+in\s+(?:the\s+|this\s+)?(?:terminal|output|scrollback|screen|buffer)(?:\s+output)?$/i);
  if (m) return { id: 'find', query: unquote(m[1]) };
  if (new RegExp(`^${OPEN}\\s+(?:the\\s+)?(?:terminal\\s+)?(?:search|find)(?:\\s+bar)?$`).test(t)) return { id: 'find' };

  // Workflows
  if (new RegExp(`^(?:${OPEN}|manage)\\s+(?:the\\s+|my\\s+)?(?:saved\\s+)?(?:workflows?|macros?)(?:\\s+(?:manager|list|editor))?$`).test(t)
    || /^(?:list|show)\s+(?:me\s+)?(?:all\s+)?(?:my\s+|the\s+)?saved\s+workflows$/.test(t)) {
    return { id: 'workflows' };
  }

  // Help and shortcuts
  if (/^(?:what\s+(?:are\s+)?(?:the\s+)?|which\s+|show\s+(?:me\s+)?(?:the\s+)?|list\s+(?:the\s+)?|open\s+(?:the\s+)?)(?:keyboard\s+)?(?:shortcuts|hotkeys|key\s*bindings)(?:\s+(?:are\s+there|exist|do\s+you\s+have))?$/.test(t)
    || /^(?:open\s+|show\s+)?(?:the\s+)?help(?:\s+screen|\s+page)?$/.test(t)) {
    return { id: 'shortcuts' };
  }

  // Appearance
  if (/^(?:change|switch|pick|choose|set|customi[sz]e|edit)\s+(?:the\s+|my\s+)?(?:colou?r\s+)?(?:theme|colou?rs|colou?r\s+scheme|appearance|look)$/.test(t)
    || new RegExp(`^(?:${OPEN}\\s+)?(?:the\\s+)?(?:themes?|theme\\s+picker|personali[sz]ation|personali[sz]e(?:\\s+the\\s+ui)?)$`).test(t)) {
    return { id: 'themes' };
  }
  m = t.match(/^(?:switch|change|go|turn|set)\s+(?:(?:on|to|into|back\s+to)\s+)?(zen|visual|minimal|classic)(?:\s+(?:mode|ui))?(?:\s+on)?$|^(?:enable|turn\s+on|use)\s+(zen|visual|minimal)(?:\s+(?:mode|ui))?$/);
  if (m) return { id: /zen|minimal/.test(m[1] || m[2]) ? 'zen_mode' : 'visual_mode' };

  // Other screens
  if (new RegExp(`^${OPEN}\\s+(?:the\\s+)?command\\s+palette$`).test(t)) return { id: 'command_palette' };
  if (new RegExp(`^(?:${OPEN}|browse)\\s+(?:the\\s+)?(?:plugins?|extensions?)(?:\\s+(?:marketplace|store))?$`).test(t)) return { id: 'plugins' };
  if (new RegExp(`^(?:${OPEN}|manage)\\s+(?:the\\s+)?(?:built[-\\s]?in|local|embedded)\\s+(?:ai\\s+)?model(?:\\s+manager)?$|^${OPEN}\\s+(?:the\\s+)?model\\s+manager$`).test(t)) {
    return { id: 'model_manager' };
  }
  if (/^(?:run|open|start|show|redo)\s+(?:the\s+)?(?:setup|onboarding|welcome)(?:\s+(?:wizard|screen))?(?:\s+again)?$/.test(t)) return { id: 'onboarding' };

  // Tabs and panes
  m = t.match(/^close\s+(?:this|the\s+current|the)\s+(tab|pane|split)$/);
  if (m) return { id: m[1] === 'tab' ? 'close_tab' : 'close_pane' };
  m = t.match(/^(?:go|switch|move|jump|change)\s+to\s+(?:the\s+)?(?:tab\s*#?(\d{1,2})|(first|second|third|fourth|fifth|last)\s+tab)$/);
  if (m) return { id: 'focus_tab', tab: m[1] ? Number(m[1]) : WORDS[m[2]] };
  if (/^(?:go\s+to\s+|switch\s+to\s+)?(?:the\s+)?next\s+tab$/.test(t)) return { id: 'next_tab' };
  if (/^(?:go\s+to\s+|switch\s+to\s+|go\s+back\s+to\s+)?(?:the\s+)?previous\s+tab$/.test(t)) return { id: 'previous_tab' };
  m = text.match(/^rename\s+(?:this|the\s+current|the)\s+tab\s+(?:to\s+|as\s+)?(.+)$/i) || text.match(/^(?:call|name)\s+this\s+tab\s+(.+)$/i);
  if (m && unquote(m[1])) return { id: 'rename_tab', name: unquote(m[1]).slice(0, 40) };

  return null;
}

/** Hand an action to the window (App.tsx). False outside the desktop app (CLI, tests). */
export function requestAppAction(action: AppAction): boolean {
  if (typeof window === 'undefined' || typeof (window as any).dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') {
    return false;
  }
  window.dispatchEvent(new CustomEvent('cero:app-action', { detail: action }));
  return true;
}
