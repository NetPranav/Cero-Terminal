import { describe, it, expect, beforeEach } from 'vitest';
import { ProcessPortManager, getPortMetadata } from './ProcessPortManager';

describe('ProcessPortManager (Active Ports & Process Inspector)', () => {
  let manager: ProcessPortManager;

  beforeEach(() => {
    manager = new ProcessPortManager();
  });

  it('parses lsof output into structured listening port objects with category and status', () => {
    const mockLsof = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      14210 pranav   23u  IPv6 0x1234567890abcdef      0t0  TCP *:3000 (LISTEN)
vite      14582 pranav   28u  IPv4 0xabcdef1234567890      0t0  TCP 127.0.0.1:5173 (LISTEN)
llama-ser 18931 pranav   30u  IPv4 0xfe01ab2345678901      0t0  TCP 127.0.0.1:8847 (LISTEN)
`;

    const ports = manager.parseLsofOutput(mockLsof);
    expect(ports.length).toBe(3);

    expect(ports[0].port).toBe(3000);
    expect(ports[0].pid).toBe(14210);
    expect(ports[0].processName).toBe('node');
    expect(ports[0].status).toBe('LISTEN');
    expect(ports[0].category).toBe('Dev Server');
    expect(ports[0].description).toContain('Web Dev Server');

    expect(ports[1].port).toBe(5173);
    expect(ports[1].category).toBe('Dev Server');

    expect(ports[2].port).toBe(8847);
    expect(ports[2].category).toBe('AI Sidecar');
    expect(ports[2].description).toContain('Cero Embedded AI');
  });

  it('determines appropriate port category metadata', () => {
    expect(getPortMetadata(8847, 'llama-server').category).toBe('AI Sidecar');
    expect(getPortMetadata(11434, 'ollama').category).toBe('AI Sidecar');
    expect(getPortMetadata(5432, 'postgres').category).toBe('Database');
    expect(getPortMetadata(3000, 'node').category).toBe('Dev Server');
  });

  it('returns default mock ports in test mode', async () => {
    const ports = await manager.getListeningPorts();
    expect(ports.length).toBe(3);
    expect(ports.some(p => p.port === 8847)).toBe(true);
  });
});
