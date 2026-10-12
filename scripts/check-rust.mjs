#!/usr/bin/env node
/**
 * cargo check for the Windows build: native `cargo check` on Windows, and
 * `cargo xwin check --target x86_64-pc-windows-msvc` on a Linux machine (roadmap 0.3; needs
 * cargo-xwin, the x86_64-pc-windows-msvc target and the llvm tools on PATH).
 */
import { spawnSync } from 'node:child_process';

const manifest = ['--manifest-path', 'src-tauri/Cargo.toml'];
const args = process.platform === 'win32'
  ? ['check', ...manifest]
  : ['xwin', 'check', '--target', 'x86_64-pc-windows-msvc', ...manifest];

const result = spawnSync('cargo', args, { stdio: 'inherit' });
if (result.error) {
  console.error(`check-rust: could not run cargo: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
