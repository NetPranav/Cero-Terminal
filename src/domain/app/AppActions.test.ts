import { describe, it, expect } from 'vitest';
import { parseAppAction } from './AppActions';

describe('parseAppAction', () => {
  it.each([
    ['open settings', 'settings'],
    ['show me the settings', 'settings'],
    ['preferences', 'settings'],
    ['open ai settings', 'settings_ai'],
    ['change the model', 'settings_ai'],
    ['open terminal settings', 'settings_terminal'],
    ['open the integrations settings', 'settings_integrations'],
    ['show my command history', 'history'],
    ['what commands did i run recently?', 'history'],
    ['open the workflow manager', 'workflows'],
    ['list my saved workflows', 'workflows'],
    ['what keyboard shortcuts are there?', 'shortcuts'],
    ['help', 'shortcuts'],
    ['change the color theme', 'themes'],
    ['switch to zen mode', 'zen_mode'],
    ['turn on visual mode', 'visual_mode'],
    ['open the command palette', 'command_palette'],
    ['browse plugins', 'plugins'],
    ['manage the built-in model', 'model_manager'],
    ['run the setup wizard again', 'onboarding'],
    ['close this tab', 'close_tab'],
    ['close the current pane', 'close_pane'],
    ['next tab', 'next_tab'],
    ['go to the previous tab', 'previous_tab'],
  ])('%s -> %s', (goal, id) => {
    expect(parseAppAction(goal)?.id).toBe(id);
  });

  it('carries the search text, tab number and new name', () => {
    expect(parseAppAction('search the terminal output for ERROR')).toEqual({ id: 'find', query: 'ERROR' });
    expect(parseAppAction('find "connection refused" in the terminal')).toEqual({ id: 'find', query: 'connection refused' });
    expect(parseAppAction('go to tab 2')).toEqual({ id: 'focus_tab', tab: 2 });
    expect(parseAppAction('switch to the last tab')).toEqual({ id: 'focus_tab', tab: -1 });
    expect(parseAppAction('rename this tab to api server')).toEqual({ id: 'rename_tab', name: 'api server' });
  });

  it('leaves shell and project requests alone', () => {
    for (const goal of ['open settings.py', 'show config', 'show the git config', 'show history of main.py', 'find TODO in src',
      'open safari', 'run ls in tab 2', 'what is tab 2 showing', 'open a new tab', 'change directory to src', 'close the server', 'search for large files']) {
      expect(parseAppAction(goal), goal).toBeNull();
    }
  });
});
