import { describe, it, expect, vi } from 'vitest';
import { installSettingsEscape, shouldCloseSettings } from './escapeKey';

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

describe('installSettingsEscape (real listener wiring)', () => {
  const press = (target: EventTarget, key: string) => {
    const ev = new Event('keydown', { cancelable: true, bubbles: true }) as Event & { key: string };
    ev.key = key;
    target.dispatchEvent(ev);
    return ev;
  };

  it('closes on Escape and consumes the event so xterm underneath never sees it', () => {
    const win = new EventTarget();
    const close = vi.fn();
    const added: Array<[string, boolean | undefined]> = [];
    const spyTarget = {
      addEventListener: (t: string, l: any, o?: any) => { added.push([t, o]); win.addEventListener(t, l, o); },
      removeEventListener: win.removeEventListener.bind(win),
    };
    installSettingsEscape(spyTarget, { hasEscOwnerOpen: () => false, close });
    expect(added).toEqual([['keydown', true]]); // capture phase, so it runs before xterm

    const ev = new Event('keydown', { cancelable: true }) as Event & { key: string };
    ev.key = 'Escape';
    const stop = vi.spyOn(ev, 'stopPropagation');
    win.dispatchEvent(ev);
    expect(close).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys and does not swallow them', () => {
    const win = new EventTarget();
    const close = vi.fn();
    const later = vi.fn();
    win.addEventListener('keydown', later);
    installSettingsEscape(win, { hasEscOwnerOpen: () => false, close });
    press(win, 'a');
    press(win, 'ArrowLeft');
    expect(close).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledTimes(2);
  });

  it('lets a child that owns Escape (open dropdown) handle it first', () => {
    const win = new EventTarget();
    const close = vi.fn();
    installSettingsEscape(win, { hasEscOwnerOpen: () => true, close });
    press(win, 'Escape');
    expect(close).not.toHaveBeenCalled();
  });

  it('stops listening once removed (Settings closed)', () => {
    const win = new EventTarget();
    const close = vi.fn();
    const remove = installSettingsEscape(win, { hasEscOwnerOpen: () => false, close });
    remove();
    press(win, 'Escape');
    expect(close).not.toHaveBeenCalled();
  });
});
