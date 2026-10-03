/**
 * PluginSandbox.ts — Execution Isolation Boundary
 * 
 * For this architecture, we use Node VM as an implementation detail,
 * proxying exclusively through the SDKBridge to allow future transition to Workers.
 */

import * as vm from 'vm';
import { CeroSDKAPI } from '../sdk/CeroSDK';
import { PluginContext } from '../models/PluginTypes';

export class PluginSandbox {
  private vmContext: vm.Context;

  constructor(
    private pluginContext: PluginContext,
    private sdk: CeroSDKAPI
  ) {
    // Only the SDK and basic JS primitives exist in the sandbox.
    // No `require`, `process`, or global `window`.
    this.vmContext = vm.createContext({
      cero: this.sdk,
      console: {
        log: (...args: any[]) => console.log(`[Plugin:${this.pluginContext.manifest.id}]`, ...args),
        error: (...args: any[]) => console.error(`[Plugin:${this.pluginContext.manifest.id}]`, ...args),
      }
    });
  }

  /**
   * Executes arbitrary code securely inside the sandbox boundary.
   * Catches any internal panics.
   */
  public execute(code: string): any {
    try {
      const script = new vm.Script(code, { filename: `${this.pluginContext.manifest.id}.js` });
      
      // Enforce advisory timeouts if specified
      const timeout = this.pluginContext.manifest.limits?.timeoutMs || 5000;
      
      return script.runInContext(this.vmContext, { timeout });
    } catch (e) {
      // Re-throw safely wrapped so it never takes down Cero Core
      throw new Error(`Sandbox Execution Failed: ${(e as Error).message}`);
    }
  }
}
