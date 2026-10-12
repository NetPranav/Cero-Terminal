import { describe, it, expect } from 'vitest';
import { planRosPipeline } from './RosPipelinePlanner';
import { isLongRunningCommand } from '../terminal/TerminalWorkspace';

describe('planRosPipeline', () => {
  it('starts the talker and listener in separate terminals', () => {
    expect(planRosPipeline('run the ros2 talker and listener demo')?.panes).toEqual([
      'ros2 run demo_nodes_cpp talker',
      'ros2 run demo_nodes_cpp listener',
    ]);
    expect(planRosPipeline('start a python talker and listener')?.panes[0]).toBe('ros2 run demo_nodes_py talker');
  });

  it('builds the turtlesim pipeline: simulator, keyboard teleop and a pose monitor', () => {
    const plan = planRosPipeline('run turtlesim, control it with the keyboard and show me the pose')!;
    expect(plan.panes).toEqual([
      'ros2 run turtlesim turtlesim_node',
      'ros2 run turtlesim turtle_teleop_key',
      'ros2 topic echo /turtle1/pose',
    ]);
    expect(plan.checks).toEqual(['ros2 node list', 'ros2 topic list']);
    expect(plan.panes.every(isLongRunningCommand)).toBe(true);
  });

  it('launches files, runs named nodes and subscribes to topics', () => {
    const plan = planRosPipeline('launch nav2_bringup navigation_launch.py, run my_robot driver_node and subscribe to /odom and echo /scan')!;
    expect(plan.panes).toEqual([
      'ros2 launch nav2_bringup navigation_launch.py',
      'ros2 run my_robot driver_node',
      'ros2 topic echo /odom',
      'ros2 topic echo /scan',
    ]);
  });

  it('records bags', () => {
    expect(planRosPipeline('record a ros bag of all topics')?.panes).toEqual(['ros2 bag record -a']);
    expect(planRosPipeline('record a bag of /scan and /odom')?.panes).toEqual(['ros2 bag record /scan /odom']);
  });

  it('leaves questions and unrelated requests alone', () => {
    expect(planRosPipeline('list the ros2 nodes')).toBeNull();
    expect(planRosPipeline('which topics are there')).toBeNull();
    expect(planRosPipeline('start the dev server')).toBeNull();
    expect(planRosPipeline('build my colcon workspace')).toBeNull();
  });
});
