import { describe, it, expect } from 'vitest';
import { bestKnownSsid } from './WifiCapability';

describe('bestKnownSsid', () => {
  const known = ['Office_5G', 'Home-WiFi-5G', 'Cafe Guest'];

  it('maps a loose spoken name to the known profile', () => {
    expect(bestKnownSsid('the office wifi', known)?.ssid).toBe('Office_5G');
    expect(bestKnownSsid('home wifi 5g', known)?.ssid).toBe('Home-WiFi-5G');
  });

  it('tolerates a small typo', () => {
    expect(bestKnownSsid('gust', known)?.ssid).toBe('Cafe Guest');
  });

  it('returns null when nothing matches', () => {
    expect(bestKnownSsid('airport lounge', known)).toBeNull();
  });
});
