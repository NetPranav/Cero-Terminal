/**
 * RosEnvironment.ts — make ROS 2 commands work from Sentinel.
 *
 * Agent commands run in a non-interactive `bash -c`, which never reads ~/.bashrc, so `ros2`,
 * `colcon` and `rosdep` were "command not found" unless Sentinel itself was started from a
 * sourced shell. This module prefixes such commands with the ROS setup script and the nearest
 * workspace overlay, and bounds commands that otherwise stream forever.
 */

/** Binaries that only exist after sourcing a ROS 2 setup script */
const ROS_COMMAND = /(^|[;&|(]\s*|\bsudo\s+|\btimeout\s+\d+\s+)(ros2|colcon|rosdep|ament_\w+|rqt\w*|rviz2|gz|ign|xacro|ros2cli)\b/;

export function needsRosEnvironment(command: string): boolean {
  return ROS_COMMAND.test(command) && !/\/opt\/ros\/[^/]+\/setup\.(?:bash|sh|zsh)/.test(command);
}

/**
 * Pick the distro to source: the one already active in the environment, else the newest
 * installed non-rolling distro (ROS 2 names are alphabetical by release), else rolling.
 */
export function chooseRosDistro(installed: string[], active?: string): string | undefined {
  if (active && installed.includes(active)) return active;
  const releases = installed.filter(d => d !== 'rolling').sort();
  return releases[releases.length - 1] || (installed.includes('rolling') ? 'rolling' : active);
}

/**
 * Shell prefix that sources ROS and the closest colcon workspace overlay (cwd or up to three
 * parents, so it also works from inside src/<package>).
 */
export function rosEnvironmentPrefix(distro?: string): string {
  const base = distro
    ? `[ -f /opt/ros/${distro}/setup.bash ] && . /opt/ros/${distro}/setup.bash`
    : 'for __ros in /opt/ros/*/setup.bash; do [ -f "$__ros" ] && __ros_setup="$__ros"; done; [ -n "$__ros_setup" ] && . "$__ros_setup"';
  const overlay = 'for __ws in . .. ../.. ../../..; do if [ -f "$__ws/install/setup.bash" ]; then . "$__ws/install/setup.bash"; break; fi; done';
  return `${base}; ${overlay};`;
}

/** Commands that never exit on their own get a bound so the agent does not wait for its timeout. */
export function boundStreamingRosCommand(command: string): string {
  let result = command.replace(/\bros2\s+topic\s+echo\b(?![^;&|]*--once)/g, 'ros2 topic echo --once');
  result = result.replace(/(^|[;&|]\s*)(ros2\s+topic\s+(?:hz|bw|delay)\b)/g, '$1timeout 10 $2');
  return result;
}

export function withRosEnvironment(command: string, distro?: string): string {
  if (!needsRosEnvironment(command)) return command;
  return `${rosEnvironmentPrefix(distro)} ${boundStreamingRosCommand(command)}`;
}

/**
 * Prefix for a command typed into an interactive terminal pane. The pane runs the user's own
 * shell, so zsh needs setup.zsh (setup.bash fails there). No globs: an unmatched glob aborts
 * the whole line in zsh. Streams are not bounded: a pane is where a stream belongs.
 */
export function rosPaneSetupPrefix(shell: string, distro?: string): string {
  const ext = /zsh$/.test(shell || '') ? 'zsh' : 'bash';
  const src = ext === 'zsh' ? 'source' : '.';
  const base = distro
    ? `[ -f /opt/ros/${distro}/setup.${ext} ] && ${src} /opt/ros/${distro}/setup.${ext}`
    : `__ros=$(find /opt/ros -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -n 1); [ -n "$__ros" ] && [ -f "$__ros/setup.${ext}" ] && ${src} "$__ros/setup.${ext}"`;
  const overlay = `for __ws in . .. ../.. ../../..; do if [ -f "$__ws/install/setup.${ext}" ]; then ${src} "$__ws/install/setup.${ext}"; break; fi; done`;
  return `${base}; ${overlay};`;
}

export function withRosEnvironmentForPane(command: string, shell: string, distro?: string): string {
  if (!needsRosEnvironment(command)) return command;
  return `${rosPaneSetupPrefix(shell, distro)} ${command}`;
}
