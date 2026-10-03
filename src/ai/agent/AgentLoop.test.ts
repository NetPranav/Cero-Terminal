import { describe, expect, it, vi } from 'vitest';
import { isExplicitFilesystemSearch, findFastPath, AgentLoop, isConversationalRefusal, isActionableGoal, isReferentialFollowup, cleanseConversationalRefusal, isSingleShotInspection } from './AgentLoop';
import { DemonstrationLearningEngine } from '../../domain/learning/DemonstrationLearningEngine';

describe('AgentLoop fast-path routing', () => {
  it('uses the filesystem shortcut only for explicit file-oriented searches', () => {
    expect(isExplicitFilesystemSearch('find all json files in tools')).toBe(true);
    expect(isExplicitFilesystemSearch('locate *.tsx')).toBe(true);
    expect(isExplicitFilesystemSearch('search for a file named config.json')).toBe(true);
  });

  it('leaves ambiguous and web-oriented searches for the local model', () => {
    expect(isExplicitFilesystemSearch('search the web for Rust ownership')).toBe(false);
    expect(isExplicitFilesystemSearch('find me a good coffee shop')).toBe(false);
  });

  it('routes URL opening directly to browser.navigate with target browser application', () => {
    const res = findFastPath('open youtube.com in safari');
    expect(res).not.toBeNull();
    expect(res?.tool).toBe('browser.navigate');
    expect(res?.params.url).toBe('youtube.com');
    expect(res?.params.appName).toBe('safari');

    const res2 = findFastPath('navigate to https://github.com using chrome');
    expect(res2?.tool).toBe('browser.navigate');
    expect(res2?.params.url).toBe('https://github.com');
    expect(res2?.params.appName).toBe('chrome');

    const res3 = findFastPath('open openai.com');
    expect(res3?.tool).toBe('browser.navigate');
    expect(res3?.params.url).toBe('openai.com');
    expect(res3?.params.appName).toBeUndefined();
  });

  it('routes bare URLs, browse commands, and web search shortcuts directly via fast-path', () => {
    // Bare URLs
    const bareUrl1 = findFastPath('github.com');
    expect(bareUrl1?.tool).toBe('browser.navigate');
    expect(bareUrl1?.params.url).toBe('github.com');

    const bareUrl2 = findFastPath('https://news.ycombinator.com');
    expect(bareUrl2?.tool).toBe('browser.navigate');
    expect(bareUrl2?.params.url).toBe('https://news.ycombinator.com');

    // Browse and go to
    const browseRes = findFastPath('browse to docs.rs');
    expect(browseRes?.tool).toBe('browser.navigate');
    expect(browseRes?.params.url).toBe('docs.rs');

    const goToRes = findFastPath('go to https://anthropic.com in Brave');
    expect(goToRes?.tool).toBe('browser.navigate');
    expect(goToRes?.params.url).toBe('https://anthropic.com');
    expect(goToRes?.params.appName).toBe('Brave');

    // Direct Web searches
    const googleRes = findFastPath('google typescript 5.5 features');
    expect(googleRes?.tool).toBe('browser.search');
    expect(googleRes?.params.engine).toBe('google');
    expect(googleRes?.params.query).toBe('typescript 5.5 features');

    const ytRes = findFastPath('youtube lo-fi beats');
    expect(ytRes?.tool).toBe('browser.search');
    expect(ytRes?.params.engine).toBe('youtube');
    expect(ytRes?.params.query).toBe('lo-fi beats');

    const ghRes = findFastPath('search github for tauri plugins');
    expect(ghRes?.tool).toBe('browser.search');
    expect(ghRes?.params.engine).toBe('github');
    expect(ghRes?.params.query).toBe('tauri plugins');

    const webRes = findFastPath('search the web for quantum computing advances');
    expect(webRes?.tool).toBe('browser.search');
    expect(webRes?.params.engine).toBe('google');
    expect(webRes?.params.query).toBe('quantum computing advances');
  });

  it('should resolve workspace disambiguation and execute project plan on user selection', async () => {
    const { AgentLoop } = await import('./AgentLoop');
    const mockToolExecutor = {
      hasDriver: () => true,
      execute: (tool: string, params: any) => Promise.resolve({ success: true, data: { stdout: `Executed ${tool}` } })
    };
    const mockRegistry = {
      toolIndex: { getAll: () => [] }
    };
    const loop = new AgentLoop(mockRegistry as any, mockToolExecutor as any);

    // Simulate pending clarification from a multi-project discovery
    (loop as any).pendingClarification = {
      goal: 'run gazebo',
      plan: {
        summary: 'Disambiguate project for "gazebo"',
        steps: [],
        phases: [],
        question: 'Found 2 projects: [1] drone_ws [2] rover_ws',
        discoveredProjects: [
          {
            id: '1',
            name: 'drone_ws',
            path: '/home/user/drone_ws',
            type: 'ros2',
            setupScript: 'source install/setup.bash',
            launchTarget: 'ros2 launch drone_ws quad.launch.py',
            confidence: 100
          },
          {
            id: '2',
            name: 'rover_ws',
            path: '/home/user/rover_ws',
            type: 'ros1',
            setupScript: 'source devel/setup.bash',
            launchTarget: 'roslaunch rover_ws sim.launch',
            confidence: 90
          }
        ]
      }
    };

    // User chooses option 1
    const result = await loop.run('1', { os: 'linux', cwd: '/home/user' });
    expect(result.success).toBe(true);
    expect(result.cdPath).toBe('/home/user/drone_ws');
    expect(result.steps.length).toBe(3);
    expect(result.steps[0].tool).toBe('filesystem.navigate');
    expect(result.steps[1].tool).toBe('shell.execute');
    expect(result.steps[1].params.command).toBe('source install/setup.bash');
    expect(result.steps[2].tool).toBe('shell.execute');
    expect(result.steps[2].params.command).toBe('ros2 launch drone_ws quad.launch.py');
  });

  it('routes system service and dotfile rice commands directly via fast-path', () => {
    const serviceRes = findFastPath('restart postgresql service');
    expect(serviceRes).not.toBeNull();
    expect(serviceRes?.tool).toBe('system.service');
    expect(serviceRes?.params.service).toBe('postgresql');
    expect(serviceRes?.params.action).toBe('restart');

    const dotfileRes = findFastPath('turn off gazebo in hyprland');
    expect(dotfileRes).not.toBeNull();
    expect(dotfileRes?.tool).toBe('system.dotfile');
    expect(dotfileRes?.params.app).toBe('gazebo');
    expect(dotfileRes?.params.enable).toBe(false);
    expect(dotfileRes?.params.target).toBe('hyprland');
  });

  it('executes user request via learned demonstration pattern without invoking LLM', async () => {
    const learningEngine = DemonstrationLearningEngine.getInstance();
    learningEngine.clear();
    learningEngine.learnExplicit(
      'compress backups into archive',
      'tar -czvf backups.tar.gz ./backups',
      'Compresses backups directory into tar.gz archive'
    );

    const mockToolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { stdout: 'backups.tar.gz created' }
      })
    };

    const loop = new AgentLoop(
      { toolIndex: { has: () => false, getAll: () => [] } } as any,
      undefined
    );
    (loop as any).toolExecutor = mockToolExecutor;

    const res = await loop.run('compress backups into archive', { os: 'mac', cwd: '/test' });
    expect(res.success).toBe(true);
    expect(mockToolExecutor.execute).toHaveBeenCalledWith(
      'shell.execute',
      expect.objectContaining({
        command: 'tar -czvf backups.tar.gz ./backups'
      }),
      '/test',
      undefined
    );
    expect(res.summary).toContain('Executed learned workflow: tar -czvf backups.tar.gz ./backups');
  });

  it('normalizes shell-native execute JSON contract into shell.execute tool call', () => {
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any);
    const parsed = (loop as any).parseLLMResponse(JSON.stringify({
      action: 'execute',
      command: 'mdfind "kMDItemFSName == \'*frontend*\'c && kMDItemContentType == \'public.folder\'"',
      explanation: 'Search entire Mac for frontend directories'
    }));

    expect(parsed).not.toBeNull();
    expect(parsed.action).toBe('tool');
    expect(parsed.tool).toBe('shell.execute');
    expect(parsed.params.command).toBe('mdfind "kMDItemFSName == \'*frontend*\'c && kMDItemContentType == \'public.folder\'"');
    expect(parsed.params.explanation).toBe('Search entire Mac for frontend directories');
  });

  it('normalizes bare command JSON object into shell.execute tool call', () => {
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any);
    const parsed = (loop as any).parseLLMResponse(JSON.stringify({
      command: 'lsof -iTCP -sTCP:LISTEN -n -P',
      explanation: 'List active listening ports'
    }));

    expect(parsed).not.toBeNull();
    expect(parsed.action).toBe('tool');
    expect(parsed.tool).toBe('shell.execute');
    expect(parsed.params.command).toBe('lsof -iTCP -sTCP:LISTEN -n -P');
  });

  it('routes search query fallback to shell-native Spotlight mdfind on macOS', () => {
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any);
    const fallback = (loop as any).tryHeuristicFallback('find all frontend folders in my system', { os: 'mac', cwd: '/workspace' });

    expect(fallback).not.toBeNull();
    expect(fallback.tool).toBe('shell.execute');
    expect(fallback.params.command).toContain('mdfind');
    expect(fallback.params.command).toContain('*frontend*');
    expect(fallback.params.command).toContain('public.folder');
  });

  describe('Tier 2: Refusal Interception & Autonomous Self-Healing', () => {
    it('detects canned chatbot refusals accurately', () => {
      expect(isConversationalRefusal("I don't have access to your file system.")).toBe(true);
      expect(isConversationalRefusal("As an AI, I am unable to view your local files or execute commands.")).toBe(true);
      expect(isConversationalRefusal("I cannot access your network or system directories.")).toBe(true);
      expect(isConversationalRefusal("I do not have access to the operating system.")).toBe(true);
      expect(isConversationalRefusal("I am unable to search your computer.")).toBe(true);
      expect(isConversationalRefusal("I'm sorry, but as an AI language model, I don't have the ability to directly manipulate or change your device's IP address without using a VPN or changing your network configuration. However, I can provide you with general information on how to do this if you're interested in learning more about it.")).toBe(true);

      expect(isConversationalRefusal("Found 12 matching folders.")).toBe(false);
      expect(isConversationalRefusal("The active listening port is 3000.")).toBe(false);
      expect(isConversationalRefusal("I am Cero, an autonomous mac terminal AI copilot.")).toBe(false);
    });

    it('identifies actionable system goals versus informational queries', () => {
      expect(isActionableGoal('find all frontend folders in my system')).toBe(true);
      expect(isActionableGoal('tell me all available network')).toBe(true);
      expect(isActionableGoal('what is using port 3000')).toBe(true);
      expect(isActionableGoal('kill node process')).toBe(true);
      expect(isActionableGoal('check git status and branches')).toBe(true);
      expect(isActionableGoal('Hey tell me is there a way we can change the ip adress without vpn or without changeing network')).toBe(true);
      expect(isActionableGoal('still somehow that you can try right now')).toBe(true);
      expect(isActionableGoal('renew ip address')).toBe(true);
      expect(isActionableGoal('renew dhcp lease')).toBe(true);

      expect(isActionableGoal('who are you')).toBe(false);
      expect(isActionableGoal('hello')).toBe(false);
      expect(isActionableGoal('what is your name')).toBe(false);
    });

    it('detects referential follow-up requests in multi-turn conversations', () => {
      expect(isReferentialFollowup('still somehow that you can try right now')).toBe(true);
      expect(isReferentialFollowup('try it')).toBe(true);
      expect(isReferentialFollowup('can you try that')).toBe(true);
      expect(isReferentialFollowup('go ahead')).toBe(true);
      expect(isReferentialFollowup('do it anyway')).toBe(true);
      expect(isReferentialFollowup('find all frontend folders in my system')).toBe(false);
    });

    it('resolves effective goal across multi-turn conversation history', () => {
      const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any);
      (loop as any).conversationHistory = [
        { role: 'user', content: 'Hey tell me is there a way we can change the ip adress without vpn or without changeing network' },
        { role: 'assistant', content: 'Changing IP directly is not possible...' }
      ];

      const effective = loop.resolveEffectiveGoal('still somehow that you can try right now');
      expect(effective).toContain('change the ip adress without vpn');
      expect(effective).toContain('still somehow that you can try right now');
    });

    it('routes IP address check and DHCP renewal to macOS terminal commands', () => {
      const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any);
      const renewFallback = (loop as any).tryHeuristicFallback(
        'change the ip adress without vpn or without changeing network (still somehow that you can try right now)',
        { os: 'mac', cwd: '/workspace' }
      );
      expect(renewFallback).not.toBeNull();
      expect(renewFallback.tool).toBe('shell.execute');
      expect(renewFallback.params.command).toContain('sudo ipconfig set en0 DHCP');

      const checkFallback = (loop as any).tryHeuristicFallback('check my ip address', { os: 'mac', cwd: '/workspace' });
      expect(checkFallback).not.toBeNull();
      expect(checkFallback.tool).toBe('shell.execute');
      expect(checkFallback.params.command).toContain('ipconfig getifaddr en0');
    });

    it('cleanses robotic AI refusals into actionable macOS network advice', () => {
      const refusal = "I'm sorry, but as an AI language model, I don't have the ability to directly manipulate or change your device's IP address without using a VPN or changing your network configuration.";
      const cleansed = cleanseConversationalRefusal(refusal, 'change the ip adress without vpn', { os: 'mac', cwd: '/workspace' });
      expect(cleansed).not.toContain('AI language model');
      expect(cleansed).toContain('sudo ipconfig set en0 DHCP');
      expect(cleansed).toContain('networksetup -setmanual');
    });

    it('intercepts canned refusal and re-prompts model with terminal execution authority', async () => {
      const mockProvider = {
        name: 'test-provider',
        isAvailable: vi.fn().mockResolvedValue(true),
        generate: vi.fn()
          // Step 1: Model attempts canned refusal
          .mockResolvedValueOnce({
            content: JSON.stringify({
              action: 'done',
              summary: "I don't have access to your file system or computer."
            })
          })
          // Step 2: After refusal interception, model generates the proper command
          .mockResolvedValueOnce({
            content: JSON.stringify({
              action: 'execute',
              command: 'mdfind "kMDItemFSName == \'*frontend*\'c"',
              explanation: 'Search for frontend folders'
            })
          })
          // No third "summarise" call: a successful read-only search answers the question itself
      };

      const mockModelManager = {
        getActiveProvider: () => mockProvider,
        getActiveModel: () => ({ modelId: 'test-model' }),
        initialize: vi.fn().mockResolvedValue(undefined)
      } as any;

      const mockToolExecutor = {
        hasDriver: vi.fn().mockReturnValue(true),
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { stdout: '/Users/test/frontend\n/Users/test/projects/frontend', code: 0 }
        })
      };

      const loop = new AgentLoop(
        { toolIndex: { has: () => false, getAll: () => [] } } as any,
        mockModelManager
      );
      (loop as any).toolExecutor = mockToolExecutor;

      const events: any[] = [];
      loop.onEvent((ev) => events.push(ev));

      const result = await loop.run('find all frontend folders in my system', { os: 'mac', cwd: '/test' });

      expect(result.success).toBe(true);
      expect(mockProvider.generate).toHaveBeenCalledTimes(2);
      expect(result.summary).toContain('/Users/test/projects/frontend');
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          grammar: expect.stringContaining('action-execute')
        })
      );

      // Verify that refusal interception occurred
      const thinkingEvents = events.filter(e => e.type === 'thinking');
      expect(thinkingEvents.some(e => e.message.includes('Intercepted model refusal'))).toBe(true);

      // Verify command executed
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({ command: 'mdfind "kMDItemFSName == \'*frontend*\'c"' }),
        '/test',
        undefined
      );
    });

    it('intercepts canned refusal on referential follow-up and executes DHCP renewal', async () => {
      const mockProvider = {
        name: 'test-provider',
        isAvailable: vi.fn().mockResolvedValue(true),
        generate: vi.fn()
          // Model returns canned AI refusal
          .mockResolvedValueOnce({
            content: JSON.stringify({
              action: 'done',
              summary: "I'm sorry, but as an AI language model, I don't have the ability to directly manipulate or change your device's IP address without using a VPN or changing your network configuration. However, I can provide you with general information on how to do this if you're interested in learning more about it."
            })
          })
          // On second attempt, model generates DHCP renewal command
          .mockResolvedValueOnce({
            content: JSON.stringify({
              action: 'execute',
              command: 'sudo ipconfig set en0 DHCP',
              explanation: 'Renew local DHCP lease'
            })
          })
          .mockResolvedValueOnce({
            content: JSON.stringify({
              action: 'done',
              summary: 'DHCP lease renewed successfully.'
            })
          })
      };

      const mockModelManager = {
        getActiveProvider: () => mockProvider,
        getActiveModel: () => ({ modelId: 'test-model' }),
        initialize: vi.fn().mockResolvedValue(undefined)
      } as any;

      const mockToolExecutor = {
        hasDriver: vi.fn().mockReturnValue(true),
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { stdout: 'DHCP lease renewed on en0.', code: 0 }
        })
      };

      const loop = new AgentLoop(
        { toolIndex: { has: () => false, getAll: () => [] } } as any,
        mockModelManager
      );
      (loop as any).toolExecutor = mockToolExecutor;

      // Seed turn 1 history
      (loop as any).conversationHistory = [
        { role: 'user', content: 'Hey tell me is there a way we can change the ip adress without vpn or without changeing network' },
        { role: 'assistant', content: 'Changing IP directly is not possible...' }
      ];

      const events: any[] = [];
      loop.onEvent((ev) => events.push(ev));

      const result = await loop.run('still somehow that you can try right now', { os: 'mac', cwd: '/workspace' });

      expect(result.success).toBe(true);
      expect(result.summary).not.toContain('AI language model');
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({ command: 'sudo ipconfig set en0 DHCP' }),
        '/workspace',
        undefined
      );
    });

    it('feeds command stderr and exit code back into AI context for self-healing remediation', async () => {
      const mockProvider = {
        name: 'test-provider',
        isAvailable: vi.fn().mockResolvedValue(true),
        generate: vi.fn()
          // Step 1: Model generates command that fails (e.g. invalid flag)
          .mockResolvedValueOnce({
            content: JSON.stringify({
              action: 'execute',
              command: 'lsof -broken_flag',
              explanation: 'Inspect listening ports'
            })
          })
          // Step 2: In response to failure feedback, model self-heals and generates valid command
          .mockResolvedValueOnce({
            content: JSON.stringify({
              action: 'execute',
              command: 'lsof -iTCP -sTCP:LISTEN -n -P',
              explanation: 'Inspect listening ports with corrected flags'
            })
          })
          // Step 3: Done
          .mockResolvedValueOnce({
            content: JSON.stringify({
              action: 'done',
              summary: 'Listed all listening ports.'
            })
          })
      };

      const mockModelManager = {
        getActiveProvider: () => mockProvider,
        getActiveModel: () => ({ modelId: 'test-model' }),
        initialize: vi.fn().mockResolvedValue(undefined)
      } as any;

      const mockToolExecutor = {
        hasDriver: vi.fn().mockReturnValue(true),
        execute: vi.fn()
          // First attempt fails with non-zero exit code and stderr
          .mockResolvedValueOnce({
            success: false,
            error: 'lsof: illegal option -- broken_flag',
            data: { stderr: 'lsof: illegal option -- broken_flag', code: 1 }
          })
          // Second attempt succeeds
          .mockResolvedValueOnce({
            success: true,
            data: { stdout: 'node 3000 LISTEN\n', code: 0 }
          })
      };

      const loop = new AgentLoop(
        { toolIndex: { has: () => false, getAll: () => [] } } as any,
        mockModelManager
      );
      (loop as any).toolExecutor = mockToolExecutor;

      const events: any[] = [];
      loop.onEvent((ev) => events.push(ev));

      const result = await loop.run('tell me all running ports', { os: 'mac', cwd: '/test' });

      expect(result.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(2);

      // Verify self-healing thinking event was emitted
      const selfHealingEvent = events.find(e => e.type === 'thinking' && e.message.includes('Self-healing'));
      expect(selfHealingEvent).toBeDefined();

      // Verify the second generate call was given the failure context
      const secondGenerateCall = mockProvider.generate.mock.calls[1][0];
      expect(secondGenerateCall).toContain('COMMAND FAILED:');
      expect(secondGenerateCall).toContain('illegal option');
      expect(secondGenerateCall).toContain('Self-Healing Mode');
    });

    it('activates deterministic safety net fallback when 3 command attempts fail (three strikes)', async () => {
      const mockProvider = {
        name: 'test-provider',
        isAvailable: vi.fn().mockResolvedValue(true),
        generate: vi.fn()
          // 3 broken attempts
          .mockResolvedValueOnce({
            content: JSON.stringify({ action: 'execute', command: 'badcmd1' })
          })
          .mockResolvedValueOnce({
            content: JSON.stringify({ action: 'execute', command: 'badcmd2' })
          })
          .mockResolvedValueOnce({
            content: JSON.stringify({ action: 'execute', command: 'badcmd3' })
          })
      };

      const mockModelManager = {
        getActiveProvider: () => mockProvider,
        getActiveModel: () => ({ modelId: 'test-model' }),
        initialize: vi.fn().mockResolvedValue(undefined)
      } as any;

      const mockToolExecutor = {
        hasDriver: vi.fn().mockReturnValue(true),
        execute: vi.fn()
          .mockResolvedValueOnce({ success: false, error: 'Command badcmd1 failed: unrecognized option --xyz', data: { code: 1 } })
          .mockResolvedValueOnce({ success: false, error: 'Command badcmd2 failed: unrecognized option --xyz', data: { code: 1 } })
          .mockResolvedValueOnce({ success: false, error: 'Command badcmd3 failed: unrecognized option --xyz', data: { code: 1 } })
          // Safety net fallback execution
          .mockResolvedValueOnce({ success: true, data: { stdout: '/Users/test/frontend', code: 0 } })
      };

      const loop = new AgentLoop(
        { toolIndex: { has: () => false, getAll: () => [] } } as any,
        mockModelManager
      );
      (loop as any).toolExecutor = mockToolExecutor;

      const events: any[] = [];
      loop.onEvent((ev) => events.push(ev));

      const result = await loop.run('find all frontend folders in my system', { os: 'mac', cwd: '/test' });

      // Deterministic fallback was triggered after 3 strikes
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(4);
      expect(result.success).toBe(true);

      const safetyNetEvent = events.find(e => e.type === 'thinking' && e.message.includes('Three command attempts failed'));
      expect(safetyNetEvent).toBeDefined();
    });

    it('skips retries and activates fallback immediately when failure is unrecoverable (MISSING_BINARY) (0.5.10)', async () => {
      const mockProvider = {
        isAvailable: vi.fn().mockResolvedValue(true),
        generate: vi.fn().mockResolvedValueOnce({
          content: JSON.stringify({ action: 'execute', command: 'missingtool' })
        })
      };

      const mockModelManager = {
        getActiveProvider: () => mockProvider,
        getActiveModel: () => ({ modelId: 'test-model' }),
        initialize: vi.fn().mockResolvedValue(undefined)
      } as any;

      const mockToolExecutor = {
        hasDriver: vi.fn().mockReturnValue(true),
        execute: vi.fn()
          // First attempt fails with missing binary (127)
          .mockResolvedValueOnce({ success: false, error: 'zsh: command not found: missingtool', data: { code: 127 } })
          // Deterministic fallback executes directly without retrying missingtool
          .mockResolvedValueOnce({ success: true, data: { stdout: '/Users/test/frontend', code: 0 } })
      };

      const loop = new AgentLoop(
        { toolIndex: { has: () => false, getAll: () => [] } } as any,
        mockModelManager
      );
      (loop as any).toolExecutor = mockToolExecutor;

      const events: any[] = [];
      loop.onEvent((ev) => events.push(ev));

      const result = await loop.run('find all frontend folders in my system', { os: 'mac', cwd: '/test' });

      // Skips retry 2 and retry 3: called only 2 times (attempt 1 + fallback)!
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);

      const unrecoverableEvent = events.find(e => e.type === 'thinking' && e.message.includes('Unrecoverable failure (MISSING_BINARY)'));
      expect(unrecoverableEvent).toBeDefined();
    });
  });


  describe('Phase 4.1 — Speculative Shadow-PTY Simulation Integration', () => {
    it('should speculatively evaluate candidates and swap unviable model syntax for verified winner', async () => {
      const mockProvider = {
        isAvailable: vi.fn().mockResolvedValue(true),
        generate: vi.fn()
          .mockResolvedValueOnce({
            content: JSON.stringify({ action: 'execute', command: 'fuser 3000/tcp', explanation: 'Check port with fuser' })
          })
          .mockResolvedValueOnce({
            content: JSON.stringify({ action: 'done', summary: 'Port 3000 inspected successfully' })
          })
      };

      const mockModelManager = {
        getActiveProvider: () => mockProvider,
        getActiveModel: () => ({ modelId: 'test-model' }),
        initialize: vi.fn().mockResolvedValue(undefined)
      } as any;

      const mockToolExecutor = {
        hasDriver: vi.fn().mockReturnValue(true),
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { stdout: 'node 4190 user 22u IPv4 0x123 TCP *:3000 (LISTEN)', stderr: '', code: 0 }
        })
      };

      // Mock shadow simulator executor where fuser fails but lsof succeeds
      const mockShadowExecutor = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
        const full = args.join(' ');
        if (full.includes('fuser')) {
          return { stdout: '', stderr: 'zsh: command not found: fuser', code: 127 };
        }
        if (full.includes('lsof')) {
          return { stdout: 'node 4190 TCP *:3000 (LISTEN)', stderr: '', code: 0 };
        }
        return { stdout: '', stderr: '', code: 0 };
      });

      const { ShadowPtySimulator } = await import('./ShadowPtySimulator');
      const customSimulator = new ShadowPtySimulator({ executor: mockShadowExecutor });

      const loop = new AgentLoop(
        { toolIndex: { has: () => false, getAll: () => [] } } as any,
        mockModelManager,
        customSimulator
      );
      (loop as any).toolExecutor = mockToolExecutor;

      const events: any[] = [];
      loop.onEvent((ev) => events.push(ev));

      const result = await loop.run('check port 3000', { os: 'mac', cwd: '/test' });

      expect(result.success).toBe(true);
      // ToolExecutor should have been called with the verified 'lsof' candidate, NOT 'fuser'!
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({
          command: expect.stringContaining('lsof')
        }),
        '/test',
        undefined
      );

      // Event stream should show speculative optimization
      const specEvent = events.find(e => e.type === 'thinking' && e.message.includes('Speculative Shadow-PTY: Optimized candidate'));
      expect(specEvent).toBeDefined();
    });

    it('executes verified canonical recipe directly via TLDR knowledge base when AI model is offline', async () => {
      const mockProvider = {
        name: 'test-provider',
        isAvailable: vi.fn().mockResolvedValue(false),
        generate: vi.fn()
      };

      const mockModelManager = {
        getActiveProvider: () => mockProvider,
        getActiveModel: () => ({ modelId: 'test-model' }),
        initialize: vi.fn().mockResolvedValue(undefined)
      } as any;

      const mockToolExecutor = {
        hasDriver: vi.fn().mockReturnValue(true),
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { stdout: 'Flushed DNS cache successfully', code: 0 }
        })
      };

      const loop = new AgentLoop(
        { toolIndex: { has: () => false, getAll: () => [] } } as any,
        mockModelManager
      );
      (loop as any).toolExecutor = mockToolExecutor;

      const events: any[] = [];
      loop.onEvent((ev) => events.push(ev));

      const result = await loop.run('flush dns cache', { os: 'mac', cwd: '/test' });

      expect(result.success).toBe(true);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'shell.execute',
        expect.objectContaining({
          command: 'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder'
        }),
        '/test',
        undefined
      );

      const tldrEvent = events.find(e => e.type === 'thinking' && e.message.includes('Using Ground-Truth CLI Recipe'));
      expect(tldrEvent).toBeDefined();
    });

    it('emits instant deterministic remediation (thefuck oracle) on git push missing upstream', async () => {
      const mockProvider = {
        name: 'test-provider',
        isAvailable: vi.fn().mockResolvedValue(true),
        generate: vi.fn()
          .mockResolvedValueOnce({
            content: JSON.stringify({ action: 'execute', command: 'git push', explanation: 'Push changes to remote' })
          })
          .mockResolvedValueOnce({
            content: JSON.stringify({ action: 'execute', command: 'git push --set-upstream origin feat-auth', explanation: 'Set upstream and push' })
          })
          .mockResolvedValueOnce({
            content: JSON.stringify({ action: 'done', summary: 'Branch pushed successfully' })
          })
      };

      const mockModelManager = {
        getActiveProvider: () => mockProvider,
        getActiveModel: () => ({ modelId: 'test-model' }),
        initialize: vi.fn().mockResolvedValue(undefined)
      } as any;

      const mockToolExecutor = {
        hasDriver: vi.fn().mockReturnValue(true),
        execute: vi.fn()
          .mockResolvedValueOnce({
            success: false,
            data: {
              code: 128,
              stderr: `fatal: The current branch feat-auth has no upstream branch.
To push the current branch and set the remote as upstream, use

    git push --set-upstream origin feat-auth`
            }
          })
          .mockResolvedValueOnce({
            success: true,
            data: { stdout: 'Branch feat-auth set up to track remote branch feat-auth from origin.', code: 0 }
          })
      };

      const loop = new AgentLoop(
        { toolIndex: { has: () => false, getAll: () => [] } } as any,
        mockModelManager
      );
      (loop as any).toolExecutor = mockToolExecutor;

      const events: any[] = [];
      loop.onEvent((ev) => events.push(ev));

      const result = await loop.run('push my commit to github', { os: 'mac', cwd: '/test' });

      expect(result.success).toBe(true);
      const remediationEvent = events.find(
        e => e.type === 'thinking' && e.message.includes('Instant Deterministic Remediation') && e.message.includes('git push --set-upstream origin feat-auth')
      );
      expect(remediationEvent).toBeDefined();
    });

  });

  describe('Application and process management fast paths', () => {
    it('routes "tell me is there any applciation named as music or somethign like that" to application.list_running with app filter', () => {
      const res = findFastPath('tell me is there any applciation named as music or somethign like that');
      expect(res).not.toBeNull();
      expect(res?.tool).toBe('application.list_running');
      expect(res?.params.app).toBe('music');
    });

    it('routes "Yeah go aheaed kill the Music application" to system.kill_process with process Music', () => {
      const res = findFastPath('Yeah go aheaed kill the Music application');
      expect(res).not.toBeNull();
      expect(res?.tool).toBe('system.kill_process');
      expect(res?.params.process).toBe('Music');
    });

    it('routes "if any applcaiton named music is running then close it" to system.kill_process with ifRunning: true', () => {
      const res = findFastPath('if any applcaiton named music is running then close it');
      expect(res).not.toBeNull();
      expect(res?.tool).toBe('system.kill_process');
      expect(res?.params.process).toBe('music');
      expect(res?.params.ifRunning).toBe(true);
    });

    it('routes conversational variants of process close and kill', () => {
      const res1 = findFastPath('kill the Music application');
      expect(res1?.tool).toBe('system.kill_process');
      expect(res1?.params.process).toBe('Music');

      const res2 = findFastPath('close Music');
      expect(res2?.tool).toBe('system.kill_process');
      expect(res2?.params.process).toBe('Music');

      const res3 = findFastPath('if Music is running then close it');
      expect(res3?.tool).toBe('system.kill_process');
      expect(res3?.params.process).toBe('Music');
      expect(res3?.params.ifRunning).toBe(true);
    });
  });

  describe('sanitizeDesktopAppCommand & application opening', () => {
    it('rewrites "zen" binary invocations to "zen-browser"', () => {
      const sanitized = AgentLoop.sanitizeDesktopAppCommand('zen & code /path/to/folder &');
      expect(sanitized).toBe('zen-browser & code /path/to/folder &');
    });

    it('prepends hyprctl workspace dispatch when goal specifies a workspace', () => {
      const sanitized = AgentLoop.sanitizeDesktopAppCommand(
        'zen-browser & code /path/to/folder &',
        'open zen browser and /path/to/folder in vscode in 5th workspace'
      );
      expect(sanitized).toContain('hyprctl dispatch workspace 5');
      expect(sanitized).toContain('zen-browser & code /path/to/folder &');
    });

    it('does not duplicate hyprctl dispatch if already present', () => {
      const original = '(hyprctl dispatch workspace 5 >/dev/null 2>&1 || true) && zen-browser & code /path/to/folder &';
      const sanitized = AgentLoop.sanitizeDesktopAppCommand(
        original,
        'open zen browser and /path/to/folder in vscode in 5th workspace'
      );
      expect(sanitized).toBe(original);
    });
  });
});


describe('Single-call answers for read-only inspection', () => {
  const makeLoop = (responses: object[], stdout: string) => {
    const generate = vi.fn();
    for (const r of responses) generate.mockResolvedValueOnce({ content: JSON.stringify(r) });
    const provider = { name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate };
    const modelManager = {
      getActiveProvider: () => provider,
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any;
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, modelManager);
    (loop as any).toolExecutor = {
      hasDriver: vi.fn().mockReturnValue(true),
      execute: vi.fn().mockResolvedValue({ success: true, data: { stdout, code: 0 } })
    };
    return { loop, generate };
  };

  it('answers "how big is my downloads folder" with one model call and the real output', async () => {
    const { loop, generate } = makeLoop(
      [{ action: 'execute', command: 'du -sh ~/Downloads', explanation: 'Size of the Downloads folder' }],
      '12G\t/home/u/Downloads'
    );
    const events: any[] = [];
    loop.onEvent(e => events.push(e));
    const result = await loop.run('how big is my downloads folder', { os: 'linux', cwd: '/home/u' });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.summary).toContain('12G');
    expect(result.metrics?.modelCalls).toBe(1);
    const done = events.filter(e => e.type === 'done');
    expect(done).toHaveLength(1);
    expect(done[0].data).toBeUndefined(); // output already shown by tool_done
  });

  it('keeps the model in the loop when the request asks for a follow-up action', async () => {
    const { generate, loop } = makeLoop(
      [
        { action: 'execute', command: 'du -sh ~/Downloads/* | sort -h | tail -n 3', explanation: 'Largest downloads' },
        { action: 'done', summary: 'The largest item is big.iso (4.2G).' }
      ],
      '1.1G a.zip\n2.0G b.tar\n4.2G big.iso'
    );
    const result = await loop.run('find my largest downloads and tell me which to delete', { os: 'linux', cwd: '/home/u' });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.summary).toContain('big.iso');
  });
});

describe('isSingleShotInspection', () => {
  it.each([
    ['how much disk space is free', 'df -h /'],
    ['is docker running', 'systemctl is-active docker'],
    ['which process is using the most cpu', 'ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -n 2'],
    ['show listening ports', 'ss -tulpn'],
    ['list the active ros2 topics', 'ros2 topic list'],
  ])('single call for "%s"', (goal, command) => {
    expect(isSingleShotInspection(goal, command)).toBe(true);
  });

  it.each([
    ['find large log files and delete them', 'find /var/log -size +100M'],
    ['why is my disk full', 'du -sh /* 2>/dev/null | sort -h'],
    ['check disk usage then clean the cache', 'df -h'],
    ['how much disk space is free', 'df -h > report.txt'],
    ['install htop', 'pacman -S htop'],
  ])('model stays in the loop for "%s"', (goal, command) => {
    expect(isSingleShotInspection(goal, command)).toBe(false);
  });
});

describe('Auto-heal context', () => {
  it('sends attached terminal output to the model as delimited untrusted data', async () => {
    const generate = vi.fn().mockResolvedValue({
      content: JSON.stringify({ action: 'done', summary: 'Port 3000 is held by node (PID 4242).' })
    });
    const provider = { name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate };
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => provider,
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);

    await loop.run('fix the error from `npm run dev`: port already in use', {
      os: 'linux',
      cwd: '/home/u/app',
      attachedContext: 'Error: listen EADDRINUSE: address already in use :::3000'
    });

    const system = generate.mock.calls[0][2].messages[0].content as string;
    expect(system).toContain('<TOOL_OUTPUT capability="terminal.output" readonly="true">');
    expect(system).toContain('EADDRINUSE');
  });
});

describe('Heuristic fallback word matching', () => {
  const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any);
  const fallback = (goal: string) => (loop as any).tryHeuristicFallback(goal, { os: 'linux', cwd: '/home/u' });

  it('does not toggle radios for questions about connections', () => {
    expect(fallback('show wifi connections')?.tool).toBe('network.wifi.scan');
    expect(fallback('show bluetooth connection status')?.tool).toBe('network.bluetooth.list');
    expect(fallback('turn on bluetooth')?.tool).toBe('network.bluetooth.on');
    expect(fallback('turn off wifi')?.tool).toBe('network.wifi.off');
  });

  it('does not match words hidden inside other words', () => {
    expect(fallback('export my bookmarks to a file')?.tool).not.toBe('network.ports');
    expect(fallback('what is stopping the build')?.tool).not.toBe('network.ping');
    expect(JSON.stringify(fallback('unzip the archive and check it') ?? {})).not.toMatch(/ip addr|ip -br|hostname -I|ipconfig/);
    expect(fallback('find the closest match in the logs')?.tool).not.toBe('system.kill_process');
    expect(fallback('which ports are listening')?.tool).toBe('network.ports');
  });
});

describe('Provider resolution', () => {
  it('fails fast with guidance when no provider answers and no local model exists', async () => {
    const { EmbeddedEngineManager } = await import('../models/EmbeddedEngineManager');
    const spy = vi.spyOn(EmbeddedEngineManager.getInstance(), 'checkModelExists').mockResolvedValue(false);
    try {
      const provider = { name: 'down', isAvailable: vi.fn().mockResolvedValue(false), generate: vi.fn() };
      const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
        getActiveProvider: () => provider,
        getActiveModel: () => ({ modelId: 'x' }),
        initialize: vi.fn().mockResolvedValue(undefined)
      } as any);
      const started = Date.now();
      const result = await (loop as any).runLLMLoop('summarise the kernel log', { os: 'linux', cwd: '/home/u' });
      expect(result.success).toBe(false);
      expect(result.summary).toContain('No AI model or API configured');
      expect(provider.generate).not.toHaveBeenCalled();
      expect(Date.now() - started).toBeLessThan(1000);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('Instant answers run before any model call', () => {
  it('answers "which process is using the most cpu" without touching the provider', async () => {
    const generate = vi.fn();
    const isAvailable = vi.fn().mockResolvedValue(true);
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable, generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    const execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: '  PID %CPU %MEM COMMAND\n 4242 96.0  3.1 cc1plus', code: 0 } });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };

    const result = await loop.run('which process is using the most cpu', { os: 'linux', cwd: '/home/u' });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('cc1plus');
    expect(generate).not.toHaveBeenCalled();
    expect(isAvailable).not.toHaveBeenCalled();
    expect(result.metrics?.modelCalls).toBe(0);
    // Structured driver (formatted table) with the shell command as the fallback description
    expect(execute.mock.calls[0][0]).toBe('system.processes');
    expect(execute.mock.calls[0][1]).toEqual({ sort: 'cpu', count: 5 });
  });

  it('finishes an app launch without a summary call', async () => {
    const { isAppLaunchRequest } = await import('./AgentLoop');
    expect(isAppLaunchRequest('open vs code here', 'code . &')).toBe(true);
    expect(isAppLaunchRequest('launch firefox', 'setsid -f firefox >/dev/null 2>&1')).toBe(true);
    expect(isAppLaunchRequest('open the logs and find errors', 'less /var/log/syslog')).toBe(false);
    expect(isAppLaunchRequest('open vs code', 'code --version')).toBe(false);
  });
});

describe('Watch commands', () => {
  const makeLoop = () => {
    const generate = vi.fn();
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    return { loop, generate };
  };

  it('starts file and service watches without a model call, tagged with this tab', async () => {
    const { ErrorWatchService } = await import('../../domain/watch/ErrorWatchService');
    const watcher = ErrorWatchService.getInstance();
    const fileSpy = vi.spyOn(watcher, 'watchFile').mockResolvedValue({ id: 7, kind: 'file', target: '/home/u/app/build.log' });
    const serviceSpy = vi.spyOn(watcher, 'watchService').mockResolvedValue({ id: 8, kind: 'service', target: 'nginx.service' });
    const { loop, generate } = makeLoop();

    const fileResult = await loop.run('watch build.log', { os: 'linux', cwd: '/home/u/app' });
    expect(fileSpy).toHaveBeenCalledWith('/home/u/app/build.log', loop.ownerId);
    expect(fileResult.summary).toContain('watch #7');

    await loop.run('watch service nginx.service', { os: 'linux', cwd: '/home/u' });
    expect(serviceSpy).toHaveBeenCalledWith('nginx.service', false, loop.ownerId);
    expect(generate).not.toHaveBeenCalled();
  });

  it('sets the remediation mode', async () => {
    const { AutoRemediationPolicy } = await import('../../domain/remediation/AutoRemediationPolicy');
    const { loop } = makeLoop();
    const res = await loop.run('watch mode auto', { os: 'linux', cwd: '/home/u' });
    expect(res.summary).toContain('auto-safe');
    expect(AutoRemediationPolicy.getMode()).toBe('auto-safe');
    AutoRemediationPolicy.setMode('suggest');
  });
});

describe('Explaining and exporting what happened', () => {
  it('explains the previous request from its recorded steps', async () => {
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate: vi.fn() }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    (loop as any).toolExecutor = {
      hasDriver: () => true,
      execute: vi.fn().mockResolvedValue({ success: true, data: { stdout: '  PID %CPU\n 42 99 cc1plus', code: 0 } })
    };
    await loop.run('which process is using the most cpu', { os: 'linux', cwd: '/home/u' });
    const why = await loop.run('why', { os: 'linux', cwd: '/home/u' });
    expect(why.summary).toContain('answered without the model');
    expect(why.summary).toContain('system.processes');
    expect(why.summary).toContain('succeeded');
  });

  it('exports a redacted Markdown transcript under ~/.cero/transcripts', async () => {
    const fs = await import('node:fs');
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any);
    (loop as any).transcript.push({
      goal: 'show my token',
      at: Date.now(),
      result: { success: true, summary: 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789', steps: [{ tool: 'shell.execute', params: { command: 'echo $GITHUB_TOKEN' }, result: { success: true } }] }
    });
    const res = await loop.run('export session', { os: 'linux', cwd: '/home/u' });
    const file = `${process.env.HOME}/.cero/transcripts/${res.summary.match(/session-[\d-]+\.md/)![0]}`;
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain('## ');
    expect(text).toContain('`echo $GITHUB_TOKEN` (ok)');
    expect(text).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });
});

describe('Declined commands and read-only questions', () => {
  const makeLoop = (steps: Array<{ command: string; explanation: string }>, execute: any) => {
    const generate = vi.fn();
    for (const step of steps) {
      generate.mockResolvedValueOnce({ content: JSON.stringify({ action: 'execute', ...step }) });
    }
    generate.mockResolvedValue({ content: JSON.stringify({ action: 'done', summary: 'model summary' }) });
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    return { loop, generate };
  };

  it('stops when the user declines a command and does not ask the model to recover', async () => {
    const execute = vi.fn().mockResolvedValue({ success: false, error: 'Declined in the confirmation dialog.', errorCode: 'USER_CANCELLED' });
    const { loop, generate } = makeLoop([{ command: 'rm -rf build', explanation: 'Remove the build folder' }], execute);
    const result = await loop.run('remove the build folder', { os: 'linux', cwd: '/home/u/app' });
    expect(result.success).toBe(false);
    expect(result.summary).toContain('you declined `rm -rf build`');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('does not run a modifying command after a question failed', async () => {
    const execute = vi.fn().mockResolvedValue({ success: false, error: 'fatal: not a git repository (or any of the parent directories): .git', data: { code: 128 } });
    const { loop } = makeLoop([
      { command: 'git log -1 --stat', explanation: 'Show the last commit' },
      { command: 'git init && git log -1', explanation: 'Initialize a repository' },
    ], execute);
    const result = await loop.run('what changed in the last commit here', { os: 'linux', cwd: '/home/u' });
    expect(result.success).toBe(false);
    expect(result.summary).toContain('not a git repository');
    expect(result.summary).toContain('did not run `git init && git log -1`');
    // The instant `git show` and the model's `git log` may run; `git init` never does
    expect(execute.mock.calls.some((c: any[]) => String(c[1]?.command).includes('git init'))).toBe(false);
  });

  it('tells questions from requests to change something', async () => {
    const { isInspectionQuestion } = await import('./AgentLoop');
    expect(isInspectionQuestion('what changed in the last commit here')).toBe(true);
    expect(isInspectionQuestion('which process is using port 3000')).toBe(true);
    expect(isInspectionQuestion('check if docker is running and start it')).toBe(false);
    expect(isInspectionQuestion('install htop')).toBe(false);
    expect(isInspectionQuestion('how do I fix my wifi')).toBe(false);
  });
});

describe('Two-part questions are not answered by the first command alone', () => {
  it('keeps going for "... and how many ..."', async () => {
    const { isSingleShotInspection } = await import('./AgentLoop');
    expect(isSingleShotInspection('how many javascript files are in this folder', 'find . -name "*.js" | wc -l')).toBe(true);
    expect(isSingleShotInspection('how many javascript files are in this folder and how many lines do they have in total', 'find . -name "*.js" | wc -l')).toBe(false);
  });
});

describe('Questions about a file are answered from the file', () => {
  it('reads math.js and gives its contents to the model', async () => {
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ action: 'done', summary: 'math.js exports add(a, b), which returns a + b.' }) });
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    const execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: 'function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n', code: 0 } });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };

    const result = await loop.run('explain what math.js does', { os: 'macos', cwd: '/tmp/repo' });

    // Internal, read-only, quoted path: approved without a dialog
    expect(execute).toHaveBeenCalledWith('shell.execute', expect.objectContaining({ command: "head -c 6000 -- 'math.js'" }), '/tmp/repo', expect.any(Function));
    const prompt = generate.mock.calls[0][0] + generate.mock.calls[0][1];
    expect(prompt).toContain('return a + b;');
    expect(result.summary).toContain('add');
  });

  it('never reads .env files or files the request does not ask about', async () => {
    const execute = vi.fn();
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any);
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    expect(await (loop as any).readReferencedFiles('explain .env.local', '/tmp')).toBeNull();
    expect(await (loop as any).readReferencedFiles('convert video.mp4 to gif', '/tmp')).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('Answers must be grounded in command output', () => {
  it('finds figures that no command printed', async () => {
    const { ungroundedNumbers } = await import('./AgentLoop');
    const out = '{"stdout":"       2\\n","code":0}';
    expect(ungroundedNumbers('There are 2 JavaScript files with a total of 111 lines.', ['how many js files', out])).toEqual(['111']);
    expect(ungroundedNumbers('There are 2 files.', ['q', out])).toEqual([]);
    // 1817224 KB is about 1.7 GB: a unit conversion, not an invention
    expect(ungroundedNumbers('About 1.7 GB is free.', ['q', '{"stdout":"/dev/disk3s5 239311296 204981792 1817224 100%"}'])).toEqual([]);
    expect(ungroundedNumbers('Node v26.0.0 at /opt/homebrew/bin/node', ['q', '{"stdout":"v26.0.0\\n/opt/homebrew/bin/node"}'])).toEqual([]);
  });

  it('sends an invented figure back once, then shows the real output', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({ content: JSON.stringify({ action: 'execute', command: "find . -name '*.js' | wc -l", explanation: 'Count JS files' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ action: 'done', summary: 'There are 2 JavaScript files with 111 lines in total.' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ action: 'execute', command: 'cat *.js | wc -l', explanation: 'Count lines' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ action: 'done', summary: 'There are 2 JavaScript files with 5 lines in total.' }) });
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    const execute = vi.fn()
      .mockResolvedValueOnce({ success: true, data: { stdout: '       2\n', code: 0 } })
      .mockResolvedValueOnce({ success: true, data: { stdout: '       5\n', code: 0 } });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };

    const result = await loop.run('how many javascript files are in this folder and how many lines do they have in total', { os: 'macos', cwd: '/tmp/r' });
    expect(result.summary).toBe('There are 2 JavaScript files with 5 lines in total.');
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe('Questions about several things are not ended by the first command', () => {
  it('keeps going for "battery and uptime" and lists with commas', async () => {
    const { isSingleShotInspection } = await import('./AgentLoop');
    expect(isSingleShotInspection("what's my battery and uptime", 'uptime')).toBe(false);
    expect(isSingleShotInspection('show cpu, ram and disk', 'top -l 1')).toBe(false);
    expect(isSingleShotInspection('what is my uptime', 'uptime')).toBe(true);
  });
});


describe('Long-running commands open their own terminal pane', () => {
  const makeLoop = (steps: Array<{ command: string; explanation: string }>) => {
    const generate = vi.fn();
    for (const step of steps) generate.mockResolvedValueOnce({ content: JSON.stringify({ action: 'execute', ...step }) });
    generate.mockResolvedValue({ content: JSON.stringify({ action: 'done', summary: 'Both are running.' }) });
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    const execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: 'ok', code: 0 } });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    return { loop, generate, execute };
  };

  it('spawns servers and log followers in panes and never runs them inline', async () => {
    const { TerminalWorkspace } = await import('../../domain/terminal/TerminalWorkspace');
    TerminalWorkspace.resetForTests();
    const spawner = vi.fn().mockReturnValueOnce('pane-a').mockReturnValueOnce('pane-b');
    TerminalWorkspace.getInstance().setSpawner(spawner);
    const { loop, execute } = makeLoop([
      { command: 'tail -f app.log', explanation: 'Follow the log' },
      { command: 'python3 -m http.server 8000', explanation: 'Serve the folder' },
    ]);
    loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const result = await loop.run('follow app.log and serve this folder on port 8000', { os: 'macos', cwd: '/tmp/site', paneId: 'main' });
    expect(result.success).toBe(true);
    expect(spawner).toHaveBeenCalledTimes(2);
    expect(spawner.mock.calls[0][0]).toMatchObject({ command: 'tail -f app.log', cwd: '/tmp/site', requesterPaneId: 'main' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('asks before opening a pane for a command that needs consent, and stops on decline', async () => {
    const { TerminalWorkspace } = await import('../../domain/terminal/TerminalWorkspace');
    TerminalWorkspace.resetForTests();
    const spawner = vi.fn();
    TerminalWorkspace.getInstance().setSpawner(spawner);
    const { loop } = makeLoop([{ command: 'npm run dev', explanation: 'Start the dev server' }]);
    const handler = vi.fn().mockResolvedValue(false);
    loop.setAuthorizationHandler(handler);
    const result = await loop.run('start the dev server', { os: 'macos', cwd: '/tmp/app', paneId: 'main' });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ capabilityId: 'terminal.spawn' }));
    expect(result.declined).toBe(true);
    expect(spawner).not.toHaveBeenCalled();
  });

  it('tells the model what the other terminals are running', async () => {
    const { TerminalWorkspace } = await import('../../domain/terminal/TerminalWorkspace');
    TerminalWorkspace.resetForTests();
    const ws = TerminalWorkspace.getInstance();
    ws.register('main', { cwd: '/ws' });
    ws.register('other', { title: 'talker', busy: true, runningCommand: 'ros2 run demo_nodes_cpp talker' });
    const { loop, generate } = makeLoop([]);
    await loop.run('is the talker still publishing', { os: 'linux', cwd: '/ws', paneId: 'main' });
    const prompt = generate.mock.calls[0][0] + generate.mock.calls[0][1];
    expect(prompt).toContain('OTHER TERMINALS');
    expect(prompt).toContain('running: ros2 run demo_nodes_cpp talker');
  });
});

describe('Multi-step chains', () => {
  const setup = (generateContents: string[] = []) => {
    const generate = vi.fn();
    for (const c of generateContents) generate.mockResolvedValueOnce({ content: c });
    generate.mockResolvedValue({ content: JSON.stringify({ action: 'done', summary: 'x' }) });
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    const execute = vi.fn(async (_tool: string, params: any, cwd: string) => {
      if (params.command.startsWith('cd ')) return { success: true, data: { stdout: `${cwd}/chain-demo\n`, code: 0 } };
      return { success: true, data: { stdout: '', code: 0 } };
    });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    return { loop, execute, generate };
  };

  it('asks once for the whole plan, carries the folder and moves the shell there', async () => {
    const { loop, execute, generate } = setup();
    const handler = vi.fn().mockResolvedValue(true);
    loop.setAuthorizationHandler(handler);
    const result = await loop.run('create a folder called chain-demo here, go into it, initialize a git repository, create a package.json with npm init -y and then list the files', { os: 'macos', cwd: '/tmp/wf' });

    expect(result.success).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ capabilityId: 'workflow.batch' });
    expect(handler.mock.calls[0][0].parameters.command).toContain('1. mkdir -p chain-demo');
    const calls = execute.mock.calls.map(c => [c[1].command, c[2]]);
    expect(calls).toEqual([
      ['mkdir -p chain-demo', '/tmp/wf'],
      ["cd '/tmp/wf/chain-demo' && pwd", '/tmp/wf'],
      ['git init', '/tmp/wf/chain-demo'],
      ['npm init -y', '/tmp/wf/chain-demo'],
      ['ls -la', '/tmp/wf/chain-demo'],
    ]);
    expect(result.cdPath).toBe('/tmp/wf/chain-demo');
  });

  it('asks the model only for the clause it could not plan, and never runs English', async () => {
    const { loop, execute, generate } = setup([JSON.stringify({ action: 'execute', command: 'npx express-generator --no-view api', explanation: 'Scaffold' })]);
    loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const result = await loop.run('create a folder called chain-demo, go into it, then scaffold an express app called api', { os: 'linux', cwd: '/tmp/wf' });
    expect(result.success).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls.map(c => c[1].command)).toContain('npx express-generator --no-view api');
    expect(execute.mock.calls.every(c => !/scaffold an express/.test(c[1].command))).toBe(true);
  });

  it('stops at the first failing step and reports it', async () => {
    const { loop, execute } = setup();
    (execute as any).mockImplementation(async (_t: string, params: any) => params.command === 'git init'
      ? { success: false, error: 'git: command not found', data: { code: 127 } }
      : { success: true, data: { stdout: '/tmp/wf/x\n', code: 0 } });
    loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const result = await loop.run('make a folder named x, go into it, initialize git, then list the files', { os: 'linux', cwd: '/tmp/wf' });
    expect(result.success).toBe(false);
    expect(result.summary).toContain('Stopped at step 3');
    expect(execute.mock.calls.map(c => c[1].command)).not.toContain('ls -la');
  });

  it('runs nothing when the plan is declined', async () => {
    const { loop, execute } = setup();
    loop.setAuthorizationHandler(vi.fn().mockResolvedValue(false));
    const result = await loop.run('create a folder called chain-demo, go into it and initialize git', { os: 'linux', cwd: '/tmp/wf' });
    expect(result.declined).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it('tells commands from sentences', async () => {
    const { looksLikeShellCommand } = await import('./AgentLoop');
    expect(looksLikeShellCommand('git init')).toBe(true);
    expect(looksLikeShellCommand('npx create-vite@latest app')).toBe(true);
    expect(looksLikeShellCommand('./build.sh --release')).toBe(true);
    expect(looksLikeShellCommand('FOO=1 make')).toBe(true);
    expect(looksLikeShellCommand('create a folder called chain-demo here, go into it &&')).toBe(false);
    expect(looksLikeShellCommand('list the files')).toBe(false);
  });
});

describe('ROS 2 pipelines', () => {
  const setup = (rosInstalled: boolean) => {
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate: vi.fn() }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    const execute = vi.fn(async (_t: string, params: any) => {
      if (params.command.includes('/opt/ros')) return rosInstalled ? { success: true, data: { stdout: '/opt/ros\n', code: 0 } } : { success: false, data: { stdout: '', code: 1 } };
      if (params.command === 'ros2 node list') return { success: true, data: { stdout: '/turtlesim\n/teleop_turtle\n', code: 0 } };
      return { success: true, data: { stdout: '/turtle1/pose\n', code: 0 } };
    });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    return { loop, execute };
  };

  it('starts every process in its own pane after one confirmation, then checks the graph', async () => {
    const { AgentLoop: Loop } = await import('./AgentLoop');
    Loop.ROS_SETTLE_MS = 0;
    Loop.PANE_STAGGER_MS = 0;
    const { TerminalWorkspace } = await import('../../domain/terminal/TerminalWorkspace');
    TerminalWorkspace.resetForTests();
    const spawner = vi.fn().mockReturnValueOnce('p1').mockReturnValueOnce('p2').mockReturnValueOnce('p3');
    TerminalWorkspace.getInstance().setSpawner(spawner);
    const { loop, execute } = setup(true);
    const handler = vi.fn().mockResolvedValue(true);
    loop.setAuthorizationHandler(handler);

    const result = await loop.run('run turtlesim, control it with the keyboard and show me the pose', { os: 'linux', cwd: '/home/u/ws', paneId: 'main' });

    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].parameters.command).toContain('ros2 run turtlesim turtle_teleop_key');
    expect(spawner.mock.calls.map(c => c[0].title)).toEqual(['turtlesim_node', 'turtle_teleop_key', 'echo /turtle1/pose']);
    expect(spawner.mock.calls.every(c => c[0].requesterPaneId === 'main')).toBe(true);
    expect(execute.mock.calls.map(c => c[1].command)).toContain('ros2 node list');
    expect(result.summary).toContain('3 processes in separate terminals');
  });

  it('explains when ROS 2 is not installed instead of opening panes that fail', async () => {
    const { TerminalWorkspace } = await import('../../domain/terminal/TerminalWorkspace');
    TerminalWorkspace.resetForTests();
    const spawner = vi.fn();
    TerminalWorkspace.getInstance().setSpawner(spawner);
    const { loop } = setup(false);
    loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const result = await loop.run('run the ros2 talker and listener', { os: 'macos', cwd: '/tmp' });
    expect(result.success).toBe(false);
    expect(result.summary).toContain('ROS 2 is not installed');
    expect(spawner).not.toHaveBeenCalled();
  });
});

describe('Talking to other terminals', () => {
  const setup = async () => {
    const { TerminalWorkspace } = await import('../../domain/terminal/TerminalWorkspace');
    TerminalWorkspace.resetForTests();
    const ws = TerminalWorkspace.getInstance();
    const writes: Array<[string, string]> = [];
    ws.setWriter((sessionId, data) => writes.push([sessionId, data]));
    const spawner = vi.fn().mockReturnValue('new-pane');
    ws.setSpawner(spawner);
    ws.register('me', { sessionId: 's-me', cwd: '/home/u/app', outputTail: ['u@h app % '] });
    ws.register('idle', { sessionId: 's-idle', cwd: '/home/u/api', title: 'api', outputTail: ['u@h api % '] });
    ws.register('srv', { sessionId: 's-srv', cwd: '/home/u/web', busy: true, runningCommand: 'npm run dev', title: 'dev server', outputTail: ['ready on :5173'] });
    ws.setLayout([{ tabId: 't1', index: 1, title: 'app', paneIds: ['me', 'idle'] }, { tabId: 't2', index: 2, title: 'web', paneIds: ['srv'] }]);
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ action: 'done', summary: 'ok' }) });
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    (loop as any).toolExecutor = { hasDriver: () => true, execute: vi.fn() };
    return { ws, writes, spawner, loop, generate };
  };

  it("answers what's running in every terminal without calling the model", async () => {
    const { loop, generate } = await setup();
    const r = await loop.run("what's running in my terminals", { os: 'macos', cwd: '/home/u/app', paneId: 'me' });
    expect(generate).not.toHaveBeenCalled();
    expect(r.summary).toContain('terminal 1 (tab 1, app) (this one)');
    expect(r.summary).toContain('terminal 3 (tab 2, dev server) in /home/u/web: running `npm run dev`');
  });

  it('shows the last line with text for a busy terminal, never an empty one', async () => {
    const { ws, loop } = await setup();
    ws.register('srv', { sessionId: 's-srv', cwd: '/home/u/web', busy: true, runningCommand: 'python3 -m http.server', outputTail: ['\x1b[32mGET / HTTP/1.1 200\x1b[0m', '', '   ', '\x1b[?2004l\r'] });
    const r = await loop.run("what's running in my terminals", { os: 'macos', cwd: '/home/u/app', paneId: 'me' });
    expect(r.summary).toContain('last line: GET / HTTP/1.1 200');
    expect(r.summary).not.toMatch(/last line:\s*$/m);
  });

  it('sends a command to an idle terminal after approval and reports its output', async () => {
    const { ws, loop, writes } = await setup();
    const { AgentLoop: Loop } = await import('./AgentLoop');
    Loop.SEND_WAIT_MS = 2000;
    loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    setTimeout(() => {
      ws.appendOutput('idle', 'git pull\nAlready up to date.\nu@h api % \n');
      ws.update('idle', { busy: false });
    }, 300);
    const r = await loop.run('run git pull in terminal 2', { os: 'macos', cwd: '/home/u/app', paneId: 'me' });
    expect(writes).toEqual([['s-idle', 'git pull\r']]);
    expect(r.summary).toContain('Ran `git pull` in terminal 2');
    expect(r.summary).toContain('Already up to date.');
  });

  it('refuses to type into a busy terminal and asks when the target is ambiguous', async () => {
    const { loop, writes } = await setup();
    loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const busy = await loop.run('run ls in tab 2', { os: 'macos', cwd: '/home/u/app', paneId: 'me' });
    expect(busy.summary).toContain('busy running `npm run dev`');
    const other = await loop.run('run ls in the other terminal', { os: 'macos', cwd: '/home/u/app', paneId: 'me' });
    expect(other.summary).toContain('could mean terminal 2');
    expect(writes).toEqual([]);
  });

  it('stops the server with Ctrl+C only after confirmation', async () => {
    const { loop, writes } = await setup();
    const handler = vi.fn().mockResolvedValue(true);
    loop.setAuthorizationHandler(handler);
    const r = await loop.run('stop the server', { os: 'macos', cwd: '/home/u/app', paneId: 'me' });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ capabilityId: 'terminal.interrupt' }));
    expect(writes).toEqual([['s-srv', '\x03']]);
    expect(r.summary).toContain('Stopped `npm run dev` in terminal 3');
  });

  it('opens a focused tab in a folder, running a command after approval', async () => {
    const { loop, spawner } = await setup();
    loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const r = await loop.run('open a new tab in ../api and run npm run dev', { os: 'macos', cwd: '/home/u/app', paneId: 'me' });
    expect(spawner).toHaveBeenCalledWith(expect.objectContaining({ placement: 'tab', cwd: '/home/u/api', command: 'npm run dev', focus: true }));
    expect(r.success).toBe(true);
  });

  it('gives the model new terminal output, and only the last line of terminals with nothing new', async () => {
    const { ws, loop, generate } = await setup();
    ws.appendOutput('srv', 'compiling\nGET / 200\n');
    await loop.run('summarize the project', { os: 'macos', cwd: '/home/u/app', paneId: 'me' });
    await loop.run('anything new?', { os: 'macos', cwd: '/home/u/app', paneId: 'me' });
    const second = generate.mock.calls[generate.mock.calls.length - 1];
    const prompt = String(second[0]) + JSON.stringify(second[2]?.messages ?? '');
    expect(prompt).toContain('(no new output since the last request)');
    expect(prompt).toContain('GET / 200');
    expect(prompt).not.toContain('compiling');
    ws.appendOutput('srv', 'GET /api 500\n');
    await loop.run('and now?', { os: 'macos', cwd: '/home/u/app', paneId: 'me' });
    const third = generate.mock.calls[generate.mock.calls.length - 1];
    expect(String(third[0]) + JSON.stringify(third[2]?.messages ?? '')).toContain('GET /api 500');
  });
});

describe('App actions win over folder navigation', () => {
  it('"go to tab 2" switches tabs instead of offering to create a folder', async () => {
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate: vi.fn() }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    const r = await loop.run('go to tab 2', { os: 'macos', cwd: '/tmp' });
    expect(r.steps[0]).toMatchObject({ tool: '__app__', params: { id: 'focus_tab', tab: 2 } });
    expect(r.summary).not.toMatch(/mkdir|does not exist/);
  });
});

describe('Quitting an app the user names', () => {
  const setup = (lists: string[]) => {
    const execute = vi.fn(async (_tool: string, params: any, _cwd: string, authorize?: any) => {
      if (/^ps /.test(params.command)) return { success: true, data: { stdout: lists.shift() ?? '', code: 0 } };
      if (authorize && !(await authorize({ capabilityId: 'shell.execute', parameters: params }))) return { success: false, errorCode: 'USER_CANCELLED' };
      return { success: true, data: { stdout: '', code: 0 } };
    });
    const generate = vi.fn();
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    return { loop, execute, generate };
  };
  const RUNNING = '/Applications/Claude.app/Contents/MacOS/Claude\n/Users/me/.local/bin/claude\n/Applications/Safari.app/Contents/MacOS/Safari';
  const AFTER = '/Users/me/.local/bin/claude\n/Applications/Safari.app/Contents/MacOS/Safari';

  it('looks up the running app first and quits "Claude" by its real name', async () => {
    const { loop, execute, generate } = setup([RUNNING, AFTER]);
    const handler = vi.fn().mockResolvedValue(true);
    loop.setAuthorizationHandler(handler);
    const r = await loop.run('terminate or stop the claude application', { os: 'macos', cwd: '/tmp' });
    const commands = execute.mock.calls.map(c => c[1].command);
    expect(commands).toEqual(['ps -axo comm=', `osascript -e 'quit app "Claude"'`, 'ps -axo comm=']);
    expect(commands.some(c => /pkill|killall/.test(c))).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ success: true, summary: 'Quit Claude.' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('says so, and closes nothing, when no running app has that name', async () => {
    const { loop, execute } = setup([RUNNING]);
    loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const r = await loop.run('quit the safary app', { os: 'macos', cwd: '/tmp' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(r.success).toBe(false);
    expect(r.summary).toContain('No running app is called "safary". Nothing was closed. Running now with a similar name: Safari.');
  });

  it('reports an app that did not quit, and a declined quit changes nothing', async () => {
    const stuck = setup([RUNNING, RUNNING]);
    stuck.loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const r = await stuck.loop.run('quit claude', { os: 'macos', cwd: '/tmp' });
    expect(r.summary).toContain('Claude is still running (it may be asking to save your work). Say "force quit Claude"');
    const declined = setup([RUNNING]);
    declined.loop.setAuthorizationHandler(vi.fn().mockResolvedValue(false));
    const d = await declined.loop.run('quit claude', { os: 'macos', cwd: '/tmp' });
    expect(d).toMatchObject({ success: false, declined: true });
  });
});

describe('Making a workflow from plain steps', () => {
  const setup = () => {
    const files = new Map<string, string>();
    const io = { exists: async (p: string) => files.has(p), write: async (p: string, t: string) => { files.set(p, t); } };
    const generate = vi.fn();
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    (loop as any).toolExecutor = { hasDriver: () => true, execute: vi.fn() };
    loop.setFlowIO(io);
    return { loop, files, generate };
  };
  const GOAL = 'make me a workflow called demo setup that installs node, opens youtube in chrome and opens vs code';
  const home = process.env.HOME || process.env.USERPROFILE || '';

  it('asks where to save, writes a file the planner understands on every OS, and does not call the model', async () => {
    const { setChoiceHandlerForTests } = await import('../../presentation/ChoiceRequests');
    const { planFlowFile } = await import('../../workflows/flow/FlowPlan');
    const { loop, files, generate } = setup();
    const asked: any[] = [];
    setChoiceHandlerForTests(async (req) => { asked.push(req); return { index: 0 }; });
    try {
      const r = await loop.run(GOAL, { os: 'macos', cwd: '/tmp/work' });
      expect(r.success).toBe(true);
      expect(generate).not.toHaveBeenCalled();
      expect(asked).toHaveLength(1);
      expect(asked[0].title).toBe('Save "demo setup" as a .flow file');
      expect(asked[0].options.map((o: any) => o.label)).toEqual(['Desktop', 'This folder', 'Cero workflows']);
      expect(asked[0].options[1].detail).toBe('/tmp/work');
      expect(asked[0].lines.slice(0, 3)).toEqual(['1. Install node', '2. Open YouTube in Chrome', '3. Open VS Code']);
      const [path] = [...files.keys()];
      expect(path).toMatch(/[\\/]Desktop[\\/]demo-setup\.flow$/);
      expect(r.summary).toContain('Saved ');
      expect(r.summary).toContain('(3 steps)');
      for (const os of ['macos', 'windows', 'linux'] as const) {
        expect(planFlowFile(files.get(path)!, path, os)?.steps.length).toBe(3);
      }
    } finally { setChoiceHandlerForTests(null); }
    expect(home).toBeTruthy();
  });

  it('never replaces an existing file, and saves in this folder or a typed path when asked', async () => {
    const { setChoiceHandlerForTests } = await import('../../presentation/ChoiceRequests');
    const { loop, files } = setup();
    files.set('/tmp/work/demo-setup.flow', 'existing');
    setChoiceHandlerForTests(async () => ({ index: 1 }));
    try {
      const r = await loop.run(GOAL, { os: 'macos', cwd: '/tmp/work' });
      expect(r.success).toBe(true);
      expect(files.get('/tmp/work/demo-setup.flow')).toBe('existing');
      expect(files.has('/tmp/work/demo-setup-2.flow')).toBe(true);
      setChoiceHandlerForTests(async () => ({ custom: '/tmp/elsewhere/mine.flow' }));
      const r2 = await loop.run(GOAL, { os: 'macos', cwd: '/tmp/work' });
      expect(r2.success).toBe(true);
      expect(files.has('/tmp/elsewhere/mine.flow')).toBe(true);
    } finally { setChoiceHandlerForTests(null); }
  });

  it('saves nothing when cancelled, and says so when there is no screen to ask on', async () => {
    const { setChoiceHandlerForTests } = await import('../../presentation/ChoiceRequests');
    const { loop, files } = setup();
    setChoiceHandlerForTests(async () => null);
    try {
      const r = await loop.run(GOAL, { os: 'macos', cwd: '/tmp/work' });
      expect(r).toMatchObject({ success: false, declined: true });
    } finally { setChoiceHandlerForTests(null); }
    const headless = await loop.run(GOAL, { os: 'macos', cwd: '/tmp/work' });
    expect(headless.success).toBe(false);
    expect(headless.summary).toContain('no screen to ask where to save');
    expect(files.size).toBe(0);
  });

  it('names steps it did not understand and leaves them out of the file', async () => {
    const { setChoiceHandlerForTests } = await import('../../presentation/ChoiceRequests');
    const { loop, files } = setup();
    let lines: string[] = [];
    setChoiceHandlerForTests(async (req) => { lines = req.lines ?? []; return { index: 1 }; });
    try {
      const r = await loop.run('create a workflow that installs node, makes everything faster and opens youtube', { os: 'linux', cwd: '/tmp/work' });
      expect(r.summary).toContain('1 step was left out');
      expect(lines.join('\n')).toContain('Left out (not understood): make everything faster');
      expect(JSON.parse([...files.values()][0]).actions).toHaveLength(2);
      setChoiceHandlerForTests(async () => { throw new Error('should not ask'); });
      const none = await loop.run('make a workflow that flibbers the wobble', { os: 'linux', cwd: '/tmp/work' });
      expect(none.success).toBe(false);
      expect(none.summary).toContain('Not understood: "flibbers the wobble"');
    } finally { setChoiceHandlerForTests(null); }
  });
});

describe('Closing a port', () => {
  const setup = (lists: string[]) => {
    const execute = vi.fn(async (_tool: string, params: any, _cwd: string, authorize?: any) => {
      if (/^lsof /.test(params.command)) return { success: true, data: { stdout: lists.shift() ?? '', code: 0 } };
      if (authorize && !(await authorize({ capabilityId: 'shell.execute', parameters: params }))) return { success: false, errorCode: 'USER_CANCELLED' };
      return { success: true, data: { stdout: '', code: 0 } };
    });
    const generate = vi.fn();
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn()
    } as any);
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    return { loop, execute, generate };
  };
  const LISTENING = 'p63988\ncPython\n';

  it('looks up the exact port, asks with the process named, stops it normally and checks it is free', async () => {
    const { loop, execute, generate } = setup([LISTENING, '']);
    const handler = vi.fn().mockResolvedValue(true);
    loop.setAuthorizationHandler(handler);
    const r = await loop.run('close port 8765', { os: 'macos', cwd: '/tmp' });
    expect(execute.mock.calls.map(c => c[1].command)).toEqual([
      'lsof -nP -iTCP:8765 -sTCP:LISTEN -Fpc 2>/dev/null || true', 'kill 63988', 'lsof -nP -iTCP:8765 -sTCP:LISTEN -Fpc 2>/dev/null || true',
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].parameters.explanation).toBe('Stop Python (PID 63988), listening on port 8765');
    expect(r).toMatchObject({ success: true, summary: 'Port 8765 is free. Stopped Python (PID 63988).' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('says so when nothing listens, and offers a forced stop only when the program stays', async () => {
    const free = setup(['']);
    free.loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const r = await free.loop.run('free up port 3000', { os: 'linux', cwd: '/tmp' });
    expect(r).toMatchObject({ success: true, summary: 'Port 3000 is already free: nothing is listening on it.' });
    expect(free.execute).toHaveBeenCalledTimes(1);

    const stuck = setup([LISTENING, LISTENING]);
    stuck.loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const s = await stuck.loop.run('close port 8765', { os: 'macos', cwd: '/tmp' });
    expect(s.success).toBe(false);
    expect(s.summary).toContain('still in use by Python (PID 63988)');
    expect(s.summary).toContain('say "force close port 8765"');
  });

  it('a declined request stops nothing, and "force" is the only way to kill -9', async () => {
    const declined = setup([LISTENING]);
    declined.loop.setAuthorizationHandler(vi.fn().mockResolvedValue(false));
    const d = await declined.loop.run('close port 8765', { os: 'macos', cwd: '/tmp' });
    expect(d).toMatchObject({ success: false, declined: true });
    expect(declined.execute.mock.calls.map(c => c[1].command)).toEqual(['lsof -nP -iTCP:8765 -sTCP:LISTEN -Fpc 2>/dev/null || true', 'kill 63988']);

    const forced = setup([LISTENING, '']);
    forced.loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    await forced.loop.run('force close port 8765', { os: 'macos', cwd: '/tmp' });
    expect(forced.execute.mock.calls[1][1].command).toBe('kill -9 63988');
  });
});

describe('Joining a Wi-Fi network', () => {
  it('uses the exact quoted command on macOS instead of asking the model (which invented a password)', async () => {
    const execute = vi.fn(async (_t: string, params: any, _c: string, authorize?: any) => {
      if (authorize && !(await authorize({ capabilityId: 'shell.execute', parameters: params }))) return { success: false, errorCode: 'USER_CANCELLED' };
      return { success: true, data: { stdout: '', code: 0 } };
    });
    const generate = vi.fn();
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }), initialize: vi.fn()
    } as any);
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    const handler = vi.fn().mockResolvedValue(false);
    loop.setAuthorizationHandler(handler);
    const r = await loop.run('connect to wifi Demo Network', { os: 'macos', cwd: '/tmp' });
    expect(generate).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].parameters.command).toContain(`networksetup -setairportnetwork`);
    expect(handler.mock.calls[0][0].parameters.command).toContain(`'Demo Network'`);
    expect(handler.mock.calls[0][0].parameters.command).not.toMatch(/password/i);
    expect(r).toMatchObject({ success: false, declined: true });
  });
});

describe('Turning Wi-Fi on and off on macOS', () => {
  it('runs the exact networksetup command after approval, without calling the model', async () => {
    const commands: string[] = [];
    const execute = vi.fn(async (_t: string, params: any, _c: string, authorize?: any) => {
      commands.push(params.command);
      if (authorize && !(await authorize({ capabilityId: 'shell.execute', parameters: params }))) return { success: false, errorCode: 'USER_CANCELLED' };
      return { success: true, data: { stdout: '', code: 0 } };
    });
    const generate = vi.fn();
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }), initialize: vi.fn()
    } as any);
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    loop.setAuthorizationHandler(vi.fn().mockResolvedValue(true));
    const off = await loop.run('turn wifi off', { os: 'macos', cwd: '/tmp' });
    expect(off).toMatchObject({ success: true, summary: 'Wi-Fi is off.' });
    expect(commands[0]).toContain('networksetup -setairportpower');
    expect(commands[0]).toMatch(/ off$/);
    const on = await loop.run('turn wifi on', { os: 'macos', cwd: '/tmp' });
    expect(on.summary).toBe('Wi-Fi is on.');
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('fixLeadingVerb', () => {
  it('corrects a slipped command word and leaves real words alone', async () => {
    const { fixLeadingVerb } = await import('./AgentLoop');
    expect(fixLeadingVerb('opn firefox')).toBe('open firefox');
    expect(fixLeadingVerb('opne gitBrans in vs code')).toBe('open gitBrans in vs code');
    expect(fixLeadingVerb('Oepn the folder x')).toBe('Open the folder x');
    expect(fixLeadingVerb('instl express')).toBe('install express');
    expect(fixLeadingVerb('please clos port 8000')).toBe('please close port 8000');
    expect(fixLeadingVerb('star the repo')).toBe('star the repo');
    expect(fixLeadingVerb('quite a lot of files here')).toBe('quite a lot of files here');
    expect(fixLeadingVerb('open firefox')).toBe('open firefox');
    expect(fixLeadingVerb('ls -la')).toBe('ls -la');
    expect(fixLeadingVerb('')).toBe('');
  });
});
