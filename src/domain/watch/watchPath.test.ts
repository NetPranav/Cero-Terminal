import { describe, it, expect } from 'vitest';
import { isWatchFileTarget, resolveWatchPath } from './watchPath';

describe('isWatchFileTarget', () => {
  it('accepts Windows and POSIX file paths and bare log file names', () => {
    for (const ok of [
      'C:\\logs\\app.log',
      'c:/logs/app.log',
      '.\\build.log',
      '..\\logs\\x',
      '~\\logs\\a.log',
      '\\\\server\\share\\a.log',
      '/var/log/app.log',
      './x.log',
      'build.log',
      'out.jsonl',
    ]) {
      expect(isWatchFileTarget(ok), ok).toBe(true);
    }
  });

  it('refuses things that are not files', () => {
    for (const no of ['list', 'mode auto', 'service Spooler', 'fix', '', 'notes']) {
      expect(isWatchFileTarget(no), no).toBe(false);
    }
  });
});

describe('resolveWatchPath', () => {
  it('keeps absolute paths as they are', () => {
    expect(resolveWatchPath('C:\\logs\\app.log', 'C:\\Users\\me')).toBe('C:\\logs\\app.log');
    expect(resolveWatchPath('\\\\server\\share\\a.log', 'C:\\Users\\me')).toBe('\\\\server\\share\\a.log');
    expect(resolveWatchPath('~\\a.log', 'C:\\Users\\me')).toBe('~\\a.log');
    expect(resolveWatchPath('/var/log/a.log', 'C:\\Users\\me')).toBe('/var/log/a.log');
  });

  it('puts a relative name after a Windows working folder with a backslash', () => {
    expect(resolveWatchPath('build.log', 'C:\\Users\\me\\app')).toBe('C:\\Users\\me\\app\\build.log');
    expect(resolveWatchPath('.\\build.log', 'C:\\Users\\me\\app\\')).toBe('C:\\Users\\me\\app\\build.log');
    expect(resolveWatchPath('./build.log', 'D:/work')).toBe('D:/work/build.log');
  });

  it('keeps the slash style of a POSIX working folder', () => {
    expect(resolveWatchPath('build.log', '/home/u/app')).toBe('/home/u/app/build.log');
    expect(resolveWatchPath('./build.log', '/home/u/app/')).toBe('/home/u/app/build.log');
  });

  it('uses the home folder when the working folder is unknown', () => {
    expect(resolveWatchPath('build.log', '~')).toBe('~/build.log');
    expect(resolveWatchPath('build.log', undefined)).toBe('~/build.log');
  });
});
