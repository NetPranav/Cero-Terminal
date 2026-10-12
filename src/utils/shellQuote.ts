/**
 * shellQuote.ts — put a value into a shell command without letting it become part of the command.
 *
 * Double quotes do not do that: "$(cmd)", `cmd` and "$VAR" are still expanded inside them, so a folder
 * or file named `$(something)` ran something. Single quotes expand nothing. When a value can be passed
 * as an argument instead of text (`sh -c 'cmd "$1"' sh value`), do that.
 */

/** POSIX shell (sh, bash, zsh, fish accepts it too): 'it'\''s' */
export function posixQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** PowerShell single-quoted string: 'it''s' */
export function powershellQuote(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Text with a newline or other control character cannot be typed as one line safely */
export function hasControlChars(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

/** The line to type into a terminal to change to a folder, for this OS's shell */
export function changeDirectoryLine(path: string, windows: boolean): string {
  return windows ? `Set-Location -LiteralPath ${powershellQuote(path)}\r` : `cd ${posixQuote(path)}\n`;
}
