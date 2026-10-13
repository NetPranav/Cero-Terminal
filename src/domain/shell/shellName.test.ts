import { describe, it, expect } from 'vitest';
import { shellDisplayName } from './shellName';

describe('shellDisplayName', () => {
  it('uses the file name without .exe for a Windows path', () => {
    expect(shellDisplayName('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('pwsh');
    expect(shellDisplayName('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe('powershell');
    expect(shellDisplayName('C:\\Windows\\System32\\cmd.exe')).toBe('cmd');
  });

  it('accepts forward slashes and bare names', () => {
    expect(shellDisplayName('C:/Program Files/Git/bin/bash.exe')).toBe('bash');
    expect(shellDisplayName('PowerShell.EXE')).toBe('powershell');
  });

  it('falls back to powershell for an empty value', () => {
    expect(shellDisplayName('')).toBe('powershell');
    expect(shellDisplayName('   ')).toBe('powershell');
  });
});
