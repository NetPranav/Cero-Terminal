/**
 * DesktopCommands.ts — window control and screenshots for the Linux desktop in use.
 *
 * The right tool depends on the compositor: Hyprland (hyprctl), Sway (swaymsg), any X11 window
 * manager (wmctrl/xdotool), and for screenshots grim+slurp on wlroots, gnome-screenshot on GNOME,
 * spectacle on KDE, scrot on X11. GNOME and KDE on Wayland expose no generic window-control CLI,
 * so those operations return null there instead of a command that cannot work.
 */

export type Compositor = 'hyprland' | 'sway' | 'gnome' | 'kde' | 'x11' | 'unknown';

export function detectCompositor(desktopEnvironment?: string, sessionType?: string): Compositor {
  const de = (desktopEnvironment || '').toLowerCase();
  if (de.includes('hyprland')) return 'hyprland';
  if (de.includes('sway')) return 'sway';
  if (sessionType === 'x11') return 'x11';
  if (de.includes('gnome') || de.includes('ubuntu') || de.includes('pop')) return 'gnome';
  if (de.includes('kde') || de.includes('plasma')) return 'kde';
  return 'unknown';
}

/** Characters allowed in a window/app name used inside a command */
const safeName = (name: string) => name.replace(/[^A-Za-z0-9 ._-]/g, '').trim();

export interface DesktopCommandSet {
  listWindows: string | null;
  focus: (appName: string) => string | null;
  moveActiveToWorkspace: (workspace: number) => string | null;
  closeActive: string | null;
  screenshot: (region: boolean) => string;
}

const SCREENSHOT_PATH = '"$HOME/Pictures/Screenshots/sentinel-$(date +%Y%m%d-%H%M%S).png"';
const withDir = (cmd: string) => `mkdir -p "$HOME/Pictures/Screenshots" && f=${SCREENSHOT_PATH} && ${cmd} && echo "Saved $f"`;

export function desktopCommands(compositor: Compositor): DesktopCommandSet {
  switch (compositor) {
    case 'hyprland':
      return {
        listWindows: `hyprctl clients -j | jq -r '.[] | "\\(.workspace.name)\\t\\(.class)\\t\\(.title)"' 2>/dev/null || hyprctl clients`,
        focus: (name) => safeName(name) ? `hyprctl dispatch focuswindow 'class:(?i)${safeName(name)}'` : null,
        moveActiveToWorkspace: (n) => `hyprctl dispatch movetoworkspace ${Math.trunc(n)}`,
        closeActive: 'hyprctl dispatch killactive',
        screenshot: (region) => withDir(region ? 'grim -g "$(slurp)" "$f"' : 'grim "$f"'),
      };
    case 'sway':
      return {
        listWindows: `swaymsg -t get_tree | jq -r '.. | objects | select(.type? == "con" and .name != null) | "\\(.app_id // .window_properties.class)\\t\\(.name)"'`,
        focus: (name) => safeName(name) ? `swaymsg '[app_id="(?i)${safeName(name)}"] focus'` : null,
        moveActiveToWorkspace: (n) => `swaymsg move container to workspace number ${Math.trunc(n)}`,
        closeActive: 'swaymsg kill',
        screenshot: (region) => withDir(region ? 'grim -g "$(slurp)" "$f"' : 'grim "$f"'),
      };
    case 'x11':
      return {
        listWindows: 'wmctrl -lx',
        focus: (name) => safeName(name) ? `wmctrl -xa '${safeName(name)}'` : null,
        moveActiveToWorkspace: (n) => `wmctrl -r :ACTIVE: -t ${Math.max(0, Math.trunc(n) - 1)}`,
        closeActive: 'wmctrl -c :ACTIVE:',
        screenshot: (region) => withDir(region ? 'scrot -s "$f"' : 'scrot "$f"'),
      };
    case 'gnome':
      return {
        listWindows: null,
        focus: () => null,
        moveActiveToWorkspace: () => null,
        closeActive: null,
        screenshot: (region) => withDir(region ? 'gnome-screenshot -a -f "$f"' : 'gnome-screenshot -f "$f"'),
      };
    case 'kde':
      return {
        listWindows: null,
        focus: () => null,
        moveActiveToWorkspace: () => null,
        closeActive: null,
        screenshot: (region) => withDir(`spectacle -b -n ${region ? '-r' : '-f'} -o "$f"`),
      };
    default:
      return {
        listWindows: null,
        focus: () => null,
        moveActiveToWorkspace: () => null,
        closeActive: null,
        screenshot: (region) => withDir(region
          ? '(grim -g "$(slurp)" "$f" || scrot -s "$f")'
          : '(grim "$f" || scrot "$f" || import -window root "$f")'),
      };
  }
}
