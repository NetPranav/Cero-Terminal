import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRegistrySDK } from '../capabilities/CapabilityRegistrySDK';
import { ApplicationCapability } from '../capabilities/drivers/ApplicationCapability';
import { BrowserCapability } from '../capabilities/drivers/BrowserCapability';
import { WifiCapability } from '../capabilities/drivers/WifiCapability';
import { BluetoothCapability } from '../capabilities/drivers/BluetoothCapability';
import { FilesystemSDKCapability } from '../capabilities/drivers/FilesystemSDKCapability';
import { SystemSDKCapability } from '../capabilities/drivers/SystemSDKCapability';
import { ShellSDKCapability } from '../capabilities/drivers/ShellSDKCapability';
import { GitCapability } from '../capabilities/drivers/GitCapability';
import { DockerCapability } from '../capabilities/drivers/DockerCapability';
import { NodeCapability } from '../capabilities/drivers/NodeCapability';
import { PythonCapability } from '../capabilities/drivers/PythonCapability';
import { NetworkingCapability } from '../capabilities/drivers/NetworkingCapability';
import { DeveloperCapability } from '../capabilities/drivers/DeveloperCapability';
import { ToolLoader } from '../../tools/loader/ToolLoader';
import { AppAliasRegistry } from '../../domain/capabilities/AppAliasRegistry';

describe('Capability SDK — End-to-End Concrete Execution Drivers', () => {
  let registry: CapabilityRegistrySDK;

  beforeEach(() => {
    registry = CapabilityRegistrySDK.getInstance();
  });

  describe('1. ApplicationCapability (Desktop Launch Driver)', () => {
    it('should open an application via express open() driver and verify lifecycle', async () => {
      const appDriver = new ApplicationCapability();
      const res = await appDriver.open('Safari');
      
      expect(res.success).toBe(true);
      expect(res.data?.opened).toBe(true);
      expect(res.commandExecuted).toContain('Safari');
      
      const verified = await appDriver.verify({ app: 'Safari' }, res);
      expect(verified).toBe(true);
      
      const rolledBack = await appDriver.rollback({ app: 'Safari' }, res);
      expect(rolledBack).toBe(true);
    });

    it('should automatically resolve macOS application aliases like "chrome" to "Google Chrome" and custom user registrations', async () => {
      const appDriver = new ApplicationCapability();
      const chromeRes = await appDriver.open('chrome', ['https://youtube.com']);
      expect(chromeRes.success).toBe(true);
      expect(chromeRes.commandExecuted).toContain('Google Chrome');

      // Test runtime custom registration
      const appRegistry = AppAliasRegistry.getInstance();
      appRegistry.setAlias('myedit', 'TextEdit');
      expect(appRegistry.resolve('myedit')).toBe('TextEdit');
      expect(appRegistry.resolve('chrome')).toBe('Google Chrome');
      expect(appRegistry.resolve('vscode')).toBe('Visual Studio Code');
    });

    it('should support dry run simulation without executing system commands', async () => {
      const appDriver = new ApplicationCapability();
      const res = await appDriver.execute({ app: 'Spotify' }, { isDryRun: true });
      expect(res.success).toBe(true);
      expect((res.data as any).dryRun).toBe(true);
    });

    it('should resolve Homebrew package identifiers and properly target casks on macOS', async () => {
      const appRegistry = AppAliasRegistry.getInstance();
      
      const bravePkg = appRegistry.resolvePackage('Brave Browser');
      expect(bravePkg.name).toBe('brave-browser');
      expect(bravePkg.isCask).toBe(true);

      const chromePkg = appRegistry.resolvePackage('Google Chrome');
      expect(chromePkg.name).toBe('google-chrome');
      expect(chromePkg.isCask).toBe(true);

      const vscodePkg = appRegistry.resolvePackage('VS Code');
      expect(vscodePkg.name).toBe('visual-studio-code');
      expect(vscodePkg.isCask).toBe(true);

      const gitPkg = appRegistry.resolvePackage('git');
      expect(gitPkg.name).toBe('git');
      expect(gitPkg.isCask).toBe(false);
    });

    it('should execute application update with normalized cask arguments', async () => {
      const appDriver = new ApplicationCapability();
      
      // GUI Application update test
      const braveRes = await appDriver.update('Brave Browser');
      expect(braveRes.success).toBe(true);
      expect(braveRes.data?.updated).toBe(true);
      expect(braveRes.data?.package).toBe('brave-browser');
      expect(braveRes.commandExecuted).toBe('brew upgrade --cask brave-browser');

      // System app update exclusion test
      const safariRes = await appDriver.update('Safari');
      expect(safariRes.success).toBe(true);
      expect(safariRes.data?.updated).toBe(false);
      expect((safariRes.data as any)?.reason).toBe('System application');
    });

    it('should handle cancellation cleanly', async () => {
      const appDriver = new ApplicationCapability();
      const cancelRes = await appDriver.cancel();
      expect(typeof cancelRes).toBe('boolean');
    });

    it('should skip package installation if target is already installed', async () => {
      const appDriver = new ApplicationCapability('application.install');
      const res = await appDriver.execute({
        operation: 'install',
        app: 'neovim',
        mockAlreadyInstalled: true
      });
      expect(res.success).toBe(true);
      expect(res.data?.alreadyInstalled).toBe(true);
      expect(res.data?.stdout).toContain('already installed');
    });

    it('should execute reinstall when reinstall or force flag is specified even if installed', async () => {
      const appDriver = new ApplicationCapability('application.install');
      const res = await appDriver.execute({
        operation: 'install',
        app: 'neovim',
        mockAlreadyInstalled: true,
        reinstall: true
      });
      expect(res.success).toBe(true);
      expect(res.data?.reinstalled).toBe(true);
      expect(res.data?.alreadyInstalled).toBeUndefined();
    });
  });

  describe('2. BrowserCapability (System Default Browser Driver)', () => {
    it('should navigate to web URL via express navigate() driver', async () => {
      const browserDriver = new BrowserCapability('browser.navigate');
      const res = await browserDriver.navigate('github.com');
      
      expect(res.success).toBe(true);
      expect(res.data?.url).toBe('https://github.com');
      
      const verified = await browserDriver.verify({ url: 'github.com' }, res);
      expect(verified).toBe(true);
    });

    it('should execute web search across Google, YouTube, and GitHub via express search()', async () => {
      const browserDriver = new BrowserCapability('browser.search');
      const ytRes = await browserDriver.search('AI agent coding', 'youtube');
      expect(ytRes.success).toBe(true);
      expect(ytRes.data?.url).toContain('youtube.com');
      expect(ytRes.commandExecuted).toContain('open');

      const ghRes = await browserDriver.search('Cero terminal', 'github');
      expect(ghRes.data?.url).toContain('github.com/search');
    });

    it('should target specific browser with -a when appName is provided', async () => {
      const browserDriver = new BrowserCapability('browser.navigate');
      const res = await browserDriver.execute({ url: 'youtube.com', appName: 'Safari' });

      expect(res.success).toBe(true);
      expect(res.data?.url).toBe('https://youtube.com');
      expect(res.data?.browser).toBe('Safari');
      expect(res.commandExecuted).toBe('open -a "Safari" "https://youtube.com"');
    });

    it('should resolve browser aliases (e.g., chrome -> Google Chrome)', async () => {
      const browserDriver = new BrowserCapability('browser.navigate');
      const res = await browserDriver.execute({ url: 'github.com', browser: 'chrome' });

      expect(res.success).toBe(true);
      expect(res.data?.browser).toBe('Google Chrome');
      expect(res.commandExecuted).toBe('open -a "Google Chrome" "https://github.com"');
    });
  });

  describe('3. WifiCapability (Wireless Networking Driver)', () => {
    it('should perform network scanning and join wireless networks via express methods', async () => {
      const wifiDriver = new WifiCapability();
      
      const scanRes = await wifiDriver.scan();
      expect(scanRes.success).toBe(true);
      expect(Array.isArray(scanRes.data?.networks)).toBe(true);
      expect(scanRes.commandExecuted).toContain('airport');

      const connectRes = await wifiDriver.connect('Home-WiFi-5G', 'secretPass');
      expect(connectRes.success).toBe(true);
      expect(connectRes.data?.connected).toBe(true);
      expect(connectRes.data?.ssid).toBe('Home-WiFi-5G');

      const verified = await wifiDriver.verify({ ssid: 'Home-WiFi-5G' }, connectRes);
      expect(verified).toBe(true);

      const rollbackRes = await wifiDriver.rollback({ ssid: 'Home-WiFi-5G' }, connectRes);
      expect(typeof rollbackRes).toBe('boolean');
    });
  });

  describe('4. BluetoothCapability (System Bluetooth Subsystem Driver)', () => {
    it('should list discoverable devices and control radio power', async () => {
      const btDriver = new BluetoothCapability('network.bluetooth.list');
      const listRes = await btDriver.list();
      expect(listRes.success).toBe(true);
      expect(listRes.commandExecuted).toBe('system_profiler SPBluetoothDataType');
      expect(listRes.data?.devices.length).toBeGreaterThan(0);

      const onRes = await btDriver.turnOn();
      expect(onRes.success).toBe(true);
      expect(onRes.commandExecuted).toContain('blueutil -p 1');

      const offRes = await btDriver.turnOff();
      expect(offRes.success).toBe(true);
      expect(offRes.commandExecuted).toContain('blueutil -p 0');

      const connectRes = await btDriver.connect('AirPods Pro');
      expect(connectRes.success).toBe(true);
      expect(connectRes.data?.device).toBe('AirPods Pro');
    });

    it('should gracefully handle missing blueutil binary on stock macOS by falling back to Bluetooth Settings', async () => {
      BluetoothCapability.mockBlueutilMissing = true;
      try {
        const btDriver = new BluetoothCapability('network.bluetooth.on');
        const onRes = await btDriver.turnOn();
        expect(onRes.success).toBe(true);
        expect((onRes.data as any)?.fallback).toBe('settings');
        expect((onRes.data as any)?.openedSettings).toBe(true);
        expect(onRes.commandExecuted).toContain('x-apple.systempreferences:com.apple.BluetoothSettings');

        const connectRes = await btDriver.connect('Soundcore Space One');
        expect(connectRes.success).toBe(true);
        expect((connectRes.data as any)?.fallback).toBe('settings');
        expect((connectRes.data as any)?.openedSettings).toBe(true);
        expect(connectRes.commandExecuted).toContain('x-apple.systempreferences:com.apple.BluetoothSettings');
      } finally {
        BluetoothCapability.mockBlueutilMissing = false;
      }
    });

    it('should connect to peripherals even when queries include accessory nouns (Issue 8 / GitHub #6)', async () => {
      const btDriver = new BluetoothCapability();
      const res = await btDriver.connect('soundcore space one headphone');
      expect(res.success).toBe(true);
      expect(res.data?.connected).toBe(true);
    });
  });

  describe('5. FilesystemSDKCapability (Pure Native Filesystem Driver)', () => {
    it('should perform file read, directory listing, recursive search, and copy via express drivers without raw shell invocations', async () => {
      const fsDriver = new FilesystemSDKCapability();
      
      const readRes = await fsDriver.read('/test/config.json');
      expect(readRes.success).toBe(true);
      expect(readRes.data?.content).toBe('mock filesystem content');

      const listRes = await fsDriver.list('/test');
      expect(listRes.success).toBe(true);
      expect(listRes.data?.entries).toBeDefined();

      const searchRes = await fsDriver.search('/workspace', '*.ts');
      expect(searchRes.success).toBe(true);
      expect(searchRes.data?.matches).toBeDefined();

      const copyRes = await fsDriver.copy('/workspace/config.json', '/workspace/config.bak');
      expect(copyRes.success).toBe(true);
      expect(copyRes.data?.copied).toBe(true);

      const verified = await fsDriver.verify({ source: 'a', destination: 'b' }, copyRes);
      expect(verified).toBe(true);

      const rolledBack = await fsDriver.rollback({ source: 'a', destination: 'b' }, copyRes);
      expect(typeof rolledBack).toBe('boolean');
    });
  });

  describe('6. System & Shell Capabilities', () => {
    it('should query system diagnostics and execute arbitrary shell instructions', async () => {
      const sysDriver = new SystemSDKCapability();
      const sysRes = await sysDriver.info();
      expect(sysRes.success).toBe(true);
      expect(sysRes.data?.os).toBeDefined();

      const shellDriver = new ShellSDKCapability();
      const shellRes = await shellDriver.run('echo hello');
      expect(shellRes.success).toBe(true);
      expect(shellRes.data?.code).toBe(0);

      const shellWithTildeCwd = await shellDriver.execute({ command: 'echo hello', cwd: '~' });
      expect(shellWithTildeCwd.success).toBe(true);

      const verifyShell = await shellDriver.verify({ command: 'echo hello' }, shellRes);
      expect(verifyShell).toBe(true);
    });
  });

  describe('7. Git & Version Control Capability', () => {
    it('should clone repository and perform commits with verification and rollback', async () => {
      const gitDriver = new GitCapability('git.clone');
      const cloneRes = await gitDriver.clone('https://github.com/sentinel-ai/core.git', './core_repo');
      expect(cloneRes.success).toBe(true);
      expect(cloneRes.data?.cloned).toBe(true);

      const verified = await gitDriver.verify({ url: 'https://github.com' }, cloneRes);
      expect(verified).toBe(true);

      const rolledBack = await gitDriver.rollback({ directory: './core_repo' }, cloneRes);
      expect(rolledBack).toBe(true);
    });

    it('should propagate working directory (cwd) context across git invocations (Issue 10 / GitHub #4)', async () => {
      const gitDriver = new GitCapability('git.status');
      const res = await gitDriver.execute({ directory: '/workspace/custom-repo' }, { cwd: '/workspace/custom-repo' } as any);
      expect(res.success).toBe(true);
      expect(res.commandExecuted).toContain('git status');
    });
  });

  describe('8. Docker & Container Runtime Capability', () => {
    it('should query running containers and control docker-compose stacks', async () => {
      const dockerDriver = new DockerCapability('docker.compose_up');
      const upRes = await dockerDriver.composeUp(true, 'docker-compose.yml');
      expect(upRes.success).toBe(true);
      expect(upRes.data?.stack).toBe('started');

      const verified = await dockerDriver.verify({}, upRes);
      expect(verified).toBe(true);

      const rolledBack = await dockerDriver.rollback({}, upRes);
      expect(rolledBack).toBe(true);
    });
  });

  describe('9. Node, Python, and Developer Environments Capabilities', () => {
    it('should manage packages, python venvs, networking diagnostics, and IDE launches', async () => {
      const nodeDriver = new NodeCapability('node.npm_install');
      const nodeRes = await nodeDriver.install('typescript');
      expect(nodeRes.success).toBe(true);

      const pyDriver = new PythonCapability('python.create_venv');
      const pyRes = await pyDriver.createVenv('venv');
      expect(pyRes.success).toBe(true);

      const netDriver = new NetworkingCapability('network.ping');
      const netRes = await netDriver.ping('openai.com');
      expect(netRes.success).toBe(true);

      const devDriver = new DeveloperCapability('developer.vscode');
      const devRes = await devDriver.openVSCode('.');
      expect(devRes.success).toBe(true);
    });
  });

  describe('10. Central Registry & Operating Knowledge Base Synchronization', () => {
    it('should ensure every single tool loaded in the Tool Registry (~91 tools) has an end-to-end executable backend driver', async () => {
      const loader = new ToolLoader();
      const loadResult = loader.loadAll();
      
      expect(loadResult.success).toBe(true);
      expect(loadResult.toolsLoaded).toBeGreaterThanOrEqual(91);

      const allTools = loader.getState().toolIndex.getAll();
      expect(allTools.length).toBeGreaterThanOrEqual(91);

      // Verify that every single loaded tool ID in the entire Cero capability library is bound to a concrete TypeScript driver
      for (const tool of allTools) {
        const toolId = tool.definition.id;
        const driver = registry.getDriver(toolId);
        expect(driver, `Driver missing for toolId: ${toolId}`).toBeDefined();
        expect(driver?.capabilityId).toBeDefined();

        const execRes = await registry.executeTool(toolId, { isDryRun: true });
        expect(execRes, `Execution failed for toolId: ${toolId}`).toBeDefined();
        expect(execRes.error?.code).not.toBe('DRIVER_NOT_FOUND');
      }
    });
  });
});

