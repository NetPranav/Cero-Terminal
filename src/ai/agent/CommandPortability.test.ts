import { describe, it, expect } from 'vitest';
import { portInterpreters, isNoMatchExit, failureHints, hiddenFailure, restoreGoalPaths } from './CommandPortability';

describe('portInterpreters', () => {
  it('uses python, not python3 (the Microsoft Store alias), only in command position', () => {
    expect(portInterpreters('python3 app.py', 'windows')).toBe('python app.py');
    expect(portInterpreters('cd src; python3 main.py; pip3 install x', 'windows')).toBe('cd src; python main.py; pip install x');
    expect(portInterpreters('python -c "print(1)"', 'windows')).toBe('python -c "print(1)"');
    expect(portInterpreters('Select-String python3 requirements.txt', 'windows')).toBe('Select-String python3 requirements.txt');
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
  it('explains bash substitutions, python, git folders and cd into files', () => {
    expect(failureHints('bad substitution', 'mv "$f" "${f,,}"', 'windows')[0]).toMatch(/ToLower\(\)/);
    expect(failureHints("python : The term 'python' is not recognized", 'python x.py', 'windows')[0]).toMatch(/py -3/);
    expect(failureHints('fatal: not a git repository', 'git log', 'windows')[0]).toMatch(/Do not run `git init`/);
    expect(failureHints('cd: not a directory: buggy.py', 'cd buggy.py; python buggy.py', 'windows').join(' ')).toMatch(/Run the file directly/);
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
