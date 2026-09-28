import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { needsRosEnvironment, chooseRosDistro, withRosEnvironment, boundStreamingRosCommand } from './RosEnvironment';
import { ShellAstParser } from '../security/ShellAstParser';

describe('RosEnvironment', () => {
  it('detects commands that need a sourced ROS environment', () => {
    expect(needsRosEnvironment('ros2 topic list')).toBe(true);
    expect(needsRosEnvironment('cd ~/ws && colcon build --symlink-install')).toBe(true);
    expect(needsRosEnvironment('sudo rosdep init')).toBe(true);
    expect(needsRosEnvironment('source /opt/ros/humble/setup.bash && ros2 node list')).toBe(false);
    expect(needsRosEnvironment('ls ros2_ws')).toBe(false);
  });

  it('prefers the active distro, then the newest release', () => {
    expect(chooseRosDistro(['humble', 'jazzy'], 'humble')).toBe('humble');
    expect(chooseRosDistro(['humble', 'jazzy', 'rolling'])).toBe('jazzy');
    expect(chooseRosDistro(['rolling'])).toBe('rolling');
    expect(chooseRosDistro([])).toBeUndefined();
  });

  it('bounds commands that would stream forever', () => {
    expect(boundStreamingRosCommand('ros2 topic echo /odom')).toBe('ros2 topic echo --once /odom');
    expect(boundStreamingRosCommand('ros2 topic echo --once /odom')).toBe('ros2 topic echo --once /odom');
    expect(boundStreamingRosCommand('ros2 topic hz /scan')).toBe('timeout 10 ros2 topic hz /scan');
  });

  it('produces valid bash that sources ROS and the nearest workspace overlay', () => {
    const cmd = withRosEnvironment('ros2 topic list', 'jazzy');
    expect(cmd).toContain('. /opt/ros/jazzy/setup.bash');
    expect(cmd).toContain('install/setup.bash');
    expect(ShellAstParser.validateSyntax(cmd).valid).toBe(true);
    // Runs cleanly in a real shell even when ROS is not installed (the command itself then fails)
    const res = spawnSync('/bin/bash', ['-c', withRosEnvironment('ros2 --help >/dev/null 2>&1; echo reached')], { encoding: 'utf-8' });
    expect(res.stdout.trim()).toBe('reached');
  });
});
