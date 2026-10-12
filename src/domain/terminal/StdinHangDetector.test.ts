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

  it('accepts the winget agreements so install and upgrade never wait for an answer', () => {
    expect(StdinHangDetector.suggestNonInteractiveFix('winget install -e --id Git.Git')).toEqual({
      flag: '--accept-source-agreements --accept-package-agreements',
      rewrittenCommand: 'winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements',
    });
    expect(StdinHangDetector.suggestNonInteractiveFix('winget uninstall Git.Git')?.rewrittenCommand).toBe('winget uninstall Git.Git --accept-source-agreements');
    expect(StdinHangDetector.isPromptingForInput('Do you agree to all the source agreements terms?\n[Y] Yes  [N] No:')).toBe(true);
  });

  it('does not rewrite a command that is already non-interactive', () => {
    expect(StdinHangDetector.suggestNonInteractiveFix('winget install Git.Git --accept-source-agreements --accept-package-agreements')).toBeNull();
    expect(StdinHangDetector.suggestNonInteractiveFix('choco install git -y')).toBeNull();
    expect(StdinHangDetector.suggestNonInteractiveFix('npm init --yes')).toBeNull();
  });

  it('suggests non-interactive fixes for choco, npm and pip', () => {
    expect(StdinHangDetector.suggestNonInteractiveFix('choco install git')?.rewrittenCommand).toBe('choco install git -y');
    expect(StdinHangDetector.suggestNonInteractiveFix('npm init')?.rewrittenCommand).toBe('npm init -y');
    expect(StdinHangDetector.suggestNonInteractiveFix('pip install requests')?.rewrittenCommand).toBe('pip install requests --no-input');
    expect(StdinHangDetector.suggestNonInteractiveFix('apt-get install nginx')).toBeNull();
  });
});
