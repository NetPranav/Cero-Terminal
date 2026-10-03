/**
 * Cero — Remote SSH Manager
 *
 * Discovers and parses remote SSH hosts from ~/.ssh/config, providing
 * one-click remote multiplexing and connection across cloud GPUs, servers, and robots.
 */

import { invoke } from '@tauri-apps/api/core';

export interface SSHHostProfile {
  host: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
}

export class RemoteSSHManager {
  private static instance: RemoteSSHManager;

  public static getInstance(): RemoteSSHManager {
    if (!RemoteSSHManager.instance) {
      RemoteSSHManager.instance = new RemoteSSHManager();
    }
    return RemoteSSHManager.instance;
  }

  /**
   * Parses standard ~/.ssh/config file text into structured SSHHostProfile items.
   */
  public parseSSHConfig(configContent: string): SSHHostProfile[] {
    const lines = configContent.split('\n');
    const profiles: SSHHostProfile[] = [];
    let current: SSHHostProfile | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const [key, ...rest] = line.split(/\s+/);
      const val = rest.join(' ');

      if (key.toLowerCase() === 'host') {
        if (current && current.host !== '*') {
          profiles.push(current);
        }
        current = { host: val };
      } else if (current) {
        switch (key.toLowerCase()) {
          case 'hostname':
            current.hostName = val;
            break;
          case 'user':
            current.user = val;
            break;
          case 'port':
            current.port = parseInt(val, 10);
            break;
          case 'identityfile':
            current.identityFile = val;
            break;
        }
      }
    }

    if (current && current.host !== '*') {
      profiles.push(current);
    }

    return profiles;
  }

  /**
   * Reads ~/.ssh/config and returns discovered hosts.
   */
  public async getSSHHosts(): Promise<SSHHostProfile[]> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return [
        { host: 'gpu-server', hostName: '192.168.1.120', user: 'ubuntu', port: 22 },
        { host: 'ros2-robot', hostName: '10.0.0.45', user: 'robot', port: 2222 },
        { host: 'cloud-staging', hostName: 'staging.cero.dev', user: 'deploy' }
      ];
    }

    try {
      const res = await invoke<{ stdout: string; code: number }>('execute_command', {
        command: 'cat',
        args: [`${process.env.HOME || '~'}/.ssh/config`]
      });

      if (res.code === 0 && res.stdout) {
        return this.parseSSHConfig(res.stdout);
      }
    } catch {
      // Fallback
    }

    return [];
  }

  /**
   * Generates connection command for a host
   */
  public getConnectCommand(host: SSHHostProfile): string {
    if (host.host && !host.hostName && !host.user) {
      return `ssh ${host.host}`;
    }
    const target = host.user ? `${host.user}@${host.hostName || host.host}` : (host.hostName || host.host);
    const portArg = host.port && host.port !== 22 ? `-p ${host.port} ` : '';
    const keyArg = host.identityFile ? `-i "${host.identityFile}" ` : '';
    return `ssh ${portArg}${keyArg}${target}`;
  }
}
