import { describe, it, expect } from 'vitest';
import { EntityExtractor } from '../intent/EntityExtractor';

describe('Phase X — Entity Extractor Verification', () => {
  const extractor = new EntityExtractor();

  it('should extract Bluetooth devices and device names from natural language', () => {
    const res = extractor.extract('Turn on bluetooth and connect my headphones.');
    expect(res.bluetooth_devices).toContain('headphones');
    expect(res.device_names).toContain('headphones');

    const res2 = extractor.extract('Pair with AirPods Pro now');
    expect(res2.bluetooth_devices).toContain('airpods pro');
  });

  it('should extract applications and desktop tools', () => {
    const res = extractor.extract('Open Chrome and launch Spotify');
    expect(res.applications).toContain('Chrome');
    expect(res.applications).toContain('Spotify');
  });

  it('should extract IP addresses and ports accurately', () => {
    const res = extractor.extract('Connect to server at 192.168.1.150 on port 8080');
    expect(res.ip_addresses).toEqual(['192.168.1.150']);
    expect(res.ports).toEqual([8080]);
  });

  it('should extract repositories, URLs, and containers', () => {
    const res = extractor.extract('Clone repository github.com/facebook/react and run postgres container');
    expect(res.repositories).toContain('facebook/react');
    expect(res.containers).toContain('postgres');
  });

  it('should extract file paths and folders', () => {
    const res = extractor.extract('List files in /Users/dev/Documents and view config.json');
    expect(res.paths).toContain('/Users/dev/Documents');
    expect(res.files).toContain('config.json');
  });

  it('should intelligently recognize standard macOS folders and handle common typos', () => {
    const res1 = extractor.extract('show the content of Downlods');
    expect(res1.folders).toContain('~/Downloads');

    const res2 = extractor.extract('Hey there go to Donwloads Folder');
    expect(res2.folders).toContain('~/Downloads');

    const res3 = extractor.extract('check my Desktop directory');
    expect(res3.folders).toContain('~/Desktop');
  });

  it('should cleanly extract SSIDs from conversational connection phrases', () => {
    const res1 = extractor.extract('connect me to nothing phone 3a pro');
    expect(res1.SSID).toContain('nothing phone 3a pro');

    const res2 = extractor.extract('connect it to nothing phone 3a');
    expect(res2.SSID).toContain('nothing phone 3a');

    const res3 = extractor.extract('connect me to wifi name similar to nothing phone');
    expect(res3.SSID).toContain('nothing phone');

    const res4 = extractor.extract('connect to nothing phone 3a pro wifi');
    expect(res4.SSID).toContain('nothing phone 3a pro');
  });
});
