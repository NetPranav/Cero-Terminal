# Run a shell on a real pseudo-terminal and relay it over plain pipes (stdin -> pty, pty -> stdout)
import os, pty, select, sys, signal
pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])
signal.signal(signal.SIGTERM, lambda *a: (os.kill(pid, signal.SIGHUP), sys.exit(0)))
stdin = sys.stdin.fileno()
while True:
    try:
        r, _, _ = select.select([fd, stdin], [], [])
    except InterruptedError:
        continue
    if fd in r:
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        os.write(1, data)
    if stdin in r:
        data = os.read(stdin, 65536)
        if not data:
            break
        os.write(fd, data)
