/**
 * OpenInApp.ts: the command that opens a folder or file, alone or in an editor, on each OS.
 *
 * Editors are given the folder and nothing else: no "new window" flag, so an editor that already has
 * the folder open brings that window forward instead of making a second one.
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

const PROCESS: Record<string, string> = { code: 'code', codium: 'codium', cursor: 'cursor', windsurf: 'windsurf', zed: 'zed', subl: 'sublime_text', idea: 'idea', pycharm: 'pycharm', webstorm: 'webstorm', clion: 'clion', studio: 'studio' };

/** Run detached so closing Sentinel does not close the editor */
const detach = (cmd: string, os: OpenOs) => (os === 'linux' ? `setsid -f ${cmd} >/dev/null 2>&1` : os === 'macos' ? `${cmd}` : cmd);

export function openCommand(path: string, os: OpenOs, withApp?: string): OpenCommand {
  const editor = editorFor(withApp);
  if (editor) {
    if (os === 'macos') {
      return { command: `open -a ${posixQuote(editor.macApp)} ${posixQuote(path)}`, fallbacks: [], appName: editor.app, processName: PROCESS[editor.cli] };
    }
    if (os === 'windows') {
      return { command: `Start-Process -FilePath ${powershellQuote(editor.cli)} -ArgumentList ${powershellQuote(path)}`, fallbacks: [], appName: editor.app, processName: PROCESS[editor.cli] };
    }
    const fallbacks: string[] = [];
    if (editor.flatpak) fallbacks.push(detach(`flatpak run ${editor.flatpak} ${posixQuote(path)}`, os));
    if (editor.cli === 'code') fallbacks.push(detach(`snap run code ${posixQuote(path)}`, os));
    fallbacks.push(detach(`xdg-open ${posixQuote(path)}`, os));
    return { command: detach(`${editor.cli} ${posixQuote(path)}`, os), fallbacks, appName: editor.app, processName: PROCESS[editor.cli] };
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
