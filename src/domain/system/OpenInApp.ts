/**
 * OpenInApp.ts: the command that opens a folder or file, alone or in an editor.
 *
 * Editors are given the folder and nothing else: no "new window" flag, so an editor that already has
 * the folder open brings that window forward instead of making a second one. A window of its own is
 * only requested when the person asked for one ("in a new window").
 */
import { powershellQuote } from '../../utils/shellQuote';
import { editorFor } from './OpenRequest';

export type OpenOs = 'windows';

export interface OpenCommand {
  /** what runs, first choice */
  command: string;
  /** what to try when the first fails because the program is not installed */
  fallbacks: string[];
  /** what to tell the person, "Opened ~/x in Visual Studio Code" */
  appName?: string;
  /** the process name to look for afterwards, when the editor should now be running */
  processName?: string;
}

/** The OS a context names; this build only runs on Windows */
export const osOf = (_name: string | undefined): OpenOs => 'windows';

/** Editors whose command line takes -n / --new-window */
const NEW_WINDOW_FLAG: Record<string, string> = { code: '-n', codium: '-n', cursor: '-n', windsurf: '-n', zed: '-n', subl: '-n' };

const PROCESS: Record<string, string> = { code: 'code', codium: 'codium', cursor: 'cursor', windsurf: 'windsurf', zed: 'zed', subl: 'sublime_text', idea: 'idea', pycharm: 'pycharm', webstorm: 'webstorm', clion: 'clion', studio: 'studio' };

export function openCommand(path: string, _os: OpenOs, withApp?: string, opts: { newWindow?: boolean } = {}): OpenCommand {
  const editor = editorFor(withApp);
  if (editor) {
    // TODO(3.7): `code`, `cursor` and other editor CLIs are .cmd shims; Start-Process finds them on PATH
    const flag = opts.newWindow ? NEW_WINDOW_FLAG[editor.cli] : undefined;
    const args = flag ? `${powershellQuote(flag)},${powershellQuote(path)}` : powershellQuote(path);
    return { command: `Start-Process -FilePath ${powershellQuote(editor.cli)} -ArgumentList ${args}`, fallbacks: [], appName: editor.app, processName: PROCESS[editor.cli] };
  }
  if (withApp) {
    // some other app the person named: let Windows open the path with it
    return { command: `Start-Process -FilePath ${powershellQuote(withApp)} -ArgumentList ${powershellQuote(path)}`, fallbacks: [], appName: withApp };
  }
  return { command: `Start-Process -FilePath ${powershellQuote(path)}`, fallbacks: [] };
}
