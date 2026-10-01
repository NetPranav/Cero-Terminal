import { describe, it, expect } from 'vitest';
import { shouldCloseSettings } from './escapeKey';

describe('shouldCloseSettings', () => {
  it('returns true for Escape with Settings open', () => {
    expect(shouldCloseSettings({
      key: 'Escape',
      defaultPrevented: false,
      settingsOpen: true,
      escOwnerOpen: false,
    })).toBe(true);
  });

  it('returns false when Settings is closed', () => {
    expect(shouldCloseSettings({
      key: 'Escape',
      defaultPrevented: false,
      settingsOpen: false,
      escOwnerOpen: false,
    })).toBe(false);
  });

  it('returns false when the key is not Escape', () => {
    expect(shouldCloseSettings({
      key: 'Enter',
      defaultPrevented: false,
      settingsOpen: true,
      escOwnerOpen: false,
    })).toBe(false);
  });

  it('returns false when defaultPrevented is true', () => {
    expect(shouldCloseSettings({
      key: 'Escape',
      defaultPrevented: true,
      settingsOpen: true,
      escOwnerOpen: false,
    })).toBe(false);
  });

  it('returns false when an esc-owning child control is open', () => {
    expect(shouldCloseSettings({
      key: 'Escape',
      defaultPrevented: false,
      settingsOpen: true,
      escOwnerOpen: true,
    })).toBe(false);
  });
});
