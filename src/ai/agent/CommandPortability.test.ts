import { describe, it, expect } from 'vitest';
import { portInterpreters, isNoMatchExit, failureHints, hiddenFailure, restoreGoalPaths } from './CommandPortability';

describe('portInterpreters', () => {
  it('uses python3 on macOS and Linux, python on Windows, only in command position', () => {
    expect(portInterpreters('python -c "print(1)"', 'macos')).toBe('python3 -c "print(1)"');
    expect(portInterpreters('cd src && python main.py; pip install x', 'linux')).toBe('cd src && python3 main.py; pip3 install x');
    expect(portInterpreters('python3 app.py', 'macos')).toBe('python3 app.py');
    expect(portInterpreters('grep python requirements.txt', 'macos')).toBe('grep python requirements.txt');
    expect(portInterpreters('python3 app.py', 'windows')).toBe('python app.py');
  });
});

describe('isNoMatchExit', () => {
  it('treats an empty exit 1 of grep, pgrep and lsof as "nothing matched"', () => {
    expect(isNoMatchExit('lsof -nP -iTCP:8765 -sTCP:LISTEN', 1, '', '')).toBe(true);
    expect(isNoMatchExit('ps aux | grep -v grep | grep node', 1, '', '')).toBe(true);
    expect(isNoMatchExit('LC_ALL=C pgrep -x nginx', 1, '', '')).toBe(true);
    expect(isNoMatchExit('grep x missing.txt', 2, '', 'No such file')).toBe(false);
    expect(isNoMatchExit('npm test', 1, '', '')).toBe(false);
    expect(isNoMatchExit('grep x f', 1, '', 'grep: f: No such file or directory')).toBe(false);
  });
});

describe('failureHints', () => {
  it('explains zsh substitutions, python3, git folders and cd into files', () => {
    expect(failureHints('zsh:1: bad substitution', 'mv "$f" "${f,,}"', 'macos')[0]).toMatch(/tr '\[:upper:\]'/);
    expect(failureHints('zsh:1: command not found: python', 'python x.py', 'macos')[0]).toMatch(/python3/);
    expect(failureHints('fatal: not a git repository', 'git log', 'linux')[0]).toMatch(/Do not run `git init`/);
    expect(failureHints('zsh:cd:1: not a directory: buggy.py', 'cd buggy.py && python3 buggy.py', 'macos').join(' ')).toMatch(/Run the file directly/);
  });
});

describe('restoreGoalPaths', () => {
  it('puts back the folder the model dropped, only for whole file names', () => {
    const goal = 'how many unique IP addresses are in logs/access.log?';
    expect(restoreGoalPaths("awk '{print $1}' access.log | sort -u | wc -l", goal)).toBe("awk '{print $1}' logs/access.log | sort -u | wc -l");
    expect(restoreGoalPaths('wc -l logs/access.log', goal)).toBe('wc -l logs/access.log');
    expect(restoreGoalPaths('grep x my-access.log', goal)).toBe('grep x my-access.log');
    expect(restoreGoalPaths('cat "access.log"', goal)).toBe('cat "logs/access.log"');
  });
});

describe('hiddenFailure', () => {
  it('catches tracebacks and unreadable input behind exit 0', () => {
    expect(hiddenFailure('Traceback (most recent call last):\n  File "x"')).toBe(true);
    expect(hiddenFailure("awk: can't open file access.log", '')).toBe(true);
    expect(hiddenFailure('ls: x: No such file or directory', 'a.txt\nb.txt')).toBe(false);
    expect(hiddenFailure('warning: deprecated', 'ok')).toBe(false);
  });
});
