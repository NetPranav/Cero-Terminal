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
      expect(isConversationalRefusal("I am Sentinel, an autonomous mac terminal AI copilot.")).toBe(false);
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

    it('matches composite app launch regex with workspace specifier', () => {
      const res = findFastPath('open zen browser and "/home/test/Projects" folder in vscode in 5th workspace');
      expect(res).not.toBeNull();
      expect(res?.tool).toBe('shell.execute');
      expect(res?.params.command).toContain('hyprctl dispatch');
      expect(res?.params.command).toContain('zen-browser');
      expect(res?.params.command).toContain('code "/home/test/Projects"');
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

  it('exports a redacted Markdown transcript under ~/.sentinel/transcripts', async () => {
    const fs = await import('node:fs');
    const loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any);
    (loop as any).transcript.push({
      goal: 'show my token',
      at: Date.now(),
      result: { success: true, summary: 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789', steps: [{ tool: 'shell.execute', params: { command: 'echo $GITHUB_TOKEN' }, result: { success: true } }] }
    });
    const res = await loop.run('export session', { os: 'linux', cwd: '/home/u' });
    const file = `${process.env.HOME}/.sentinel/transcripts/${res.summary.match(/session-[\d-]+\.md/)![0]}`;
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain('## ');
    expect(text).toContain('`echo $GITHUB_TOKEN` (ok)');
    expect(text).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });
});
