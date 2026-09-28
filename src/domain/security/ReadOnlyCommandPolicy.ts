/**
 * ReadOnlyCommandPolicy.ts — single source of truth for "this command line cannot change
 * anything".
 *
 * Used by SecurityEngine (SAFE = runs without asking) and CommandCapabilityClassifier (may be
 * executed in the shadow sandbox). It works on the parsed AST, so every command in a pipeline,
 * `&&`/`;` list, subshell, loop body or `$(...)` substitution must pass. Previously the SAFE check
 * only looked at the first word, so `ls && python3 -c ...`, `echo x >> ~/.bashrc`,
 * `ip link set wlan0 down` and `hostname pwned` all ran without consent.
 *
 * Unknown binaries are never read-only. When in doubt the answer is "no", which only costs a
 * consent prompt.
 */

import { ShellAstParser, ProgramNode, PipelineNode, CommandNode, SimpleCommandNode, RedirectNode } from './ShellAstParser';

export interface ReadOnlyVerdict {
  readOnly: boolean;
  reason: string;
}

/** Binaries that only read, whatever their arguments (output redirection is checked separately). */
const ALWAYS_READ_ONLY = new Set<string>([
  'ls', 'dir', 'vdir', 'pwd', 'cd', 'cat', 'tac', 'head', 'tail', 'less', 'more', 'nl', 'rev', 'fold', 'column',
  'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'wc', 'cut', 'tr', 'uniq', 'comm', 'join', 'paste',
  'basename', 'dirname', 'realpath', 'readlink', 'stat', 'file', 'which', 'whereis', 'type', 'whatis', 'apropos',
  'whoami', 'id', 'groups', 'uname', 'arch', 'nproc', 'getconf', 'uptime', 'free', 'vmstat', 'iostat', 'mpstat',
  'df', 'du', 'lscpu', 'lsblk', 'lspci', 'lsusb', 'lsmod', 'lshw', 'findmnt', 'blkid', 'inxi', 'sensors',
  'ps', 'pstree', 'pgrep', 'pidof', 'top', 'htop', 'btop', 'printenv', 'locale', 'strings', 'ldd', 'getpcaps',
  'who', 'w', 'last', 'lastlog', 'lsof', 'ss', 'netstat', 'ping', 'dig', 'nslookup', 'host', 'traceroute', 'tracepath',
  'echo', 'printf', 'true', 'false', 'test', '[', 'cal', 'jq', 'diff', 'colordiff', 'cmp',
  'md5sum', 'sha1sum', 'sha256sum', 'sha512sum', 'b2sum', 'cksum',
  'upower', 'acpi', 'uptime', 'man', 'tldr', 'help',
  'mdfind', 'sw_vers', 'system_profiler', 'vm_stat',
  'nvidia-smi', 'glxinfo', 'vulkaninfo', 'lsb_release', 'fastfetch', 'neofetch',
]);

/** Shell keywords the lightweight parser reports as command names. */
const PASS_THROUGH_KEYWORDS = new Set(['do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', 'time']);
const NO_OP_KEYWORDS = new Set(['done', 'fi', 'esac', 'for', 'in', '{', '}']);

const MUTATING_VERBS = new Set([
  'add', 'del', 'delete', 'remove', 'set', 'change', 'replace', 'flush', 'append', 'prepend', 'restore',
  'save', 'exec', 'up', 'down', 'on', 'off', 'modify', 'mod', 'connect', 'disconnect', 'reload', 'import',
  'clone', 'edit', 'hotspot', 'reapply', 'rename', 'kill', 'start', 'stop', 'restart', 'enable', 'disable',
]);

function nonFlagArgs(args: string[]): string[] {
  return args.filter(a => !a.startsWith('-'));
}

function hasAnyArg(args: string[], forbidden: string[]): boolean {
  return args.some(a => forbidden.some(f => a === f || a.startsWith(`${f}=`)));
}

/** Per-binary rules for tools that are read-only only in some forms. Returns undefined when unknown. */
function subcommandVerdict(name: string, args: string[]): boolean | undefined {
  const positional = nonFlagArgs(args);
  const lowerPositional = positional.map(a => a.toLowerCase());
  switch (name) {
    case 'git': {
      const sub = positional[0] || '';
      if (['status', 'log', 'diff', 'show', 'describe', 'rev-parse', 'ls-files', 'blame', 'shortlog', 'reflog', 'grep', 'ls-remote', 'count-objects'].includes(sub)) return true;
      if (sub === 'branch') return !hasAnyArg(args, ['-d', '-D', '-m', '-M', '-c', '-C', '--delete', '--move', '--copy', '-f', '--force', '--set-upstream-to', '-u', '--unset-upstream']) && positional.length === 1;
      if (sub === 'remote') return positional.length === 1 || positional[1] === 'show' || positional[1] === 'get-url';
      if (sub === 'tag') return positional.length === 1 || hasAnyArg(args, ['-l', '--list']);
      if (sub === 'config') return hasAnyArg(args, ['--get', '--get-all', '--list', '-l', '--get-regexp']);
      if (sub === 'stash') return positional[1] === 'list' || positional[1] === 'show';
      return false;
    }
    case 'find':
      return !hasAnyArg(args, ['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls']);
    case 'sort':
      return !args.some(a => a === '-o' || a.startsWith('-o') && !a.startsWith('--') || a.startsWith('--output'));
    case 'sed':
      // -i edits files in place; the `w` and `e` commands write files / execute shell commands
      return !args.some(a => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))
        && !positional.some(a => /(^|[;\s{])[we](\s|$)/.test(a));
    case 'awk': case 'gawk': case 'mawk':
      return !args.some(a => /system\s*\(|\|\s*"|"\s*\|\s*getline|print[^;]*>\s*"|printf[^;]*>\s*"/.test(a));
    case 'yq':
      return !hasAnyArg(args, ['-i', '--inplace']);
    case 'env':
      return positional.length === 0; // `env VAR=x cmd` runs cmd
    case 'hostname':
      return positional.length === 0; // `hostname NAME` renames the machine
    case 'date':
      return !hasAnyArg(args, ['-s', '--set']);
    case 'ip':
      return !lowerPositional.some(a => MUTATING_VERBS.has(a));
    case 'iw':
      return !lowerPositional.some(a => MUTATING_VERBS.has(a) || a === 'scan');
    case 'nmcli':
      return !lowerPositional.some(a => MUTATING_VERBS.has(a));
    case 'bluetoothctl':
      return positional.length > 0 && ['devices', 'paired-devices', 'info', 'show', 'list'].includes(lowerPositional[0]);
    case 'systemctl': {
      const verb = lowerPositional[0] || 'list-units';
      return ['status', 'is-active', 'is-enabled', 'is-failed', 'is-system-running', 'list-units', 'list-unit-files',
        'list-timers', 'list-sockets', 'list-dependencies', 'list-jobs', 'show', 'cat', 'get-default'].includes(verb);
    }
    case 'journalctl':
      return !args.some(a => /^--(vacuum-|rotate|flush|sync|relinquish-var|smart-relinquish-var|setup-keys|update-catalog)/.test(a));
    case 'timedatectl': case 'hostnamectl': case 'localectl':
      return !lowerPositional.some(a => a.startsWith('set-'));
    case 'resolvectl':
      return positional.length <= 1 || ['status', 'query', 'statistics', 'show-cache', 'show-server-state'].includes(lowerPositional[0]);
    case 'mount':
      return positional.length === 0;
    case 'swapon':
      return positional.length === 0;
    case 'dmesg':
      return !args.some(a => ['-c', '-C', '--clear', '--read-clear', '-D', '-E', '-n', '--console-off', '--console-on', '--console-level'].includes(a));
    case 'docker': case 'podman':
      return ['ps', 'images', 'inspect', 'logs', 'version', 'info', 'top', 'port', 'diff', 'history', 'stats'].includes(lowerPositional[0] || '');
    case 'kubectl':
      return ['get', 'describe', 'logs', 'top', 'version', 'explain', 'api-resources', 'cluster-info'].includes(lowerPositional[0] || '')
        || (lowerPositional[0] === 'config' && lowerPositional[1] === 'view');
    case 'npm': case 'pnpm': case 'yarn':
      return ['ls', 'list', 'view', 'info', 'outdated', 'why', 'explain', 'root', 'prefix'].includes(lowerPositional[0] || '')
        || (positional.length === 0 && hasAnyArg(args, ['-v', '--version']));
    case 'pip': case 'pip3':
      return ['list', 'show', 'freeze', 'check'].includes(lowerPositional[0] || '');
    case 'python': case 'python3': case 'node': case 'rustc': case 'cargo': case 'go': case 'java': case 'gcc': case 'clang':
      return args.length === 1 && ['--version', '-v', '-V', 'version'].includes(args[0]);
    case 'pacman':
      return args.length > 0 && /^-Q/.test(args[0]); // queries only
    case 'dpkg':
      return hasAnyArg(args, ['-l', '-L', '-s', '-S', '--list', '--listfiles', '--status', '--search']);
    case 'dpkg-query': case 'rpm':
      return name === 'dpkg-query' || args.some(a => /^-q/.test(a));
    case 'apt': case 'apt-cache':
      return ['list', 'search', 'show', 'policy', 'depends', 'rdepends'].includes(lowerPositional[0] || '');
    case 'dnf': case 'yum':
      return ['list', 'info', 'search', 'repolist', 'provides', 'check-update'].includes(lowerPositional[0] || '');
    case 'flatpak':
      return ['list', 'info', 'search', 'remotes'].includes(lowerPositional[0] || '');
    case 'ros2': {
      const [group, verb] = lowerPositional;
      if (group === 'doctor' || group === 'wtf') return true;
      const readVerbs: Record<string, string[]> = {
        topic: ['list', 'info', 'echo', 'hz', 'bw', 'type', 'find', 'delay'],
        node: ['list', 'info'],
        service: ['list', 'type', 'find'],
        param: ['list', 'get', 'describe', 'dump'],
        action: ['list', 'info'],
        interface: ['list', 'show', 'package', 'packages', 'proto'],
        pkg: ['list', 'prefix', 'executables', 'xml'],
        daemon: ['status'],
      };
      return Boolean(group && verb && readVerbs[group]?.includes(verb));
    }
    case 'fuser':
      return !hasAnyArg(args, ['-k', '--kill']);
    case 'pmset':
      return args[0] === '-g';
    case 'networksetup':
      return Boolean(args[0] && (args[0].startsWith('-list') || args[0].startsWith('-get')));
    default:
      return undefined;
  }
}

function writesToFile(redirects: RedirectNode[] | undefined): RedirectNode | undefined {
  return (redirects || []).find(r => {
    if (r.op === '<' || r.op === '2>&1' || r.op === '<<' || r.op === '<<<') return false;
    if (!/[>]/.test(r.op)) return false;
    const target = (r.target || '').replace(/^['"]|['"]$/g, '');
    return target !== '/dev/null' && target !== '&1' && target !== '&2';
  });
}

function simpleCommandVerdict(cmd: SimpleCommandNode): ReadOnlyVerdict {
  let name = cmd.name.replace(/^['"]|['"]$/g, '');
  let args = cmd.args;

  // The parser reports loop/conditional keywords as command names; look through them.
  while (PASS_THROUGH_KEYWORDS.has(name) && args.length > 0) {
    name = args[0];
    args = args.slice(1);
  }
  if (NO_OP_KEYWORDS.has(name) || PASS_THROUGH_KEYWORDS.has(name)) {
    return { readOnly: true, reason: `shell keyword ${name}` };
  }
  // A path like /usr/bin/ls is judged by its basename
  name = name.split('/').pop() || name;

  const redirect = writesToFile(cmd.redirects);
  if (redirect) {
    return { readOnly: false, reason: `writes to ${redirect.target} via ${redirect.op}` };
  }

  for (const sub of cmd.substitutions || []) {
    const subVerdict = simpleCommandVerdict(sub);
    if (!subVerdict.readOnly) return { readOnly: false, reason: `substitution: ${subVerdict.reason}` };
  }

  const special = subcommandVerdict(name, args);
  if (special !== undefined) {
    return special
      ? { readOnly: true, reason: `${name} in read-only form` }
      : { readOnly: false, reason: `${name} ${args.join(' ')} can modify state` };
  }
  if (ALWAYS_READ_ONLY.has(name)) {
    return { readOnly: true, reason: `${name} is read-only` };
  }
  return { readOnly: false, reason: `${name} is not a known read-only command` };
}

function collect(node: ProgramNode | PipelineNode | CommandNode, out: { cmds: SimpleCommandNode[]; redirects: RedirectNode[] }): void {
  if (node.type === 'program') {
    for (const stmt of node.statements) collect(stmt.pipeline, out);
  } else if (node.type === 'pipeline') {
    for (const cmd of node.commands) collect(cmd, out);
  } else if (node.type === 'subshell') {
    out.redirects.push(...(node.redirects || []));
    collect(node.body, out);
  } else if (node.type === 'simple_command' && node.name) {
    out.cmds.push(node);
  }
}

/**
 * True only when every command in the line is a known read-only form and nothing is written
 * to a file (redirection to /dev/null is fine).
 */
export function isReadOnlyCommandLine(commandLine: string): ReadOnlyVerdict {
  const trimmed = (commandLine || '').trim();
  if (!trimmed) return { readOnly: false, reason: 'empty command' };

  let ast: ProgramNode;
  try {
    ast = ShellAstParser.parse(trimmed);
  } catch (err: any) {
    return { readOnly: false, reason: `unparseable: ${err?.message || err}` };
  }
  if (ShellAstParser.isObfuscatedExecution(trimmed).isObfuscated) {
    return { readOnly: false, reason: 'obfuscated execution' };
  }

  const found = { cmds: [] as SimpleCommandNode[], redirects: [] as RedirectNode[] };
  collect(ast, found);
  if (found.cmds.length === 0) return { readOnly: false, reason: 'no commands found' };

  const subshellWrite = writesToFile(found.redirects);
  if (subshellWrite) return { readOnly: false, reason: `writes to ${subshellWrite.target} via ${subshellWrite.op}` };

  for (const cmd of found.cmds) {
    const verdict = simpleCommandVerdict(cmd);
    if (!verdict.readOnly) return verdict;
  }
  return { readOnly: true, reason: 'every command is read-only' };
}
