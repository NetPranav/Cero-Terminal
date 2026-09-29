import { describe, it, expect } from 'vitest';
import { pathsInError, localImports, parseDiagnoseRequest } from './ErrorSources';

describe('ErrorSources', () => {
  it('finds user files in node and python stack traces, not internals', () => {
    const node = 'node:internal/assert/utils:146\n  at Object.<anonymous> (/home/u/proj/node-app/test.js:3:8)\n  at Module._compile (node:internal/modules/cjs/loader:1554:14)';
    expect(pathsInError(node, '/home/u/proj')).toEqual(['node-app/test.js']);
    const py = 'Traceback (most recent call last):\n  File "/home/u/proj/buggy.py", line 4, in <module>\n  File "/usr/lib/python3.12/json/__init__.py", line 2';
    expect(pathsInError(py, '/home/u/proj')).toEqual(['buggy.py']);
  });

  it('follows local imports one level', () => {
    expect(localImports('node-app/test.js', "const { add } = require('./math');\nimport x from '../lib/util.js';")).toEqual(['node-app/math.js', 'node-app/../lib/util.js']);
    expect(localImports('src/main.py', 'import util\nimport os\nfrom helpers.db import q')).toEqual(['src/util.py', 'src/helpers/db.py']);
  });
});

describe('parseDiagnoseRequest', () => {
  const isCommand = (t: string) => /^(?:npm|cargo|python3|make|node)\b/.test(t);
  it('takes the command and the folder', () => {
    expect(parseDiagnoseRequest('why is npm test failing in node-app?', isCommand)).toEqual({ command: 'npm test', folder: 'node-app' });
    expect(parseDiagnoseRequest('why does `cargo build` keep failing', isCommand)).toEqual({ command: 'cargo build', folder: undefined });
    expect(parseDiagnoseRequest('why is my wifi not working', isCommand)).toBeNull();
  });
});
