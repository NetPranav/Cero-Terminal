import { describe, it, expect } from 'vitest';
import * as p from './pathPolyfill';

describe('pathPolyfill (the app\'s path module on every OS)', () => {
  it('joins and normalizes POSIX paths like Node', () => {
    expect(p.join('/home/u', 'proj', '../api', './src')).toBe('/home/u/api/src');
    expect(p.join('a', 'b')).toBe('a/b');
    expect(p.normalize('../x/./y')).toBe('../x/y');
  });

  it('resolves: the last absolute segment wins', () => {
    expect(p.resolve('/tmp/a', '/opt/b')).toBe('/opt/b');
    expect(p.resolve('/tmp/a', 'b/')).toBe('/tmp/a/b');
    expect(p.resolve('C:\\Users\\me', 'proj')).toBe('C:/Users/me/proj');
    expect(p.resolve('C:\\Users\\me', 'D:\\data')).toBe('D:/data');
    expect(p.resolve('/workspace', 'cero')).toBe('/workspace/cero');
  });

  it('understands Windows paths', () => {
    expect(p.isAbsolute('C:\\Users\\me')).toBe(true);
    expect(p.isAbsolute('c:/x')).toBe(true);
    expect(p.isAbsolute('proj\\src')).toBe(false);
    expect(p.dirname('C:\\Users\\me\\a.txt')).toBe('C:/Users/me');
    expect(p.dirname('C:\\a.txt')).toBe('C:/');
    expect(p.basename('C:\\Users\\me\\a.txt', '.txt')).toBe('a');
    expect(p.join('C:\\Users\\me', '..', 'you')).toBe('C:/Users/you');
  });

  it('dirname, basename, extname and relative', () => {
    expect(p.dirname('/a/b/c.js')).toBe('/a/b');
    expect(p.dirname('/a')).toBe('/');
    expect(p.dirname('c.js')).toBe('.');
    expect(p.basename('/a/b/')).toBe('b');
    expect(p.extname('archive.tar.gz')).toBe('.gz');
    expect(p.extname('.bashrc')).toBe('');
    expect(p.relative('/a/b', '/a/c/d')).toBe('../c/d');
    expect(p.relative('C:\\Users\\Me', 'c:/users/me/x')).toBe('x');
  });
});
