/** Short name of a shell for the title and status bar: `pwsh` for `C:\Program Files\PowerShell\7\pwsh.exe`. */
export function shellDisplayName(shellPath: string): string {
  const file = (shellPath || '').trim().split(/[\\/]/).pop() || '';
  const name = file.replace(/\.exe$/i, '').toLowerCase();
  return name || 'powershell';
}
