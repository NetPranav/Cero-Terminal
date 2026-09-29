#!/usr/bin/env node
// sentinel: open Sentinel Terminal in a folder, or run a .flow file, from any shell.
//
//   sentinel                 open a Sentinel window in the current folder
//   sentinel ~/projects/api  open a Sentinel window in that folder
//   sentinel setup.flow      run the flow (desktop-only flows run without showing the terminal)
//
// Works on macOS, Linux and Windows. Set SENTINEL_APP to the app's executable (or the .app on
// macOS, or an AppImage on Linux) when it is installed somewhere unusual.
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VERSION = require('./package.json').version;
const APP = 'Sentinel Terminal';
const BIN = 'sentinel-terminal';

const HELP = `sentinel ${VERSION}: command line launcher for Sentinel Terminal

Usage:
  sentinel [folder]        Open a Sentinel window in the folder (default: the current folder)
  sentinel <file.flow>     Run a .flow file. A flow that only opens apps and links runs without
                           showing the terminal; one that installs or runs commands asks first.
  sentinel --version       Print the version
  sentinel --help          Show this help

Environment:
  SENTINEL_APP             Path to the app when it is not in the usual place
                           (the .app on macOS, the .exe on Windows, the binary or AppImage on Linux)

Get the app: https://github.com/NetPranav/Sentinal-Terminal/releases`;

function fail(message) {
  process.stderr.write(`sentinel: ${message}\n`);
  process.exit(1);
}

const isFlow = p => /\.(flow|workflow\.json|sentinel-workflow\.json)$/i.test(p);
const expandHome = p => (p === '~' || p.startsWith('~/') || p.startsWith('~\\') ? path.join(os.homedir(), p.slice(1)) : p);
const exists = p => { try { return fs.existsSync(p); } catch { return false; } };

function onPath(name) {
  const res = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
  const first = res.status === 0 ? res.stdout.split(/\r?\n/).find(Boolean) : undefined;
  return first && exists(first) ? first : undefined;
}

/** The installed app: a .app bundle on macOS, an executable elsewhere */
function findApp() {
  if (process.env.SENTINEL_APP) {
    const custom = expandHome(process.env.SENTINEL_APP);
    if (!exists(custom)) fail(`SENTINEL_APP points to ${custom}, which does not exist.`);
    return custom;
  }
  const candidates = process.platform === 'darwin'
    ? [`/Applications/${APP}.app`, path.join(os.homedir(), 'Applications', `${APP}.app`)]
    : process.platform === 'win32'
      ? [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
        .filter(Boolean)
        .flatMap(dir => [path.join(dir, APP, `${BIN}.exe`), path.join(dir, APP, `${APP}.exe`), path.join(dir, 'Programs', APP, `${BIN}.exe`)])
      : [`/usr/bin/${BIN}`, `/usr/local/bin/${BIN}`, path.join(os.homedir(), '.local', 'bin', BIN)];
  return candidates.find(exists) || onPath(BIN)
    || fail(`${APP} is not installed (looked in ${candidates.join(', ')}).\n`
      + 'Install it from https://github.com/NetPranav/Sentinal-Terminal/releases, or set SENTINEL_APP.');
}

function launch(app, target) {
  let child;
  if (process.platform === 'darwin' && app.endsWith('.app')) {
    // A .flow file goes through "open", like a double-click. A folder starts a new window there.
    const args = isFlow(target) ? ['-a', app, target] : ['-n', '-a', app, '--args', target];
    child = spawn('open', args, { stdio: 'ignore' });
  } else {
    child = spawn(app, [target], { detached: true, stdio: 'ignore', cwd: isFlow(target) ? path.dirname(target) : target });
  }
  child.on('error', err => fail(`could not start ${APP}: ${err.message}`));
  child.unref();
}

function main(argv) {
  const [first, ...rest] = argv;
  if (first === '--help' || first === '-h') return console.log(HELP);
  if (first === '--version' || first === '-v') return console.log(VERSION);
  if (first && first.startsWith('-')) fail(`unknown option ${first}. See sentinel --help.`);
  if (rest.length) fail('give one folder or one .flow file. See sentinel --help.');

  const target = path.resolve(expandHome(first || '.'));
  if (!exists(target)) fail(`${target} does not exist.`);
  const isDir = fs.statSync(target).isDirectory();
  if (!isDir && !isFlow(target)) fail(`${target} is not a folder or a .flow file.`);
  launch(findApp(), target);
}

main(process.argv.slice(2));
