import { describe, it, expect } from 'vitest';
import { ProjectDiscoveryEngine, DiscoveredProject, FileSystemScanner } from './ProjectDiscoveryEngine';

describe('ProjectDiscoveryEngine', () => {
  const mockScanner: FileSystemScanner = {
    readdir: async (dir: string) => {
      if (dir === '/home/user/workspaces') {
        return ['drone_ws', 'rover_ws', 'robotics_ws'];
      }
      if (dir === '/home/user/workspaces/drone_ws') {
        return ['src', 'install', 'package.xml'];
      }
      if (dir === '/home/user/workspaces/drone_ws/src') {
        return ['gazebo_quad.launch.py'];
      }
      if (dir === '/home/user/workspaces/rover_ws') {
        return ['src', 'devel', 'package.xml'];
      }
      if (dir === '/home/user/workspaces/rover_ws/src') {
        return ['rover_gazebo.launch'];
      }
      if (dir === '/home/user/workspaces/robotics_ws') {
        return ['package.json'];
      }
      return [];
    },
    stat: async (p: string) => {
      const isDir = !p.includes('.') || p.endsWith('_ws') || p.endsWith('/src') || p.endsWith('/install') || p.endsWith('/devel');
      return { isDirectory: () => isDir };
    },
    readFile: async (p: string) => {
      if (p.includes('drone_ws/package.xml')) {
        return '<package format="3"><name>quad_sim</name><buildtool_depend>ament_cmake</buildtool_depend></package>';
      }
      if (p.includes('rover_ws/package.xml')) {
        return '<package><name>rover_gazebo</name><buildtool_depend>catkin</buildtool_depend></package>';
      }
      if (p.includes('robotics_ws/package.json')) {
        return JSON.stringify({ name: 'robotics-web', scripts: { dev: 'vite' } });
      }
      return '';
    },
    exists: async (p: string) => {
      if (p.includes('drone_ws/install/setup.bash')) return true;
      if (p.includes('rover_ws/devel/setup.bash')) return true;
      return false;
    }
  };

  it('should scan workspaces and discover projects matching keyword', async () => {
    const probe = await ProjectDiscoveryEngine.probe(
      'gazebo',
      ['/home/user/workspaces'],
      mockScanner
    );

    expect(probe.matches.length).toBe(2);
    expect(probe.matches[0].name).toBe('drone_ws');
    expect(probe.matches[0].type).toBe('ros2');
    expect(probe.matches[0].setupScript).toBe('source install/setup.bash');

    expect(probe.matches[1].name).toBe('rover_ws');
    expect(probe.matches[1].type).toBe('ros1');
    expect(probe.matches[1].setupScript).toBe('source devel/setup.bash');
  });

  it('should format clean numbered disambiguation prompt when multiple projects match', async () => {
    const probe = await ProjectDiscoveryEngine.probe(
      'gazebo',
      ['/home/user/workspaces'],
      mockScanner
    );

    expect(probe.disambiguationRequired).toBe(true);
    expect(probe.disambiguationPrompt).toBeDefined();
    expect(probe.disambiguationPrompt).toContain('Found 2 project workspaces matching "gazebo":');
    expect(probe.disambiguationPrompt).toContain('[1]');
    expect(probe.disambiguationPrompt).toContain('[2]');
    expect(probe.disambiguationPrompt).toContain('Which project would you like to run? [1-2]:');
  });

  it('should resolve user selection by numeric choice', () => {
    const candidates: DiscoveredProject[] = [
      { id: '1', name: 'drone_sim', path: '/home/user/drone_ws', type: 'ros2', confidence: 100 },
      { id: '2', name: 'rover_sim', path: '/home/user/rover_ws', type: 'ros1', confidence: 90 }
    ];

    const selected1 = ProjectDiscoveryEngine.resolveSelection('1', candidates);
    expect(selected1).toBeDefined();
    expect(selected1?.name).toBe('drone_sim');

    const selected2 = ProjectDiscoveryEngine.resolveSelection('2', candidates);
    expect(selected2).toBeDefined();
    expect(selected2?.name).toBe('rover_sim');
  });

  it('should resolve user selection by project name substring', () => {
    const candidates: DiscoveredProject[] = [
      { id: '1', name: 'drone_sim', path: '/home/user/drone_ws', type: 'ros2', confidence: 100 },
      { id: '2', name: 'rover_sim', path: '/home/user/rover_ws', type: 'ros1', confidence: 90 }
    ];

    const selected = ProjectDiscoveryEngine.resolveSelection('rover', candidates);
    expect(selected).toBeDefined();
    expect(selected?.id).toBe('2');
    expect(selected?.name).toBe('rover_sim');
  });
});
