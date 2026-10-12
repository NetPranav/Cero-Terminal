import { describe, it, expect } from 'vitest';
import { desktopCommands, detectCompositor } from './DesktopCommands';
import { findInstantAnswer } from '../../ai/agent/InstantAnswers';
import { isReadOnlyCommandLine } from '../security/ReadOnlyCommandPolicy';
import { ShellAstParser } from '../security/ShellAstParser';

describe('DesktopCommands', () => {
  it('detects the compositor from the session', () => {
    expect(detectCompositor('Hyprland', 'wayland')).toBe('hyprland');
    expect(detectCompositor('sway', 'wayland')).toBe('sway');
    expect(detectCompositor('XFCE', 'x11')).toBe('x11');
    expect(detectCompositor('ubuntu:GNOME', 'wayland')).toBe('gnome');
    expect(detectCompositor('KDE', 'wayland')).toBe('kde');
  });

  it('builds valid commands for every compositor, with listing forms read-only', () => {
    for (const c of ['hyprland', 'sway', 'x11', 'gnome', 'kde', 'unknown'] as const) {
      const set = desktopCommands(c);
      for (const cmd of [set.listWindows, set.closeActive, set.focus('firefox'), set.moveActiveToWorkspace(3), set.screenshot(false), set.screenshot(true)]) {
        if (cmd) expect(ShellAstParser.validateSyntax(cmd).valid, `${c}: ${cmd}`).toBe(true);
      }
      if (set.listWindows) expect(isReadOnlyCommandLine(set.listWindows).readOnly, set.listWindows).toBe(true);
      if (set.closeActive) expect(isReadOnlyCommandLine(set.closeActive).readOnly).toBe(false);
    }
  });

  it('strips unsafe characters from window names', () => {
    expect(desktopCommands('hyprland').focus("fire'fox; rm -rf ~")).toBe("hyprctl dispatch focuswindow 'class:(?i)firefox rm -rf'");
  });

  it('answers window and screenshot requests for the current desktop', () => {
    expect(findInstantAnswer('list open windows', 'linux', { environment: 'Hyprland', session: 'wayland' })?.command).toContain('hyprctl clients');
    expect(findInstantAnswer('list open windows', 'linux', { environment: 'GNOME', session: 'wayland' })).toBeNull();
    expect(findInstantAnswer('take a screenshot', 'linux', { environment: 'sway', session: 'wayland' })?.command).toContain('grim "$f"');
    expect(findInstantAnswer('take a screenshot of a region', 'linux', { environment: 'XFCE', session: 'x11' })?.command).toContain('scrot -s');
  });
});
