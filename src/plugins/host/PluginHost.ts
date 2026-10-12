/**
 * PluginHost.ts — Independent Owner for an Individual Plugin Instance
 * 
 * Instantiates the Sandbox, configures SDK Bridge, injects capabilities,
 * and gracefully manages isolated plugin failures.
 */

import { PluginManifest, PluginContext, PluginState } from '../models/PluginTypes';
import { PluginSandbox } from '../sandbox/PluginSandbox';
import { CeroSDK } from '../sdk/CeroSDK';
import { SDKBridge } from '../bridge/SDKBridge';
import { PermissionManager } from '../permissions/PermissionManager';
import { ExtensionPoints } from '../hooks/ExtensionPoints';

export class PluginHost {
  private state: PluginState = 'load';
  private sandbox?: PluginSandbox;
  private sdk?: CeroSDK;

  constructor(
    public readonly manifest: PluginManifest,
    private permissionManager: PermissionManager,
    private extensionPoints: ExtensionPoints,
    private storageDirectory: string = `/tmp/cero/plugins/${manifest.id}`
  ) {}

  public getState(): PluginState {
    return this.state;
  }

  public async initialize(): Promise<void> {
    try {
      this.state = 'init';
      
      const context: PluginContext = {
        manifest: this.manifest,
        workingDirectory: __dirname,
        storageDirectory: this.storageDirectory
      };

      // Grant declared permissions
      this.permissionManager.grantPermissions(this.manifest.id, this.manifest.permissions || []);

      // Construct Bridge & SDK
      const bridge = new SDKBridge(this.manifest.id, this.permissionManager, this.extensionPoints);
      this.sdk = new CeroSDK(bridge);
      
      // Instantiate Sandbox Boundary
      this.sandbox = new PluginSandbox(context, this.sdk);

      this.state = 'enable';
    } catch (e) {
      this.state = 'error';
      console.error(`PluginHost: Failed to initialize plugin ${this.manifest.id}`, e);
    }
  }

  /**
   * Loads and executes the raw script payload inside the isolated Sandbox.
   */
  public async executeEntrypoint(code: string): Promise<void> {
    if (this.state !== 'enable') {
      throw new Error(`Cannot execute plugin ${this.manifest.id} in state ${this.state}`);
    }

    try {
      this.state = 'running';
      this.sandbox!.execute(code);
    } catch (e) {
      this.state = 'error';
      console.error(`PluginHost: Plugin ${this.manifest.id} crashed during execution`, e);
      // Host intercepts crash safely; Cero Core remains online
    }
  }

  public shutdown(): void {
    this.state = 'disable';
    this.permissionManager.revokeAll(this.manifest.id);
    this.sandbox = undefined;
    this.sdk = undefined;
    this.state = 'unload';
  }
}
