import { describe, it, expect, beforeEach } from 'vitest';
import { ERROR_SIGNAL, PtyOutputObserver } from './PtyOutputObserver';

describe('PtyOutputObserver — Passive Output Stream Error Detection', () => {
  let observer: PtyOutputObserver;

  beforeEach(() => {
    observer = new PtyOutputObserver();
    observer.clearRemediation();
  });

  it('detects EADDRINUSE port collision from raw shell output and generates remediation', () => {
    const chunk = `
> dev-server@1.0.0 start
> node server.js

Error: listen EADDRINUSE: address already in use :::3000
    at Server.setupListenHandle [as _listen2] (net.js:1318:16)
`;
    const rem = observer.ingest(chunk, '/test/repo');
    expect(rem).not.toBeNull();
    expect(rem?.cause).toContain('3000');
    expect(rem?.actionTitle).toContain('3000');
    expect(rem?.tool).toBe('system.kill_process');
    expect(rem?.params.port).toBe(3000);
  });

  it('notifies registered listeners when a recoverable error stream is observed', () => {
    let notifiedRem: any = null;
    const unsub = observer.onRemediation((rem) => {
      notifiedRem = rem;
    });

    observer.ingest('fatal: Unable to create \'.git/index.lock\': File exists.', '/test/repo');
    expect(notifiedRem).not.toBeNull();
    expect(notifiedRem.actionTitle).toContain('.git/index.lock');
    expect(notifiedRem.tool).toBe('filesystem.delete');

    unsub();
  });

  it('returns null and does not false-positive on standard successful output', () => {
    const chunk = `
vite v5.0.0 ready in 150 ms
➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
`;
    const rem = observer.ingest(chunk, '/test/repo');
    expect(rem).toBeNull();
    expect(observer.getActiveRemediation()).toBeNull();
  });

  it('detects missing git upstream and provides exact fixedCommand remediation', () => {
    const chunk = `
$ git push
fatal: The current branch my-feature has no upstream branch.
To push the current branch and set the remote as upstream, use

    git push --set-upstream origin my-feature
`;
    const rem = observer.ingest(chunk, '/test/repo');
    expect(rem).not.toBeNull();
    expect(rem?.fixedCommand).toBe('git push --set-upstream origin my-feature');
    expect(rem?.tool).toBe('shell.execute');
  });

  it('suspends observation when entering alternate screen buffer (vim/htop/tmux) and ignores errors', () => {
    // Simulate launching vim or htop (enters alternate screen buffer)
    observer.ingest('\x1b[?1049hWelcome to VIM - Vi IMproved');
    expect(observer.isObserverSuspended()).toBe(true);

    // An error string appearing in TUI redraw should NOT trigger any remediation
    const tuiRedrawWithError = `
    Error: listen EADDRINUSE: address already in use :::3000
    ~
    ~ [Vim buffer content]
    `;
    const rem = observer.ingest(tuiRedrawWithError, '/test/repo');
    expect(rem).toBeNull();
    expect(observer.getActiveRemediation()).toBeNull();

    // Exit alternate screen buffer (user quits vim with :q)
    observer.ingest('\x1b[?1049l');
    expect(observer.isObserverSuspended()).toBe(false);

    // Subsequent normal shell errors now trigger remediation again
    const normalError = `
    Error: listen EADDRINUSE: address already in use :::3000
    `;
    const normalRem = observer.ingest(normalError, '/test/repo');
    expect(normalRem).not.toBeNull();
    expect(normalRem?.params.port).toBe(3000);
  });
});

describe('PtyOutputObserver error gate', () => {
  // One real-world sample per DeterministicRuleOracle output trigger; none may be filtered out
  const triggers = [
    'fatal: The current branch main has no upstream branch.',
    ' ! [rejected]        main -> main (fetch first)',
    'Updates were rejected because the tip of your current branch is behind (non-fast-forward)',
    'no changes added to commit (use "git add" and/or "git commit -a")',
    'nothing to commit, working tree clean',
    'Changes not staged for commit:',
    'Another git process seems to be running in this repository',
    'Your local changes to the following files would be overwritten by checkout:',
    'The following paths are ignored by one of your .gitignore files:',
    "No changes - did you forget to use 'git add'?",
    'npm ERR! Missing script: "dev"',
    'ERR_PNPM_NO_MATCHING_VERSION  No matching version found',
    'error: externally-managed-environment',
    'This environment is externally managed',
    "error[E0432]: unresolved import: no crate named `serde'",
    'rm: build: is a directory',
    'cp: src is a directory (not copied).',
    'The file /tmp/x.txt does not exist.',
    'Error: listen EADDRINUSE: address already in use :::3000',
    'kill: illegal pid: node',
    'kill: (1) - Operation not permitted',
    'This command has to be run with superuser privileges (under the root user on most systems).',
    'npm ERR! code EACCES',
    "gti: command not found. Did you mean git?",
    'The most similar command is  git',
    'Error response from daemon: Container 3f2a is not running',
    'the input device is not a TTY',
    'ssh: Could not resolve hostname x: nodename nor servname provided, or not known',
    'sed: 1: "x": invalid command code .',
    'sed: -e expression #1, char 9: bad flag in substitute command',
  ];

  it.each(triggers)('lets rule triggers through: %s', (line) => {
    expect(ERROR_SIGNAL.test(line)).toBe(true);
  });

  it('skips ordinary output', () => {
    for (const line of ['Compiling serde v1.0.219', '  VITE v7.0.4  ready in 312 ms', 'Tests  1553 passed (1553)', '[##########] 100%']) {
      expect(ERROR_SIGNAL.test(line)).toBe(false);
    }
  });
});
