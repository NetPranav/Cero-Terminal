import { describe, it, expect, vi } from 'vitest';
import { ErrorWatchService, WatchBackend, WatchEvent } from './ErrorWatchService';
import { AutoRemediationPolicy, AutoRemediationMode } from '../remediation/AutoRemediationPolicy';

function setup(mode: AutoRemediationMode) {
  let now = 1_000_000;
  const run = vi.fn(async (_cmd: string) => ({ code: 0, stdout: '', stderr: '' }));
  const backend: WatchBackend = {
    startFile: vi.fn(async () => 1),
    startService: vi.fn(async () => 2),
    stop: vi.fn(async () => true),
    list: vi.fn(async () => []),
    onLines: vi.fn(async () => () => {}),
    run,
  };
  const service = new ErrorWatchService(backend, new AutoRemediationPolicy(() => now), () => now, () => mode);
  const events: WatchEvent[] = [];
  service.onEvent(e => events.push(e));
  return { service, backend, run, events, advance: (ms: number) => { now += ms; } };
}

describe('ErrorWatchService', () => {
  it('auto-applies a vetted fix in auto-safe mode and reports it', async () => {
    const { service, run, events } = setup('auto-safe');
    // The log lives outside the repository: the lock named in the error line is removed
    await service.watchFile('/home/u/logs/build.log');
    await service.handleLines(1, ["fatal: Unable to create '/home/u/app/.git/index.lock': File exists."]);

    expect(run).toHaveBeenCalledWith("! pgrep -x git >/dev/null && rm -f '/home/u/app/.git/index.lock'");
    expect(events[0]).toMatchObject({ type: 'auto-fixed', exitCode: 0 });
  });

  it('falls back to the watched folder when the lock path is not absolute or looks crafted', async () => {
    const { extractIndexLockPath } = await import('../remediation/AutoRemediationPolicy');
    expect(extractIndexLockPath("fatal: Unable to create '/srv/repo/.git/index.lock': File exists.")).toBe('/srv/repo/.git/index.lock');
    expect(extractIndexLockPath("fatal: Unable to create 'repo/.git/index.lock': File exists.")).toBeNull();
    expect(extractIndexLockPath("fatal: Unable to create '/srv/../etc/.git/index.lock': File exists.")).toBeNull();
    expect(extractIndexLockPath("fatal: Unable to create '/etc/passwd': File exists.")).toBeNull();
  });

  it('never auto-installs a package named by a log line, even in auto-safe mode', async () => {
    const { service, run, events } = setup('auto-safe');
    await service.watchFile('/home/u/app/dev.log');
    await service.handleLines(1, ["Error: Cannot find module 'evil-pkg'"]);

    expect(run).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: 'proposal' });
    expect(service.takeLatestProposal()?.suggestion.ruleId).toBe('npm_missing_package');
  });

  it('only proposes in suggest mode and deduplicates repeats of the same error', async () => {
    const { service, run, events, advance } = setup('suggest');
    await service.watchFile('/home/u/app/build.log');
    const line = "fatal: Unable to create '/home/u/app/.git/index.lock': File exists.";
    await service.handleLines(1, [line]);
    await service.handleLines(1, [line]);
    expect(run).not.toHaveBeenCalled();
    expect(events.filter(e => e.type === 'proposal')).toHaveLength(1);

    advance(6 * 60_000);
    await service.handleLines(1, [line]);
    expect(events.filter(e => e.type === 'proposal')).toHaveLength(2);
  });

  it('reports errors without a known fix, rate-limited, and ignores normal output', async () => {
    const { service, events, advance } = setup('suggest');
    await service.watchService('nginx.service');
    await service.handleLines(2, ['GET /index.html 200 12ms']);
    expect(events).toHaveLength(0);

    await service.handleLines(2, ['[emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)']);
    await service.handleLines(2, ['upstream timed out while reading response header']);
    expect(events.filter(e => e.type === 'error' || e.type === 'proposal')).toHaveLength(1);

    advance(31_000);
    await service.handleLines(2, ['upstream timed out while reading response header']);
    expect(events).toHaveLength(2);
  });

  it('stops watches by id, target or all', async () => {
    const { service, backend } = setup('suggest');
    await service.watchFile('/var/log/app.log');
    expect((await service.unwatch('app.log')).map(w => w.id)).toEqual([1]);
    expect(backend.stop).toHaveBeenCalledWith(1);
    expect(service.list()).toEqual([]);
  });
});

describe('ErrorWatchService diagnoses each new error on its own', () => {
  it('does not re-apply an old fix when an unrelated error arrives, and proposes the new one', async () => {
    const { service, run, events } = setup('auto-safe');
    await service.watchFile('/home/u/logs/app.log');

    await service.handleLines(1, ["fatal: Unable to create '/home/u/a/.git/index.lock': File exists."]);
    await service.handleLines(1, ["fatal: Unable to create '/home/u/b/.git/index.lock': File exists."]);
    await service.handleLines(1, ["Error: Cannot find module 'evil-pkg'"]);

    expect(run.mock.calls.map(c => c[0])).toEqual([
      "! pgrep -x git >/dev/null && rm -f '/home/u/a/.git/index.lock'",
      "! pgrep -x git >/dev/null && rm -f '/home/u/b/.git/index.lock'",
    ]);
    expect(events.map(e => e.type)).toEqual(['auto-fixed', 'auto-fixed', 'proposal']);
    expect((events[2] as any).suggestion.ruleId).toBe('npm_missing_package');
  });

  it('handles several errors that arrive in one read', async () => {
    const { service, run, events } = setup('suggest');
    await service.watchFile('/home/u/logs/app.log');
    await service.handleLines(1, [
      "fatal: Unable to create '/home/u/a/.git/index.lock': File exists.",
      'some ordinary line',
      "Error: Cannot find module 'left-pad'",
    ]);
    expect(events.map(e => (e as any).suggestion?.ruleId)).toEqual(['git_index_lock', 'npm_missing_package']);
    expect(run).not.toHaveBeenCalled();
  });
});
