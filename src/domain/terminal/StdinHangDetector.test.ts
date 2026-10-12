import { describe, it, expect } from 'vitest';
import { StdinHangDetector } from './StdinHangDetector';

describe('StdinHangDetector', () => {
  it('detects [Y/n] and [y/N] interactive prompts in output', () => {
    const output1 = 'Do you want to continue? [Y/n] ';
    expect(StdinHangDetector.isPromptingForInput(output1)).toBe(true);

    const output2 = 'The following packages will be upgraded: ...\nNeed to get 14.2 MB of archives.\nAfter this operation, 22.5 MB of additional disk space will be used.\nDo you want to continue? [y/N]';
    expect(StdinHangDetector.isPromptingForInput(output2)).toBe(true);
  });

  it('detects password and passphrase prompts', () => {
    expect(StdinHangDetector.isPromptingForInput('[sudo] password for user: ')).toBe(true);
    expect(StdinHangDetector.isPromptingForInput('Enter passphrase for key /home/user/.ssh/id_rsa:')).toBe(true);
  });

  it('returns false for normal non-interactive output', () => {
    const normal = 'Setting up htop (3.2.2-1) ...\nProcessing triggers for man-db (2.10.2-1) ...\nDone.';
    expect(StdinHangDetector.isPromptingForInput(normal)).toBe(false);
  });

  it('suggests non-interactive fix for apt install without -y', () => {
    const fix = StdinHangDetector.suggestNonInteractiveFix('apt install nginx');
    expect(fix).not.toBeNull();
    expect(fix?.flag).toBe('-y');
    expect(fix?.rewrittenCommand).toContain('DEBIAN_FRONTEND=noninteractive');
    expect(fix?.rewrittenCommand).toContain('apt -y install nginx');
  });

  it('does not rewrite apt install when -y is already present', () => {
    expect(StdinHangDetector.suggestNonInteractiveFix('apt install -y nginx')).toBeNull();
    expect(StdinHangDetector.suggestNonInteractiveFix('apt-get install --yes nginx')).toBeNull();
  });

  it('suggests non-interactive fix for dnf, pacman, apk, brew, npm', () => {
    expect(StdinHangDetector.suggestNonInteractiveFix('dnf install gcc')?.rewrittenCommand).toBe('dnf -y install gcc');
    expect(StdinHangDetector.suggestNonInteractiveFix('pacman -S ripgrep')?.rewrittenCommand).toBe('pacman -S ripgrep --noconfirm');
    expect(StdinHangDetector.suggestNonInteractiveFix('apk add curl')?.rewrittenCommand).toBe('apk add -q curl');
    expect(StdinHangDetector.suggestNonInteractiveFix('brew install node')?.rewrittenCommand).toBe('NONINTERACTIVE=1 brew install node');
    expect(StdinHangDetector.suggestNonInteractiveFix('npm init')?.rewrittenCommand).toBe('npm init -y');
  });
});
