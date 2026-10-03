import { describe, it, expect, vi } from 'vitest';
import { AdaptivePlanEngine, AgentPlan, PlanPhase } from './AdaptivePlanEngine';

describe('AdaptivePlanEngine — Dynamic Multi-Phase Planning & Execution', () => {
  it('should generate a multi-phase plan for composite user requests', async () => {
    const engine = new AdaptivePlanEngine();
    const plan = await engine.createPlan('connect bluetooth headphones Soundcore Space One', { os: 'mac', cwd: '/Users/test' });

    expect(plan).toBeDefined();
    expect(plan.phases.length).toBeGreaterThanOrEqual(3);
    expect(plan.phases[0].id).toBe('1');
    expect(plan.phases[0].title).toContain('Bluetooth');
    expect(plan.phases[1].id).toBe('2');
    expect(plan.phases[1].title).toContain('Soundcore Space One');
    expect(plan.phases[2].id).toBe('3');
  });

  it('should execute phases 1 by 1 and skip remaining phases upon early goal fulfillment', async () => {
    const engine = new AdaptivePlanEngine();
    const plan: AgentPlan = {
      summary: 'Connect Soundcore Space One Headphones',
      steps: ['Check Bluetooth status', 'Connect to Soundcore Space One', 'Verify audio routing', 'Configure volume balance'],
      phases: [
        { id: '1', title: 'Check Bluetooth status', tool: 'network.bluetooth.on', status: 'pending' },
        { id: '2', title: 'Connect to Soundcore Space One', tool: 'network.bluetooth.connect', params: { device: 'Soundcore Space One' }, status: 'pending' },
        { id: '3', title: 'Verify audio routing', tool: 'system.audio', status: 'pending' },
        { id: '4', title: 'Configure volume balance', tool: 'system.volume', status: 'pending' }
      ]
    };

    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockImplementation(async (toolId: string) => {
        if (toolId === 'network.bluetooth.on') {
          return { success: true, data: { poweredOn: true } };
        }
        if (toolId === 'network.bluetooth.connect') {
          // Goal fulfilled at Phase 2!
          return { success: true, data: { connected: true, device: 'Soundcore Space One' } };
        }
        return { success: true, data: {} };
      })
    };

    const phaseStarted: string[] = [];
    const phaseDone: string[] = [];

    const result = await engine.executePlan('connect bluetooth headphone Soundcore Space One', plan, {
      cwd: '/Users/test',
      os: 'mac',
      toolExecutor: mockToolExecutor,
      onPhaseStart: (p) => phaseStarted.push(p.id),
      onPhaseDone: (p) => phaseDone.push(p.id)
    });

    expect(result.success).toBe(true);
    // Phase 1 and 2 ran
    expect(phaseStarted).toEqual(['1', '2']);
    expect(plan.phases[0].status).toBe('completed');
    expect(plan.phases[1].status).toBe('completed');

    // Early Goal Satisfaction: Phase 3 and 4 were skipped!
    expect(plan.phases[2].status).toBe('skipped');
    expect(plan.phases[2].skippedReason).toContain('Goal fully achieved early');
    expect(plan.phases[3].status).toBe('skipped');

    // Tool for Phase 3 and Phase 4 was never executed
    expect(mockToolExecutor.execute).toHaveBeenCalledTimes(2);
    expect(result.summary).toContain('2 subsequent phase(s) skipped');
  });

  it('should dynamically inject and execute sub-phases (e.g. 2.1, 2.2) when prerequisites are discovered', async () => {
    const engine = new AdaptivePlanEngine();
    const plan: AgentPlan = {
      summary: 'Connect Bluetooth Device',
      steps: ['Initialize Bluetooth', 'Connect to target peripheral'],
      phases: [
        { id: '1', title: 'Initialize Bluetooth', tool: 'network.bluetooth.on', status: 'pending' },
        { id: '2', title: 'Connect to target peripheral', tool: 'network.bluetooth.connect', params: { device: 'Space One' }, status: 'pending' }
      ]
    };

    let connectAttempt = 0;
    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockImplementation(async (toolId: string) => {
        if (toolId === 'network.bluetooth.connect') {
          connectAttempt++;
          if (connectAttempt === 1) {
            // First attempt fails because Bluetooth power was unexpectedly off
            return { success: false, error: 'Bluetooth power is off' };
          }
          // After sub-phases resolve prerequisite, retry succeeds
          return { success: true, data: { connected: true, device: 'Space One' } };
        }
        if (toolId === 'network.bluetooth.on') {
          return { success: true, data: { poweredOn: true } };
        }
        if (toolId === 'network.bluetooth.scan') {
          return { success: true, data: { found: ['Space One'] } };
        }
        return { success: true, data: {} };
      })
    };

    const phaseStarted: string[] = [];
    const result = await engine.executePlan('connect bluetooth headphone Space One', plan, {
      cwd: '/Users/test',
      os: 'mac',
      toolExecutor: mockToolExecutor,
      onPhaseStart: (p) => phaseStarted.push(p.id)
    });

    expect(result.success).toBe(true);

    // Verify sub-phases were injected under Phase 2
    expect(plan.phases[1].subPhases).toBeDefined();
    expect(plan.phases[1].subPhases?.length).toBe(2);

    expect(plan.phases[1].subPhases![0].id).toBe('2.1');
    expect(plan.phases[1].subPhases![0].title).toBe('Power on Bluetooth adapter');
    expect(plan.phases[1].subPhases![0].status).toBe('completed');

    expect(plan.phases[1].subPhases![1].id).toBe('2.2');
    expect(plan.phases[1].subPhases![1].title).toBe('Scan for target peripheral');
    expect(plan.phases[1].subPhases![1].status).toBe('completed');

    // Both Phase 1, Phase 2, and sub-phases 2.1 & 2.2 executed
    expect(phaseStarted).toContain('1');
    expect(phaseStarted).toContain('2');
    expect(phaseStarted).toContain('2.1');
    expect(phaseStarted).toContain('2.2');
  });

  it('should support external / cloud AI API planners via pluggable PlannerModelProvider', async () => {
    // Simulate future cloud AI API (OpenAI / Claude / Gemini endpoint)
    const mockCloudAI = {
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          summary: 'Build and deploy production Next.js application',
          phases: [
            { id: '1', title: 'Audit and install dependencies', tool: 'shell.execute' },
            { id: '2', title: 'Compile and build production bundle', tool: 'shell.execute' },
            { id: '3', title: 'Run automated end-to-end test suite', tool: 'shell.execute' },
            { id: '4', title: 'Deploy container artifact', tool: 'docker.run' }
          ]
        })
      })
    };

    const cloudEngine = new AdaptivePlanEngine(mockCloudAI, 'gpt-4o');
    const plan = await cloudEngine.createPlan('build and deploy nextjs app', { os: 'mac', cwd: '/workspace' });

    expect(mockCloudAI.generate).toHaveBeenCalledOnce();
    expect(plan.phases.length).toBe(4);
    expect(plan.phases[0].id).toBe('1');
    expect(plan.phases[0].title).toBe('Audit and install dependencies');
    expect(plan.phases[3].id).toBe('4');
    expect(plan.phases[3].title).toBe('Deploy container artifact');
  });

  it('should autonomously self-heal software errors (e.g. EADDRINUSE port collision)', async () => {
    const engine = new AdaptivePlanEngine();
    const plan: AgentPlan = {
      summary: 'Launch local web service',
      steps: ['Start service on port 3000'],
      phases: [
        { id: '1', title: 'Start service on port 3000', tool: 'shell.execute', params: { command: 'node server.js' }, status: 'pending' }
      ]
    };

    let serverAttempts = 0;
    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockImplementation(async (toolId: string, params: any) => {
        if (toolId === 'shell.execute') {
          serverAttempts++;
          if (serverAttempts === 1) {
            // First attempt fails with EADDRINUSE port collision
            return {
              success: false,
              stderr: 'Error: listen EADDRINUSE: address already in use :::3000',
              error: 'Port 3000 is occupied'
            };
          }
          // After self-healing sub-phase frees port, second attempt succeeds!
          return { success: true, data: { stdout: 'Server listening on http://localhost:3000' } };
        }
        if (toolId === 'system.kill_process') {
          // Remediation sub-phase
          return { success: true, data: { stdout: 'Killed PID 4912 listening on port 3000' } };
        }
        return { success: true, data: {} };
      })
    };

    const outputLogs: string[] = [];
    const result = await engine.executePlan('start server', plan, {
      cwd: '/workspace',
      os: 'mac',
      toolExecutor: mockToolExecutor,
      onStepOutput: (out) => outputLogs.push(out)
    });

    expect(result.success).toBe(true);
    // Sub-phase 1.1 was automatically injected to free port 3000!
    expect(plan.phases[0].subPhases).toBeDefined();
    expect(plan.phases[0].subPhases?.length).toBe(1);
    expect(plan.phases[0].subPhases![0].id).toBe('1.1');
    expect(plan.phases[0].subPhases![0].title).toBe('Free port 3000');
    expect(plan.phases[0].subPhases![0].status).toBe('completed');

    // kill_process was called with port 3000
    expect(mockToolExecutor.execute).toHaveBeenCalledWith(
      'system.kill_process',
      { port: 3000 },
      '/workspace',
      undefined
    );

    // Shell execute was called twice (first failed, second succeeded)
    expect(serverAttempts).toBe(2);
    expect(plan.phases[0].status).toBe('completed');
  });

  it('should pause in awaiting_action for physical hardware confirmation and resume on user approval', async () => {
    const engine = new AdaptivePlanEngine();
    const plan: AgentPlan = {
      summary: 'Connect to offline hardware peripheral',
      steps: ['Connect to USB device'],
      phases: [
        { id: '1', title: 'Connect to USB device', tool: 'shell.execute', params: { command: 'flash-firmware' }, status: 'pending' }
      ]
    };

    let flashAttempts = 0;
    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockImplementation(async (toolId: string) => {
        if (toolId === 'shell.execute') {
          flashAttempts++;
          if (flashAttempts === 1) {
            // First attempt fails due to physical cable disconnect
            return {
              success: false,
              error: 'Error: USB device disconnected or hardware not responding'
            };
          }
          // After physical confirmation, second attempt succeeds!
          return { success: true, data: { stdout: 'Firmware flashed successfully' } };
        }
        return { success: true, data: {} };
      })
    };

    let physicalActionPromptReceived = '';
    const mockPhysicalActionHandler = vi.fn().mockImplementation(async (req: { prompt: string; cause: string }) => {
      physicalActionPromptReceived = req.prompt;
      // User plugs in hardware and types "done" or presses Enter!
      return true;
    });

    const result = await engine.executePlan('flash firmware', plan, {
      cwd: '/workspace',
      os: 'mac',
      toolExecutor: mockToolExecutor,
      onPhysicalActionRequired: mockPhysicalActionHandler
    });

    expect(result.success).toBe(true);
    expect(mockPhysicalActionHandler).toHaveBeenCalledOnce();
    expect(physicalActionPromptReceived).toContain('[Physical Action Required]');
    expect(physicalActionPromptReceived).toContain('type "done" or press Enter');

    // Executed flash tool twice (first failed with disconnect, second succeeded after confirmation)
    expect(flashAttempts).toBe(2);
    expect(plan.phases[0].status).toBe('completed');
  });

  it('should probe workspaces and formulate disambiguation question when multiple ROS/projects match', async () => {
    const engine = new AdaptivePlanEngine();
    const mockScanner = {
      readdir: async (dir: string) => {
        if (dir === '/workspaces') return ['drone_ws', 'rover_ws'];
        if (dir === '/workspaces/drone_ws') return ['package.xml', 'install', 'src'];
        if (dir === '/workspaces/drone_ws/src') return ['gazebo_quad.launch.py'];
        if (dir === '/workspaces/rover_ws') return ['package.xml', 'devel', 'src'];
        if (dir === '/workspaces/rover_ws/src') return ['rover_gazebo.launch'];
        return [];
      },
      stat: async () => ({ isDirectory: () => true }),
      readFile: async (p: string) => {
        if (p.includes('drone_ws')) return '<package><name>quad</name><buildtool_depend>ament_cmake</buildtool_depend></package>';
        if (p.includes('rover_ws')) return '<package><name>rover</name><buildtool_depend>catkin</buildtool_depend></package>';
        return '';
      },
      exists: async () => true
    };

    const plan = await engine.probeProjectWorkspaces(
      'run my gazebo',
      { os: 'linux', cwd: '/workspaces' },
      mockScanner as any
    );

    expect(plan).toBeDefined();
    expect(plan?.question).toBeDefined();
    expect(plan?.question).toContain('Found 2 project workspaces matching "gazebo":');
    expect(plan?.discoveredProjects?.length).toBe(2);
    expect(plan?.discoveredProjects![0].name).toBe('drone_ws');
    expect(plan?.discoveredProjects![1].name).toBe('rover_ws');
  });

  it('should formulate and execute a 3-phase plan (cd + source + launch) for a chosen ROS 2 workspace', async () => {
    const engine = new AdaptivePlanEngine();
    const chosenProject = {
      id: '1',
      name: 'drone_ws',
      path: '/home/user/workspaces/drone_ws',
      type: 'ros2' as const,
      setupScript: 'source install/setup.bash',
      launchTarget: 'ros2 launch drone_ws gazebo_quad.launch.py',
      confidence: 100
    };

    const plan = engine.createProjectExecutionPlan(chosenProject, 'gazebo');

    expect(plan.phases.length).toBe(3);
    expect(plan.phases[0].id).toBe('1');
    expect(plan.phases[0].title).toBe('Navigate to workspace: drone_ws');
    expect(plan.phases[0].tool).toBe('filesystem.navigate');
    expect(plan.phases[0].params?.path).toBe('/home/user/workspaces/drone_ws');

    expect(plan.phases[1].id).toBe('2');
    expect(plan.phases[1].title).toBe('Source environment: source install/setup.bash');
    expect(plan.phases[1].tool).toBe('shell.execute');
    expect(plan.phases[1].params?.command).toBe('source install/setup.bash');

    expect(plan.phases[2].id).toBe('3');
    expect(plan.phases[2].title).toBe('Launch drone_ws: ros2 launch drone_ws gazebo_quad.launch.py');
    expect(plan.phases[2].tool).toBe('shell.execute');

    // Execute plan
    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockResolvedValue({ success: true, data: { stdout: '[INFO] Launching Gazebo simulator node...' } })
    };

    const executedPhases: string[] = [];
    const result = await engine.executePlan('run gazebo', plan, {
      cwd: '/home/user',
      os: 'linux',
      toolExecutor: mockToolExecutor,
      onPhaseStart: (p) => executedPhases.push(p.id)
    });

    expect(result.success).toBe(true);
    expect(executedPhases).toEqual(['1', '2', '3']);
    expect(result.cdPath).toBe('/home/user/workspaces/drone_ws');
  });

  it('should generate a 3-phase plan for system service orchestration', async () => {
    const engine = new AdaptivePlanEngine();
    const plan = await engine.createPlan('restart postgresql service', { os: 'linux', cwd: '/home/user' });

    expect(plan).toBeDefined();
    expect(plan.summary).toContain('RESTART system service "postgresql"');
    expect(plan.phases.length).toBe(3);
    expect(plan.phases[0].tool).toBe('system.service');
    expect(plan.phases[0].params?.action).toBe('status');
    expect(plan.phases[1].tool).toBe('system.service');
    expect(plan.phases[1].params?.action).toBe('restart');
    expect(plan.phases[2].tool).toBe('system.service');
  });

  it('should generate a safe dotfile rice editing plan for toggling startup applications', async () => {
    const engine = new AdaptivePlanEngine();
    const plan = await engine.createPlan('turn off gazebo in hyprland', { os: 'linux', cwd: '/home/user' });

    expect(plan).toBeDefined();
    expect(plan.summary).toContain('Disable "gazebo" in hyprland rice configuration');
    expect(plan.phases.length).toBe(1);
    expect(plan.phases[0].tool).toBe('system.dotfile');
    expect(plan.phases[0].params?.app).toBe('gazebo');
    expect(plan.phases[0].params?.enable).toBe(false);
    expect(plan.phases[0].params?.target).toBe('hyprland');
  });

  it('should generate a compound 3-phase plan for project scaffolding and git initialization', async () => {
    const engine = new AdaptivePlanEngine();
    const plan = await engine.createPlan(
      'inside the frontend folder inside desktop initialize the next project into it and also git initialize it after',
      { os: 'mac', cwd: '/Users/test' }
    );

    expect(plan).toBeDefined();
    expect(plan.phases.length).toBe(3);
    expect(plan.phases[0].id).toBe('1');
    expect(plan.phases[0].title).toContain('Desktop');
    expect(plan.phases[0].title).toContain('frontend');
    expect(plan.phases[0].tool).toBe('filesystem.navigate');

    expect(plan.phases[1].id).toBe('2');
    expect(plan.phases[1].title).toContain('Next.js');
    expect(plan.phases[1].tool).toBe('shell.execute');
    expect(plan.phases[1].params?.command).toContain('create-next-app');

    expect(plan.phases[2].id).toBe('3');
    expect(plan.phases[2].title).toContain('git repository');
    expect(plan.phases[2].tool).toBe('shell.execute');
  });

  it('should dynamically adapt plan by skipping git init phase if scaffolding already initialized git', async () => {
    const engine = new AdaptivePlanEngine();
    const plan: AgentPlan = {
      summary: 'Scaffold Next.js and Git',
      steps: ['Navigate', 'Scaffold', 'Git init'],
      phases: [
        { id: '1', title: 'Navigate to target', tool: 'filesystem.navigate', params: { path: '/tmp/test_scaffold' }, status: 'pending' },
        { id: '2', title: 'Initialize Next.js project', tool: 'shell.execute', params: { command: 'create-next-app' }, status: 'pending' },
        { id: '3', title: 'Initialize git repository', tool: 'shell.execute', params: { command: 'git init' }, status: 'pending' }
      ]
    };

    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockImplementation(async (toolId: string) => {
        if (toolId === 'filesystem.navigate') {
          return { success: true, data: {} };
        }
        if (toolId === 'shell.execute') {
          return { success: true, data: { stdout: 'Success' } };
        }
        return { success: true, data: {} };
      })
    };

    const adaptSpy = vi.spyOn(engine, 'adaptPlanAfterPhase').mockImplementation((completed, p) => {
      if (completed.id === '2') {
        p.phases[2].status = 'skipped';
        p.phases[2].skippedReason = 'Git repository was already initialized by scaffolding';
      }
    });

    const result = await engine.executePlan('scaffold and git init', plan, {
      cwd: '/tmp/test_scaffold',
      os: 'mac',
      toolExecutor: mockToolExecutor
    });

    expect(result.success).toBe(true);
    expect(plan.phases[0].status).toBe('completed');
    expect(plan.phases[1].status).toBe('completed');
    expect(plan.phases[2].status).toBe('skipped');
    expect(plan.phases[2].skippedReason).toContain('already initialized');
    expect(mockToolExecutor.execute).toHaveBeenCalledTimes(2);
    adaptSpy.mockRestore();
  });
});

