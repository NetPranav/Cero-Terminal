import { describe, it, expect } from 'vitest';
import { SecurityEngine } from './SecurityEngine';

describe('SecurityEngine consent decisions', () => {
  const engine = new SecurityEngine();
  const level = (command: string) => engine.calculateRisk('shell.execute', { command });

  it.each([
    'ls && python3 -c "import os; os.system(\'id\')"',
    'echo "alias ls=rm" >> ~/.bashrc',
    'cat key.pub >> ~/.ssh/authorized_keys',
    'ip link set wlan0 down',
    'hostname pwned',
    'nmcli radio wifi off',
    'hostnamectl set-hostname pwned',
    "awk 'BEGIN{system(\"id\")}'",
    'env bash -c id',
    'npm run deploy',
  ])('asks before running: %s', (command) => {
    const risk = level(command);
    expect(risk.level).not.toBe('SAFE');
    expect(risk.requiresConsent).toBe(true);
  });

  it.each([
    'ls -la',
    'df -h /',
    'systemctl is-active docker',
    'journalctl -u nginx -n 50 --no-pager',
    'ps aux | grep kill',
    'git status --short && git branch -v',
    'npm test',
    'cargo check',
  ])('runs read-only inspection without prompting: %s', (command) => {
    const risk = level(command);
    expect(risk.level).toBe('SAFE');
    expect(risk.requiresConsent).toBe(false);
  });

  it('still escalates privileged and destructive commands', () => {
    expect(level('sudo systemctl stop sshd').level).toBe('ADMIN');
    expect(level('rm -rf ~/Documents').level).toBe('CRITICAL');
    expect(level('systemctl stop sshd').requiresConsent).toBe(true);
  });
});
