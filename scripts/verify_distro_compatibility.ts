#!/usr/bin/env tsx
/**
 * scripts/verify_distro_compatibility.ts
 *
 * Phase 4 Multi-Distribution Verification Script
 * Audits host Linux distribution, package managers, init systems, and display compositors
 * to ensure Cero capabilities operate cleanly.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';

interface CompatibilityReport {
  distro: {
    prettyName: string;
    id: string;
    version: string;
    kernel: string;
    arch: string;
  };
  packageManagers: {
    pacman: boolean;
    apt: boolean;
    dnf: boolean;
    zypper: boolean;
    flatpak: boolean;
    primary: string;
  };
  initSystem: {
    isSystemd: boolean;
    hasSystemctl: boolean;
  };
  display: {
    server: 'wayland' | 'x11' | 'headless';
    desktop: string;
  };
  networking: {
    hasNmcli: boolean;
    hasBluetoothctl: boolean;
    hasSs: boolean;
  };
  universalScore: number;
}

function runCmd(cmd: string): { success: boolean; output: string } {
  try {
    const res = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8', timeout: 3000 });
    return { success: true, output: res.trim() };
  } catch {
    return { success: false, output: '' };
  }
}

export function auditDistroCompatibility(): CompatibilityReport {
  // 1. Distro info
  let prettyName = 'Linux Generic';
  let distroId = 'linux';
  let version = 'unknown';

  if (fs.existsSync('/etc/os-release')) {
    const content = fs.readFileSync('/etc/os-release', 'utf-8');
    const nameMatch = content.match(/PRETTY_NAME="?([^"\n]+)"?/);
    if (nameMatch) prettyName = nameMatch[1];
    const idMatch = content.match(/^ID="?([^"\n]+)"?/m);
    if (idMatch) distroId = idMatch[1];
    const verMatch = content.match(/VERSION_ID="?([^"\n]+)"?/);
    if (verMatch) version = verMatch[1];
  }

  const kernel = runCmd('uname -r').output || 'unknown';
  const arch = runCmd('uname -m').output || 'unknown';

  // 2. Package Managers
  const hasPacman = runCmd('command -v pacman').success;
  const hasApt = runCmd('command -v apt-get').success;
  const hasDnf = runCmd('command -v dnf').success;
  const hasZypper = runCmd('command -v zypper').success;
  const hasFlatpak = runCmd('command -v flatpak').success;

  let primaryPkg = 'unknown';
  if (hasPacman) primaryPkg = 'pacman (Arch/Manjaro)';
  else if (hasApt) primaryPkg = 'apt-get (Debian/Ubuntu/Mint)';
  else if (hasDnf) primaryPkg = 'dnf (Fedora/RHEL)';
  else if (hasZypper) primaryPkg = 'zypper (openSUSE)';
  else if (hasFlatpak) primaryPkg = 'flatpak';

  // 3. Init system
  const isSystemd = fs.existsSync('/run/systemd/system');
  const hasSystemctl = runCmd('command -v systemctl').success;

  // 4. Display server & desktop
  const env = process.env;
  let displayServer: 'wayland' | 'x11' | 'headless' = 'headless';
  if (env.WAYLAND_DISPLAY || env.XDG_SESSION_TYPE === 'wayland') {
    displayServer = 'wayland';
  } else if (env.DISPLAY || env.XDG_SESSION_TYPE === 'x11') {
    displayServer = 'x11';
  }
  const desktop = env.XDG_CURRENT_DESKTOP || env.DESKTOP_SESSION || 'terminal-only';

  // 5. Networking tools
  const hasNmcli = runCmd('command -v nmcli').success;
  const hasBluetoothctl = runCmd('command -v bluetoothctl').success;
  const hasSs = runCmd('command -v ss').success;

  // 6. Score calculation
  let points = 0;
  if (hasPacman || hasApt || hasDnf || hasZypper || hasFlatpak) points += 25;
  if (hasSystemctl) points += 25;
  if (hasSs) points += 25;
  if (hasNmcli || hasBluetoothctl) points += 25;

  return {
    distro: { prettyName, id: distroId, version, kernel, arch },
    packageManagers: {
      pacman: hasPacman,
      apt: hasApt,
      dnf: hasDnf,
      zypper: hasZypper,
      flatpak: hasFlatpak,
      primary: primaryPkg
    },
    initSystem: { isSystemd, hasSystemctl },
    display: { server: displayServer, desktop },
    networking: { hasNmcli, hasBluetoothctl, hasSs },
    universalScore: points
  };
}

if (process.argv[1]?.includes('verify_distro_compatibility')) {
  console.log('🔍 Cero — Host Linux Distribution Audit\n');
  const rep = auditDistroCompatibility();

  console.log(`OS:              ${rep.distro.prettyName} (${rep.distro.arch})`);
  console.log(`Kernel:          ${rep.distro.kernel}`);
  console.log(`Primary Package: ${rep.packageManagers.primary}`);
  console.log(`Init System:     ${rep.initSystem.isSystemd ? 'systemd (active)' : 'non-systemd / fallback'}`);
  console.log(`Display Session: ${rep.display.server.toUpperCase()} (${rep.display.desktop})`);
  console.log(`Network Diagnostics: ss=${rep.networking.hasSs}, nmcli=${rep.networking.hasNmcli}, bluetooth=${rep.networking.hasBluetoothctl}`);
  console.log(`\nCompatibility Readiness: ${rep.universalScore}%`);

  if (rep.universalScore >= 75) {
    console.log('✅ System is fully compatible with Cero release builds.');
  } else {
    console.log('⚠️ Minimal environment detected; core terminal and AI will run with standard fallback drivers.');
  }
}
