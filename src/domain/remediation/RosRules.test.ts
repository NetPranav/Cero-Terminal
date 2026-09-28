import { describe, it, expect } from 'vitest';
import { DeterministicRuleOracle } from './DeterministicRuleOracle';

const diagnose = (output: string, command = '') =>
  DeterministicRuleOracle.getInstance().diagnose({ command, output, os: 'linux', cwd: '/home/u/ros2_ws' });

describe('ROS 2 and Linux remediation rules', () => {
  it('sources ROS when its tools are missing from PATH', () => {
    const fix = diagnose('bash: ros2: command not found', 'ros2 topic list');
    expect(fix?.ruleId).toBe('ros_not_sourced');
    expect(fix?.fixedCommand).toContain('/opt/ros/');
    expect(fix?.fixedCommand).toContain('&& ros2 topic list');
  });

  it('sources the workspace overlay for an unknown package', () => {
    const fix = diagnose("Package 'my_robot' not found", 'ros2 launch my_robot bringup.launch.py');
    expect(fix?.ruleId).toBe('ros_package_not_found');
    expect(fix?.fixedCommand).toBe('source install/setup.bash && ros2 launch my_robot bringup.launch.py');
  });

  it('proposes rosdep for missing CMake packages and marks it as needing sudo', () => {
    const fix = diagnose('CMake Error at CMakeLists.txt:20 (find_package):\n  Could not find a package configuration file provided by "nav2_msgs" with any of the following names');
    expect(fix?.ruleId).toBe('ros_missing_dependencies');
    expect(fix?.requiresElevation).toBe(true);
  });

  it('handles the Linux docker daemon and socket errors', () => {
    expect(diagnose('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?', 'docker ps')?.ruleId)
      .toBe('linux_docker_daemon_not_running');
    expect(diagnose('permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock')?.ruleId)
      .toBe('linux_docker_socket_permission');
  });

  it('does not fire ROS rules on macOS', () => {
    const fix = DeterministicRuleOracle.getInstance().diagnose({ command: 'ros2 topic list', output: 'zsh: command not found: ros2', os: 'mac' });
    expect(fix?.ruleId).not.toBe('ros_not_sourced');
  });
});
