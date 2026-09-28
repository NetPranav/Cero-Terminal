/**
 * RosPipelinePlanner.ts — ROS 2 requests that need several terminals.
 *
 * "run turtlesim, control it with the keyboard and show me the pose" is three processes that
 * each run until stopped: the simulator, the teleop node (interactive, needs its own keyboard
 * focus) and a topic echo. Each gets its own pane; short checks (node/topic list) run inline
 * afterwards to confirm the pipeline is up. Deterministic for the common cases so a small
 * model is not trusted with process layout.
 */

export interface RosPipeline {
  /** One line for the user */
  summary: string;
  /** Long-running commands, one pane each, in start order */
  panes: string[];
  /** Read-only commands run inline once the panes have started */
  checks: string[];
}

const TOPIC = String.raw`(\/[A-Za-z0-9_\/]+)`;

function isRosRequest(text: string): boolean {
  return /\b(?:ros2?|node|nodes|topic|topics|launch|turtle\s?sim|talker|listener|rviz2?|gazebo|teleop|bag|colcon\s+workspace)\b/i.test(text);
}

export function planRosPipeline(goal: string): RosPipeline | null {
  const text = goal.trim();
  if (!isRosRequest(text)) return null;
  // Questions about a running system are not start requests
  if (/^(?:what|which|is|are|does|do|list|show\s+(?:me\s+)?(?:the\s+)?(?:list|nodes|topics))\b/i.test(text) && !/\b(?:echo|subscribe|pose)\b/i.test(text)) return null;
  const wantsStart = /\b(?:run|start|launch|bring\s+up|spin\s+up|open|fire\s+up|set\s+up|demo|echo|subscribe|record|monitor|watch|listen|control|drive|teleop)\b/i.test(text);
  if (!wantsStart) return null;

  const panes: string[] = [];
  const add = (cmd: string) => { if (!panes.includes(cmd)) panes.push(cmd); };
  const lang = /\bpython|\bpy\b/i.test(text) ? 'demo_nodes_py' : 'demo_nodes_cpp';

  // Talker / listener demo
  const talker = /\btalker\b/i.test(text) || /\b(?:pub(?:lisher)?\s*(?:\/|and|&)\s*sub(?:scriber)?|chatter\s+demo|demo\s+nodes)\b/i.test(text);
  const listener = /\blistener\b/i.test(text) || /\b(?:pub(?:lisher)?\s*(?:\/|and|&)\s*sub(?:scriber)?|chatter\s+demo|demo\s+nodes)\b/i.test(text);
  if (talker) add(`ros2 run ${lang} talker`);
  if (listener) add(`ros2 run ${lang} listener`);

  // turtlesim, optionally with keyboard control and a pose monitor
  if (/\bturtle\s?sim\b/i.test(text)) {
    add('ros2 run turtlesim turtlesim_node');
    if (/\b(?:teleop|keyboard|control|drive|move|steer)\b/i.test(text)) add('ros2 run turtlesim turtle_teleop_key');
    if (/\b(?:pose|position|where\s+the\s+turtle)\b/i.test(text)) add('ros2 topic echo /turtle1/pose');
  }

  // Explicit launch files and nodes: "launch nav2_bringup navigation_launch.py", "run my_pkg my_node"
  for (const m of text.matchAll(/\b(?:ros2\s+)?launch\s+([a-z][\w]*)\s+([\w.-]+\.launch\.(?:py|xml|yaml)|[\w-]+_launch\.py|[\w-]+\.py)\b/gi)) {
    add(`ros2 launch ${m[1]} ${m[2]}`);
  }
  for (const m of text.matchAll(/\b(?:ros2\s+run|run\s+(?:the\s+)?node)\s+([a-z][\w]*)\s+([a-z][\w]*)\b/gi)) {
    add(`ros2 run ${m[1]} ${m[2]}`);
  }
  // Plain "run my_robot driver_node": ROS package and executable names carry underscores
  for (const m of text.matchAll(/\brun\s+([a-z][\w]*)\s+([a-z][\w]*)\b/gi)) {
    const [pkg, exe] = [m[1], m[2]];
    if (/^(?:the|a|an|it|ros2?|node|my|this|that)$/i.test(pkg)) continue;
    if (pkg.includes('_') || exe.includes('_')) add(`ros2 run ${pkg} ${exe}`);
  }

  // Topic streams: "echo /scan", "subscribe to /odom", "monitor /cmd_vel"
  for (const m of text.matchAll(new RegExp(`\\b(?:echo|subscribe(?:\\s+to)?|monitor|watch|listen\\s+to|show\\s+(?:me\\s+)?(?:the\\s+)?(?:messages\\s+on)?)\\s+(?:the\\s+)?(?:topic\\s+)?${TOPIC}`, 'gi'))) {
    add(`ros2 topic echo ${m[1]}`);
  }
  // Bags: "record all topics", "record /scan and /odom"
  if (/\brecord\b/i.test(text) && /\bbag\b|\ball\s+topics\b/i.test(text)) {
    const topics = [...text.matchAll(new RegExp(TOPIC, 'g'))].map(m => m[1]);
    add(topics.length ? `ros2 bag record ${topics.join(' ')}` : 'ros2 bag record -a');
  }
  if (/\brviz2?\b/i.test(text)) add('rviz2');

  if (panes.length === 0) return null;
  const echoes = panes.filter(p => /topic echo/.test(p)).length;
  return {
    summary: `${panes.length} process${panes.length === 1 ? '' : 'es'} in separate terminals${echoes ? `, ${echoes} topic monitor${echoes === 1 ? '' : 's'}` : ''}`,
    panes,
    checks: ['ros2 node list', 'ros2 topic list']
  };
}
