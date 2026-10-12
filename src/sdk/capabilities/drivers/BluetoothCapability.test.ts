import { describe, it, expect } from 'vitest';
import { matchPairedDevice } from './BluetoothCapability';

describe('matchPairedDevice', () => {
  const paired = [
    { name: 'Soundcore Space One', address: '00-11-22-33-44-55' },
    { name: 'MX Master 3S', address: 'AA-BB-CC-DD-EE-FF' },
  ];

  it('drops peripheral nouns and matches by substring', () => {
    expect(matchPairedDevice('soundcore headphones', paired)).toBe('00-11-22-33-44-55');
  });

  it('falls back to the closest name by edit distance', () => {
    expect(matchPairedDevice('MX Mastr 3S', paired)).toBe('AA-BB-CC-DD-EE-FF');
  });

  it('returns null when nothing is close', () => {
    expect(matchPairedDevice('Galaxy Buds', paired)).toBeNull();
  });
});
