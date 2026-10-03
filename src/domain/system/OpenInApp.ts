/**
 * OpenInApp.ts: the command that opens a folder or file, alone or in an editor, on each OS.
 *
 * Editors are given the folder and nothing else: no "new window" flag, so an editor that already has
 * the folder open brings that window forward instead of making a second one. A window of its own is
 * only requested when the person asked for one ("in a new window").
 */
import { posixQuote, powershellQuote } from '../../utils/shellQuote';
import { editorFor } from './OpenRequest';

export type OpenOs = 'macos' | 'linux' | 'windows';

export interface OpenCommand {
  /** what runs, first choice */
  command: string;
  /** what to try when the first fails because the program is not installed (Linux) */
  fallbacks: string[];
  /** what to tell the person, "Opened ~/x in Visual Studio Code" */
  appName?: string;
  /** the process name to look for afterwards, when the editor should now be running */
  processName?: string;
}

export const osOf = (name: string | undefined): OpenOs =>
  /^win/i.test(name || '') ? 'windows' : /^(?:mac|darwin)/i.test(name || '') ? 'macos' : 'linux';

/** Editors whose command line takes -n / --new-window */
const NEW_WINDOW_FLAG: Record<string, string> = { code: '-n', codium: '-n', cursor: '-n', windsurf: '-n', zed: '-n', subl: '-n' };

const PROCESS: Record<string, string> = { code: 'code', codium: 'codium', cursor: 'cursor', windsurf: 'windsurf', zed: 'zed', subl: 'sublime_text', idea: 'idea', pycharm: 'pycharm', webstorm: 'webstorm', clion: 'clion', studio: 'studio' };

/** Run detached so closing Cero does not close the editor */
const detach = (cmd: string, os: OpenOs) => (os === 'linux' ? `setsid -f ${cmd} >/dev/null 2>&1` : os === 'macos' ? `${cmd}` : cmd);

export function openCommand(path: string, os: OpenOs, withApp?: string, opts: { newWindow?: boolean } = {}): OpenCommand {
  const editor = editorFor(withApp);
  if (editor) {
    const flag = opts.newWindow ? NEW_WINDOW_FLAG[editor.cli] : undefined;
    if (os === 'macos') {
      return { command: `open -a ${posixQuote(editor.macApp)} ${posixQuote(path)}`, fallbacks: [], appName: editor.app, processName: PROCESS[editor.cli] };
    }
    if (os === 'windows') {
      const args = flag ? `${powershellQuote(flag)},${powershellQuote(path)}` : powershellQuote(path);
      return { command: `Start-Process -FilePath ${powershellQuote(editor.cli)} -ArgumentList ${args}`, fallbacks: [], appName: editor.app, processName: PROCESS[editor.cli] };
    }
    // each choice first checks the program is really there, because a detached launch always "succeeds"
    const fallbacks: string[] = [];
    if (editor.flatpak) fallbacks.push(`flatpak info ${editor.flatpak} >/dev/null 2>&1 && ${detach(`flatpak run ${editor.flatpak} ${flag ? '--new-window ' : ''}${posixQuote(path)}`, os)}`);
    if (editor.cli === 'code') fallbacks.push(`snap list code >/dev/null 2>&1 && ${detach(`snap run code ${flag ? `${flag} ` : ''}${posixQuote(path)}`, os)}`);
    fallbacks.push(`command -v xdg-open >/dev/null 2>&1 && ${detach(`xdg-open ${posixQuote(path)}`, os)}`);
    return { command: `command -v ${editor.cli} >/dev/null 2>&1 && ${detach(`${editor.cli} ${flag ? `${flag} ` : ''}${posixQuote(path)}`, os)}`, fallbacks, appName: editor.app, processName: PROCESS[editor.cli] };
  }
  if (withApp) {
    // some other app the person named: let the system open the path with it
    if (os === 'macos') return { command: `open -a ${posixQuote(withApp)} ${posixQuote(path)}`, fallbacks: [], appName: withApp };
    if (os === 'windows') return { command: `Start-Process -FilePath ${powershellQuote(withApp)} -ArgumentList ${powershellQuote(path)}`, fallbacks: [], appName: withApp };
    return { command: detach(`${posixQuote(withApp.toLowerCase().replace(/\s+/g, '-'))} ${posixQuote(path)}`, os), fallbacks: [detach(`xdg-open ${posixQuote(path)}`, os)], appName: withApp };
  }
  if (os === 'macos') return { command: `open ${posixQuote(path)}`, fallbacks: [] };
  if (os === 'windows') return { command: `Start-Process -FilePath ${powershellQuote(path)}`, fallbacks: [] };
  return { command: detach(`xdg-open ${posixQuote(path)}`, os), fallbacks: [] };
}
