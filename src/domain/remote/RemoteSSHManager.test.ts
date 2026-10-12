import { describe, it, expect, beforeEach } from 'vitest';
import { RemoteSSHManager } from './RemoteSSHManager';

describe('RemoteSSHManager (Pillar 3.3)', () => {
  let manager: RemoteSSHManager;

  beforeEach(() => {
    manager = new RemoteSSHManager();
  });

  it('parses standard ~/.ssh/config format accurately', () => {
    const mockConfig = `
# Global default
Host *
  ServerAliveInterval 60

Host gpu-box
  HostName 192.168.1.50
  User ubuntu
  Port 2222
  IdentityFile ~/.ssh/id_ed25519

Host ros-drone
  HostName 10.42.0.1
  User pi
`;
    const profiles = manager.parseSSHConfig(mockConfig);
    expect(profiles.length).toBe(2);

    expect(profiles[0].host).toBe('gpu-box');
    expect(profiles[0].hostName).toBe('192.168.1.50');
    expect(profiles[0].user).toBe('ubuntu');
    expect(profiles[0].port).toBe(2222);
    expect(profiles[0].identityFile).toBe('~/.ssh/id_ed25519');

    expect(profiles[1].host).toBe('ros-drone');
    expect(profiles[1].hostName).toBe('10.42.0.1');
    expect(profiles[1].user).toBe('pi');
  });

  it('generates appropriate connection command', () => {
    const cmd = manager.getConnectCommand({
      host: 'gpu-box',
      hostName: '192.168.1.50',
      user: 'ubuntu',
      port: 2222
    });
    expect(cmd).toBe('ssh -p 2222 ubuntu@192.168.1.50');
  });
});
